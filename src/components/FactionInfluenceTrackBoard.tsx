import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  colorHex,
  FACTION_ALLIANCE_KEYS,
  FACTION_LEVEL_KEYS,
  type FactionKey,
  type TelemetryPlayer,
} from "@/lib/match-telemetry";
import emperorToken from "@/assets/alliances/Emperor.png.asset.json";
import guildToken from "@/assets/alliances/Guild.png.asset.json";
import beneToken from "@/assets/alliances/Bene.png.asset.json";
import fremenToken from "@/assets/alliances/Fremen.png.asset.json";

const MAX_LEVEL = 6;
const ALLIANCE_LEVEL = 4;

type FactionMeta = {
  key: FactionKey;
  label: string;
  token: string;
  accent: string;
  tint: string;
};

export const FACTIONS: FactionMeta[] = [
  { key: "emperor", label: "Emperor", token: emperorToken.url, accent: "#c9ccd4", tint: "rgba(120,126,138,0.16)" },
  { key: "spacing_guild", label: "Spacing Guild", token: guildToken.url, accent: "#e0794f", tint: "rgba(190,86,60,0.16)" },
  { key: "bene_gesserit", label: "Bene Gesserit", token: beneToken.url, accent: "#b08adf", tint: "rgba(126,79,177,0.18)" },
  { key: "fremen", label: "Fremen", token: fremenToken.url, accent: "#6ea8d8", tint: "rgba(60,100,150,0.18)" },
];

/** Columns run Slot 4 · Slot 1 · Slot 2 · Slot 3, mirroring the in-game roster. */
const SLOT_ORDER = [4, 1, 2, 3];

function levelOf(p: TelemetryPlayer, f: FactionKey): number | null {
  const v = p[FACTION_LEVEL_KEYS[f]];
  return v === null || v === undefined ? null : Number(v);
}

function allianceOf(p: TelemetryPlayer, f: FactionKey): boolean {
  return p[FACTION_ALLIANCE_KEYS[f]] === true;
}

/** Alliance tokens a player currently holds — used by the nameplates. */
export function alliancesHeldBy(p: TelemetryPlayer): FactionMeta[] {
  return FACTIONS.filter((f) => allianceOf(p, f.key));
}

/** 3D-styled player cube. */
function PlayerCube({ hex, size = 14 }: { hex: string; size?: number }) {
  return (
    <span
      className="inline-block rounded-[3px]"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(145deg, color-mix(in srgb, ${hex} 78%, white), ${hex} 55%, color-mix(in srgb, ${hex} 70%, black))`,
        boxShadow: `0 1px 2px rgba(0,0,0,0.6), inset 0 1px 1px rgba(255,255,255,0.45), 0 0 8px ${hex}66`,
        border: "1px solid rgba(0,0,0,0.45)",
      }}
    />
  );
}

export function FactionInfluenceTrackBoard({
  players,
  canEdit = false,
  onUpdateInfluence,
  compact = false,
}: {
  players: TelemetryPlayer[];
  canEdit?: boolean;
  onUpdateInfluence?: (next: TelemetryPlayer[], message: string) => void;
  compact?: boolean;
}) {
  const [conflict, setConflict] = useState<{
    faction: FactionMeta;
    level: number;
    candidates: TelemetryPlayer[];
    base: TelemetryPlayer[];
  } | null>(null);

  const columns = SLOT_ORDER.map((slot) =>
    players.find((p) => (p.player_slot ?? 0) === slot),
  );
  // Fall back to placement order when slots were never recorded.
  const resolved = columns.every((c) => !c)
    ? [...players].sort((a, b) => a.placement - b.placement).slice(0, 4)
    : columns;

  const cellH = compact ? 13 : 16;
  const gap = 2;

  const applyAlliance = (next: TelemetryPlayer[], f: FactionMeta, holder?: string) => {
    const key = FACTION_ALLIANCE_KEYS[f.key];
    return next.map((p) => ({ ...p, [key]: holder ? p.player_name === holder : false }));
  };

  const setLevel = (player: TelemetryPlayer, f: FactionMeta, level: number) => {
    if (!canEdit || !onUpdateInfluence) return;
    const levelKey = FACTION_LEVEL_KEYS[f.key];
    const current = levelOf(player, f.key);
    const value = current === level ? null : level;
    let next = players.map((p) =>
      p.player_name === player.player_name ? { ...p, [levelKey]: value } : p,
    );

    const scored = next.filter((p) => (levelOf(p, f.key) ?? 0) >= ALLIANCE_LEVEL);
    if (scored.length === 0) {
      onUpdateInfluence(applyAlliance(next, f), `${f.label} influence updated`);
      return;
    }
    const top = Math.max(...scored.map((p) => levelOf(p, f.key) ?? 0));
    const leaders = scored.filter((p) => (levelOf(p, f.key) ?? 0) === top);
    if (leaders.length > 1) {
      setConflict({ faction: f, level: top, candidates: leaders, base: next });
      return;
    }
    next = applyAlliance(next, f, leaders[0].player_name);
    onUpdateInfluence(next, `${f.label} influence updated`);
  };

  const resolveConflict = (name: string) => {
    if (!conflict || !onUpdateInfluence) return;
    onUpdateInfluence(
      applyAlliance(conflict.base, conflict.faction, name),
      `${conflict.faction.label} alliance assigned to ${name}`,
    );
    setConflict(null);
  };

  return (
    <Card className="p-2 border-border/60 bg-card/70 w-full sm:w-[180px] shrink-0">
      <div className="space-y-2">
        {FACTIONS.map((f) => {
          const claimed = resolved.some((p) => p && allianceOf(p, f.key));
          const anyAtMilestone = resolved.some(
            (p) => p && (levelOf(p, f.key) ?? 0) >= ALLIANCE_LEVEL,
          );
          const showTrackToken = !claimed && !anyAtMilestone;
          // Upper playing field: rows 4–6 (from the bottom of the stack).
          const upperBottom = ALLIANCE_LEVEL * (cellH + gap);
          const upperHeight = 3 * cellH + 2 * gap;
          const tokenSize = upperHeight - 4;
          return (
            <div
              key={f.key}
              className="relative rounded-md border px-1 pb-1 pt-0.5"
              style={{ borderColor: `${f.accent}55`, background: f.tint }}
            >
              <div
                className="pb-0.5 text-center font-display uppercase tracking-[0.16em]"
                style={{ color: f.accent, fontSize: compact ? 8 : 9 }}
              >
                {f.label}
              </div>
              <div className="relative flex items-stretch">
                {resolved.map((p, i) => (
                  <div key={p?.player_name ?? `empty-${i}`} className="flex-1 px-[2px]">
                    <div className="flex flex-col-reverse" style={{ gap }}>
                      {Array.from({ length: MAX_LEVEL + 1 }, (_, lvl) => {
                        const active = p ? levelOf(p, f.key) === lvl : false;
                        const hex = p ? colorHex(p.player_color) : "#8b8b8b";
                        // Tiered backgrounds: box 0 darkest, 1–3 mid, 4–6 faction-lit.
                        const tierBg =
                          lvl === 0
                            ? "rgba(0,0,0,0.45)"
                            : lvl <= 3
                              ? "rgba(255,255,255,0.07)"
                              : `color-mix(in srgb, ${f.accent} 22%, rgba(0,0,0,0.35))`;
                        return (
                          <button
                            key={lvl}
                            type="button"
                            disabled={!canEdit || !p}
                            onClick={() => p && setLevel(p, f, lvl)}
                            title={p ? `${p.player_name} — ${f.label} ${lvl}` : undefined}
                            className={`relative flex items-center justify-center transition-all duration-200 ${
                              canEdit && p ? "cursor-pointer hover:brightness-125" : "cursor-default"
                            }`}
                            style={{
                              height: cellH,
                              background: active ? "transparent" : tierBg,
                              border:
                                lvl === 0
                                  ? "2px solid rgba(0,0,0,0.7)"
                                  : `1px solid ${f.accent}33`,
                              boxShadow:
                                lvl === 0
                                  ? "inset 0 2px 0 rgba(255,255,255,0.10), 0 2px 0 rgba(0,0,0,0.55)"
                                  : undefined,
                              borderRadius: lvl === 0 ? 3 : 2,
                            }}
                          >
                            {active && <PlayerCube hex={hex} size={cellH - 5} />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {/* Subtle horizontal dividers between steps 1|2 and 3|4. */}
                {[1, 3].map((lvl) => (
                  <div
                    key={lvl}
                    aria-hidden
                    className="pointer-events-none absolute left-0 right-0"
                    style={{
                      bottom: (lvl + 1) * (cellH + gap) - gap / 2,
                      borderTop: "1px solid rgba(255,255,255,0.12)",
                    }}
                  />
                ))}

                {/* Thick separator above box 0. */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute left-0 right-0"
                  style={{
                    bottom: (cellH + gap) - gap / 2 - 1,
                    borderTop: "3px solid rgba(0,0,0,0.6)",
                    boxShadow: "0 1px 0 rgba(255,255,255,0.10)",
                  }}
                />

                {/* Golden VP globe next to box 2. */}
                <div
                  aria-hidden
                  title="1 Victory Point at Level 2"
                  className="pointer-events-none absolute flex items-center justify-center rounded-full"
                  style={{
                    left: -7,
                    bottom: 2 * (cellH + gap) + cellH / 2,
                    transform: "translateY(50%)",
                    width: cellH,
                    height: cellH,
                    background:
                      "radial-gradient(circle at 35% 30%, #f7d98a, #caa03c 60%, #7a5b14)",
                    border: "1px solid #5c430d",
                    boxShadow: "0 0 6px rgba(247,217,138,0.55), 0 1px 2px rgba(0,0,0,0.6)",
                  }}
                >
                  <span
                    className="font-display font-bold"
                    style={{ color: "#3a2a05", fontSize: cellH * 0.55, lineHeight: 1 }}
                  >
                    1
                  </span>
                </div>

                {/* Alliance token next to box 4. */}
                {showTrackToken && (
                  <img
                    src={f.token}
                    alt=""
                    aria-hidden
                    title={`${f.label} Alliance at Level 4`}
                    className="pointer-events-none absolute rounded-full opacity-95 drop-shadow"
                    style={{
                      left: -8,
                      bottom: ALLIANCE_LEVEL * (cellH + gap) + cellH / 2,
                      transform: "translateY(50%)",
                      width: tokenSize,
                      height: tokenSize,
                      border: `1.5px solid ${f.accent}88`,
                      boxShadow: `0 0 8px ${f.accent}55, 0 1px 3px rgba(0,0,0,0.7)`,
                    }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={Boolean(conflict)} onOpenChange={(o) => !o && setConflict(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">
              Multiple players reached Level {conflict?.level} — who holds the Alliance token?
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            {conflict?.candidates.map((c) => (
              <Button
                key={c.player_name}
                variant="outline"
                className="justify-start gap-2"
                onClick={() => resolveConflict(c.player_name)}
              >
                <PlayerCube hex={colorHex(c.player_color)} size={12} />
                {c.player_name}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
