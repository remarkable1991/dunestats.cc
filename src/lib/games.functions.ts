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
  game_version: z.enum(["base", "ix", "uprising"]),
  results: z.array(ResultRow).min(2).max(8),
});

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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;

    // Insert game
    const { data: gameRow, error: gErr } = await supabaseAdmin
      .from("games")
      .insert({ game_version: data.game_version, source: "screenshot", created_by: userId })
      .select("id")
      .single();
    if (gErr || !gameRow) throw new Error(gErr?.message ?? "Failed to save game");

    // Insert results
    const { error: rErr } = await supabaseAdmin.from("game_results").insert(
      data.results.map((r) => ({
        game_id: gameRow.id,
        placement: r.placement,
        player_name: r.player_name,
        leader_name: r.leader_name ?? null,
        points: r.points,
      })),
    );
    if (rErr) throw new Error(rErr.message);

    // Update ELO for each player in this version
    const keys = data.results.map((r) => r.player_name.toLowerCase().trim());
    const { data: existing } = await supabaseAdmin
      .from("player_ratings")
      .select("player_key, elo, games_played, wins, top2, total_points")
      .eq("game_version", data.game_version)
      .in("player_key", keys);

    const existingMap = new Map(existing?.map((r) => [r.player_key, r]) ?? []);
    const currentElos = keys.map((k) => Number(existingMap.get(k)?.elo ?? 1000));
    const placements = data.results.map((r) => r.placement);
    const newElos = recomputeElo(currentElos, placements);

    const upserts = data.results.map((r, i) => {
      const k = keys[i];
      const prev = existingMap.get(k);
      return {
        player_key: k,
        display_name: r.player_name,
        game_version: data.game_version,
        elo: Number(newElos[i].toFixed(2)),
        games_played: (prev?.games_played ?? 0) + 1,
        wins: (prev?.wins ?? 0) + (r.placement === 1 ? 1 : 0),
        top2: (prev?.top2 ?? 0) + (r.placement <= 2 ? 1 : 0),
        total_points: (prev?.total_points ?? 0) + r.points,
        updated_at: new Date().toISOString(),
      };
    });

    const { error: uErr } = await supabaseAdmin
      .from("player_ratings")
      .upsert(upserts, { onConflict: "player_key,game_version" });
    if (uErr) throw new Error(uErr.message);

    return { game_id: gameRow.id };
  });
