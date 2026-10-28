export const SURVEY_PROMPT_KEY = "sa:surveyPrompt";
export const SURVEY_MIN_INTERACTIONS = 20;
export const SURVEY_SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

export type SurveyPromptState = { interactions: number; snoozedUntil: number; never: boolean };

export function readPromptState(raw: string | null): SurveyPromptState {
  try {
    const v = raw ? JSON.parse(raw) : {};
    return { interactions: Number(v.interactions) || 0, snoozedUntil: Number(v.snoozedUntil) || 0, never: !!v.never };
  } catch {
    return { interactions: 0, snoozedUntil: 0, never: false };
  }
}

export function shouldPromptSurvey(s: SurveyPromptState, now: number, hasAnswered: boolean): boolean {
  return !hasAnswered && !s.never && s.interactions >= SURVEY_MIN_INTERACTIONS && now >= s.snoozedUntil;
}

export function snooze(s: SurveyPromptState, now: number): SurveyPromptState {
  return { ...s, snoozedUntil: now + SURVEY_SNOOZE_MS };
}
