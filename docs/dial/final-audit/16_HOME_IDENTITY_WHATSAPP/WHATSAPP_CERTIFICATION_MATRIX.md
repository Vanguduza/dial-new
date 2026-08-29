# WhatsApp Channel Certification Matrix

## Global
- webhook signature validation;
- duplicate webhook/message;
- linked and unlinked identity;
- branch switch;
- Flow resume/expiry;
- template-window behavior;
- Flow endpoint outage;
- Chatwoot outage;
- support-AI outage;
- Cloud API send failure;
- app/web deep-link return.

## Every branch Flow
Test:
- happy path;
- invalid/expired state;
- duplicate submit;
- stale quote/slot/offer;
- cancellation/change;
- provider/business rejection;
- customer timeout;
- media/evidence upload;
- Help/human escalation.

## Payment
For Paynow and ContiPay:
- initiate success/failure;
- hosted-payment abandonment;
- callback success;
- duplicate callback;
- invalid callback authentication;
- timeout then success;
- timeout then fail;
- status query;
- duplicate-debit support;
- refund/reversal where supported;
- payment success while WhatsApp confirmation fails.

## Support
- bot resolves safe FAQ;
- safe tool action;
- explicit human request;
- high-risk automatic handoff;
- Chatwoot receives context;
- human response returns to WhatsApp;
- policy/template behavior outside customer-service window;
- RCE escalation carries evidence.

## Cross-channel
Start WhatsApp → open DIAL web/app → authenticate → complete payment/approval → WhatsApp receives status and the same SupportConversation remains linked.

## Channel-specific payment matrix — v1.6

### Cash
- collection code generated;
- authorized collector only;
- under/over/wrong currency;
- offline receipt sync;
- handover/count/variance;
- customer receipt.

### EcoCash Direct
- correct/alternate MSISDN;
- USSD push sent;
- customer decline/timeout;
- HMAC-invalid callback;
- duplicate/out-of-order callback;
- provider query confirms status;
- settlement missing.

### Paynow
- initiation/hash validation;
- browser abandonment;
- resulturl duplicate;
- resulturl vs poll mismatch;
- Paid/Awaiting Delivery/Delivered/Cancelled/Disputed/Refunded mappings;
- returnurl before authoritative confirmation.

### ContiPay
- adapter contract validation against current portal;
- initiation/query/notification;
- invalid notification;
- timeout/unknown;
- refund where supported;
- settlement mismatch.

### PayPal
- order creation;
- buyer approval;
- capture success/pending/denied;
- approval reversal;
- webhook signature verification;
- duplicate webhook;
- refund pending/fail/completed state;
- dispute/chargeback;
- customer return before capture completes.

