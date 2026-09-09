# `@dial/product-telemetry`

This package is the only DIAL-owned product-experience telemetry boundary for PostHog-style event capture and rollout exposure.

PostHog is intentionally **not** a business source of truth. DIAL domain events and canonical modules remain authoritative. The package fails open for the customer/business transaction path: analytics failures are recorded as telemetry failures but cannot block checkout, fulfilment, dispatch, support, payments, pricing or authorization.

## Adopted PostHog surface

- product analytics: events, funnels, activation/retention/adoption analysis;
- web analytics;
- privacy-gated session replay / heatmaps on permitted surfaces;
- staff/dogfood/progressive UX rollout flags;
- experiment assignment/measurement only when the experiment itself is owned by DIAL GMPC.

## Explicitly not adopted as parallel authorities

- surveys: Formbricks remains DIAL's survey input tool;
- AI observability/evals: Langfuse + Promptfoo + human promotion remain canonical;
- technical logs/metrics/traces: OpenTelemetry/Prometheus/Loki/Tempo/Grafana remain the technical plane;
- BI: Metabase remains read-only business exploration;
- workflow automation: Temporal/n8n/BullMQ and DIAL domain services remain owners;
- data warehouse/CDP: PostHog must not become a customer, money, catalogue, job, claims or campaign source of truth.

No PostHog flag may control payable amounts, pricing, ledger posting, settlement, authorization, eligibility, compliance, Health/claims decisions or DIAL branch certification/activation.
