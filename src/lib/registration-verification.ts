export type RegistrationIdentity = { direwolf_name: string; discord_username: string | null };
export type RegistrationMapping = { discord_user_id: string | null; discord_username: string | null; player_key: string | null; display_name: string | null };
export type RegistrationGuildMember = { discord_user_id: string; discord_username: string; has_verified_map: boolean | null };
export type RegistrationRating = { player_key: string; display_name: string; games_played: number };

const nameKey = (value: string | null) => (value ?? "").trim().toLowerCase();
// Preserve punctuation: distinct Discord handles must not collapse into one identity.
export const discordHandleKey = (value: string | null) => nameKey(value).replace(/^@/, "");

export function verifyRegistration(
  registration: RegistrationIdentity,
  mappings: RegistrationMapping[],
  members: RegistrationGuildMember[],
  ratings: RegistrationRating[],
) {
  const ign = nameKey(registration.direwolf_name);
  const handle = discordHandleKey(registration.discord_username);
  const rating = ratings.find((row) => nameKey(row.player_key) === ign || nameKey(row.display_name) === ign);
  const member = handle ? members.find((row) => discordHandleKey(row.discord_username) === handle) : undefined;
  const matches = handle ? mappings.filter((row) =>
    discordHandleKey(row.discord_username) === handle || (!!member && row.discord_user_id === member.discord_user_id),
  ) : [];
  const mapped = matches.find((row) => row.player_key &&
    [row.player_key, row.display_name].some((name) => nameKey(name) === ign));
  const conflicting = matches.find((row) => !!row.player_key);
  const discordStatus = !handle ? "missing" : mapped ? "verified" : conflicting ? "mismatch" :
    member?.has_verified_map ? "mapped-in-guild" : member ? "in-guild" : "not-found";
  return { rating, discordStatus, mappedName: conflicting?.display_name || conflicting?.player_key || null };
}

export function registrationTimezoneLabel(timezone: string | null, at = new Date()): string {
  if (!timezone) return "Timezone not provided";
  try {
    const offset = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, timeZoneName: "shortOffset" })
      .formatToParts(at).find((part) => part.type === "timeZoneName")?.value.replace("GMT", "UTC");
    return offset ? `${timezone} (${offset})` : timezone;
  } catch {
    return `${timezone} (unrecognized timezone)`;
  }
}