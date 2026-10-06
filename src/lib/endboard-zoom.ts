/**
 * Guided zoom areas for the endboard verifier (mobile/iPad).
 *
 * Every box is [x0, y0, x1, y1] as a fraction of the screenshot:
 * x = left → right, y = top → bottom (0 = top-left, 1 = bottom-right).
 * Boxes are deliberately generous so small device differences still keep
 * the information inside the zoom. Tweak the numbers freely.
 */
export type Box = [number, number, number, number];
export type ZoomLayout = "pc" | "phone";

/** Screenshots wider than this aspect ratio (w/h) use the phone layout. */
export const PHONE_ASPECT_THRESHOLD = 1.85;

export const FACTIONS = [
  { key: "emperor", label: "Emperor" },
  { key: "spacing_guild", label: "Spacing Guild" },
  { key: "bene_gesserit", label: "Bene Gesserit" },
  { key: "fremen", label: "Fremen" },
] as const;
export type FactionKey = (typeof FACTIONS)[number]["key"];

type LayoutBoxes = {
  slots: Record<1 | 2 | 3 | 4, Box>;
  /** Full vertical faction track (all four factions stacked top → bottom). */
  track: Box;
  /** Extra space around each faction's quarter of the track (fraction of image). */
  factionPadY: number;
  councilSwordmaster: Box;
};

export const ZOOM_BOXES: Record<ZoomLayout, LayoutBoxes> = {
  pc: {
    slots: {
      1: [0.0, 0.0, 0.19, 0.2],
      2: [0.0, 0.13, 0.19, 0.38],
      3: [0.0, 0.3, 0.19, 0.76], // lots of empty space between slot 3 and 4 on PC
      4: [0.0, 0.7, 0.21, 1.0],
    },
    track: [0.13, 0.04, 0.28, 0.78],
    factionPadY: 0.05,
    councilSwordmaster: [0.33, 0.02, 0.72, 0.3],
  },
  phone: {
    slots: {
      1: [0.0, 0.0, 0.26, 0.25],
      2: [0.0, 0.17, 0.26, 0.45],
      3: [0.0, 0.36, 0.26, 0.68], // sits right above slot 4 on phones
      4: [0.0, 0.58, 0.26, 0.96],
    },
    track: [0.19, 0.05, 0.36, 0.78],
    factionPadY: 0.05,
    councilSwordmaster: [0.31, 0.02, 0.72, 0.31],
  },
};

export function layoutForAspect(aspect: number): ZoomLayout {
  return aspect > PHONE_ASPECT_THRESHOLD ? "phone" : "pc";
}

export function factionBox(layout: ZoomLayout, index: number): Box {
  const { track, factionPadY } = ZOOM_BOXES[layout];
  const [x0, y0, x1, y1] = track;
  const step = (y1 - y0) / 4;
  return clampBox([x0, y0 + step * index - factionPadY, x1, y0 + step * (index + 1) + factionPadY]);
}

export function clampBox([x0, y0, x1, y1]: Box): Box {
  return [Math.max(0, x0), Math.max(0, y0), Math.min(1, x1), Math.min(1, y1)];
}
