import { describe, expect, it } from 'vitest';
import {
  captureProductEvent,
  createPostHogTelemetrySink,
  evaluateSessionReplayPolicy,
  resolveProductRollout,
} from '../packages/product-telemetry/src/index.js';

describe('DIAL product telemetry boundary', () => {
  it('captures a versioned pseudonymous product event without making analytics transaction-critical', async () => {
    const captured: unknown[] = [];
    const sink = createPostHogTelemetrySink({ capture: (name, properties) => captured.push({ name, properties }) });
    const result = await captureProductEvent(sink, {
      name: 'spare.search_completed.v1',
      privacyClass: 'PSEUDONYMOUS',
      properties: { result_count: 12, vehicle_class: 'pickup' },
    });
    expect(result.state).toBe('CAPTURED');
    expect(captured).toHaveLength(1);
  });

  it('fails closed on sensitive telemetry and exact money properties', async () => {
    const calls: unknown[] = [];
    const sink = createPostHogTelemetrySink({ capture: (...args) => calls.push(args) });
    expect((await captureProductEvent(sink, {
      name: 'checkout.completed.v1', privacyClass: 'SENSITIVE', properties: { amount_minor: 1000 },
    })).state).toBe('DROPPED');
    expect(calls).toHaveLength(0);
  });

  it('does not let a PostHog outage break the core product path', async () => {
    const result = await captureProductEvent({ capture: () => { throw new Error('offline'); } }, {
      name: 'tech.booking_opened.v1', privacyClass: 'PUBLIC', properties: { entry_surface: 'home' },
    });
    expect(result).toEqual({ state: 'SINK_FAILED', reason: 'ANALYTICS_SINK_FAILED' });
  });

  it('blocks replay on checkout, payment, identity, Health, claims and employee surfaces', () => {
    for (const surface of ['CHECKOUT', 'PAYMENT', 'IDENTITY', 'HEALTH', 'CLAIMS', 'EMPLOYEE'] as const) {
      expect(evaluateSessionReplayPolicy({ consentGranted: true, privacyClass: 'PSEUDONYMOUS', surface }).allowed).toBe(false);
    }
    expect(evaluateSessionReplayPolicy({ consentGranted: true, privacyClass: 'PSEUDONYMOUS', surface: 'GENERAL' }).allowed).toBe(true);
  });

  it('keeps the canonical DIAL gate above PostHog rollout state', () => {
    expect(resolveProductRollout({ flagKey: 'home.new_nav', purpose: 'DOGFOOD', canonicalEnabled: false, providerValue: true, stableDefault: false })).toEqual({
      enabled: false, variant: null, reason: 'CANONICAL_DIAL_GATE_DISABLED',
    });
    expect(resolveProductRollout({ flagKey: 'home.new_nav', purpose: 'DOGFOOD', canonicalEnabled: true, providerValue: true, stableDefault: false }).enabled).toBe(true);
  });

  it('refuses feature flags for money, authorization, compliance and Health domains', () => {
    for (const flagKey of ['checkout.pricing.v2', 'payment.refund.ui', 'auth.role.admin', 'health.claim.flow']) {
      expect(resolveProductRollout({ flagKey, purpose: 'EXPERIMENT', canonicalEnabled: true, providerValue: true, stableDefault: false }).reason).toBe('FLAG_DOMAIN_FORBIDDEN');
    }
  });
});
