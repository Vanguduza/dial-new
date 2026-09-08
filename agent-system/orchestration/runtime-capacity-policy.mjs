const PROVIDER_LIMIT_STATES = new Set(['ACCOUNT_LIMITED', 'RATE_LIMITED', 'MODEL_LIMITED']);

const DEFAULT_COOLDOWN_MS = Object.freeze({
  ACCOUNT_LIMITED: 60 * 60 * 1000,
  RATE_LIMITED: 10 * 60 * 1000,
  MODEL_LIMITED: 10 * 60 * 1000,
});

function iso(ms) { return Number.isFinite(ms) ? new Date(ms).toISOString() : null; }


export function classifyRuntimeBoundaryText(value) {
  const text = String(value ?? '').toLowerCase();
  if (!text.trim()) return null;
  if (/authenticate|authentication|not logged|oauth|credential|unauthorized|\b401\b/.test(text)) return 'AUTH_FAILED';
  if (/usagelimitexceeded|sessionbudgetexceeded|weekly.*limit|usage.*limit|session.*limit|budget.*exceed|billing|insufficient.*credit|account.*limit|quota/.test(text)) return 'ACCOUNT_LIMITED';
  if (/rate.?limit|too many requests|\b429\b/.test(text)) return 'RATE_LIMITED';
  if (/overload|model.*unavailable|service unavailable|\b503\b/.test(text)) return 'MODEL_LIMITED';
  return null;
}

export function parseProviderRetryAfter(value, { nowMs = Date.now() } = {}) {
  const text = String(value ?? '');
  if (!text.trim()) return null;

  const relative = text.match(/try again in\s+(\d+)\s*(minute|minutes|hour|hours|day|days)/i);
  if (relative) {
    const amount = Number(relative[1]);
    const unitMs = /^day/i.test(relative[2]) ? 24 * 60 * 60 * 1000 : (/^hour/i.test(relative[2]) ? 60 * 60 * 1000 : 60 * 1000);
    return iso(nowMs + amount * unitMs);
  }

  const dated = text.match(/try again at\s+([A-Z][a-z]{2}\s+\d{1,2}(?:st|nd|rd|th)?,\s+\d{4}\s+\d{1,2}:\d{2}\s*(?:AM|PM))/i);
  if (dated) {
    const cleaned = dated[1].replace(/(\d)(?:st|nd|rd|th)/i, '$1');
    const parsed = Date.parse(`${cleaned} UTC`);
    if (Number.isFinite(parsed) && parsed > nowMs) return iso(parsed);
  }

  const clock = text.match(/try again at\s+(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (clock) {
    let hour = Number(clock[1]) % 12;
    if (clock[3].toUpperCase() === 'PM') hour += 12;
    const minute = Number(clock[2]);
    const now = new Date(nowMs);
    let candidate = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, minute, 0, 0);
    if (candidate <= nowMs) candidate += 24 * 60 * 60 * 1000;
    return iso(candidate);
  }

  return null;
}

export function providerCooldownUntil(health, { nowMs = Date.now() } = {}) {
  const state = health?.state;
  if (!PROVIDER_LIMIT_STATES.has(state)) return null;
  const explicit = Date.parse(health?.retry_after ?? '');
  if (Number.isFinite(explicit) && explicit > nowMs) return iso(explicit);
  const observed = Date.parse(health?.observed_at ?? '');
  if (!Number.isFinite(observed)) return null;
  const duration = DEFAULT_COOLDOWN_MS[state] ?? 0;
  const until = observed + duration;
  return until > nowMs ? iso(until) : null;
}

export function primaryAttemptDecision(health, { nowMs = Date.now() } = {}) {
  const state = health?.state ?? 'UNKNOWN';
  if (state === 'AUTH_FAILED') {
    return { allowed: false, reason: 'AUTH_FAILED_REQUIRES_EXTERNAL_CHANGE', state, retry_after: null };
  }
  const cooldown = providerCooldownUntil(health, { nowMs });
  if (cooldown) {
    return { allowed: false, reason: 'KNOWN_PROVIDER_LIMIT_COOLDOWN', state, retry_after: cooldown };
  }
  return { allowed: true, reason: null, state, retry_after: null };
}

export function providerLimitState(state) {
  return PROVIDER_LIMIT_STATES.has(state);
}
