import { PROVIDER_OUTCOMES } from './constants.mjs';

const UNAVAILABLE_RE = [
  /outage/,
  /unavailable/,
  /rate.?limit/,
  /too many requests/,
  /\b429\b/,
  /quota/,
  /account.?limit/,
  /usage.?limit/,
  /auth(entication|orization)? (fail|expir|denied)/,
  /not logged/,
  /oauth/,
  /unauthorized/,
  /\b401\b/,
  /queue stall/,
  /queue.?full/,
  /service unavailable/,
  /\b503\b/,
  /auth_failed/,
  /account_limited/,
  /rate_limited/,
  /model_limited/,
];

const INADEQUATE_RE = [
  /disk (exhausted|full|quota)/,
  /enospc/,
  /no space left/,
  /workspace clone exceeded/,
  /clone limit/,
  /egress blocked/,
  /network (denied|blocked|unreachable)/,
  /wall[- ]?clock exceeded/,
  /deadline exceeded/,
  /memory (ceiling|limit|exhausted)/,
  /\boom\b/,
  /cannot allocate memory/,
  /required device absent/,
  /no such device/,
  /image lacks/,
  /toolchain (missing|absent)/,
  /command not found/,
];

export function classifyProviderFailure(signal) {
  const text = [
    signal?.observed_reason,
    signal?.reason,
    signal?.message,
    signal?.stderr,
    signal?.stdout,
    typeof signal === 'string' ? signal : '',
  ].filter(Boolean).join('\n').toLowerCase();

  const explicit = signal?.outcome || signal?.class;
  if (explicit === PROVIDER_OUTCOMES.SUCCESS) {
    return { class: PROVIDER_OUTCOMES.SUCCESS, observed_reason: String(signal?.observed_reason || 'completed') };
  }
  if (explicit === PROVIDER_OUTCOMES.UNAVAILABLE || explicit === PROVIDER_OUTCOMES.INFRASTRUCTURE_INADEQUATE) {
    return {
      class: explicit,
      observed_reason: String(signal?.observed_reason || signal?.reason || text || explicit),
    };
  }

  const unavailable = UNAVAILABLE_RE.some((re) => re.test(text));
  const inadequate = INADEQUATE_RE.some((re) => re.test(text));
  if (inadequate && !unavailable) {
    return {
      class: PROVIDER_OUTCOMES.INFRASTRUCTURE_INADEQUATE,
      observed_reason: String(signal?.observed_reason || signal?.reason || text),
    };
  }
  return {
    class: PROVIDER_OUTCOMES.UNAVAILABLE,
    observed_reason: String(signal?.observed_reason || signal?.reason || text || 'ambiguous provider failure treated as unavailable'),
  };
}
