import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ParseInput = z.object({
  imageBase64: z.string().min(100),
  mimeType: z.string().default("image/png"),
});

const ResultRow = z.object({
  placement: z.number().int().min(1).max(8),
  player_name: z.string().min(1).max(64),
  leader_name: z.string().max(120).nullable().optional(),
  points: z.number().int().min(0).max(99),
});

const SaveInput = z.object({
  board_version: z.enum(["base", "uprising"]),
  has_rise_of_ix: z.boolean().default(false),
  has_epic_mode: z.boolean().default(false),
  has_immortality: z.boolean().default(false),
  has_base_leaders: z.boolean().default(false),
  match_screenshot_url: z.string().max(500).optional().nullable(),
  tournament_num: z.number().int().positive().optional().nullable(),
  results: z.array(ResultRow).min(2).max(8),
});

const SaveOutput = z.object({
  game_id: z.string().uuid(),
  game_version: z.enum(["base", "ix", "uprising"]),
  tournament_num: z.number().int().positive().nullable(),
  deltas: z.array(
    z.object({
      player_name: z.string(),
      placement: z.number().int(),
      version_delta: z.number(),
      overall_delta: z.number(),
    }),
  ),
});

type SupabaseRpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

/** Call Lovable AI Gateway (Gemini) to OCR the Dune Imperium results card. */
export const parseScreenshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ParseInput.parse(d))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI Gateway is not configured. Please contact the site owner.");

    const prompt = `You are reading a Dune Imperium Digital end-of-game results screen.
Extract every player row visible. For each row return: placement (1-4 from "1st/2nd/3rd/4th" badge), player_name (the larger top text — the player's account name), leader_name (the smaller subtitle text — the in-game leader they played, e.g. "Helena Richese", "Glossu \\"Beast\\" Rabban", "Duke Leto Atreides"), and points (the number inside the round badge at the right).

Rules:
- Use exactly the spelling shown on screen.
- If you cannot read a field clearly, return your best guess; never invent extra rows.
- Return ONLY valid JSON matching this shape: {"results":[{"placement":1,"player_name":"...","leader_name":"...","points":11}, ...]}
- Sort the array by placement ascending.`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: { url: `data:${data.mimeType};base64,${data.imageBase64}` },
              },
            ],
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      if (resp.status === 429) throw new Error("AI is busy right now. Try again in a moment.");
      if (resp.status === 402) throw new Error("AI credits exhausted. Ask the site owner to top up.");
      throw new Error(`AI parse failed (${resp.status}): ${text.slice(0, 200)}`);
    }
    const json = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = json.choices?.[0]?.message?.content ?? "{}";
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error("AI returned an unreadable response. Try a clearer screenshot.");
    }
    const out = z
      .object({ results: z.array(ResultRow).min(2).max(8) })
      .safeParse(parsed);
    if (!out.success) {
      throw new Error("Could not extract results. Try a clearer screenshot.");
    }
    return out.data;
  });

/** Standard multiplayer ELO update across pairwise placements. K=32 / (N-1). */
function recomputeElo(
  current: number[],
  placements: number[],
  k = 32,
): number[] {
  const n = current.length;
  const next = [...current];
  const kp = k / Math.max(1, n - 1);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const ea = 1 / (1 + Math.pow(10, (current[j] - current[i]) / 400));
      const sa = placements[i] < placements[j] ? 1 : placements[i] === placements[j] ? 0.5 : 0;
      next[i] += kp * (sa - ea);
    }
  }
  return next;
}

export const saveGame = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SaveInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: saved, error } = await (context.supabase as unknown as SupabaseRpcClient).rpc(
      "save_game_with_ratings",
      {
        p_board_version: data.board_version,
        p_has_rise_of_ix: data.has_rise_of_ix,
        p_has_epic_mode: data.has_epic_mode,
        p_has_immortality: data.has_immortality,
        p_has_base_leaders: data.has_base_leaders,
        p_match_screenshot_url: data.match_screenshot_url ?? null,
        p_tournament_num: data.tournament_num ?? null,
        p_results: data.results,
      },
    );

    if (error) throw new Error(error.message);

    const parsed = SaveOutput.safeParse(saved);
    if (!parsed.success) throw new Error("Saved match returned an unexpected response.");

    return parsed.data;
  });

/** Delete a match and revert the ELO / counters it contributed. */
export const deleteGame = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ game_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: game, error: gErr } = await supabaseAdmin
      .from("games")
      .select("id, created_by, game_version")
      .eq("id", data.game_id)
      .maybeSingle();
    if (gErr) throw new Error(gErr.message);
    if (!game) throw new Error("Match not found.");

    // Authorize: owner or admin
    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (game.created_by !== context.userId && !isAdmin) {
      throw new Error("You can only delete your own matches.");
    }

    const { data: results } = await supabaseAdmin
      .from("game_results")
      .select("player_name, placement, points, elo_delta, elo_delta_overall")
      .eq("game_id", data.game_id);

    const gv = game.game_version as "base" | "ix" | "uprising";
    if (results && results.length) {
      const keys = results.map((r) => r.player_name.toLowerCase().trim());
      const revertTrack = async (
        track: "base" | "ix" | "uprising" | "overall",
        deltaField: "elo_delta" | "elo_delta_overall",
      ) => {
        const { data: ratings } = await supabaseAdmin
          .from("player_ratings")
          .select("player_key, elo, games_played, wins, top2, total_points")
          .eq("game_version", track)
          .in("player_key", keys);
        const map = new Map(ratings?.map((r) => [r.player_key, r]) ?? []);
        for (const r of results) {
          const k = r.player_name.toLowerCase().trim();
          const prev = map.get(k);
          if (!prev) continue;
          await supabaseAdmin
            .from("player_ratings")
            .update({
              elo: Number((Number(prev.elo) - Number(r[deltaField] ?? 0)).toFixed(2)),
              games_played: Math.max(0, prev.games_played - 1),
              wins: Math.max(0, prev.wins - (r.placement === 1 ? 1 : 0)),
              top2: Math.max(0, prev.top2 - (r.placement <= 2 ? 1 : 0)),
              total_points: Math.max(0, prev.total_points - r.points),
              updated_at: new Date().toISOString(),
            })
            .eq("player_key", k)
            .eq("game_version", track);
        }
      };
      await revertTrack(gv, "elo_delta");
      await revertTrack("overall", "elo_delta_overall");
    }

    const { error: dErr } = await supabaseAdmin.from("games").delete().eq("id", data.game_id);
    if (dErr) throw new Error(dErr.message);
    return { ok: true };
  });

/** Claim an unclaimed player name as the signed-in user. */
export const claimPlayer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        player_key: z.string().min(1).max(64),
        reset: z.boolean().optional().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const key = data.player_key.toLowerCase().trim();

    const { data: rows, error: rErr } = await supabaseAdmin
      .from("player_ratings")
      .select("id, claimed_by, game_version")
      .eq("player_key", key);
    if (rErr) throw new Error(rErr.message);
    if (!rows || rows.length === 0) throw new Error("This player isn't on the leaderboard yet.");

    const other = rows.find((r) => r.claimed_by && r.claimed_by !== context.userId);
    if (other) throw new Error("This name has already been claimed by another player.");

    if (data.reset) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("has_used_reset")
        .eq("id", context.userId)
        .maybeSingle();
      if (profile?.has_used_reset) {
        throw new Error("You've already used your one-time stats reset.");
      }
      // Reset aggregate stats but keep historical game_results as shadow data.
      await supabaseAdmin
        .from("player_ratings")
        .update({
          elo: 1000,
          games_played: 0,
          wins: 0,
          top2: 0,
          total_points: 0,
          updated_at: new Date().toISOString(),
        })
        .eq("player_key", key);
      await supabaseAdmin
        .from("profiles")
        .update({ has_used_reset: true })
        .eq("id", context.userId);
    }

    const { error: uErr } = await supabaseAdmin
      .from("player_ratings")
      .update({ claimed_by: context.userId, updated_at: new Date().toISOString() })
      .eq("player_key", key);
    if (uErr) throw new Error(uErr.message);

    return { ok: true, player_key: key, reset: data.reset };
  });
