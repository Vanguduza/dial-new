/**
 * DIAL product-experience telemetry boundary.
 *
 * PostHog is an optional analytics/rollout sink. It is never a source of truth
 * for money, pricing, authorization, eligibility, certification, health/claims,
 * fulfilment or business workflow state. Core DIAL behavior must remain correct
 * when this adapter is absent or unavailable.
 */

export type TelemetryPrivacyClass = 'PUBLIC' | 'PSEUDONYMOUS' | 'SENSITIVE' | 'RESTRICTED';
export type TelemetrySurface =
  | 'GENERAL'
  | 'CHECKOUT'
  | 'PAYMENT'
  | 'IDENTITY'
  | 'HEALTH'
  | 'CLAIMS'
  | 'EMPLOYEE';
export type RolloutPurpose = 'PRESENTATION' | 'DOGFOOD' | 'EXPERIMENT';

export interface ProductTelemetryEvent {
  /** Versioned, semantic event name: domain.action.vN */
  name: string;
  privacyClass: TelemetryPrivacyClass;
  surface?: TelemetrySurface;
  properties?: Record<string, unknown>;
}

export interface ProductTelemetrySink {
  capture(eventName: string, properties: Record<string, unknown>): void | Promise<void>;
}

export interface PostHogLikeClient {
  capture(eventName: string, properties?: Record<string, unknown>): void;
  isFeatureEnabled?(flagKey: string): boolean | string | undefined;
}

export interface CaptureResult {
  state: 'CAPTURED' | 'DROPPED' | 'SINK_FAILED';
  reason: string;
}

const EVENT_NAME = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*\.v[1-9][0-9]*$/;
const EXTERNAL_CLASSES = new Set<TelemetryPrivacyClass>(['PUBLIC', 'PSEUDONYMOUS']);
const REPLAY_BLOCKED_SURFACES = new Set<TelemetrySurface>([
  'CHECKOUT',
  'PAYMENT',
  'IDENTITY',
  'HEALTH',
  'CLAIMS',
  'EMPLOYEE',
]);
const FORBIDDEN_PROPERTY = /(?:^|_)(?:email|phone|mobile|address|name|dob|birth|password|secret|token|cookie|card|cvv|pan|bank|account|wallet|claim|diagnosis|medical|clinical|prescription|health|amount|balance|price|payable|tax|vat|tin|national_id|id_number)(?:_|$)/i;
const FORBIDDEN_FLAG = /(?:^|[._-])(?:price|pricing|payment|ledger|settlement|refund|payout|auth|permission|role|rls|eligibility|compliance|clinical|health|claim|credit|tax|vat|wht|discount|promotion_value)(?:[._-]|$)/i;

function isJsonScalar(value: unknown): value is string | number | boolean | null {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}

export function validateTelemetryEvent(event: ProductTelemetryEvent): string[] {
  const failures: string[] = [];
  if (!EVENT_NAME.test(event.name)) failures.push('EVENT_NAME_NOT_VERSIONED');
  if (!EXTERNAL_CLASSES.has(event.privacyClass)) failures.push('PRIVACY_CLASS_NOT_EXPORTABLE');
  for (const [key, value] of Object.entries(event.properties ?? {})) {
    if (FORBIDDEN_PROPERTY.test(key)) failures.push(`FORBIDDEN_PROPERTY:${key}`);
    if (!(isJsonScalar(value) || (Array.isArray(value) && value.every(isJsonScalar)))) {
      failures.push(`NON_SCALAR_PROPERTY:${key}`);
    }
  }
  return failures.sort();
}

/**
 * Analytics is a side path: validation failures drop the event and sink failures
 * are reported without throwing through the customer transaction path.
 */
export async function captureProductEvent(
  sink: ProductTelemetrySink | null | undefined,
  event: ProductTelemetryEvent,
): Promise<CaptureResult> {
  const failures = validateTelemetryEvent(event);
  if (failures.length) return { state: 'DROPPED', reason: failures.join(',') };
  if (!sink) return { state: 'DROPPED', reason: 'ANALYTICS_SINK_UNAVAILABLE' };
  try {
    await sink.capture(event.name, {
      ...(event.properties ?? {}),
      dial_privacy_class: event.privacyClass,
      dial_surface: event.surface ?? 'GENERAL',
    });
    return { state: 'CAPTURED', reason: 'CAPTURED' };
  } catch {
    return { state: 'SINK_FAILED', reason: 'ANALYTICS_SINK_FAILED' };
  }
}

export function createPostHogTelemetrySink(client: PostHogLikeClient): ProductTelemetrySink {
  return {
    capture(eventName, properties) {
      client.capture(eventName, properties);
    },
  };
}

export interface ReplayPolicyInput {
  consentGranted: boolean;
  privacyClass: TelemetryPrivacyClass;
  surface?: TelemetrySurface;
}

export function evaluateSessionReplayPolicy(input: ReplayPolicyInput): { allowed: boolean; reason: string } {
  if (!input.consentGranted) return { allowed: false, reason: 'CONSENT_REQUIRED' };
  if (!EXTERNAL_CLASSES.has(input.privacyClass)) return { allowed: false, reason: 'PRIVACY_CLASS_BLOCKED' };
  if (REPLAY_BLOCKED_SURFACES.has(input.surface ?? 'GENERAL')) return { allowed: false, reason: 'SURFACE_BLOCKED' };
  return { allowed: true, reason: 'ALLOWED' };
}

export interface ProductRolloutInput {
  flagKey: string;
  purpose: RolloutPurpose;
  /** Canonical DIAL activation/certification gate. PostHog cannot override false. */
  canonicalEnabled: boolean;
  /** Optional value returned by PostHog. */
  providerValue?: boolean | string;
  /** Stable local fallback when PostHog is absent/slow. */
  stableDefault: boolean;
}

export interface ProductRolloutDecision {
  enabled: boolean;
  variant: string | null;
  reason: string;
}

/**
 * Rollout composition is conjunctive with canonical DIAL authority. A PostHog
 * flag controls exposure only; it can never create a capability or business rule.
 */
export function resolveProductRollout(input: ProductRolloutInput): ProductRolloutDecision {
  if (FORBIDDEN_FLAG.test(input.flagKey)) {
    return { enabled: false, variant: null, reason: 'FLAG_DOMAIN_FORBIDDEN' };
  }
  if (!input.canonicalEnabled) {
    return { enabled: false, variant: null, reason: 'CANONICAL_DIAL_GATE_DISABLED' };
  }
  if (typeof input.providerValue === 'string') {
    return { enabled: true, variant: input.providerValue, reason: `POSTHOG_${input.purpose}_VARIANT` };
  }
  if (typeof input.providerValue === 'boolean') {
    return { enabled: input.providerValue, variant: null, reason: `POSTHOG_${input.purpose}_ROLLOUT` };
  }
  return { enabled: input.stableDefault, variant: null, reason: 'STABLE_LOCAL_FALLBACK' };
}
