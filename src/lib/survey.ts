import uprisingIcon from "@/assets/uprising.png.asset.json";
import ixIcon from "@/assets/ix.png.asset.json";
import immoIcon from "@/assets/immo.png.asset.json";
import epicIcon from "@/assets/epic.png.asset.json";
import choamIcon from "@/assets/choam.png.asset.json";
import baseLeadersIcon from "@/assets/base-leaders.png.asset.json";
import liveIcon from "@/assets/live-mode.png.asset.json";
import asyncIcon from "@/assets/async-mode.png.asset.json";

export type QuestionType = "single_choice" | "multi_choice" | "stars" | "open_text" | "format_builder";

export const QUESTION_TYPES: { value: QuestionType; label: string }[] = [
  { value: "single_choice", label: "Pick one" },
  { value: "multi_choice", label: "Pick several" },
  { value: "stars", label: "Star rating (0-5)" },
  { value: "open_text", label: "Open answer" },
  { value: "format_builder", label: "Game format builder" },
];

export type SurveyOption = {
  value: string;
  label: string;
  hint?: string;
  icon?: string;
};

export type SurveyQuestion = {
  id: string;
  category_id: string;
  prompt: string;
  help_text: string;
  question_type: QuestionType;
  options: SurveyOption[] | { max?: number };
  is_required: boolean;
  sort_order: number;
  is_active: boolean;
};

export type SurveyCategory = {
  id: string;
  slug: string;
  title: string;
  description: string;
  intro: string;
  icon: string;
  sort_order: number;
  is_active: boolean;
};

/** Images shared with the LFG hub so the survey looks familiar. */
export const OPTION_IMAGES: Record<string, string> = {
  live: liveIcon.url,
  async: asyncIcon.url,
  both: liveIcon.url,
  uprising: uprisingIcon.url,
  ix: ixIcon.url,
  immo: immoIcon.url,
  epic: epicIcon.url,
};

export function asOptions(o: SurveyQuestion["options"]): SurveyOption[] {
  return Array.isArray(o) ? o : [];
}

export function builderMax(o: SurveyQuestion["options"]): number {
  return (!Array.isArray(o) && o?.max) || 3;
}

/* ------------------------------------------------------------------ */
/* Game format rules                                                    */
/* ------------------------------------------------------------------ */

export type BoardKey = "uprising" | "base";

export type FormatPick = {
  board: BoardKey;
  modules: string[];
};

export const BOARDS: { key: BoardKey; label: string; hint: string; image?: string }[] = [
  { key: "uprising", label: "Uprising", hint: "The newer standalone board", image: uprisingIcon.url },
  { key: "base", label: "Base game", hint: "The original Dune: Imperium board" },
];

export type ModuleDef = {
  key: string;
  label: string;
  hint: string;
  image?: string;
  boards: BoardKey[];
  requires?: string;
};

export const MODULES: ModuleDef[] = [
  { key: "choam", label: "CHOAM & Richese", hint: "Uprising only", image: choamIcon.url, boards: ["uprising"] },
  {
    key: "base_leaders",
    label: "Base leaders",
    hint: "Available with either board",
    image: baseLeadersIcon.url,
    boards: ["uprising", "base"],
  },
  { key: "ix", label: "Rise of Ix", hint: "Available with either board", image: ixIcon.url, boards: ["uprising", "base"] },
  {
    key: "immortality",
    label: "Immortality",
    hint: "Available with either board",
    image: immoIcon.url,
    boards: ["uprising", "base"],
  },
  {
    key: "epic",
    label: "Epic mode",
    hint: "Needs Rise of Ix",
    image: epicIcon.url,
    boards: ["uprising", "base"],
    requires: "ix",
  },
];

/** Why a module cannot be picked right now, or null when it is available. */
export function moduleBlockedReason(m: ModuleDef, pick: FormatPick): string | null {
  if (!m.boards.includes(pick.board)) {
    return m.boards.includes("uprising") ? "Only available on the Uprising board" : "Only available on the base game board";
  }
  if (m.requires && !pick.modules.includes(m.requires)) {
    const req = MODULES.find((x) => x.key === m.requires);
    return `Turn on ${req?.label ?? m.requires} first`;
  }
  return null;
}

/** Applies the rules after a change so no impossible combination can be saved. */
export function normalizeFormat(pick: FormatPick): FormatPick {
  let modules = pick.modules.filter((k) => {
    const def = MODULES.find((m) => m.key === k);
    return def ? def.boards.includes(pick.board) : false;
  });
  // Drop anything whose requirement was removed (repeat for chains).
  for (let i = 0; i < 3; i++) {
    modules = modules.filter((k) => {
      const def = MODULES.find((m) => m.key === k);
      return !def?.requires || modules.includes(def.requires);
    });
  }
  return { board: pick.board, modules };
}

export function emptyFormat(): FormatPick {
  return { board: "uprising", modules: [] };
}

export function formatLabel(pick: FormatPick): string {
  const board = BOARDS.find((b) => b.key === pick.board)?.label ?? pick.board;
  const mods = pick.modules.map((k) => MODULES.find((m) => m.key === k)?.label ?? k);
  return [board, ...mods].join(" · ");
}
