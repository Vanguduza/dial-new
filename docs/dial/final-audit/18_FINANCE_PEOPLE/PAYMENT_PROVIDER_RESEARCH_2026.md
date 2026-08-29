# Payment Provider Research Snapshot — 2026-08-29

This file records only currently public provider facts used by the DIAL architecture. Exact authenticated credentials/paths are resolved during adapter integration.

## EcoCash

Official EcoCash developer portal states:
- RESTful APIs;
- OAuth 2.0;
- sandbox;
- real-time webhooks.

Developer portal terms require HTTPS webhook endpoints, HMAC signature validation and idempotent handling of duplicate deliveries.

EcoCash public channel-partner terms define a **Push Transaction** as a merchant transaction initiated from the merchant/payment-accepting system and sent through the USSD channel to the selected EcoCash customer for confirmation.

Sources:
- https://developers.ecocash.co.zw/
- https://developers.ecocash.co.zw/terms
- https://partnerapplications.ecocash.co.zw/terms-and-conditions

## Paynow

Official Paynow docs:
- initiate via HTTP POST to `https://www.paynow.co.zw/interface/initiatetransaction`;
- response includes `browserurl`, `pollurl`, `status`, `hash`;
- merchant config supplies `returnurl` and `resulturl`;
- status updates are POSTed to `resulturl`;
- merchant must validate hashes;
- for an important paid update, Paynow recommends polling Paynow to confirm status.

Documented statuses include:
Created, Sent, Paid, Awaiting Delivery, Delivered, Cancelled, Disputed, Refunded.

Sources:
- https://developers.paynow.co.zw/docs/paynow/paynow_api/
- https://developers.paynow.co.zw/docs/paynow/initiate_transaction/
- https://developers.paynow.co.zw/docs/paynow/status_update/
- https://developers.paynow.co.zw/docs/paynow/polling_status/
- https://developers.paynow.co.zw/docs/paynow/validating_hash/

## ContiPay

Public ContiPay developer documentation currently exposes a login/registration portal. Public product material confirms:
- developer workspace;
- REST API;
- transaction notifications;
- separate test environment.

The exact authenticated endpoint/signature contract is intentionally not guessed in DIAL canon.

Sources:
- https://contipay.co.zw/
- https://docs.contipay.co.zw/login

## PayPal

Current PayPal developer material supports:
- Orders v2 create/show/capture;
- Payments v2 capture refunds and refund status;
- REST webhooks;
- webhook-signature verification.

Relevant checkout/payment events include:
- `CHECKOUT.ORDER.APPROVED`;
- `CHECKOUT.PAYMENT-APPROVAL.REVERSED`;
- `PAYMENT.CAPTURE.PENDING`;
- `PAYMENT.CAPTURE.COMPLETED`;
- `PAYMENT.CAPTURE.DENIED`;
- `PAYMENT.CAPTURE.REFUNDED`;
- `PAYMENT.CAPTURE.REVERSED`;
- `PAYMENT.REFUND.PENDING`;
- `PAYMENT.REFUND.FAILED`.

Sources:
- https://developer.paypal.com/api/rest/integration/orders-api
- https://developer.paypal.com/api/rest/webhooks
- https://developer.paypal.com/api/rest/webhooks/rest/
- https://developer.paypal.com/api/rest/webhooks/event-names/
- https://developer.paypal.com/checkout/refund-payment
- https://developer.paypal.com/api/webhooks/v1/verify-webhook-signature-post/
