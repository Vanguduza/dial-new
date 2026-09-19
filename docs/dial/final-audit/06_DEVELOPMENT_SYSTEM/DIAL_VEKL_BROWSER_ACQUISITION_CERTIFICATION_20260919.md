# DIAL VEKL Browser Acquisition Fabric — Certification Evidence

Date: 2026-09-19  
Scope: DIAL VEKL Stagehand + Browser Harness integration  
Branch: `gpt/vekl-research-open-world-integration-20260919`  
Authority: implementation/evidence record only; this document does not alter Project Truth.

## Certified topology

- `vekl-worker` remains the authoritative VEKL PostgreSQL/state/evidence host.
- `dial-hermes-control` remains the DIAL control/MCP/orchestration host.
- Trading Core hosts the browser runtime only. It is not Project Truth authority or a general DIAL development worker.
- DIAL browser estate is isolated from VAN:
  - DIAL: `/opt/dial-browser-runtime`, `/var/lib/dial-browser`, user/group `dial-browser`.
  - VAN: `/opt/van-browser-runtime`, user/group `van-browser`; trading state `/var/lib/van-trading`, owner `vati`.
- DIAL Browser Acquisition Fabric: localhost `127.0.0.1:9150`.
- Stagehand model proxy: localhost `127.0.0.1:9152` on `vekl-worker`, reached from Trading Core only through persistent SSH tunnels.
- Browser runtime pins: Stagehand 4.1.0, Playwright 1.63.0.
- Stagehand model path uses the existing VEKL worker Groq credential and ZDR marker. No Groq key is copied into the Trading Core browser estate.

## Acquisition contract

The VEKL acquisition router now supports:

1. `DIRECT_FETCH` for known public HTTPS sources.
2. `EXA_SEARCH` for primary open-world discovery.
3. `BROWSER_SEARCH` if Exa is unavailable, empty, rate-limited, or otherwise fails.
4. `BROWSER_RENDERED` when deterministic static retrieval is insufficient.
5. `STAGEHAND_NAVIGATION` when semantic page interpretation is required.

All browser evidence is normalized as `NON_AUTHORITATIVE_RESEARCH` and contains deterministic source/final URL, content hash, page/snapshot hash, interaction-trace hash, observation time, source kind, trust suggestion, candidate id, and acquisition method. Browser acquisition does not grant Project Truth or T0 authority.

The browser service enforces public HTTPS, DNS and redirect validation, private/loopback/link-local rejection, response/request limits, bounded navigation, downloads disabled by default, no file URL acquisition, and a fixed operation allow-list.

## Live certification evidence

### Browser Harness rendered retrieval

Live page: `https://playwright.dev/docs/intro`

Observed:

- acquisition method: `BROWSER_RENDERED`
- content hash: `c6ceff720ba799584251376e1260c0f6bab837a1ec9719aa777db7bd7dae0e72`
- page snapshot hash: `49b73ffadd88a4a3c6d231989efd13922f05eb770a116c25ef25d430de0481e8`
- authority: `NON_AUTHORITATIVE_RESEARCH`

### Browser search

Live public search through Browser Harness returned real public candidates using Bing. A certification observation included:

- acquisition method: `BROWSER_SEARCH`
- content hash: `ace60cbfab8099248eee955a7ce1a8da26a6c9d6775952fa4e853cee8d2be511`
- candidate: `DISC-50220d8b36ba1c40feb0a86d`
- returned public destinations including PostgreSQL official pages.

The browser search route now has bounded engine fallback across Bing, Brave, DuckDuckGo, and GitHub search, with outbound URL normalization and public-URL filtering.

### Forced Exa 429 fallback

A real acquisition test forced the Exa adapter to return HTTP 429 while leaving the Browser Harness path live.

Observed:

- state: `DEGRADED_ROUTE_USED`
- fallback acquisition method: `BROWSER_SEARCH`
- fallback cause: `EXA_HTTP_429`
- content hash: `4c2ee05dd360994396bfe9725e07b27714f44bbd2de9246fdc86f9078b0c3328`
- candidate: `DISC-fb1d60fddf40fac139fdb5a9`

Therefore Exa rate limiting no longer constitutes a VEKL research-packet failure by itself.

### Stagehand semantic retrieval

Live semantic extraction succeeded against:

`https://www.postgresql.org/docs/current/mvcc-intro.html`

One final semantic certification observation returned:

- acquisition method: `STAGEHAND_NAVIGATION`
- content hash: `8c8089ac2d935848f0f68aef048446d1dcab440032585d68b0b5958c965a5e9d`
- page snapshot hash: `350bf1a506351719ff2c0b0f4590ce943258c739a64f24f15b58042c4c87d52d`
- candidate: `DISC-e6cd546103c51328c64eb8e7`
- result: an evidence-grounded MVCC extraction covering snapshot semantics, transaction isolation, and lock-contention reduction.

The worker-side model proxy was hardened for Groq TPM/rate-limit behavior, structured-output validation failures, bounded prompt compaction, and empty-response retry. Persistent failures remain fail-closed.

## VEKL persistence canary

The current canonical packet used to prove browser-acquired evidence persistence was:

- packet: `DU-RSCH-699a25c9f11aea6347ee6587`
- packet hash: `9e0fca9d7d23bc4fd79070b038921575efc516b0313420fa107cb82172b9095b`
- unit lineage: `DU-LIN-0479a617df29b72f1df386e9`
- feature: `TECH-F003`

The specific PostgreSQL MVCC page is not one of the packet's original source-hint URLs; the packet only contained the PostgreSQL documentation root.

A Stagehand-acquired source was persisted with:

- acquisition method: `STAGEHAND_NAVIGATION`
- source ref: `source:30af807de98f706a83fda8ad02a569c5d5f9e3ffe8573da659293938f05b210b`
- content hash: `30af807de98f706a83fda8ad02a569c5d5f9e3ffe8573da659293938f05b210b`
- analysis evidence hash: `44c6c1a42f1e6eee49f91acf5075a77f31eeb274599838bf93b4d84ac1f45088`
- coverage maturity after submission: `ANALYZED`

The packet was deliberately returned to `RETRY`, not falsely completed, so normal deep-research completion may continue.

The discovery candidate `DISC-e6cd546103c51328c64eb8e7` passed the lightweight official-reference lifecycle. Certification also exposed and repaired a re-observation regression: discovery upserts are now monotonic in lifecycle and trust, evidence refs are merged, and verified official publisher/source matches repair trust to `T1_OFFICIAL` rather than regressing an admitted candidate. The candidate is currently `ADMITTED / T1_OFFICIAL`.

## Existing full-loop integrity

The previously certified end-to-end research packet remains unchanged:

- packet: `DU-RSCH-8b1fb6d82ddad0cb0f350010`
- packet hash: `de439bf60af5f55cc01dbf2c35bdc27199fda8d01d01679e80d516025dce3234`
- state: `COMPLETE`
- evidence kinds: `GROQ_RESEARCH`, `ANALYSIS`, `DEEPER_EVIDENCE`
- persisted `COMPLETION_GATE_PASSED`: true

Browser integration therefore did not invalidate the earlier completion proof.

## Fresh verification results

Fresh direct Node verification:

- VEKL browser-fabric verification: **5/5 PASS**
  - normalized evidence/no token material
  - Exa 429 browser fallback
  - direct-fetch to rendered-browser escalation
  - bounded MCP acquisition routes
  - browser isolation/SSRF control markers
- VEKL infrastructure verification: **6/6 PASS**
  - incomplete completion blocked
  - complete same-lease loop accepted
  - semantic automation applicability
  - lightweight reference vs strict executable qualification
  - staged coverage maturity
  - discovery lifecycle/trust/evidence monotonicity
- Discovery architecture: **28/28 PASS**
- Guided frontend architecture: **34/34 PASS**
- n8n DEV architecture/runtime qualification: **43/43 PASS**

The repository's Vitest binary was not available in the existing Hermes checkout during certification, so this evidence does not claim a fresh Vitest run. The purpose-built Node certification suites and architecture checks above were executed fresh.

## Live service checks

At certification time:

- DIAL chat-control MCP: active
- Hermes browser-fabric SSH tunnel: active
- Hermes worker model-proxy tunnel: active
- Hermes Trading-Core reverse model-proxy tunnel: active
- DIAL n8n DEV: active
- DIAL n8n DB tunnel: active
- DIAL n8n `/healthz`: `{"status":"ok"}`
- VEKL PostgreSQL: active
- Groq first-pass timer: active
- ChatGPT deep-research dispatcher timer: active
- reference promoter timer: active
- Stagehand model proxy: active
- worker browser-fabric tunnel: active
- Trading Core DIAL browser service: active

After browser requests completed, the DIAL browser user had zero lingering Chromium processes in the leak check.

## Current mission monitor

A certification snapshot of the current mission reported:

- Development Units: 309 / expected 309
- DU×research-dimension cells: 5,253 / expected 5,253
- roles per packet: 18
- packets: COMPLETE 4, READY 303, RETRY 2
- evidence: GROQ_RESEARCH 7, ANALYSIS 7, DEEPER_EVIDENCE 5
- frontend applicable: 236
- n8n applicable: 30
- monitor browser fabric: healthy, Stagehand enabled, Playwright 1.63.0
- persisted acquisition route count included `STAGEHAND_NAVIGATION`.

These are point-in-time values and will change as the autonomous research mission proceeds.

## Secret and isolation checks

A repository scan for Groq/OpenAI-style credential material found no matching committed secrets. Provider key material remains outside git.

DIAL/VAN filesystem ownership remains separated on Trading Core. DIAL uses a separate user, runtime root, state root, browser profiles, evidence cache, service, ports, and transport. VAN browser/trading roots retain their own owners.

## Certification conclusion

The DIAL VEKL Browser Acquisition Fabric is certified for production research use under the current VEKL authority model:

- deterministic browser rendering is live;
- semantic Stagehand acquisition is live;
- Exa 429 degrades to real browser discovery;
- browser evidence is normalized and can be persisted into canonical VEKL research packets;
- discovery qualification remains authority-bounded;
- lifecycle/trust upserts are monotonic;
- existing full-loop research integrity remains intact;
- DIAL/VAN tenancy is isolated;
- services are boot-persistent and healthy.

Groq provider quotas remain an external throughput constraint. They are handled with bounded retries and fail-closed behavior and do not change VEKL authority semantics.
