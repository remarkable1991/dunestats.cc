export const GAME_VERSIONS = [
  { value: "base", label: "Base Game" },
  { value: "ix", label: "Rise of Ix" },
  { value: "uprising", label: "Uprising" },
] as const;

export type GameVersion = (typeof GAME_VERSIONS)[number]["value"];

export function versionLabel(v: string) {
  return GAME_VERSIONS.find((g) => g.value === v)?.label ?? v;
}
