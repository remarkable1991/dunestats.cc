// Canonical leader dictionary + multi-language / OCR translation map.
// `translateLeader` returns the canonical English database string, or null
// when the input cannot be confidently mapped to a known leader. The
// canonical list is the strict allow-list used at submission time.

export const CANONICAL_LEADERS = [
  // Base
  "Baron Vladimir Harkonnen",
  "Count Ilban Richese",
  "Countess Ariana Thorvald",
  "Duke Leto Atreides",
  "Earl Memnon Thorvald",
  'Glossu "Beast" Rabban',
  "Helena Richese",
  "Paul Atreides",
  // Rise of Ix
  "Archduke Armand Ecaz",
  "Ilesa Ecaz",
  "Prince Rhombur Vernius",
  '"Princess" Yuna Moritani',
  "Tessia Vernius",
  "Viscount Hundro Moritani",
  // Uprising
  "Feyd-Rautha Harkonnen",
  "Gurney Halleck",
  "Lady Amber Metulli",
  "Lady Jessica",
  "Lady Margot Fenring",
  "Muad'Dib",
  "Princess Irulan",
  "Shaddam Corrino IV",
  "Staban Tuek",
] as const;

// Multi-language + OCR alias map. Keys are normalized via `keyOf` so quote
// styles, accents, punctuation, and casing differences all collapse.
const ALIASES: Array<[string, string]> = [
  // Base
  ["Baron Vladimir Harkonnen", "Baron Vladimir Harkonnen"],
  ["Graf Ilban Richese", "Count Ilban Richese"],
  ["Comte Ilban Richese", "Count Ilban Richese"],
  ["Count Ilban Richese", "Count Ilban Richese"],
  ["Gräfin Ariana Thorvald", "Countess Ariana Thorvald"],
  ["Comtesse Ariana Thorvald", "Countess Ariana Thorvald"],
  ["Countess Ariana Thorvald", "Countess Ariana Thorvald"],
  ["Herzog Leto Atreides", "Duke Leto Atreides"],
  ["Duc Leto Atreides", "Duke Leto Atreides"],
  ["Duke Leto Atreides", "Duke Leto Atreides"],
  ["Graf Memnon Thorvald", "Earl Memnon Thorvald"],
  ["Comte Memnon Thorvald", "Earl Memnon Thorvald"],
  ["Earl Memnon Thorvald", "Earl Memnon Thorvald"],
  ['Glossu "Die Bestie" Rabban', 'Glossu "Beast" Rabban'],
  ['Glossu "La Bête" Rabban', 'Glossu "Beast" Rabban'],
  ['Glossu "The Beast" Rabban', 'Glossu "Beast" Rabban'],
  ['Glossu "Beast" Rabban', 'Glossu "Beast" Rabban'],
  ['Glossu "Beast" Rabbah', 'Glossu "Beast" Rabban'],
  ["Helena Richese", "Helena Richese"],
  ["Paul Atreides", "Paul Atreides"],
  // Rise of Ix
  ['"Prinzessin" Yuna Moritani', '"Princess" Yuna Moritani'],
  ['"Princesse" Yuna Moritani', '"Princess" Yuna Moritani'],
  ['Princesse Yuna Moritani', '"Princess" Yuna Moritani'],
  ['"Princesa" Yuna Moritani', '"Princess" Yuna Moritani'],
  ['"Princess" Yuna Moritani', '"Princess" Yuna Moritani'],
  ["Erzherzog Armand Ecaz", "Archduke Armand Ecaz"],
  ["Archiduc Armand Ecaz", "Archduke Armand Ecaz"],
  ["Archduke Armand Ecaz", "Archduke Armand Ecaz"],
  ["Ilesa Ecaz", "Ilesa Ecaz"],
  ["Jlesa Ecaz", "Ilesa Ecaz"],
  ["lfcazn", "Ilesa Ecaz"],
  ["Ifcazn", "Ilesa Ecaz"],
  ["Prinz Rhombur Vernius", "Prince Rhombur Vernius"],
  ["Prince Rhombur Vernius", "Prince Rhombur Vernius"],
  ["Tessia Vernius", "Tessia Vernius"],
  ["Vicomte Hundro Moritani", "Viscount Hundro Moritani"],
  ["Graf Hundro Moritani", "Viscount Hundro Moritani"],
  ["Viscount Hundro Moritani", "Viscount Hundro Moritani"],
  // Uprising
  ["Feyd-Rautha Harkonnen", "Feyd-Rautha Harkonnen"],
  ["Gurney Halleck", "Gurney Halleck"],
  ["Lady Amber Metulli", "Lady Amber Metulli"],
  ["Lady Jessica", "Lady Jessica"],
  ["Reverend Mother Jessica", "Lady Jessica"],
  ["Ehrwürdige Mutter Jessica", "Lady Jessica"],
  ["Révérende Mère Jessica", "Lady Jessica"],
  ["Lady Margot Fenring", "Lady Margot Fenring"],
  ["Muad'Dib", "Muad'Dib"],
  ["Prinzessin Irulan", "Princess Irulan"],
  ["Princesse Irulan", "Princess Irulan"],
  ["Princess Irulan", "Princess Irulan"],
  ["Shaddam Corrino IV.", "Shaddam Corrino IV"],
  ["Shaddam Corrino IV", "Shaddam Corrino IV"],
  ["Staban Tuek", "Staban Tuek"],
];

function keyOf(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[„“”«»"']/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

const ALIAS_INDEX = new Map<string, string>();
for (const [from, to] of ALIASES) ALIAS_INDEX.set(keyOf(from), to);
for (const c of CANONICAL_LEADERS) ALIAS_INDEX.set(keyOf(c), c);

const CANONICAL_KEYS = new Set(CANONICAL_LEADERS.map((c) => keyOf(c)));

/**
 * Map a raw leader string (any language, OCR-noisy) to its canonical
 * English database value. Returns null when the value cannot be resolved
 * to a known leader — caller must force manual selection.
 */
export function translateLeader(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  const k = keyOf(v);
  const hit = ALIAS_INDEX.get(k);
  if (hit) return hit;
  // Fallback: substring match against canonical keys (e.g. extra prefixes).
  for (const ck of CANONICAL_KEYS) {
    if (ck.length >= 6 && (k.includes(ck) || ck.includes(k))) {
      for (const c of CANONICAL_LEADERS) if (keyOf(c) === ck) return c;
    }
  }
  return null;
}

export function isCanonicalLeader(name: string | null | undefined): boolean {
  if (!name) return false;
  return CANONICAL_KEYS.has(keyOf(name));
}