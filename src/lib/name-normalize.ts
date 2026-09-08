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

/** Characters OCR commonly confuses with each other. */
const CONFUSABLE_GROUPS = ["li1|!ij", "o0", "s5", "b8", "g69q", "z2", "cke", "uv", "mn"];
function confusable(a: string, b: string): boolean {
  if (a === b) return true;
  return CONFUSABLE_GROUPS.some((g) => g.includes(a) && g.includes(b));
}

/**
 * Decide whether `raw` differs from `master` by a single *safe* edit:
 * a look-alike character substitution, or a duplicated/dropped repeat of an
 * adjacent character. Any other single-letter swap (e.g. Raven -> Riven) is
 * rejected so genuinely different players never get merged.
 */
function safeSingleEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a.length === b.length) {
    let diff = -1;
    for (let i = 0; i < a.length; i++) {
      if (a[i] === b[i]) continue;
      if (diff >= 0) return false;
      diff = i;
    }
    return diff >= 0 && confusable(a[diff], b[diff]);
  }
  // One insertion/deletion: only allowed when it repeats a neighbouring char.
  const long = a.length > b.length ? a : b;
  const short = a.length > b.length ? b : a;
  let i = 0;
  while (i < short.length && long[i] === short[i]) i++;
  // remaining tails must line up
  for (let j = i; j < short.length; j++) if (long[j + 1] !== short[j]) return false;
  const c = long[i];
  return c === long[i - 1] || c === long[i + 1];
}

/**
 * Normalize detected player names against master records. Priority:
 *   1. Exact case-insensitive match → use master spelling.
 *   2. Same "shape" (confusable-glyph) match → master spelling.
 *   3. A single look-alike / repeated-character edit away (names ≥ 5 chars,
 *      unambiguous match only) → master spelling.
 * Anything else is kept exactly as read from the screenshot.
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
    if (raw.length < 5) return row;
    const rk = shapeKey(raw);
    const hits: string[] = [];
    for (const m of master) {
      if (Math.abs(m.length - raw.length) > 1) continue;
      if (safeSingleEdit(rk, shapeKey(m))) hits.push(m);
    }
    const unique = Array.from(new Set(hits.map((h) => h.toLowerCase())));
    return hits.length && unique.length === 1 ? { ...row, player_name: hits[0] } : row;
  });
}
