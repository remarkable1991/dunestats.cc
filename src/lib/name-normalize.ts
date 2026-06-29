import { supabase } from "@/integrations/supabase/client";

/**
 * Build a normalized "shape" key for fuzzy matching: lowercased, with
 * commonly confused glyphs collapsed (l/I/1, O/0, rn/m, vv/w, etc.) and
 * non-alphanumerics stripped. OCR artifacts like "lfcazn" vs "Ifcazn"
 * produce the same shape and resolve to the master spelling.
 */
function shapeKey(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/rn/g, "m")
    .replace(/vv/g, "w")
    .replace(/[li1|!\]\[]/g, "i")
    .replace(/[o0]/g, "o")
    .replace(/[^a-z0-9]/g, "");
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) dp[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]; dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[b.length];
}

let cache: { at: number; names: string[] } | null = null;

async function loadMasterNames(): Promise<string[]> {
  if (cache && Date.now() - cache.at < 60_000) return cache.names;
  const seen = new Map<string, string>(); // lowercased -> canonical (most frequent spelling wins)
  const counts = new Map<string, number>();
  const add = (raw?: string | null) => {
    const n = (raw ?? "").trim();
    if (!n) return;
    const k = n.toLowerCase();
    counts.set(k, (counts.get(k) ?? 0) + 1);
    if (!seen.has(k) || (counts.get(k)! > 1 && n !== seen.get(k))) seen.set(k, n);
  };
  const [{ data: tm }, { data: pr }, { data: gr }] = await Promise.all([
    supabase.from("tournament_matches").select("player_name").limit(2000),
    supabase.from("player_ratings").select("display_name").limit(5000),
    supabase.from("game_results").select("player_name").limit(5000),
  ]);
  tm?.forEach((r) => add(r.player_name));
  pr?.forEach((r) => add(r.display_name));
  gr?.forEach((r) => add(r.player_name));
  const names = Array.from(seen.values());
  cache = { at: Date.now(), names };
  return names;
}

/**
 * Normalize detected player names against master records. Priority:
 *   1. Exact case-insensitive match → use master spelling.
 *   2. Same "shape" (confusable-glyph) match → master spelling.
 *   3. Levenshtein distance ≤ 1 (or ≤ 2 for names ≥ 8 chars) → master spelling.
 */
export async function normalizeNames<T extends { player_name: string }>(rows: T[]): Promise<T[]> {
  if (!rows.length) return rows;
  const master = await loadMasterNames();
  if (!master.length) return rows;
  const byLower = new Map(master.map((m) => [m.toLowerCase(), m]));
  const byShape = new Map<string, string>();
  for (const m of master) {
    const k = shapeKey(m);
    if (k && !byShape.has(k)) byShape.set(k, m);
  }
  return rows.map((row) => {
    const raw = row.player_name?.trim();
    if (!raw) return row;
    const exact = byLower.get(raw.toLowerCase());
    if (exact) return exact === raw ? row : { ...row, player_name: exact };
    const shaped = byShape.get(shapeKey(raw));
    if (shaped) return { ...row, player_name: shaped };
    const tol = raw.length >= 8 ? 2 : 1;
    let best: { name: string; d: number } | null = null;
    for (const m of master) {
      if (Math.abs(m.length - raw.length) > tol) continue;
      const d = levenshtein(raw.toLowerCase(), m.toLowerCase());
      if (d <= tol && (!best || d < best.d)) best = { name: m, d };
      if (best && best.d === 0) break;
    }
    return best ? { ...row, player_name: best.name } : row;
  });
}