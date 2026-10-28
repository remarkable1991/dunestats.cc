import { describe, expect, it } from "vitest";
import { shouldPromptSurvey, snooze } from "../src/lib/survey-prompt";

const base = { interactions: 20, snoozedUntil: 0, never: false };

describe("survey prompt", () => {
  it("needs at least 20 interactions", () => {
    expect(shouldPromptSurvey({ ...base, interactions: 19 }, 0, false)).toBe(false);
    expect(shouldPromptSurvey(base, 0, false)).toBe(true);
  });
  it("maybe later waits 14 days", () => {
    const s = snooze(base, 0);
    expect(shouldPromptSurvey(s, 13 * 86400000, false)).toBe(false);
    expect(shouldPromptSurvey(s, 14 * 86400000, false)).toBe(true);
  });
  it("never and already answered stop prompting", () => {
    expect(shouldPromptSurvey({ ...base, never: true }, 0, false)).toBe(false);
    expect(shouldPromptSurvey(base, 0, true)).toBe(false);
  });
});
