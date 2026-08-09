/** Minimal RFC4180-ish CSV parser (handles quoted fields with commas/newlines). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/\r\n?/g, "\n");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') { inQuotes = true; continue; }
    if (c === ",") { row.push(field); field = ""; continue; }
    if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; continue; }
    field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

export type TournamentMatchInsert = {
  tournament_num: number;
  round_type: string;
  table_identifier: string;
  player_name: string;
  discord_username: string | null;
  leader_name: string | null;
  placement: number | null;
  points: number | null;
  table_score: number | null;
  player_compatibility_score: number | null;
  player_availability: string[] | null;
};

const norm = (s: string) => s.trim().replace(/_/g, " ");
const num = (s: string) => {
  const v = Number(String(s).trim());
  return String(s).trim() === "" || Number.isNaN(v) ? null : v;
};

/** Convert an uploaded matchup CSV into tournament_matches rows. */
export function parseTournamentMatchesCsv(
  text: string,
  tournamentNum?: number,
): { rows: TournamentMatchInsert[]; errors: string[] } {
  const grid = parseCsv(text);
  const errors: string[] = [];
  if (grid.length < 2) return { rows: [], errors: ["CSV is empty"] };
  const header = grid[0].map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const need = ["tournament_num", "round_type", "table_identifier", "player_name"];
  for (const n of need) if (idx(n) === -1 && !(n === "tournament_num" && tournamentNum)) errors.push(`Missing column: ${n}`);
  if (errors.length) return { rows: [], errors };

  const get = (r: string[], name: string) => {
    const i = idx(name);
    return i === -1 ? "" : (r[i] ?? "");
  };

  const rows: TournamentMatchInsert[] = [];
  for (let i = 1; i < grid.length; i++) {
    const r = grid[i];
    const player = get(r, "player_name").trim();
    if (!player) continue;
    const tnum = tournamentNum ?? num(get(r, "tournament_num"));
    if (!tnum) { errors.push(`Row ${i + 1}: missing tournament number`); continue; }
    let availability: string[] | null = null;
    const rawAvail = get(r, "player_availability").trim();
    if (rawAvail) {
      try {
        const parsed = JSON.parse(rawAvail);
        if (Array.isArray(parsed)) availability = parsed.map(String);
      } catch { /* ignore malformed availability */ }
    }
    rows.push({
      tournament_num: Number(tnum),
      round_type: norm(get(r, "round_type")) || "Game 1",
      table_identifier: norm(get(r, "table_identifier")) || "Table 1",
      player_name: player,
      discord_username: get(r, "discord_username").trim() || null,
      leader_name: get(r, "leader_name").trim() || null,
      placement: num(get(r, "placement")),
      points: num(get(r, "points")),
      table_score: num(get(r, "table_score")),
      player_compatibility_score: num(get(r, "player_compatibility_score")),
      player_availability: availability,
    });
  }
  return { rows, errors };
}
