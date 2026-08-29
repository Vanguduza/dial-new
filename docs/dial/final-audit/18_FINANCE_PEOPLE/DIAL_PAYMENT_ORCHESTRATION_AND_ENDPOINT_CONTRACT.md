# DIAL Payment Orchestration & Endpoint Contract — Cash, EcoCash Direct, Paynow, ContiPay, PayPal

**Status:** LOCKED  
**Authority:** DIAL Money / PaymentIntent / Ledger  
**Channels:** Cash, EcoCash Direct USSD Push, Paynow, ContiPay, PayPal

## 1. Core principle

Payment channels are adapters around one DIAL payment state machine.

No division may create its own independent payment truth.

```text
Customer / Cashier / WhatsApp / App / Web
                    │
                    ▼
              PaymentIntent
                    │
          eligible payment channel
                    │
  ┌─────────┬───────────┬─────────┬──────────┬────────┐
  │         │           │         │          │
 Cash   EcoCash Direct Paynow   ContiPay   PayPal
  │         │           │         │          │
  └─────────┴───────────┴─────────┴──────────┘
                    │
              Provider/Custody
                confirmation
                    │
                    ▼
              PaymentEvent
                    │
       accounting / business routing
          ┌─────────┼───────────┐
          │         │           │
        Ledger   Domain       Customer
                aggregate     notification
          │
          ▼
    BU payment journal
          │
          ▼
      settlement /
     reconciliation
```

## 2. Confirmation is not settlement

DIAL separates:

- **customer action** — e.g. confirms EcoCash USSD, approves PayPal, hands cash to courier;
- **payment confirmation** — authoritative evidence that DIAL can recognize the payment;
- **settlement** — provider/cash funds actually settle into DIAL-controlled treasury/bank/cash custody;
- **reconciliation** — DIAL proves provider settlement/cash count agrees with expected postings.

This avoids the common error of posting money twice when a webhook arrives and again when settlement arrives.

## 3. Canonical state model

```text
DRAFT
CREATED
ACTION_REQUIRED
PENDING_PROVIDER
AUTHORIZED_ACTION_REQUIRED_CAPTURE
CONFIRMED
CONFIRMED_SUSPENSE
SETTLEMENT_PENDING
SETTLED

FAILED
CANCELLED
EXPIRED
UNKNOWN
DISPUTED
REVERSED
REFUND_PENDING
REFUND_FAILED
REFUNDED
EXCEPTION
```

Provider-specific states remain stored as `providerSubstate`.

A business-domain state transition such as `ORDER_PAID` or `JOB_RESERVE_FUNDED` must subscribe to a typed DIAL payment event; it must never interpret raw provider status.

## 4. Generic public/server API

### Create intent

`POST /api/v1/payments/intents`

Input:
```json
{
  "businessUnit": "SPARE",
  "sourceType": "ORDER",
  "sourceRef": "ORD-18452",
  "quoteRef": "QTE-...",
  "amount": {"currency":"USD","minor":4500},
  "customerRef": "CUS-...",
  "channelContext": "WEB"
}
```

Server resolves:
- current authorized payable quote;
- tax/FX;
- eligible payment methods;
- customer/organization/entitlement context.

Client cannot submit an arbitrary binding final amount.

### Get payment

`GET /api/v1/payments/{paymentIntentRef}`

Returns:
- DIAL status;
- provider substate;
- amount/currency;
- selected channel;
- valid customer actions;
- provider/cash refs safe for display;
- settlement/reconciliation state where customer/operator is allowed to see it.

### Select/initiate channel

Channel-specific endpoints under:
`/api/v1/payments/{paymentIntentRef}/<channel>/...`

### Refresh

`POST /api/v1/payments/{paymentIntentRef}/refresh`

Purpose:
- server-side provider query;
- cash custody refresh;
- reconcile an `UNKNOWN/PENDING_PROVIDER` state;
- never trust client claim.

### Cancel

`POST /api/v1/payments/{paymentIntentRef}/cancel`

Only if current payment/domain/provider state permits.

### Refund

`POST /api/v1/refunds`

Input references:
- original PaymentIntent;
- source return/claim/RCE decision;
- amount;
- reason;
- authorization/approval evidence.

A refund is a new controlled money workflow, not mutation of the original payment.

### Refund status

`GET /api/v1/refunds/{refundRef}`

## 5. Confirmation routing pipeline

Every provider/cash confirmation follows:

```text
raw event / cash confirmation
        ↓
authenticate source
        ↓
parse + strict schema validation
        ↓
dedupe providerEventId / commandId
        ↓
correlate PaymentIntent
        ↓
validate amount/currency/reference
        ↓
normalize provider state
        ↓
append ProviderPaymentEvent
        ↓
advance PaymentIntent if legal
        ↓
emit DIAL PaymentConfirmed / Failed / Reversed / Refunded
        ↓
AccountingEvent
        ↓
Ledger PostingRequest
        ↓
business-domain subscriber
        ↓
notification / Activity / WhatsApp
        ↓
finance journal projection
        ↓
reconciliation queue
```

If correlation, amount, currency or authenticity fails:
- no business fulfilment;
- no ledger posting as confirmed payment;
- route to Payment Exception queue.

## 6. Cash channel

### Roles

Authorized cash collection may be performed by:
- cashier;
- approved branch staff;
- courier/COD collector;
- petty-cash custodian only for petty-cash workflows, not customer receipts unless separately authorized.

### Endpoints

- `POST /payments/{ref}/cash/prepare`
- `POST /payments/{ref}/cash/receive`
- `POST /payments/{ref}/cash/confirm-count`
- `POST /cash-sessions`
- `POST /cash-sessions/{ref}/handover`
- `POST /cash-sessions/{ref}/close`
- `POST /cash-deposits`
- `POST /cash-variances/{ref}/resolve`

### Cash custody model

```text
Customer
→ Collector/Courier
→ Branch Cash Session
→ Authorized Cashier/Custodian
→ Bank/Treasury deposit
```

Every transfer is a custody event.

### Offline

A field device may record a signed local cash receipt draft if offline, but:
- it is marked `OFFLINE_UNSYNCED`;
- idempotency/receipt reference is reserved;
- server reconciliation is mandatory;
- payout/settlement cannot be derived from an unsynced local state.

### Eventualities

- underpayment/overpayment;
- wrong currency;
- counterfeit/suspect note;
- no change;
- collector enters wrong amount;
- duplicate receipt;
- customer claims cash paid but collector denies;
- courier loses cash;
- cash theft;
- handover mismatch;
- till over/short;
- bank deposit mismatch;
- receipt printer/device unavailable.

## 7. EcoCash Direct USSD Push

EcoCash public developer material confirms:
- REST APIs;
- OAuth 2.0;
- sandbox;
- real-time webhooks;
- HMAC validation requirements.

EcoCash's merchant terms define a **Push Transaction** as a merchant-initiated transaction sent through the USSD channel to a selected EcoCash customer for confirmation.

Exact production provider paths are bound from the authenticated EcoCash developer portal during implementation rather than invented in architecture.

### DIAL endpoints

- `POST /payments/{ref}/ecocash/push`
- `POST /payments/{ref}/refresh`
- `POST /webhooks/ecocash`

### Push request rules

Server resolves:
- linked/entered MSISDN;
- amount/currency;
- merchant/business-unit configuration;
- correlation reference;
- expiry.

Do not send an EcoCash PIN through DIAL.

### Confirmation

Customer confirms inside EcoCash USSD.

DIAL only advances to `CONFIRMED` after the authenticated provider notification/query confirms the transaction.

### Webhook

`POST /api/v1/webhooks/ecocash`

Must:
- HTTPS;
- verify EcoCash HMAC per current portal docs;
- handle duplicate/out-of-order delivery;
- correlate merchant/provider ref;
- compare amount/currency;
- store provider event;
- respond rapidly then process durably.

## 8. Paynow

Official Paynow flow:

`POST https://www.paynow.co.zw/interface/initiatetransaction`

returns:
- `browserurl`;
- `pollurl`;
- status/hash.

DIAL validates the response hash before presenting `browserurl`.

### DIAL routes

- `POST /payments/{ref}/paynow/initiate`
- `GET /payments/{ref}/paynow/return`
- `POST /webhooks/paynow/result`
- `POST /payments/{ref}/refresh`

The configured Paynow `resulturl` points to DIAL's webhook route.

The browser `returnurl` is UX only; it does not establish successful payment.

### Paynow provider states retained

- Created
- Sent
- Paid
- Awaiting Delivery
- Delivered
- Cancelled
- Disputed
- Refunded

For a consequential "paid" callback, DIAL follows Paynow's recommendation to poll the provided `pollurl` and confirm state.

`Awaiting Delivery` / `Delivered` are Paynow settlement/suspense semantics, **not DIAL Delivery SoR state**.

## 9. ContiPay

Public ContiPay material confirms:
- developer workspace;
- REST API;
- transaction notifications;
- separate test environment.

The exact authenticated API paths/signature fields must be bound from the current developer workspace.

### DIAL routes

- `POST /payments/{ref}/contipay/initiate`
- `POST /payments/{ref}/refresh`
- `POST /webhooks/contipay`

The adapter must implement:

```ts
interface ContiPayAdapter {
  initiate(intent: PaymentIntent): Promise<ProviderAction>
  query(providerRef: string): Promise<ProviderPaymentState>
  verifyNotification(request: RawProviderRequest): Promise<VerifiedProviderEvent>
  refund?(request: RefundRequest): Promise<ProviderRefundState>
}
```

Provider SDK/runtime is not allowed to become payment authority.

## 10. PayPal

Use server-side PayPal Orders v2 / Payments v2.

### Provider operations

- create order: `POST /v2/checkout/orders`
- get order: `GET /v2/checkout/orders/{order_id}`
- capture approved order: `POST /v2/checkout/orders/{order_id}/capture`
- refund capture: `POST /v2/payments/captures/{capture_id}/refund`
- get refund: `GET /v2/payments/refunds/{refund_id}`
- verify webhook: `POST /v1/notifications/verify-webhook-signature`

### DIAL routes

- `POST /payments/{ref}/paypal/orders`
- `GET /payments/{ref}/paypal/return`
- `POST /payments/{ref}/paypal/capture`
- `POST /webhooks/paypal`
- `POST /payments/{ref}/refresh`
- `POST /refunds`

### Events

Subscribe at minimum to events relevant to the selected integration:

- `CHECKOUT.ORDER.APPROVED`
- `CHECKOUT.PAYMENT-APPROVAL.REVERSED`
- `PAYMENT.CAPTURE.PENDING`
- `PAYMENT.CAPTURE.COMPLETED`
- `PAYMENT.CAPTURE.DENIED`
- `PAYMENT.CAPTURE.REFUNDED`
- `PAYMENT.CAPTURE.REVERSED`
- `PAYMENT.REFUND.PENDING`
- `PAYMENT.REFUND.FAILED`
- dispute events used by DIAL's PayPal account/integration.

Webhooks are verified before processing.

Buyer approval is not payment completion. For immediate capture, DIAL captures server-side and waits for authoritative capture state.

## 11. Provider settlement

Every digital channel has:

```text
confirmed customer payment
        ↓
BU channel clearing account
        ↓
provider settlement batch
        ↓
match gross confirmed receipts
        ↓
fees / FX / withholding if applicable
        ↓
bank/treasury account
        ↓
reconciled
```

A provider settlement batch has:
- provider batch/ref;
- settlement date;
- gross;
- fees;
- tax/withholding;
- adjustments;
- net;
- currency;
- linked PaymentIntents;
- unresolved differences.

## 12. Reconciliation

Daily/periodic reconciliation compares:

```text
DIAL PaymentIntents
vs
provider/cash transaction evidence
vs
provider settlement / bank deposit
vs
DIAL Ledger
```

Exception types:
- provider confirmed but DIAL missing;
- DIAL confirmed but provider missing;
- amount/currency mismatch;
- fee mismatch;
- duplicate;
- settlement absent;
- reversal/refund unmatched;
- cash over/short;
- bank deposit mismatch.

No user directly edits a reconciled journal line.

Corrections use:
- provider event;
- compensating accounting event;
- approved adjustment;
- reversal.

## 13. Customer routing

After payment state changes:

```text
PaymentIntent
→ Activity
→ source Order/Job/etc.
→ DIAL Consumer/Business/Health
→ WhatsApp channel session if linked
→ email/push where configured
```

Customer sees:
- payment reference;
- channel;
- amount/currency;
- status;
- receipt;
- valid next action.

Do not expose provider secrets or internal ledger internals.

## 14. Security

All channel integrations inherit DIAL S3 money controls:
- server-side secrets;
- idempotency;
- signature/hash verification;
- rate/abuse control;
- response minimization;
- no client-authoritative paid state;
- step-up/approval for manual refund/adjustment;
- immutable audit;
- reconciliation.
