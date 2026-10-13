// Semi-finals trial seeding (port of TFile2LF.py). Independent from the
// qualifier matchmaker: standings → candidate pool → partition search → draft.

export type QualifierRow = {
  round_type: string;
  table_identifier: string;
  player_name: string;
  discord_username: string | null;
  placement: number | null;
  points: number | null;
  is_backup: boolean;
};

export type Standing = {
  player: string;
  discord: string | null;
  tp: number;
  wins: number;
  games: number;
  avgPlacement: number;
  vp: number;
  vpPct: number;
  rank: number;
};

export type SemiRegistration = {
  direwolf_name: string;
  discord_username: string | null;
  availability: unknown;
  updated_at: string;
};

export type SemiSlot = { start: number; type: "perfect" | "near"; missing: string[] };
export type ClosestWindow = { start: number; filled: number; total: number; perPlayer: { player: string; blocks: boolean[] }[] };
export type SemiTable = { name: string; players: string[]; slots: SemiSlot[]; avgTp: number; avgRank: number; closest: ClosestWindow[]; noAvailability: string[]; availableHours: Record<string, number> };
export type SemiAlternative = { score: number; tables: string[][]; perfect: number; near: number; bestFilled: number };
export type SemiDraft = { tables: SemiTable[]; score: number; partitionsTested: number; slotsScanned: number; alternatives: SemiAlternative[] };

const SWISS = new Set(["Game 1", "Game 2", "Game 3", "Game_1", "Game_2", "Game_3"]);
const SLOT_MS = 30 * 60_000;
const WINDOW = 4; // 2 hours
const SPACING = 20; // 10 hours

/** Official order: TP → wins → avg placement (low) → VP → VP share % → name. */
export function computeStandings(rows: QualifierRow[]): Standing[] {
  const tables = new Map<string, QualifierRow[]>();
  for (const r of rows) {
    if (!SWISS.has(r.round_type)) continue;
    const k = `${r.round_type}__${r.table_identifier}`;
    tables.set(k, [...(tables.get(k) ?? []), r]);
  }
  type Agg = { player: string; discord: string | null; tp: number; wins: number; placements: number[]; vp: number; share: number };
  const map = new Map<string, Agg>();
  for (const t of tables.values()) {
    const ranked = t.filter((r) => r.placement && r.points != null).sort((a, b) => (a.placement ?? 9) - (b.placement ?? 9));
    if (ranked.length < 4) continue;
    const vps = ranked.map((r) => r.points ?? 0);
    const total = vps.reduce((s, n) => s + n, 0);
    const tps = [20 + (vps[0] - vps[1]), 15 - (vps[0] - vps[1]), 10 - (vps[0] - vps[2]), 5 - (vps[0] - vps[3])].map((v) => Math.max(0, v));
    ranked.forEach((r, i) => {
      if (r.is_backup) return; // substitutes are not seeded
      const a = map.get(r.player_name) ?? { player: r.player_name, discord: r.discord_username, tp: 0, wins: 0, placements: [], vp: 0, share: 0 };
      a.tp += tps[i] ?? 0;
      if (r.placement === 1) a.wins += 1;
      a.placements.push(r.placement ?? 0);
      a.vp += r.points ?? 0;
      a.share += total > 0 ? (r.points ?? 0) / total : 0;
      if (r.discord_username) a.discord = r.discord_username;
      map.set(r.player_name, a);
    });
  }
  // Registered-but-unscored players still appear (0s) so nobody goes missing.
  for (const r of rows) {
    if (r.is_backup || !SWISS.has(r.round_type) || map.has(r.player_name)) continue;
    map.set(r.player_name, { player: r.player_name, discord: r.discord_username, tp: 0, wins: 0, placements: [], vp: 0, share: 0 });
  }
  const list = [...map.values()].map((a) => ({
    player: a.player,
    discord: a.discord,
    tp: a.tp,
    wins: a.wins,
    games: a.placements.length,
    avgPlacement: a.placements.length ? a.placements.reduce((s, n) => s + n, 0) / a.placements.length : 4,
    vp: a.vp,
    vpPct: a.placements.length ? (a.share / a.placements.length) * 100 : 0,
    rank: 0,
  }));
  list.sort((a, b) => b.tp - a.tp || b.wins - a.wins || a.avgPlacement - b.avgPlacement || b.vp - a.vp || b.vpPct - a.vpPct || a.player.localeCompare(b.player));
  list.forEach((s, i) => (s.rank = i + 1));
  return list;
}

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

export function findRegistration(player: string, discord: string | null, regs: SemiRegistration[]) {
  return regs.find((r) => norm(r.direwolf_name) === norm(player)) ?? (discord ? regs.find((r) => norm(r.discord_username) === norm(discord)) : undefined);
}

function slotsOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  if (typeof value === "string") { try { const p: unknown = JSON.parse(value); return Array.isArray(p) ? p.filter((v): v is string => typeof v === "string") : []; } catch { return []; } }
  return [];
}

function bitmap(avail: unknown, start: number, count: number): Uint8Array {
  const b = new Uint8Array(count);
  for (const iso of slotsOf(avail)) {
    const t = Date.parse(iso);
    if (Number.isNaN(t)) continue;
    const i = Math.floor((t - start) / SLOT_MS);
    if (i >= 0 && i < count) b[i] = 1;
  }
  return b;
}

function tableSlots(players: string[], maps: Map<string, Uint8Array>, count: number, target: number): SemiSlot[] {
  const bms = players.map((p) => maps.get(p)!);
  const sum = new Uint8Array(count);
  for (const b of bms) for (let i = 0; i < count; i++) sum[i] += b[i];
  const out: SemiSlot[] = [];
  const far = (i: number) => out.every((s) => Math.abs(s.start - i) >= SPACING);
  for (let i = 0; i + WINDOW <= count && out.length < target; i++) {
    let ok = true;
    for (let k = 0; k < WINDOW; k++) if (sum[i + k] !== 4) { ok = false; break; }
    if (ok && far(i)) out.push({ start: i, type: "perfect", missing: [] });
  }
  for (let i = 0; i + WINDOW <= count && out.length < target; i++) {
    let tot = 0, min = 4;
    for (let k = 0; k < WINDOW; k++) { tot += sum[i + k]; min = Math.min(min, sum[i + k]); }
    if (tot / WINDOW < 3 || min < 2 || !far(i)) continue;
    const missing = players.filter((_, pi) => { for (let k = 0; k < WINDOW; k++) if (!bms[pi][i + k]) return true; return false; });
    out.push({ start: i, type: "near", missing });
  }
  return out.sort((a, b) => a.start - b.start);
}

/** Best 2-hour windows by player-slots filled (out of 16), even when nobody lines up fully. */
function closestWindows(players: string[], maps: Map<string, Uint8Array>, count: number, take = 3): { start: number; filled: number; perPlayer: { player: string; blocks: boolean[] }[] }[] {
  const bms = players.map((p) => maps.get(p)!);
  const cands: { i: number; tot: number }[] = [];
  for (let i = 0; i + WINDOW <= count; i++) {
    let tot = 0;
    for (const b of bms) for (let k = 0; k < WINDOW; k++) tot += b[i + k];
    if (tot > 0) cands.push({ i, tot });
  }
  cands.sort((a, b) => b.tot - a.tot || a.i - b.i);
  const out: { i: number; tot: number }[] = [];
  for (const c of cands) {
    if (out.length >= take) break;
    if (out.every((o) => Math.abs(o.i - c.i) >= SPACING)) out.push(c);
  }
  return out.map((c) => ({
    start: c.i,
    filled: c.tot,
    perPlayer: players.map((p, pi) => ({ player: p, blocks: Array.from({ length: WINDOW }, (_, k) => !!bms[pi][c.i + k]) })),
  }));
}

const mean = (xs: number[]) => xs.reduce((s, n) => s + n, 0) / (xs.length || 1);
const std = (xs: number[]) => { const m = mean(xs); return Math.sqrt(mean(xs.map((x) => (x - m) ** 2))); };

function overlapHours(a: Uint8Array, b: Uint8Array) { let n = 0; for (let i = 0; i < a.length; i++) n += Math.min(a[i], b[i]); return n / 2; }

/** All ways to split players into groups of 4 (exhaustive; 8 players → 35). */
function partitions(players: string[]): string[][][] {
  if (players.length === 0) return [[]];
  const [first, ...rest] = players;
  const out: string[][][] = [];
  const combos = (arr: string[], k: number, start = 0, acc: string[] = []): string[][] => {
    if (acc.length === k) return [acc];
    const r: string[][] = [];
    for (let i = start; i < arr.length; i++) r.push(...combos(arr, k, i + 1, [...acc, arr[i]]));
    return r;
  };
  for (const c of combos(rest, 3)) {
    const group = [first, ...c];
    const remaining = rest.filter((p) => !c.includes(p));
    for (const tail of partitions(remaining)) out.push([group, ...tail]);
  }
  return out;
}

export function runSemiSearch(opts: {
  pool: Standing[];
  regs: SemiRegistration[];
  windowStart: Date;
  windowEnd: Date;
  targetSlots: number;
}): SemiDraft | null {
  const { pool, regs, targetSlots } = opts;
  if (pool.length < 4 || pool.length % 4 !== 0) return null;
  const start = Math.ceil(opts.windowStart.getTime() / SLOT_MS) * SLOT_MS;
  const count = Math.max(0, Math.floor((opts.windowEnd.getTime() - start) / SLOT_MS));
  const maps = new Map<string, Uint8Array>();
  const meta = new Map(pool.map((s) => [s.player, s]));
  for (const s of pool) maps.set(s.player, bitmap(findRegistration(s.player, s.discord, regs)?.availability, start, count));

  // Exhaustive up to 12 players (5,775 splits); beyond that seed by snake order only.
  const names = pool.map((s) => s.player);
  const parts = names.length <= 12 ? partitions(names) : [snake(names, names.length / 4)];
  let best: SemiDraft | null = null;
  const alts: SemiAlternative[] = [];
  for (const tables of parts) {
    const slots = tables.map((t) => tableSlots(t, maps, count, targetSlots));
    const perfect = slots.map((s) => s.filter((x) => x.type === "perfect").length);
    const totals = slots.map((s) => s.length);
    const compat = tables.map((t) => { const h: number[] = []; for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) h.push(overlapHours(maps.get(t[i])!, maps.get(t[j])!)); return mean(h); });
    const tps = tables.map((t) => mean(t.map((p) => meta.get(p)!.tp)));
    const ranks = tables.map((t) => mean(t.map((p) => meta.get(p)!.rank)));
    let score = Math.min(...perfect) * 20000 + Math.min(...totals) * 5000 + totals.reduce((a, b) => a + b, 0) * 500;
    score += compat.reduce((a, b) => a + b, 0) * 10;
    score -= std(tps) * 2 + std(ranks) * 1.5;
    const bestFilled = Math.min(...tables.map((t) => closestWindows(t, maps, count, 1)[0]?.filled ?? 0));
    score += bestFilled * 50; // reward splits whose closest window is nearer to 16/16
    alts.push({ score, tables: tables.map((t) => [...t].sort((a, b) => meta.get(a)!.rank - meta.get(b)!.rank)), perfect: perfect.reduce((a, b) => a + b, 0), near: totals.reduce((a, b) => a + b, 0) - perfect.reduce((a, b) => a + b, 0), bestFilled });
    if (!best || score > best.score) {
      best = {
        score,
        partitionsTested: parts.length,
        slotsScanned: count,
        alternatives: [],
        tables: tables
          .map((t, i) => {
            const players = [...t].sort((a, b) => meta.get(a)!.rank - meta.get(b)!.rank);
            const hours: Record<string, number> = {};
            for (const p of players) hours[p] = maps.get(p)!.reduce((s, n) => s + n, 0) / 2;
            return {
              players,
              slots: slots[i],
              avgTp: tps[i],
              avgRank: ranks[i],
              closest: closestWindows(players, maps, count, 3).map((c) => ({ ...c, start: start + c.start * SLOT_MS, total: players.length * WINDOW })),
              noAvailability: players.filter((p) => hours[p] === 0),
              availableHours: hours,
            };
          })
          .sort((a, b) => a.avgRank - b.avgRank)
          .map((t, i) => ({ ...t, name: `Semi Final ${i + 1}`, slots: t.slots.map((s) => ({ ...s, start: start + s.start * SLOT_MS })) })),
      };
    }
  }
  if (best) best.alternatives = alts.sort((a, b) => b.score - a.score).slice(1, 4);
  return best;
}

function snake(names: string[], n: number): string[][] {
  const out: string[][] = Array.from({ length: n }, () => []);
  names.forEach((p, i) => { const round = Math.floor(i / n); const pos = i % n; out[round % 2 === 0 ? pos : n - 1 - pos].push(p); });
  return out;
}

export function slotUnix(slot: SemiSlot) { return Math.floor(slot.start / 1000); }

export function announcement(num: number, draft: SemiDraft, gf: Standing[]) {
  const lines = [`**Tournament ${num} — Semi-Finals**`, ""];
  if (gf.length) lines.push(`Direct to Grand Final: ${gf.map((s) => s.player).join(", ")}`, "");
  for (const t of draft.tables) {
    lines.push(`__${t.name}__: ${t.players.join(", ")}`);
    t.slots.forEach((s, i) => lines.push(`Option ${i + 1}: <t:${slotUnix(s)}:F>${s.missing.length ? ` (3/4 — check ${s.missing.join(", ")})` : ""}`));
    lines.push("");
  }
  return lines.join("\n");
}

export function botCsv(num: number, draft: SemiDraft, discord: (p: string) => string | null) {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const head = ["tournament_num", "round_type", "table_identifier", "players", "discord_usernames", "slot_1", "slot_2", "slot_3"];
  const rows = draft.tables.map((t) => [String(num), "Finals", t.name, t.players.join(";"), t.players.map((p) => discord(p) ?? p).join(";"), ...[0, 1, 2].map((i) => (t.slots[i] ? new Date(t.slots[i].start).toISOString() : ""))]);
  return [head, ...rows].map((r) => r.map(esc).join(",")).join("\n");
}
