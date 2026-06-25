// Canonical Dune Imperium leader sets per expansion.
// Detection uses distinctive lowercase tokens so a single first/last name
// is enough to classify even when AI OCR slightly mis-reads the title.

export const LEADERS = {
  base: [
    "Baron Vladimir Harkonnen",
    "Count Ilban Richese",
    "Countess Ariana Thorvald",
    "Duke Leto Atreides",
    "Earl Memnon Thorvald",
    'Glossu "Beast" Rabban',
    "Helena Richese",
    "Paul Atreides",
  ],
  ix: [
    "Archduke Armand Ecaz",
    "Ilesa Ecaz",
    "Prince Rhombur Vernius",
    '"Princess" Yuna Moritani',
    "Tessia Vernius",
    "Viscount Hundro Moritani",
  ],
  uprising: [
    "Feyd-Rautha Harkonnen",
    "Gurney Halleck",
    "Lady Amber Metulli",
    "Lady Jessica",
    "Lady Margot Fenring",
    "Muad'Dib",
    "Princess Irulan",
    "Reverend Mother Jessica",
    "Shaddam Corrino IV",
    "Staban Tuek",
  ],
} as const;

type Group = "base" | "ix" | "uprising";

// Distinctive tokens unique to each group (avoids the "Harkonnen" ambiguity
// between Baron Vladimir and Feyd-Rautha by keying off the first names).
const TOKENS: Array<[string, Group]> = [
  // Base
  ["vladimir", "base"], ["ilban", "base"], ["ariana", "base"], ["leto", "base"],
  ["memnon", "base"], ["rabban", "base"], ["beast", "base"], ["helena", "base"],
  ["paul atreides", "base"], ["thorvald", "base"], ["richese", "base"],
  // Rise of Ix
  ["armand", "ix"], ["ecaz", "ix"], ["ilesa", "ix"], ["rhombur", "ix"],
  ["vernius", "ix"], ["yuna", "ix"], ["tessia", "ix"], ["hundro", "ix"],
  ["moritani", "ix"],
  // Uprising
  ["feyd", "uprising"], ["gurney", "uprising"], ["halleck", "uprising"],
  ["amber", "uprising"], ["metulli", "uprising"], ["jessica", "uprising"],
  ["margot", "uprising"], ["fenring", "uprising"], ["muaddib", "uprising"],
  ["muad dib", "uprising"], ["irulan", "uprising"], ["shaddam", "uprising"],
  ["corrino", "uprising"], ["staban", "uprising"], ["tuek", "uprising"],
];

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function classifyLeader(name: string): Group | null {
  const n = " " + normalize(name) + " ";
  for (const [token, group] of TOKENS) {
    if (n.includes(" " + token + " ") || n.includes(token)) return group;
  }
  return null;
}

export type DetectedExpansions = {
  board_version: "base" | "uprising";
  has_rise_of_ix: boolean;
  has_base_leaders: boolean;
};

/**
 * Decide board + expansion auto-suggestions from the detected leaders.
 *
 * - Any uprising leader present → board = uprising.
 *   If a base leader is also present → has_base_leaders = true.
 * - Otherwise → board = base. If any Rise of Ix leader present → has_rise_of_ix.
 */
export function detectExpansions(leaderNames: Array<string | null | undefined>): DetectedExpansions {
  const groups = leaderNames
    .filter((n): n is string => Boolean(n && n.trim()))
    .map(classifyLeader);
  const hasBase = groups.includes("base");
  const hasIx = groups.includes("ix");
  const hasUpr = groups.includes("uprising");

  if (hasUpr) {
    return {
      board_version: "uprising",
      has_rise_of_ix: hasIx,
      has_base_leaders: hasBase,
    };
  }
  return {
    board_version: "base",
    has_rise_of_ix: hasIx,
    has_base_leaders: false,
  };
}