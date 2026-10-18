// Game state, economy and saving. No three.js or DOM in here.

export const UPGRADES = [
  { id: 'pick', name: 'Sharper Pick', icon: '⛏️', base: 15, tap: 1, sec: 0 },
  { id: 'drone', name: 'Crystal Drone', icon: '🛸', base: 50, tap: 0, sec: 1 },
  { id: 'gloves', name: 'Lucky Gloves', icon: '🧤', base: 400, tap: 6, sec: 0 },
  { id: 'golem', name: 'Gem Golem', icon: '🗿', base: 1200, tap: 0, sec: 10 },
  { id: 'chime', name: 'Resonance Chime', icon: '🔔', base: 14000, tap: 0, sec: 60 },
  { id: 'refinery', name: 'Sky Refinery', icon: '🏭', base: 160000, tap: 0, sec: 400 },
];

export const PRICE_GROWTH = 1.15;
export const REBIRTH_AT = 1e6; // gems earned this run needed to rebirth
export const SHARD_BONUS = 0.1; // +10% income per Star Shard
export const OFFLINE_CAP_SECONDS = 8 * 60 * 60;
export const MAX_STAT = 1e9;

const SAVE_KEY = 'tower-tapper:save:v1';

const num = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : 0);
const clampStat = (v) => Math.min(MAX_STAT, Math.max(0, Math.round(num(v))));

function freshRun() {
  return { gems: 0, runGems: 0, owned: Object.fromEntries(UPGRADES.map((u) => [u.id, 0])) };
}

export class Game {
  constructor() {
    this.state = {
      ...freshRun(),
      totalGems: 0, // lifetime, display only
      shards: 0,
      rebirths: 0,
      bestPerSec: 0,
      taps: 0,
      lastTick: Date.now(),
    };
  }

  get multiplier() {
    return 1 + this.state.shards * SHARD_BONUS;
  }

  get perTap() {
    return (1 + UPGRADES.reduce((sum, u) => sum + u.tap * this.state.owned[u.id], 0)) * this.multiplier;
  }

  get perSec() {
    return UPGRADES.reduce((sum, u) => sum + u.sec * this.state.owned[u.id], 0) * this.multiplier;
  }

  price(upgrade) {
    return Math.ceil(upgrade.base * PRICE_GROWTH ** this.state.owned[upgrade.id]);
  }

  earn(amount) {
    const s = this.state;
    s.gems += amount;
    s.runGems += amount;
    s.totalGems += amount;
  }

  tap() {
    const amount = this.perTap;
    this.earn(amount);
    this.state.taps += 1;
    return amount;
  }

  buy(id) {
    const upgrade = UPGRADES.find((u) => u.id === id);
    if (!upgrade) return false;
    const cost = this.price(upgrade);
    if (this.state.gems < cost) return false;
    this.state.gems -= cost;
    this.state.owned[id] += 1;
    this.state.bestPerSec = Math.max(this.state.bestPerSec, this.perSec);
    return true;
  }

  // Passive income from wall-clock time, so background tabs and time away
  // both count (capped at 8 hours). Returns { seconds, gems } earned.
  update(now = Date.now()) {
    const seconds = Math.min(Math.max(0, (now - this.state.lastTick) / 1000), OFFLINE_CAP_SECONDS);
    this.state.lastTick = now;
    const gems = this.perSec * seconds;
    if (gems > 0) this.earn(gems);
    return { seconds, gems };
  }

  get shardsOnRebirth() {
    return Math.floor(Math.sqrt(this.state.runGems / REBIRTH_AT));
  }

  get canRebirth() {
    return this.state.runGems >= REBIRTH_AT;
  }

  rebirth() {
    if (!this.canRebirth) return 0;
    const gained = this.shardsOnRebirth;
    Object.assign(this.state, freshRun());
    this.state.shards += gained;
    this.state.rebirths += 1;
    return gained;
  }

  // The stats in startng.json: whole numbers from 0 to 1,000,000,000.
  boardStats() {
    return {
      prestige: clampStat(this.state.rebirths),
      best_gems: clampStat(this.state.bestPerSec),
    };
  }

  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ ...this.state, savedAt: Date.now() }));
      return true;
    } catch {
      return false;
    }
  }

  // Loads the save (if any) and awards capped earnings for the time away.
  load() {
    let data = null;
    try {
      data = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    } catch {
      data = null;
    }
    if (!data || typeof data !== 'object') return { seconds: 0, gems: 0 };
    const s = this.state;
    s.gems = num(data.gems);
    s.runGems = num(data.runGems);
    s.totalGems = num(data.totalGems);
    s.shards = Math.floor(num(data.shards));
    s.rebirths = Math.floor(num(data.rebirths));
    s.bestPerSec = num(data.bestPerSec);
    s.taps = Math.floor(num(data.taps));
    for (const u of UPGRADES) s.owned[u.id] = Math.floor(num(data.owned?.[u.id]));
    s.lastTick = Math.min(num(data.savedAt) || Date.now(), Date.now());
    return this.update();
  }

  reset() {
    try { localStorage.removeItem(SAVE_KEY); } catch { /* storage unavailable */ }
  }
}

const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

// 1234 → "1,234", 1234567 → "1.23M"
export function formatNumber(n, decimals = 0) {
  if (!Number.isFinite(n)) return '∞';
  if (n < 1e4) {
    return n < 10 && decimals ? (Math.floor(n * 10) / 10).toString() : Math.floor(n).toLocaleString('en-US');
  }
  const tier = Math.floor(Math.log10(n) / 3);
  if (tier >= SUFFIXES.length) return n.toExponential(2).replace('+', '');
  const scaled = n / 10 ** (tier * 3);
  return `${scaled.toFixed(scaled < 10 ? 2 : scaled < 100 ? 1 : 0)}${SUFFIXES[tier]}`;
}
