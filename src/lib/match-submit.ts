import { supabase } from "@/integrations/supabase/client";
import { saveGame } from "@/lib/games.functions";
import { mirrorFileToR2 } from "@/lib/storage-r2";

export type SubmitMatchRow = {
  placement: number;
  player_name: string;
  leader_name: string | null;
  points: number;
};

export type SubmitMatchTournament = {
  num: number;
  round: string;
  table: string;
};

export type SubmitMatchInput = {
  userId: string;
  file: File | null;
  board: "base" | "uprising";
  hasIx: boolean;
  hasEpic: boolean;
  hasImmortality: boolean;
  hasBaseLeaders: boolean;
  rows: SubmitMatchRow[];
  tournament: SubmitMatchTournament | null;
  /**
   * When set, the match is saved globally and queued for admin approval as a
   * tournament game instead of being written into the tournament table.
   */
  pendingTournament?: {
    num: number;
    round: string | null;
    table: string | null;
    unmatched: Array<{ detected: string; suggested: string | null }>;
  } | null;
  /** Skip duplicate check (user confirmed the duplicate warning). */
  confirmDuplicate?: boolean;
};

export type SaveGameResult = Awaited<ReturnType<typeof saveGame>>;

export type SubmitMatchResult =
  | { status: "duplicate" }
  | {
      status: "ok";
      saveResult: SaveGameResult;
      publicMatchId: string;
      tournamentApplied: boolean;
      pendingReview: boolean;
    };


/**
 * Unified upload pipeline used by /upload and /tournament.
 *
 * 1. Duplicate check against the last 100 uploaded games (fingerprint on
 *    placement|player|leader|points). Skippable via confirmDuplicate.
 * 2. Upload screenshot to `match-screenshots`.
 * 3. Save game globally via `saveGame` (ELO + game_results rows).
 * 4. Fire-and-forget sandbox sync (never blocks).
 * 5. If a tournament slot is provided: upsert `tournament_table_screenshots`
 *    and update the matching `tournament_matches` rows for that table.
 */
export async function submitMatch(input: SubmitMatchInput): Promise<SubmitMatchResult> {
  const rows = input.rows.map((r) => ({
    placement: r.placement,
    player_name: r.player_name.trim(),
    leader_name: r.leader_name?.trim() || null,
    points: Number(r.points) || 0,
  }));

  if (!input.confirmDuplicate) {
    const dup = await checkRecentDuplicate(rows);
    if (dup) return { status: "duplicate" };
  }

  // 1. Screenshot upload (Supabase + Cloudflare R2 backup)
  let screenshotPath: string | null = null;
  if (input.file) {
    const ext = (input.file.name.split(".").pop() || "png").toLowerCase();
    const path = `${input.userId}/${crypto.randomUUID()}.${ext}`;
    const contentType = input.file.type || "image/png";
    const { error: upErr } = await supabase.storage
      .from("match-screenshots")
      .upload(path, input.file, { contentType, upsert: false });
    if (upErr) throw upErr;
    screenshotPath = path;
    void mirrorFileToR2("match-screenshots", path, contentType, input.file);
  }


  // 2. Save globally
  const saveResult = await saveGame({
    data: {
      board_version: input.board,
      has_rise_of_ix: input.hasIx,
      has_epic_mode: input.hasEpic,
      has_immortality: input.hasImmortality,
      has_base_leaders: input.hasBaseLeaders,
      match_screenshot_url: screenshotPath,
      tournament_num: input.tournament?.num ?? null,
      results: rows,
    },
  });

  // 3. Fire-and-forget sandbox sync
  void supabase
    .rpc("sync_new_game_to_sandbox_by_id", { p_game_id: saveResult.game_id })
    .then(({ error }) => {
      if (error) console.error("Sandbox sync error:", error);
    });

  // 4. Fetch public_match_id
  const { data: g } = await supabase
    .from("games")
    .select("public_match_id")
    .eq("id", saveResult.game_id)
    .maybeSingle();
  const publicMatchId = g?.public_match_id ?? saveResult.game_id;

  // 5. Tournament writes
  let tournamentApplied = false;
  if (input.tournament) {
    const { num, round, table } = input.tournament;
    try {
      if (screenshotPath) {
        await supabase.from("tournament_table_screenshots").upsert(
          {
            tournament_num: num,
            round_type: round,
            table_identifier: table,
            image_url: screenshotPath,
            created_by: input.userId,
          },
          { onConflict: "tournament_num,round_type,table_identifier" },
        );
      }
      const { data: slot } = await supabase
        .from("tournament_matches")
        .select("id, player_name")
        .eq("tournament_num", num)
        .eq("round_type", round)
        .eq("table_identifier", table);
      const slotRows = slot ?? [];
      for (const pr of rows) {
        const lower = pr.player_name.toLowerCase();
        const target = slotRows.find((r) => {
          const rn = (r.player_name ?? "").toLowerCase();
          return rn === lower || rn.includes(lower) || lower.includes(rn);
        });
        if (!target) continue;
        await supabase
          .from("tournament_matches")
          .update({
            placement: pr.placement,
            points: pr.points,
            leader_name: pr.leader_name,
            updated_at: new Date().toISOString(),
          })
          .eq("id", target.id);
      }
      tournamentApplied = true;
    } catch (e) {
      console.error("Tournament write failed:", e);
      tournamentApplied = false;
    }
  }

  // 6. Queue for admin approval instead of writing the tournament table
  let pendingReview = false;
  if (!input.tournament && input.pendingTournament) {
    const { error } = await supabase.from("tournament_pending_matches").insert({
      game_id: saveResult.game_id,
      tournament_num: input.pendingTournament.num,
      round_type: input.pendingTournament.round,
      table_identifier: input.pendingTournament.table,
      submitted_by: input.userId,
      detected_players: rows,
      unmatched: input.pendingTournament.unmatched,
    });
    if (error) console.error("Pending tournament review insert failed:", error);
    else pendingReview = true;
  }

  return { status: "ok", saveResult, publicMatchId, tournamentApplied, pendingReview };
}


/** Look up which (round, table) inside a tournament matches a set of detected players. */
export async function detectTournamentTable(
  tournamentNum: number,
  detectedPlayers: string[],
): Promise<{ round: string; table: string } | null> {
  const keys = detectedPlayers
    .map((n) => n.toLowerCase().trim())
    .filter(Boolean);
  if (keys.length < 2) return null;
  const { data } = await supabase
    .from("tournament_matches")
    .select("round_type, table_identifier, player_name")
    .eq("tournament_num", tournamentNum);
  if (!data) return null;
  const groups = new Map<string, { round: string; table: string; players: string[] }>();
  for (const r of data) {
    const k = `${r.round_type}__${r.table_identifier}`;
    if (!groups.has(k))
      groups.set(k, { round: r.round_type, table: r.table_identifier, players: [] });
    groups.get(k)!.players.push((r.player_name ?? "").toLowerCase().trim());
  }
  let best: { round: string; table: string } | null = null;
  let bestScore = 0;
  for (const g of groups.values()) {
    const score = keys.reduce((acc, dk) => {
      const hit = g.players.some((p) => p === dk || p.includes(dk) || dk.includes(p));
      return acc + (hit ? 1 : 0);
    }, 0);
    if (score > bestScore) {
      bestScore = score;
      best = { round: g.round, table: g.table };
    }
  }
  return best && bestScore >= 2 ? best : null;
}

async function checkRecentDuplicate(rows: SubmitMatchRow[]): Promise<boolean> {
  const fp = fingerprint(rows);
  const { data: recent } = await supabase
    .from("games")
    .select("id, game_results(placement, player_name, leader_name, points)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (!recent) return false;
  for (const g of recent) {
    const gr =
      (g as {
        game_results?: Array<{
          placement: number;
          player_name: string;
          leader_name: string | null;
          points: number;
        }>;
      }).game_results ?? [];
    if (gr.length !== rows.length) continue;
    const other = gr.map((r) => ({
      placement: r.placement,
      player_name: r.player_name,
      leader_name: r.leader_name ?? "",
      points: r.points,
    }));
    if (fingerprint(other) === fp) return true;
  }
  return false;
}

function fingerprint(rows: SubmitMatchRow[]): string {
  return rows
    .map(
      (r) =>
        `${r.placement}|${r.player_name.trim().toLowerCase()}|${(r.leader_name ?? "").trim().toLowerCase()}|${Number(r.points) || 0}`,
    )
    .sort()
    .join("::");
}
