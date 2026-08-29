# WhatsApp Payments — Cash, EcoCash Direct, Paynow, ContiPay & PayPal

## Lock

WhatsApp can carry the customer from service selection through payment initiation/status, but it is not payment authority.

All channels use the canonical DIAL PaymentIntent.

The detailed provider and endpoint contract is:
`18_FINANCE_PEOPLE/DIAL_PAYMENT_ORCHESTRATION_AND_ENDPOINT_CONTRACT.md`.

## Channel selector

The WhatsApp payment Flow resolves the current transaction's eligible methods:

```text
Pay
├── Cash
├── EcoCash Direct
├── Paynow
├── ContiPay
└── PayPal
```

Only valid channels appear for:
- business unit;
- currency;
- amount;
- zone;
- transaction type;
- customer/org context;
- provider availability.

## Cash

WhatsApp may:
- show approved collection location/COD option;
- show cash collection reference;
- show amount/currency;
- show receipt/status after DIAL collector confirmation.

Customer tapping "I paid cash" never changes payment state.

## EcoCash Direct

WhatsApp:
1. shows payable summary;
2. confirms mobile number;
3. DIAL server initiates EcoCash Push Transaction;
4. customer confirms inside EcoCash USSD;
5. WhatsApp shows waiting state;
6. authenticated EcoCash provider notification/query advances DIAL state;
7. WhatsApp sends confirmed/failed state and receipt.

DIAL never asks for the EcoCash PIN.

## Paynow

WhatsApp:
1. creates PaymentIntent;
2. DIAL server initiates Paynow;
3. validates Paynow response hash;
4. sends/opens secure `browserurl`;
5. resulturl callback arrives server-side;
6. DIAL validates hash and polls `pollurl` where needed;
7. canonical payment state updates;
8. WhatsApp receives status.

The return URL is UX only.

## ContiPay

The current authenticated ContiPay adapter drives the supported provider action.

WhatsApp never embeds provider secrets or invents provider status.

Notification/query → DIAL PaymentIntent → WhatsApp status.

## PayPal

WhatsApp:
1. DIAL creates a PayPal Order server-side;
2. customer opens PayPal approval;
3. after approval DIAL captures server-side;
4. PayPal API/webhook state confirms outcome;
5. WhatsApp receives status/receipt.

`CHECKOUT.ORDER.APPROVED` is not treated as payment completion.

## Unknown state

Every channel supports:
`Check payment`

If DIAL cannot determine the provider result:
- show `Confirming payment`;
- query/reconcile;
- do not encourage blind repeat payment;
- human support for aged/duplicate-debit cases.

## Refunds

Customer can see:
- refund requested;
- pending;
- completed;
- failed/action required.

Refund authority comes from return/RCE/business policy and Finance approval, not the WhatsApp bot.

## Security

- no raw card/wallet PIN data;
- provider secrets server-side;
- Flow token not authorization;
- webhooks/signatures/hashes verified;
- provider events deduped;
- amount/currency correlated;
- human/manual adjustments permissioned and audited.
