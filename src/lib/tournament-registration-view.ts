export function registrationSearch(search: Record<string, unknown>): { t?: number } {
  const value = search.t ?? search.tournament ?? search.tournament_num ?? search.num;
  return { t: value != null && value !== "" && Number.isFinite(Number(value)) ? Number(value) : undefined };
}

export function registrationOverrideKey(num: number) {
  return `dune_semifinals_overrides_t${num}`;
}

export function parseRegistrationOverrides(raw: string | null): Record<string, string> {
  try {
    const value: unknown = JSON.parse(raw ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0));
  } catch { return {}; }
}