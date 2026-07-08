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
    const { data: deleted, error } = await (context.supabase as unknown as SupabaseRpcClient).rpc(
      "delete_game_with_rating_revert",
      { p_game_id: data.game_id },
    );

    if (error) throw new Error(error.message);

    return z.object({ ok: z.literal(true) }).parse(deleted);
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
    const { data: claimed, error } = await (context.supabase as unknown as SupabaseRpcClient).rpc(
      "claim_player_name",
      { p_player_key: data.player_key, p_reset: data.reset },
    );

    if (error) throw new Error(error.message);

    return z
      .object({ ok: z.literal(true), player_key: z.string(), reset: z.boolean() })
      .parse(claimed);
  });
