export type UploaderClaimedName = {
  key: string;
  name: string;
  gamesPlayed: number;
};

export type UploaderSeatCandidate = {
  detectedName: string;
  placement: number;
  key: string;
  takenByAnotherAccount: boolean;
  gamesPlayed: number;
};

export const uploadNameKey = (name: string) => name.trim().toLowerCase();

/** Confusable glyphs are compared only to suggest a mapping; the uploader must confirm it. */
export function uploadNameShape(name: string): string {
  return uploadNameKey(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/rn/g, "m")
    .replace(/vv/g, "w")
    .replace(/[li1|!\]\[]/g, "i")
    .replace(/[o0]/g, "o")
    .replace(/[^a-z0-9]/g, "");
}

/** An account may claim several IGNs; any one on the screenshot suppresses the prompt. */
export function shouldPromptForUploader(detectedNames: string[], claimedNames: UploaderClaimedName[]): boolean {
  const detected = new Set(detectedNames.map(uploadNameKey).filter(Boolean));
  return !claimedNames.some((claim) => detected.has(claim.key));
}

/** Preselect only by elimination, never merely because a seat is the first unclaimed row. */
export function preselectUploaderSeat(candidates: UploaderSeatCandidate[]): string | null {
  const available = candidates.filter((candidate) => !candidate.takenByAnotherAccount);
  return available.length === 1 ? available[0].key : null;
}

/** Suggest an existing claimed IGN only for an unambiguous confusable-glyph match. */
export function suggestUploaderCanonicalName(
  detectedName: string,
  claimedNames: UploaderClaimedName[],
): UploaderClaimedName | null {
  const shape = uploadNameShape(detectedName);
  if (!shape) return null;
  const hits = claimedNames.filter((claim) => uploadNameShape(claim.name) === shape);
  return hits.length === 1 ? hits[0] : null;
}
