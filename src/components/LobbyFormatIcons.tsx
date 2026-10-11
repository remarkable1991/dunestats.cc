import type { LfgRow } from "@/lib/lfg-seats";
import uprising from "@/assets/uprising.png.asset.json";
import ix from "@/assets/ix.png.asset.json";
import immo from "@/assets/immo.png.asset.json";
import epic from "@/assets/epic.png.asset.json";
import choam from "@/assets/choam.png.asset.json";
import baseLeaders from "@/assets/base-leaders.png.asset.json";

const OPTIONS = [
  { needle: "ix", title: "Rise of Ix", src: ix.url },
  { needle: "immo", title: "Immortality", src: immo.url },
  { needle: "epic", title: "Epic Mode", src: epic.url },
  { needle: "base leader", title: "Base Leaders", src: baseLeaders.url },
  { needle: "choam", title: "CHOAM Module", src: choam.url },
];

export function LobbyFormatIcons({ row }: { row: LfgRow }) {
  const extras = [...(row.expansions ?? []), ...(row.modules ?? [])].join(" ").toLowerCase();
  const icons = [
    ...((row.board_type ?? "").toLowerCase().includes("uprising") ? [{ title: "Uprising", src: uprising.url }] : []),
    ...OPTIONS.filter((option) => extras.includes(option.needle)),
  ];
  return <span className="inline-flex flex-wrap items-center gap-1">
    {icons.map(({ title, src }) => <span key={title} title={title} className="inline-flex size-7 items-center justify-center rounded-full border border-border/60 bg-background/60">
      <img src={src} alt={title} className="size-4 object-contain" />
    </span>)}
  </span>;
}