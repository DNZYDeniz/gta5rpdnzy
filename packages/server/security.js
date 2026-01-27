// dnzy_auth/security.js
// Anti-spam / debounce / brute-force / basic flood shield
// Not: DDoS network-level çözülür. Bu dosya uygulama seviyesinde koruma sağlar.

const buckets = new Map();   // key -> {count, resetAt, lastAt}
const bans = new Map();      // key -> {until, reason}

function now() { return Date.now(); }

function makeKey(player, action) {
  const ip = player.ip || "noip";
  const sc = player.socialClub || "nosc";
  // action + ip + socialclub birleşimi (tek başına IP'ye bağlı kalmıyoruz)
  return `${action}:${ip}:${sc}`;
}

function banTemp(key, ms, reason = "tempban") {
  bans.set(key, { until: now() + ms, reason });
}

function isBanned(key) {
  const b = bans.get(key);
  if (!b) return null;
  if (now() > b.until) { bans.delete(key); return null; }
  return b;
}

// windowMs içinde max tane, ayrıca minGapMs ile "buton spam" engeli
function rateLimit(key, { windowMs = 4000, max = 4, minGapMs = 350 } = {}) {
  const banned = isBanned(key);
  if (banned) return { ok: false, reason: banned.reason };

  const t = now();
  let b = buckets.get(key);

  if (!b || t > b.resetAt) {
    b = { count: 0, resetAt: t + windowMs, lastAt: 0 };
    buckets.set(key, b);
  }

  // debounce: çok hızlı ardışık çağrı
  if (t - b.lastAt < minGapMs) {
    return { ok: false, reason: "too_fast" };
  }

  b.lastAt = t;
  b.count += 1;

  if (b.count > max) {
    // Çok ısrarcı spam -> kısa süreli ban
    banTemp(key, 10_000, "rate_limited"); // 10 sn
    return { ok: false, reason: "rate_limited" };
  }

  return { ok: true };
}

// Login için daha sert koruma (brute-force)
function loginGate(player) {
  const key = makeKey(player, "login");
  return rateLimit(key, { windowMs: 15_000, max: 5, minGapMs: 900 });
}

// Register için daha sert koruma
function registerGate(player) {
  const key = makeKey(player, "register");
  return rateLimit(key, { windowMs: 20_000, max: 3, minGapMs: 1200 });
}

// Genel UI click’leri için (enter, navigate vs.)
function uiGate(player, action) {
  const key = makeKey(player, action);
  return rateLimit(key, { windowMs: 5000, max: 8, minGapMs: 250 });
}

module.exports = {
  makeKey,
  rateLimit,
  loginGate,
  registerGate,
  uiGate
};
