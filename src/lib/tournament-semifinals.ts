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
  id?: string;
  user_id?: string | null;
  timezone?: string | null;
  direwolf_name: string;
  discord_username: string | null;
  availability: unknown;
  updated_at: string;
};

export type SemiSlot = { start: number; blocks: number; filled: number; type: "perfect" | "near"; missing: string[] };
export type ClosestWindow = { start: number; blocks: number; filled: number; total: number; perPlayer: { player: string; blocks: boolean[] }[] };
export type SemiTable = { name: string; players: string[]; slots: SemiSlot[]; avgTp: number; avgRank: number; closest: ClosestWindow[]; noAvailability: string[]; availableHours: Record<string, number>; windowCounts: Record<number, number> };
export type SemiAlternative = { score: number; tables: string[][]; perfect: number; near: number; bestFilled: number; bestTotal: number };
export type SemiDraft = { tables: SemiTable[]; score: number; partitionsTested: number; slotsScanned: number; alternatives: SemiAlternative[] };

const SWISS = new Set(["Game 1", "Game 2", "Game 3", "Game_1", "Game_2", "Game_3"]);
const SLOT_MS = 30 * 60_000;
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

/** Only unique exact, verified-handle or punctuation-normalized matches are accepted. */
export function findRegistration(player: string, discord: string | null, regs: SemiRegistration[]) {
  const unique = (matches: SemiRegistration[]) => matches.length === 1 ? matches[0] : undefined;
  const exact = regs.filter((r) => norm(r.direwolf_name) === norm(player));
  if (exact.length) return unique(exact);
  if (discord) {
    const linked = regs.filter((r) => norm(r.discord_username) === norm(discord));
    if (linked.length) return unique(linked);
  }
  const compact = (s: string) => norm(s).normalize("NFKC").replace(/[^\p{L}\p{N}]/gu, "");
  return unique(regs.filter((r) => compact(r.direwolf_name) === compact(player)));
}

export function availabilityHours(value: unknown, windowStart: Date, windowEnd: Date) {
  return bitmap(value, Math.ceil(windowStart.getTime() / SLOT_MS) * SLOT_MS,
    Math.max(0, Math.floor((windowEnd.getTime() - Math.ceil(windowStart.getTime() / SLOT_MS) * SLOT_MS) / SLOT_MS)))
    .reduce((sum, n) => sum + n, 0) / 2;
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

type Candidate = { start: number; blocks: number; filled: number; perPlayer: { player: string; blocks: boolean[] }[] };

function candidates(players: string[], maps: Map<string, Uint8Array>, count: number, minBlocks: number, maxBlocks: number, minPlayerBlocks: number): Candidate[] {
  const out: Candidate[] = [];
  for (let blocks = maxBlocks; blocks >= minBlocks; blocks--) {
    for (let i = 0; i + blocks <= count; i++) {
      const perPlayer = players.map((player) => ({ player, blocks: Array.from({ length: blocks }, (_, k) => Boolean(maps.get(player)?.[i + k])) }));
      const totals = perPlayer.map((p) => p.blocks.filter(Boolean).length);
      // Zero-availability players are never treated as a scheduling fallback.
      if (totals.some((n) => n < minPlayerBlocks)) continue;
      const filled = totals.reduce((a, b) => a + b, 0);
      if (filled / blocks < 3) continue;
      out.push({ start: i, blocks, filled, perPlayer });
    }
  }
  // More shared minutes beats shorter windows; equal coverage favors full attendance.
  return out.sort((a, b) => b.filled - a.filled || b.filled / b.blocks - a.filled / a.blocks || a.start - b.start);
}

function spaced(cands: Candidate[], take: number): Candidate[] {
  const out: Candidate[] = [];
  for (const c of cands) {
    if (out.length >= take) break;
    if (out.every((o) => Math.abs(o.start - c.start) >= SPACING)) out.push(c);
  }
  return out;
}

function asSlot(c: Candidate): SemiSlot {
  const missing = c.perPlayer.filter((p) => p.blocks.some((b) => !b)).map((p) => p.player);
  return { start: c.start, blocks: c.blocks, filled: c.filled, type: missing.length ? "near" : "perfect", missing };
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
  minBlocks?: number;
  maxBlocks?: number;
  minPlayerBlocks?: number;
  registrationOverrides?: Record<string, string>;
}): SemiDraft | null {
  const { pool, regs, targetSlots } = opts;
  if (pool.length < 4 || pool.length % 4 !== 0) return null;
  const minBlocks = Math.min(4, Math.max(2, opts.minBlocks ?? 2));
  const maxBlocks = Math.min(4, Math.max(minBlocks, opts.maxBlocks ?? 4));
  const minPlayerBlocks = Math.min(minBlocks, Math.max(1, opts.minPlayerBlocks ?? 1));
  if (!Number.isFinite(opts.windowStart.getTime()) || !Number.isFinite(opts.windowEnd.getTime()) || opts.windowEnd <= opts.windowStart) return null;
  const start = Math.ceil(opts.windowStart.getTime() / SLOT_MS) * SLOT_MS;
  const count = Math.max(0, Math.floor((opts.windowEnd.getTime() - start) / SLOT_MS));
  const maps = new Map<string, Uint8Array>();
  const meta = new Map(pool.map((s) => [s.player, s]));
  for (const s of pool) {
    const override = opts.registrationOverrides?.[s.player];
    const registration = override ? regs.find((r) => r.id === override) : findRegistration(s.player, s.discord, regs);
    maps.set(s.player, bitmap(registration?.availability, start, count));
  }
  const cache = new Map<string, Candidate[]>();
  const getCandidates = (players: string[]) => {
    const key = [...players].sort().join("\u0001");
    const cached = cache.get(key);
    if (cached) return cached;
    const result = candidates(players, maps, count, minBlocks, maxBlocks, minPlayerBlocks);
    cache.set(key, result);
    return result;
  };

  // Exhaustive up to 12 players (5,775 splits); beyond that seed by snake order only.
  const names = pool.map((s) => s.player);
  const parts = names.length <= 12 ? partitions(names) : [snake(names, names.length / 4)];
  let best: SemiDraft | null = null;
  const alts: SemiAlternative[] = [];
  for (const tables of parts) {
    const candidateLists = tables.map(getCandidates);
    const slots = candidateLists.map((cs) => spaced(cs, targetSlots).map(asSlot));
    const perfect = slots.map((s) => s.filter((x) => x.type === "perfect").length);
    const totals = slots.map((s) => s.length);
    const compat = tables.map((t) => { const h: number[] = []; for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) h.push(overlapHours(maps.get(t[i]) ?? new Uint8Array(count), maps.get(t[j]) ?? new Uint8Array(count))); return mean(h); });
    const tps = tables.map((t) => mean(t.map((p) => meta.get(p)?.tp ?? 0)));
    const ranks = tables.map((t) => mean(t.map((p) => meta.get(p)?.rank ?? 0)));
    const bestFilled = Math.min(...candidateLists.map((cs) => cs[0]?.filled ?? 0));
    const bestTotal = Math.min(...candidateLists.map((cs) => (cs[0]?.blocks ?? maxBlocks) * 4));
    // Prioritize the weakest table's viable shared minutes before balance.
    let score = bestFilled * 20000 + candidateLists.reduce((n, cs) => n + (cs[0]?.filled ?? 0), 0) * 500;
    score += Math.min(...totals) * 100 + Math.min(...perfect) * 50;
    score += compat.reduce((a, b) => a + b, 0) * 10;
    score -= std(tps) * 2 + std(ranks) * 1.5;
    alts.push({ score, tables: tables.map((t) => [...t].sort((a, b) => (meta.get(a)?.rank ?? 0) - (meta.get(b)?.rank ?? 0))), perfect: perfect.reduce((a, b) => a + b, 0), near: totals.reduce((a, b) => a + b, 0) - perfect.reduce((a, b) => a + b, 0), bestFilled, bestTotal });
    if (!best || score > best.score) {
      best = {
        score,
        partitionsTested: parts.length,
        slotsScanned: count,
        alternatives: [],
        tables: tables
          .map((t, i) => {
            const players = [...t].sort((a, b) => (meta.get(a)?.rank ?? 0) - (meta.get(b)?.rank ?? 0));
            const hours: Record<string, number> = {};
            for (const p of players) hours[p] = (maps.get(p) ?? new Uint8Array(count)).reduce((s, n) => s + n, 0) / 2;
            return {
              players,
              slots: slots[i],
              avgTp: tps[i],
              avgRank: ranks[i],
              closest: spaced(getCandidates(players), 3).map((c) => ({ ...c, start: start + c.start * SLOT_MS, total: players.length * c.blocks })),
              windowCounts: Object.fromEntries([2, 3, 4].map((blocks) => [blocks * 30, candidates(players, maps, count, blocks, blocks, blocks).length])),
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
    t.slots.forEach((s, i) => lines.push(`Option ${i + 1}: <t:${slotUnix(s)}:F> · ${s.blocks * 30} min${s.missing.length ? ` (${(s.filled / s.blocks).toFixed(2)}/4 average — check ${s.missing.join(", ")})` : ""}`));
    lines.push("");
  }
  return lines.join("\n");
}

/** Bot-ready CSV matching the qualifier discordCsv format: thread_title, pings, slot_1..3. */
export function botCsv(num: number, draft: SemiDraft, discord: (p: string) => string | null) {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const head = ["thread_title", "pings", "slot_1", "slot_2", "slot_3"];
  const rows = draft.tables.map((t) => {
    const warnings = new Map<string, string[]>();
    t.slots.forEach((s, i) => {
      if (s.type !== "near") return;
      for (const p of s.missing) warnings.set(p, [...(warnings.get(p) ?? []), String.fromCharCode(65 + i)]);
    });
    const pings = t.players.map((p) => {
      const disc = discord(p)?.trim();
      const w = warnings.get(p);
      const warn = w ? ` - ⚠️ Near-Match: Not available for Slot ${w.join("/")}` : "";
      return disc ? `@${disc} (${p}${warn})` : `**${p}**${warn}`;
    }).join(", ");
    const slots = [0, 1, 2].map((i) => (t.slots[i] ? `<t:${slotUnix(t.slots[i])}:F>` : ""));
    return [`T${num} ${t.name}`, pings, ...slots];
  });
  return [head, ...rows].map((r) => r.map(esc).join(",")).join("\n");
}

/** ASync semi-finals: no scheduling, tables seeded by snake order of the eligible pool. */
export function snakeSemiDraft(pool: Standing[]): SemiDraft | null {
  if (pool.length < 4 || pool.length % 4 !== 0) return null;
  const tables = snake(pool.map((s) => s.player), pool.length / 4);
  const meta = new Map(pool.map((s) => [s.player, s]));
  return {
    score: 0, partitionsTested: 1, slotsScanned: 0, alternatives: [],
    tables: tables.map((players, i) => ({
      name: `Semi Final ${i + 1}`, players, slots: [], closest: [], noAvailability: [], availableHours: {}, windowCounts: {},
      avgTp: mean(players.map((p) => meta.get(p)?.tp ?? 0)),
      avgRank: mean(players.map((p) => meta.get(p)?.rank ?? 0)),
    })),
  };
}
