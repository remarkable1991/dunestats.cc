export type MatchmakerRegistration = {
  id: string;
  user_id: string | null;
  direwolf_name: string;
  discord_username: string | null;
  availability: unknown;
  created_at: string;
  has_checked_in: boolean | null;
};

export type MatchmakerSettings = {
  startDate: string;
  cutoffDate: string;
  targetSlots: number;
  maxSeeds: number;
  stepsPerSeed: number;
  checkpointStep: number;
  patience: number;
  initialTemperature: number;
  coolingRate: number;
};

export type Strategy = {
  minSlots: number;
  spacing: number;
  nearMode: "none" | "backup_only" | "full";
  name: string;
  detail: string;
};

export type SuggestedSlot = { index: number; type: "perfect" | "near"; missing: string | null };
export type MatchmakerTable = {
  round: number;
  table: number;
  players: string[];
  slots: SuggestedSlot[];
  averageSharedHours: number;
  playerCompatibility: Record<string, number>;
};
export type MatchmakerCandidate = {
  strategyIndex: number;
  strategy: Strategy;
  seed: number;
  score: number;
  brokenTables: number;
  tables: MatchmakerTable[];
  timeline: number[];
};
export type MatchmakerProgress = {
  strategyIndex: number;
  seed: number;
  maxSeeds: number;
  score: number;
  brokenTables: number;
  bestScore: number;
  bestBrokenTables: number;
  newBest: boolean;
};

export const STRATEGIES: Strategy[] = [
  { minSlots: 2, spacing: 20, nearMode: "none", name: "Strict", detail: "2+ unanimous slots · 10h spacing" },
  { minSlots: 1, spacing: 20, nearMode: "none", name: "Wide spacing", detail: "1+ unanimous slot · 10h spacing" },
  { minSlots: 1, spacing: 4, nearMode: "none", name: "Tight spacing", detail: "1+ unanimous slot · 2h spacing" },
  { minSlots: 1, spacing: 4, nearMode: "backup_only", name: "Hybrid", detail: "First unanimous · backups may be 3/4" },
  { minSlots: 2, spacing: 4, nearMode: "full", name: "Near match", detail: "2+ slots · true 3/4 options allowed" },
];

export function availabilityOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  if (typeof value !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

const normalized = (value: string | null | undefined) => (value ?? "").trim().toLocaleLowerCase();

export function duplicateGroups(rows: MatchmakerRegistration[]): MatchmakerRegistration[][] {
  const seen = new Set<string>();
  const groups: MatchmakerRegistration[][] = [];
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    const values = [normalized(row.user_id), normalized(row.direwolf_name), normalized(row.discord_username)].filter(Boolean);
    const group = rows.filter((other) =>
      other.id === row.id || values.some((value) => [normalized(other.user_id), normalized(other.direwolf_name), normalized(other.discord_username)].includes(value)),
    );
    group.forEach((item) => seen.add(item.id));
    if (group.length > 1) groups.push(group);
  }
  return groups;
}

function pairsOf(players: string[]) {
  const pairs: [string, string][] = [];
  for (let i = 0; i < players.length; i++) for (let j = i + 1; j < players.length; j++) pairs.push([players[i], players[j]]);
  return pairs;
}

function shuffle<T>(items: T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

const golferPairKey = (a: number, b: number) => `${Math.min(a, b)}:${Math.max(a, b)}`;

function socialGolfer(count: number): number[][][] | null {
  const tableCount = count / 4;
  for (let attempt = 0; attempt < 800; attempt++) {
    const rounds: number[][][] = [];
    const used = new Set<string>();
    const first = Array.from({ length: tableCount }, (_, table) => Array.from({ length: 4 }, (_, seat) => table * 4 + seat));
    rounds.push(first);
    first.forEach((table) => {
      for (let i = 0; i < table.length; i++) for (let j = i + 1; j < table.length; j++) used.add(golferPairKey(table[i], table[j]));
    });
    let valid = true;
    for (let round = 1; round < 3; round++) {
      let found: number[][] | null = null;
      for (let tryRound = 0; tryRound < 300 && !found; tryRound++) {
        const available = shuffle(Array.from({ length: count }, (_, i) => i));
        const tables: number[][] = [];
        for (let table = 0; table < tableCount; table++) {
          const seated = [available.shift() as number];
          while (seated.length < 4) {
            const index = available.findIndex((candidate) => seated.every((other) => !used.has(golferPairKey(candidate, other))));
            if (index < 0) break;
            seated.push(available.splice(index, 1)[0]);
          }
          if (seated.length < 4) break;
          tables.push(seated);
        }
        if (tables.length === tableCount) found = tables;
      }
      if (!found) { valid = false; break; }
      found.forEach((table) => {
        for (let i = 0; i < table.length; i++) for (let j = i + 1; j < table.length; j++) used.add(golferPairKey(table[i], table[j]));
      });
      rounds.push(found);
    }
    if (valid) return rounds;
  }
  return null;
}

type Prepared = {
  players: string[];
  details: Map<string, MatchmakerRegistration>;
  timeline: number[];
  available: Map<string, Set<number>>;
  pairHours: Map<string, number>;
};

function prepare(rows: MatchmakerRegistration[], settings: MatchmakerSettings): Prepared {
  const start = new Date(settings.startDate).getTime();
  const end = new Date(settings.cutoffDate).getTime();
  const details = new Map(rows.map((row) => [row.direwolf_name, row]));
  const available = new Map<string, Set<number>>();
  const timestamps = rows.flatMap((row) => availabilityOf(row.availability).map((slot) => new Date(slot).getTime())).filter((time) => Number.isFinite(time) && time >= start && time <= end);
  if (!timestamps.length) throw new Error("No player availability falls inside this date range.");
  const first = Math.max(start, Math.min(...timestamps));
  const last = Math.min(end, Math.max(...timestamps));
  const timeline = Array.from({ length: Math.floor((last - first) / 1_800_000) + 1 }, (_, i) => first + i * 1_800_000);
  for (const row of rows) {
    const slots = new Set(availabilityOf(row.availability).map((slot) => new Date(slot).getTime()).filter((time) => time >= first && time <= last));
    available.set(row.direwolf_name, slots);
  }
  const pairHours = new Map<string, number>();
  pairsOf(rows.map((row) => row.direwolf_name)).forEach(([a, b]) => {
    const aSlots = available.get(a) ?? new Set<number>();
    const bSlots = available.get(b) ?? new Set<number>();
    let shared = 0;
    aSlots.forEach((slot) => { if (bSlots.has(slot)) shared++; });
    pairHours.set(`${a}\u0001${b}`, shared / 2);
    pairHours.set(`${b}\u0001${a}`, shared / 2);
  });
  return { players: rows.map((row) => row.direwolf_name), details, timeline, available, pairHours };
}

function evaluate(template: number[][][], mapping: string[], prepared: Prepared, strategy: Strategy, targetSlots: number) {
  const busy = new Map(mapping.map((player) => [player, new Set<number>()]));
  const tables: MatchmakerTable[] = [];
  let score = 0;
  let brokenTables = 0;
  for (let round = 0; round < template.length; round++) {
    for (let table = 0; table < template[round].length; table++) {
      const players = template[round][table].map((index) => mapping[index]);
      const selected: SuggestedSlot[] = [];
      for (let i = 0; i <= prepared.timeline.length - 4 && selected.length < targetSlots; i++) {
        const block = [0, 1, 2, 3].map((offset) => prepared.timeline[i + offset]);
        const free = players.filter((player) => block.every((slot) => prepared.available.get(player)?.has(slot)));
        const overlaps = players.some((player) => block.some((slot) => busy.get(player)?.has(slot)));
        const spaced = selected.every((slot) => Math.abs(i - slot.index) >= strategy.spacing);
        if (free.length === 4 && !overlaps && spaced) selected.push({ index: i, type: "perfect", missing: null });
      }
      const allowNear = strategy.nearMode === "full" || (strategy.nearMode === "backup_only" && selected.length > 0);
      if (allowNear && selected.length < targetSlots) {
        const near: SuggestedSlot[] = [];
        for (let i = 0; i <= prepared.timeline.length - 4; i++) {
          const block = [0, 1, 2, 3].map((offset) => prepared.timeline[i + offset]);
          if (players.some((player) => block.some((slot) => busy.get(player)?.has(slot)))) continue;
          const free = players.filter((player) => block.every((slot) => prepared.available.get(player)?.has(slot)));
          if (free.length === 3) near.push({ index: i, type: "near", missing: players.find((player) => !free.includes(player)) ?? null });
        }
        for (const preferUnique of [true, false]) {
          for (const slot of near) {
            if (selected.length >= targetSlots) break;
            if (selected.some((other) => Math.abs(other.index - slot.index) < strategy.spacing)) continue;
            if (preferUnique && selected.some((other) => other.missing === slot.missing)) continue;
            selected.push(slot);
          }
        }
      }
      const perfect = selected.filter((slot) => slot.type === "perfect").length;
      const hours = pairsOf(players).map(([a, b]) => prepared.pairHours.get(`${a}\u0001${b}`) ?? 0);
      const average = hours.reduce((sum, value) => sum + value, 0) / Math.max(1, hours.length);
      const minimum = Math.min(...hours);
      const broken = selected.length < strategy.minSlots || (strategy.nearMode === "backup_only" && perfect === 0);
      if (broken) { brokenTables++; score -= 500; }
      else {
        const averagePosition = selected.reduce((sum, slot) => sum + slot.index, 0) / Math.max(1, selected.length) / prepared.timeline.length;
        score += 70 * perfect + 30 * (selected.length - perfect) + Math.trunc((1 - averagePosition) * 20) + Math.trunc(Math.min(40, average * 2) - Math.max(0, 4 - minimum) * 5);
        selected.forEach((slot) => players.forEach((player) => [0, 1, 2, 3].forEach((offset) => busy.get(player)?.add(prepared.timeline[slot.index + offset]))));
      }
      const playerCompatibility = Object.fromEntries(players.map((player) => {
        const values = players.filter((other) => other !== player).map((other) => prepared.pairHours.get(`${player}\u0001${other}`) ?? 0);
        return [player, Number((values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)).toFixed(1))];
      }));
      tables.push({ round: round + 1, table: table + 1, players, slots: selected, averageSharedHours: Number(average.toFixed(1)), playerCompatibility });
    }
  }
  return { score: score - brokenTables * 5000, brokenTables, tables };
}

export async function runMatchmaker(
  rows: MatchmakerRegistration[],
  settings: MatchmakerSettings,
  onProgress: (progress: MatchmakerProgress, best: MatchmakerCandidate | null) => void,
  isCancelled: () => boolean,
): Promise<MatchmakerCandidate | null> {
  const prepared = prepare(rows, settings);
  let bestAcrossLevels: MatchmakerCandidate | null = null;
  const historical: { template: number[][][]; mapping: string[] }[] = [];
  for (let strategyIndex = 0; strategyIndex < STRATEGIES.length; strategyIndex++) {
    const strategy = STRATEGIES[strategyIndex];
    let levelBest: MatchmakerCandidate | null = null;
    let stagnant = 0;
    for (let historyIndex = 0; historyIndex < historical.length; historyIndex++) {
      const previous = historical[historyIndex];
      const result = evaluate(previous.template, previous.mapping, prepared, strategy, settings.targetSlots);
      const candidate: MatchmakerCandidate = {
        strategyIndex,
        strategy,
        seed: -(historyIndex + 1),
        score: result.score,
        brokenTables: result.brokenTables,
        tables: result.tables,
        timeline: prepared.timeline,
      };
      if (!levelBest || candidate.brokenTables < levelBest.brokenTables || (candidate.brokenTables === levelBest.brokenTables && candidate.score > levelBest.score)) {
        levelBest = candidate;
        bestAcrossLevels = candidate;
      }
    }
    if (levelBest?.brokenTables === 0) return levelBest;
    for (let seed = 1; seed <= settings.maxSeeds; seed++) {
      if (isCancelled()) return bestAcrossLevels;
      const template = socialGolfer(prepared.players.length);
      if (!template) throw new Error("Could not generate three rounds without repeated opponents.");
      let mapping = shuffle(prepared.players);
      let current = evaluate(template, mapping, prepared, strategy, settings.targetSlots);
      let seedBest = { ...current, mapping: [...mapping] };
      let temperature = settings.initialTemperature;
      for (let step = 0; step < settings.stepsPerSeed; step++) {
        const i = Math.floor(Math.random() * mapping.length);
        let j = Math.floor(Math.random() * mapping.length);
        if (i === j) j = (j + 1) % mapping.length;
        [mapping[i], mapping[j]] = [mapping[j], mapping[i]];
        const next = evaluate(template, mapping, prepared, strategy, settings.targetSlots);
        if (next.score > current.score || Math.random() < Math.exp((next.score - current.score) / Math.max(0.01, temperature))) {
          current = next;
          if (current.brokenTables < seedBest.brokenTables || (current.brokenTables === seedBest.brokenTables && current.score > seedBest.score)) seedBest = { ...current, mapping: [...mapping] };
        } else [mapping[i], mapping[j]] = [mapping[j], mapping[i]];
        temperature *= settings.coolingRate;
        if (step === settings.checkpointStep && levelBest && (seedBest.brokenTables > levelBest.brokenTables + 1 || seedBest.brokenTables >= 4)) break;
      }
      const candidate: MatchmakerCandidate = { strategyIndex, strategy, seed, score: seedBest.score, brokenTables: seedBest.brokenTables, tables: seedBest.tables, timeline: prepared.timeline };
      const isNew = !levelBest || candidate.brokenTables < levelBest.brokenTables || (candidate.brokenTables === levelBest.brokenTables && candidate.score > levelBest.score);
      if (isNew) {
        levelBest = candidate;
        bestAcrossLevels = candidate;
        stagnant = 0;
        if (candidate.brokenTables <= 2) {
          historical.push({ template, mapping: seedBest.mapping });
          if (historical.length > 5) historical.shift();
        }
      } else stagnant++;
      const currentLevelBest = levelBest ?? candidate;
      onProgress({ strategyIndex, seed, maxSeeds: settings.maxSeeds, score: candidate.score, brokenTables: candidate.brokenTables, bestScore: currentLevelBest.score, bestBrokenTables: currentLevelBest.brokenTables, newBest: isNew }, bestAcrossLevels);
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      if (currentLevelBest.brokenTables === 0) return currentLevelBest;
      if (stagnant >= settings.patience) break;
    }
  }
  return bestAcrossLevels;
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export function matchupsCsv(candidate: MatchmakerCandidate, tournamentNum: number, rows: MatchmakerRegistration[]): string {
  const details = new Map(rows.map((row) => [row.direwolf_name, row]));
  const header = ["tournament_num", "round_type", "table_identifier", "player_name", "discord_username", "leader_name", "placement", "points", "table_score", "player_compatibility_score", "suggested_time_slot_1", "suggested_time_slot_2", "suggested_time_slot_3", "player_availability"];
  const lines = [header.map(csvCell).join(",")];
  candidate.tables.forEach((table) => table.players.forEach((player) => {
    const detail = details.get(player);
    const suggestions = table.slots.map((slot) => `<t:${Math.floor(candidate.timeline[slot.index] / 1000)}:F>${slot.type === "near" ? ` [3/4 Match - Check ${slot.missing}]` : ""}`);
    lines.push([tournamentNum, `Game_${table.round}`, `Table_${table.table}`, player, detail?.discord_username ?? "", "", "", "", table.averageSharedHours, table.playerCompatibility[player], suggestions[0] ?? "", suggestions[1] ?? "", suggestions[2] ?? "", JSON.stringify(availabilityOf(detail?.availability))].map(csvCell).join(","));
  }));
  return lines.join("\n");
}

export function discordCsv(candidate: MatchmakerCandidate, rows: MatchmakerRegistration[], round: number): string {
  const details = new Map(rows.map((row) => [row.direwolf_name, row]));
  const lines = [["thread_title", "pings", "slot_1", "slot_2", "slot_3"].map(csvCell).join(",")];
  candidate.tables.filter((table) => table.round === round).forEach((table) => {
    const pings = table.players.map((player) => details.get(player)?.discord_username?.trim() ? `@${details.get(player)?.discord_username} (${player})` : `**${player}**`).join(", ");
    const slots = table.slots.map((slot) => `<t:${Math.floor(candidate.timeline[slot.index] / 1000)}:F>${slot.type === "near" ? ` [3/4 Match - Check ${slot.missing}]` : ""}`);
    lines.push([`Game ${round} Table ${table.table}`, pings, slots[0] ?? "", slots[1] ?? "", slots[2] ?? ""].map(csvCell).join(","));
  });
  return lines.join("\n");
}