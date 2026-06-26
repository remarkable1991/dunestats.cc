export const GAME_VERSIONS = [
  { value: "overall", label: "Overall (Lifetime)" },
  { value: "base", label: "Base Game" },
  { value: "ix", label: "Rise of Ix" },
  { value: "uprising", label: "Uprising" },
] as const;

export type GameVersion = (typeof GAME_VERSIONS)[number]["value"];

export const EXPANSION_VERSIONS = GAME_VERSIONS.filter((g) => g.value !== "overall");

export function versionLabel(v: string) {
  return GAME_VERSIONS.find((g) => g.value === v)?.label ?? v;
}
