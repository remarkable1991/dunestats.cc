# Stricter auto-correction of player names from screenshots

## Problem

In match SOMA-MAULER-8008 the screenshot name "Raven" was silently changed to "Riven",
an existing player. The name matcher currently accepts any single-character difference
(two characters for names of 8+ letters), so genuinely different short names get merged.

## What changes

Keep the helpful cases, drop the risky ones:

- Keep: exact match ignoring capitals (l/L, case fixes).
- Keep: look-alike character fixes — l/I/1/|, O/0, rn/m, vv/w, S/5, B/8, G/6, Z/2 —
  and repeated-letter differences (iiii vs i).
- Stop: swapping one ordinary letter for another unrelated letter (a -> i, as in Raven -> Riven).
- Stop: correcting very short names (under 5 characters) at all.
- Stop: correcting when two known players are equally close — ambiguous, so leave as read.

Anything not confidently matched is kept exactly as the screenshot shows it, which is
already handled downstream: the uploader sees the name in the review step and the
tournament flow flags unknown names for approval.

## Technical detail

`src/lib/name-normalize.ts`:

- Priority 1 (exact, case-insensitive) and priority 2 (shape key with confusable glyph
  collapsing) stay as they are — these cover the L/I/1 and rn/m cases.
- Replace priority 3 (plain Levenshtein <= 1 or <= 2) with a guarded variant:
  - Only run for names of length >= 5.
  - Compute a distance of at most 1 on the *shape keys* rather than the raw strings, so
    only differences that survive glyph collapsing count. Because "raven"/"riven" differ
    by a real vowel, their shape keys still differ, and the edit is a
    letter-to-letter substitution outside the confusable set, so it is rejected.
  - Accept only edits classified as: an insertion/deletion of a character identical to
    its neighbour (repeat runs), or a substitution between two characters in the
    confusable set.
  - Reject when more than one master name qualifies.
- No change to `src/routes/upload.tsx` or `src/routes/tournament.tsx`; they keep calling
  `normalizeNames` the same way.
