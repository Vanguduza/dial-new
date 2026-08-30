# Protection pricing and regulatory position — researched conclusions v1

**Purpose.** To close the Grocery Rounds vertical slice without waiting for a
broker quote or a counsel meeting, by reaching documented conclusions from
primary sources.

**Standing.** These are researched engineering positions with their sources named,
not a tax opinion, a legal opinion or a bound quote. They are sufficient to build
and to price a pilot. They are not sufficient to publish a customer tier
(`RCM-019`) or to take a first real payment. Where a conclusion is strong, this
document says so; where it rests on an absence of contrary evidence, it says that
instead.

---

## 1. Is a Round credit a deposit? — No, on two independent grounds

**Source.** Banking Act [Chapter 24:20], as published by the Reserve Bank of
Zimbabwe.

> **"Banking business"** — *the business of accepting deposits withdrawable or
> repayable on demand or after a fixed period or after notice **and** the
> employment of those deposits, in whole or in part, by lending or any other
> means.*

The definition is **cumulative**. Both limbs must be satisfied. A Round credit
fails each of them separately:

**Limb 1 — nothing is withdrawable or repayable.** `DEC-001` makes credits
non-redeemable in money in any circumstance, and `RCM-002` refuses a Round product
configured otherwise. A member's only exits are in kind: groceries at standard
retail, or carry-forward to the next Round (`DEC-005`, `RCM-017`). There is no
state of the world in which Dial owes a member money.

**Limb 2 — the money is not employed by lending.** Consideration for credits buys
grocery stock and forward supply. The master plan's §13 already forbids profit
from interest or investment of customer purchase value, and `DEC-001`'s record
carries that forward. The float is working capital in an inventory business, not
a loan book.

The Act's definition of **"deposit"** is also circular in a way that helps: it is
an amount *"which a banking institution accepts for credit to an account in its
books"*. It presupposes a banking institution. Dial is not one, does not hold
member accounts in that sense, and the credit ledger is an entitlement ledger
under fulfilment rather than an account of money (`RCM-001`, `RCM-015`).

**Confidence: high**, on the primary text, for the Banking Act specifically.

**What is not covered.** The National Payment Systems Act and any stored-value or
e-money instruments made under it were not examined. The design's closed-loop,
non-transferable, single-issuer construction is the standard exclusion in those
regimes, and `RCM-001`/`RCM-015` enforce it in code — but this is reasoning from
the general shape of such rules, not from the Zimbabwean text. **This is the one
item still worth a lawyer's half-hour**, and it does not block the slice.

## 2. Does the protection charge make Dial an insurance intermediary? — No

**Source.** Insurance Act [Chapter 24:07], as published by IPEC.

> **"Insurance agent"** — *a person who, **on behalf of a registered insurer**,
> initiates insurance business, or does any act in relation to the receiving of
> proposals for insurance, the issue of policies or the collection of premiums.*

> **"Insurance broker"** — *a person who, **on behalf of any other person**,
> negotiates insurance business with insurers.*

> **"Insurance business"** — *the business of **assuming the obligations of an
> insurer** in any class of insurance business whatsoever.*

Three definitions, three tests, and the design fails all three in the direction
that matters:

| Definition | Requires | Dial |
|---|---|---|
| Agent | acting **on behalf of an insurer** | acts on its own behalf; is the insured |
| Broker | negotiating **on behalf of another person** | negotiates its own cover for its own obligation |
| Insurance business | **assuming an insurer's obligations** | buys cover; assumes none |

**Dial insuring its own delivery obligation and recovering the cost inside the
product price triggers no registration.** Nothing in the Act reaches a business
that insures itself and prices the premium into what it sells.

**Where the line actually is, and it is exactly where `RCM-019` already put it.**
The registration risk begins the moment the member becomes the insured — if Dial
collects an identified premium on an insurer's behalf, or arranges cover in which
the member is the beneficiary. That is agent conduct under limb (a) of the agent
definition. `RCM-019` refuses `presentedAsMemberPremium`, and now it has a source
rather than a caution behind it.

**Confidence: high.** The definitions are explicit and the distinction is
structural rather than a matter of degree.

## 3. What should the protection charge be? — 4% is defensible; availability is the real question

**The plan was reaching for the wrong product.** Trade credit insurance — the
figures most readily available, at [0.05%–0.6% of insured sales](https://www.impelloglobal.com/trade-credit-insurance-cost)
— protects a **seller against a buyer's non-payment**. Rounds needs the reverse:
protection for **customers against Dial's non-delivery**. That is advance payment
bond / performance guarantee / surety territory, and it prices very differently.

**Published surety pricing**, from [Bond Exchange](https://www.bondexchange.com/surety-bond-basics-understanding-premium-rates/):

| Bond class | Rate on bond amount |
|---|---|
| Contract bonds, larger projects | 1–3% |
| Contract bonds, under US$1m | ~3% |
| Judicial bonds | 0.75–2% |
| Licence and permit bonds | 0.5–10% annually |

Underwriting turns on credit standing, years of trading and risk class — all three
of which are weak for a new principal, which pushes toward the top of any range.

**Conclusion: 4% is a defensible planning figure**, sitting just above the
small-contract-bond rate and well inside the licence-bond band. Review finding H2
estimated 4–6%; the published ranges suggest that was if anything slightly
pessimistic at the bottom. **Proceed at 4%.**

**The finding that matters more than the rate.** For an unrated principal with no
trading history, surety markets frequently **decline rather than price**, or write
only against cash collateral or a counter-indemnity. So the question to put to the
broker is not *"what is your rate"* but *"will you write this at all, and against
what security"*. That is a materially different conversation, and it is worth
having early — but it gates publishing a tier, not building the slice.

## 4. Consumer-law standing of non-redeemability

**Not researched to a conclusion**, and deliberately left there. The Consumer
Protection Act [Chapter 14:44] question is about how a court or the Commission
would read an unfair-term challenge, which is a judgement about application rather
than a definition to look up — the kind of question where desk research produces
false confidence.

**What can be said without a lawyer:** the risk is mitigated by design rather than
argued away. `DEC-005` gives a member a substantial in-kind exit available at any
time, at standard retail, without needing anyone's permission — so the term under
challenge is not "you forfeit your money" but "you take your value in groceries
rather than cash". That is a much weaker target, and it was built that way on
purpose.

**Not a blocker.** Nothing about it changes what gets built.

---

## 5. What this closes, and what it does not

**Closed for build:**

- deposit-taking characterisation (§1);
- insurance intermediation characterisation (§2);
- the protection rate as a planning figure (§3).

The Grocery Rounds vertical slice proceeds on these. `RCM-019` accepts a
researched position while `commercialStage` is `DEVELOPMENT`.

**Still required before a tier is published or a first real payment is taken**, and
each is now a specific short question rather than an open meeting:

1. **A broker conversation** about whether surety-class cover is available at all
   for an unrated principal and against what security. `RCM-019` requires a real
   quote at `TIERS_PUBLISHED`.
2. **Half an hour of counsel time** on the National Payment Systems Act
   stored-value position (§1's one gap) and the Consumer Protection Act reading
   (§4).
3. **The AML/KYC responsibility matrix** — unchanged, and genuinely required by
   `ACT-REG-001` before pooling money from strangers over months.

## Sources

- [Banking Act [Chapter 24:20], Reserve Bank of Zimbabwe](https://www.rbz.co.zw/documents/acts/ZIMBABWE_Banking_Act_2023_updated.pdf)
- [Insurance Act [Chapter 24:07], IPEC](https://ipec.co.zw/wp-content/uploads/2023/06/Insurance-Act_2.pdf)
- [IPEC licensing requirements](https://ipec.co.zw/licensing-requirements/)
- [Surety bond premium rates — Bond Exchange](https://www.bondexchange.com/surety-bond-basics-understanding-premium-rates/)
- [Trade credit insurance cost — Impello Global](https://www.impelloglobal.com/trade-credit-insurance-cost), cited to show why it is the wrong comparator
