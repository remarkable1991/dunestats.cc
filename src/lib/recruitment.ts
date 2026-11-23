export type RecruitPackage = { name: string; value: string; blurb: string; items: string[] };

export type RecruitEdition = {
  id: "summer-2026" | "winter-2026";
  label: string;
  start: string; // inclusive ISO
  end: string; // exclusive ISO
  periodLabel: string;
};

export const RECRUIT_EDITIONS: RecruitEdition[] = [
  {
    id: "winter-2026",
    label: "Winter 2026",
    start: "2026-11-23T00:00:00Z",
    end: "2027-01-01T00:00:00Z",
    periodLabel: "Nov 23 – Dec 31, 2026",
  },
  {
    id: "summer-2026",
    label: "Summer 2026",
    start: "2026-07-01T00:00:00Z",
    end: "2026-09-01T00:00:00Z",
    periodLabel: "Jul 1 – Aug 31, 2026",
  },
];

export const SUMMER_PRIZES = ["Wingspan", "Terraforming Mars", "Dune: Imperium"];

export const WINTER_GRAND_PRIZE = "Physical Dune: Imperium expansion shipped to your home (Conspiracy by default)";

/** Community total points that unlock 4th and 5th place prizes. */
export const WINTER_STRETCH_GOALS = [
  { points: 250, place: 4 },
  { points: 500, place: 5 },
] as const;

/** Number of prize places for the winter edition given the community total. */
export function winterPrizePlaces(communityPoints: number): number {
  let places = 3;
  for (const g of WINTER_STRETCH_GOALS) if (communityPoints >= g.points) places = g.place;
  return places;
}

export function editionStatus(e: RecruitEdition, now = Date.now()): "upcoming" | "active" | "finished" {
  if (now < Date.parse(e.start)) return "upcoming";
  if (now >= Date.parse(e.end)) return "finished";
  return "active";
}

export const WINTER_PACKAGES: RecruitPackage[] = [
  {
    name: "Package 1: The Engineering & Vehicle Sandbox Bundle",
    value: "~$55 – $60",
    blurb: "Best for players who love physics, vehicle customization, and tinkering.",
    items: [
      "TerraTech (Base Game) — design, build and command a fleet of custom vehicles in an open-world sandbox.",
      "TerraTech: R&D Labs",
      "Fantabulous Contraptions Pack",
      "To the Stars Pack",
      "Warriors of Future Past Pack",
      "Weapons of War Pack",
      "Skin Pack: Falcon Genesis",
      "Kickstarter Skin Pack",
    ],
  },
  {
    name: "Package 2: The Sci-Fi Colony & Strategy Bundle",
    value: "~$55 – $61",
    blurb: "Best for strategic planners who enjoy resource logistics, terraforming, and high-stakes management.",
    items: [
      "Per Aspera Deluxe Edition — hard sci-fi planetary simulation terraforming Mars.",
      "Drill Core — tactical planetary-mining platformer defending your rig from nightly alien attacks.",
    ],
  },
  {
    name: "Package 3: The Post-Apocalyptic & Tactician Bundle",
    value: "~$55 – $60",
    blurb: "Best for survival-city builders and fans of large-scale siege warfare.",
    items: [
      "Endzone 2: Deluxe Bundle (Base Game + Soundtrack + Digital Artbook) — post-apocalyptic survival colony builder.",
      "Diplomacy Is Not An Option — massive-scale medieval RTS and castle defense.",
    ],
  },
  {
    name: "Package 4: The Charming & Cozy Builder Bundle",
    value: "~$56",
    blurb: "Best for players who prefer creative city-building, relaxed aesthetics, and clever puzzles.",
    items: [
      "SteamWorld Build — steampunk frontier city-builder with mines below.",
      "I Am Future: Cozy Apocalypse Survival — cozy rooftop survival with helpful robots.",
      "Urbo — meditative minimalist city-building puzzles.",
      "Gourdlets — wholesome sandbox town-builder with vegetable-folk.",
    ],
  },
];
