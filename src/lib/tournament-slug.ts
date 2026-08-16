/**
 * Short, shareable slugs for tournament tables.
 *   Game 1 / Table 3   -> G1T3
 *   Finals / Semi Final 1 -> SF1
 *   Finals / Grand Final! -> GF
 * Anything else falls back to a dash-slug of "round-table".
 */
export function tableSlug(roundType: string, tableIdentifier: string): string {
  const rt = (roundType ?? "").trim();
  const ti = (tableIdentifier ?? "").trim();

  const grand = /grand\s*final/i.test(ti);
  if (grand) return "GF";

  const semi = ti.match(/semi\s*final\s*(\d+)?/i);
  if (semi) return `SF${semi[1] ?? "1"}`;

  const g = rt.match(/game\s*(\d+)/i);
  const t = ti.match(/table\s*(\d+)/i);
  if (g && t) return `G${g[1]}T${t[1]}`;

  return `${rt}-${ti}`
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase();
}

/** Human label for a table slug, used before data has loaded. */
export function tableLabel(roundType: string, tableIdentifier: string): string {
  return `${roundType} · ${tableIdentifier}`;
}

/** Match a slug against a (round, table) pair, case-insensitively. */
export function slugMatches(slug: string, roundType: string, tableIdentifier: string): boolean {
  return tableSlug(roundType, tableIdentifier).toLowerCase() === (slug ?? "").trim().toLowerCase();
}
