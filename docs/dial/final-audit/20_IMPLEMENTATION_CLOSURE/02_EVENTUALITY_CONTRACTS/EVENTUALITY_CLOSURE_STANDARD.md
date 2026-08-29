# DIAL v2 Eventuality Closure Standard

The old pattern `detect → preserve state → evidence → route → remedy` remains the universal recovery doctrine, but it is no longer sufficient as an implementation contract.

Every eventuality now resolves to:
- trigger;
- owning queue;
- severity/materiality;
- initial exception state;
- named recovery commands;
- evidence to freeze;
- customer endpoint where visible;
- money/safety/compliance guard;
- terminal states;
- compensation rule;
- verification tests.

## Material eventualities

A MATERIAL eventuality is one that is customer-visible, affects money, safety, compliance, fulfilment quality, external-provider capacity/degradation, employment authority, or carries High/Critical severity.

Material eventualities require a named handler/workflow or explicit mapping into a shared handler before the parent Feature can reach INTEGRATION_GREEN.

## Immutable-history rule

Recovery never means silently editing the earlier event into the desired state.

Use:
- retry with the same idempotency key where appropriate;
- reversal;
- compensating command/event;
- RCE remedy;
- explicit cancellation;
- authorized adjustment.

## Unknown state

When the external fact is unknown:
- represent `UNKNOWN` / `AWAITING_CONFIRMATION`;
- retain reservations safely where policy permits;
- query/reconcile;
- do not pretend failure;
- do not invite an uncontrolled duplicate action.

## Human operating handoff

A human escalation is still a software workflow. It must create:
- queue item;
- priority;
- context refs;
- SLA;
- evidence;
- allowed decisions;
- escalation owner;
- closure result.

No eventuality may rely on "ops will handle it" without that mapping.
