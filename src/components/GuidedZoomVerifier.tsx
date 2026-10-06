import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { colorHex, type TelemetryPlayer } from "@/lib/match-telemetry";
import {
  FACTIONS,
  ZOOM_BOXES,
  factionBox,
  layoutForAspect,
  type Box,
  type ZoomLayout,
} from "@/lib/endboard-zoom";

/** Shows only the `box` region of the image, scaled to fill the width. */
function ZoomCrop({ src, box, aspect, className = "" }: { src: string; box: Box; aspect: number; className?: string }) {
  const [x0, y0, x1, y1] = box;
  const bw = x1 - x0;
  const bh = y1 - y0;
  return (
    <div
      className={`relative w-full overflow-hidden rounded border border-border/50 bg-background/40 ${className}`}
      style={{ aspectRatio: `${(bw * aspect) / bh}` }}
    >
      <img
        src={src}
        alt=""
        draggable={false}
        className="absolute max-w-none select-none transition-all duration-300"
        style={{
          width: `${100 / bw}%`,
          height: `${100 / bh}%`,
          left: `${(-x0 / bw) * 100}%`,
          top: `${(-y0 / bh) * 100}%`,
        }}
      />
    </div>
  );
}

type Step = { title: string; hint: string; box: Box; tie?: { level: number; players: TelemetryPlayer[] } };

export function GuidedZoomVerifier({ src, players }: { src: string; players: TelemetryPlayer[] }) {
  const [aspect, setAspect] = useState<number | null>(null);
  const [override, setOverride] = useState<ZoomLayout | null>(null);
  const [index, setIndex] = useState(0);
  const [full, setFull] = useState(false);

  const layout: ZoomLayout = override ?? (aspect ? layoutForAspect(aspect) : "pc");

  const steps = useMemo<Step[]>(() => {
    const bySlot = (s: number) => players.find((p) => p.player_slot === s);
    const list: Step[] = [1, 2, 3, 4].map((s) => {
      const p = bySlot(s);
      return {
        title: `Slot ${s}${p ? ` — ${p.player_name}` : ""}`,
        hint: "Check colour, points, resources and alliance badges.",
        box: ZOOM_BOXES[layout].slots[s as 1 | 2 | 3 | 4],
      };
    });
    FACTIONS.forEach((f, i) => {
      const levelOf = (p: TelemetryPlayer) =>
        (p as unknown as Record<string, number | null>)[`${f.key}_level`] ?? null;
      const max = Math.max(-1, ...players.map((p) => levelOf(p) ?? -1));
      const tied = max >= 4 ? players.filter((p) => levelOf(p) === max) : [];
      list.push({
        title: `${f.label} track`,
        hint: "Columns left → right: slot 4, 1, 2, 3.",
        box: factionBox(layout, i),
        tie: tied.length >= 2 ? { level: max, players: tied } : undefined,
      });
    });
    list.push({
      title: "High Council & Swordmasters",
      hint: "Check who holds a council seat and who recruited a swordmaster.",
      box: ZOOM_BOXES[layout].councilSwordmaster,
    });
    return list;
  }, [players, layout]);

  const step = steps[Math.min(index, steps.length - 1)];

  return (
    <div className="space-y-2">
      {/* hidden probe to read the screenshot's real aspect ratio */}
      <img
        src={src}
        alt=""
        className="hidden"
        onLoad={(e) => {
          const img = e.currentTarget;
          if (img.naturalHeight) setAspect(img.naturalWidth / img.naturalHeight);
        }}
      />
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Step {index + 1} of {steps.length}
          </div>
          <div className="font-display text-sm truncate">{full ? "Full board" : step.title}</div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setOverride(layout === "pc" ? "phone" : "pc")}
            className="rounded border border-border/60 px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground"
            title="Switch zoom layout if the crops look off"
          >
            {layout === "pc" ? "PC" : "Mobile"} layout
          </button>
          <Button size="icon" variant="ghost" className="size-7" onClick={() => setFull((v) => !v)} title="Full board">
            {full ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </Button>
        </div>
      </div>

      {aspect &&
        (full ? (
          <ZoomCrop src={src} box={[0, 0, 1, 1]} aspect={aspect} />
        ) : (
          <ZoomCrop src={src} box={step.box} aspect={aspect} className="max-h-[45vh] mx-auto" />
        ))}

      {!full && <p className="text-[11px] text-muted-foreground">{step.hint}</p>}

      {!full && step.tie && aspect && (
        <div className="rounded border border-amber-500/50 bg-amber-500/10 p-2 space-y-2">
          <div className="flex items-center gap-1.5 text-xs text-amber-500">
            <AlertTriangle className="size-3.5" />
            Tie at level {step.tie.level} — check who holds the alliance badge.
          </div>
          <div className="grid grid-cols-2 gap-2">
            {step.tie.players.map((p) =>
              p.player_slot ? (
                <div key={p.player_name} className="space-y-1">
                  <div className="text-[11px] truncate" style={{ color: colorHex(p.player_color) }}>
                    {p.player_name}
                  </div>
                  <ZoomCrop src={src} box={ZOOM_BOXES[layout].slots[p.player_slot as 1 | 2 | 3 | 4]} aspect={aspect} />
                </div>
              ) : null,
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <Button size="sm" variant="outline" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>
          <ChevronLeft className="size-4" /> Previous
        </Button>
        <div className="flex gap-1">
          {steps.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Go to step ${i + 1}`}
              onClick={() => { setIndex(i); setFull(false); }}
              className={`size-2 rounded-full ${i === index ? "bg-sand" : "bg-muted"}`}
            />
          ))}
        </div>
        <Button
          size="sm"
          disabled={index === steps.length - 1}
          onClick={() => { setIndex((i) => i + 1); setFull(false); }}
        >
          Next <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
