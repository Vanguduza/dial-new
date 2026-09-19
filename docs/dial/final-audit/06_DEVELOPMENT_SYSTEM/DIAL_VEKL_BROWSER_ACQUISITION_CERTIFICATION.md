# DIAL VEKL Browser Acquisition Fabric — Full Certification

**Certification date:** 2026-09-19
**Scope:** DIAL VEKL Stagehand + Browser Harness integration
**Branch:** `gpt/vekl-browser-fabric-certified-v2-20260919`
**Implementation authority:** owner-authorized VEKL open-world research program
**Authority boundary:** browser-derived material remains `NON_AUTHORITATIVE_RESEARCH` until normal VEKL qualification/admission. This certification does not elevate public research to Project Truth.

## 1. Certified topology

The certified runtime topology is:

- **vekl-worker** — authoritative `dial_vekl` PostgreSQL state, VEKL evidence, discovery lifecycle, Groq first pass, ChatGPT deep-research handoff, reference promotion, Stagehand model proxy.
- **dial-hermes-control** — DIAL control/MCP/orchestration authority. It exposes bounded research tools and persistent SSH tunnels.
- **van-trading-core** — physical host for the isolated DIAL browser runtime only. It is not Project Truth authority and is not a DIAL development worker.

The DIAL browser estate is isolated from VAN:

- DIAL runtime: `/opt/dial-browser-runtime`, owner `dial-browser:dial-browser`.
- DIAL state/cache: `/var/lib/dial-browser`, owner `dial-browser:dial-browser`.
- VAN browser runtime: `/opt/van-browser-runtime`, owner `van-browser:van-browser`.
- VAN trading state: `/var/lib/van-trading`, owner `vati:vati`.
- No cross-owned files were found in the opposite estates during certification.

DIAL browser fabric binds to `127.0.0.1:9150`. The Stagehand model proxy binds to `127.0.0.1:9152` on vekl-worker and is made reachable to the browser estate only through persistent SSH forwarding. The Groq credential remains on vekl-worker; it is not copied into Trading Core.

Pinned top-level runtime versions:

- `@browserbasehq/stagehand 4.1.0`
- `playwright 1.63.0`

## 2. Certified acquisition routing

The VEKL acquisition layer now supports:

1. `DIRECT_FETCH` for known public HTTPS sources.
2. `EXA_SEARCH` as the preferred open-world search route while healthy.
3. `BROWSER_SEARCH` when Exa is unavailable, empty, timed out, or rate limited.
4. `BROWSER_RENDERED` when static retrieval is insufficient or rendering is required.
5. `STAGEHAND_NAVIGATION` for bounded semantic extraction/navigation.
6. Repository/document-specific browser operations through the same bounded fabric.

Exa failure is treated as a degraded route, not a research-packet failure.

All browser routes normalize evidence with source/final URL, acquisition method, content hash, page/snapshot hash, interaction-trace hash, observation time, source kind, trust suggestion, candidate ID and non-authoritative research authority.

## 3. Security certification

The browser fabric passed the following controls:

- public HTTPS only;
- DNS validation before navigation;
- private, loopback, link-local and internal targets rejected;
- redirect/request interception;
- downloads disabled;
- no `file://` or arbitrary browser-command surface;
- bounded request body, result size, links, navigation time and semantic instruction size;
- local listeners only;
- SSH-tunnel transport isolation;
- no Docker socket;
- no provider credential on Trading Core;
- DIAL/VAN runtime and state separation.

Live negative proof:

`https://127.0.0.1/` was refused as `BROWSER_FABRIC_PRIVATE_DNS_TARGET_REJECTED`.

Repository secret scan for Groq/OpenAI/private-key patterns returned no matches.

## 4. Live acquisition proofs

### 4.1 Direct fetch

Current PostgreSQL documentation was retrieved through `DIRECT_FETCH`.

Content hash:

`8ec5a1859e79a2554671192efde6ca54df6f432d18bdda49d716f0095b32daed`

### 4.2 Rendered Browser Harness

Playwright documentation was retrieved using real Chromium through `BROWSER_RENDERED`.

Content hash:

`c6ceff720ba799584251376e1260c0f6bab837a1ec9719aa777db7bd7dae0e72`

Page snapshot hash:

`a66c2d020dac408acd1501579b4a32e8740cbf2148e78fc3e696fdb77e4eb772`

### 4.3 Forced Exa rate-limit fallback

A controlled Exa HTTP 429 was injected for the query:

`PostgreSQL official concurrency documentation`

The router returned:

- state: `DEGRADED_ROUTE_USED`
- acquisition method: `BROWSER_SEARCH`
- fallback cause: `EXA_HTTP_429`
- evidence hash: `ace60cbfab8099248eee955a7ce1a8da26a6c9d6775952fa4e853cee8d2be511`
- browser candidate: `DISC-c1fc50be1efd7d15e8888d09`

The browser returned real public candidates, including the canonical PostgreSQL site.

### 4.4 Stagehand semantic navigation

Stagehand performed live semantic extraction from PostgreSQL MVCC documentation.

Certified semantic extraction hash:

`1399f68a799c6ed28f4ee9e48e448b0741043680c69739fb0b2f3b43c63b2ad4`

The extracted evidence correctly described PostgreSQL MVCC snapshot semantics and implementation implications. Earlier provider JSON-schema, TPM and transient target-attachment failures were fixed with bounded prompt compaction, local structured-output coercion, transient rate-limit retry and browser retry behavior.

## 5. Authoritative VEKL persistence proof

A real browser-acquired Stagehand source was persisted into canonical VEKL packet:

- packet: `DU-RSCH-699a25c9f11aea6347ee6587`
- packet hash: `9e0fca9d7d23bc4fd79070b038921575efc516b0313420fa107cb82172b9095b`
- feature: `TECH-F003`
- acquisition method: `STAGEHAND_NAVIGATION`
- persisted ANALYSIS evidence: `d682a9c5b5e1044c08cfdca2d4b30e260a31941cb6fcb89121fb7d6aa73c2cc5`
- additional Stagehand ANALYSIS evidence: `44c6c1a42f1e6eee49f91acf5075a77f31eeb274599838bf93b4d84ac1f45088`

A first-class MCP `FETCH_READ` event was also persisted for Stagehand navigation with content hash:

`30af807de98f706a83fda8ad02a569c5d5f9e3ffe8573da659293938f05b210b`

This proves the browser fabric is not merely a side service: browser evidence can flow through the bounded DIAL MCP research contract into authoritative VEKL evidence/event storage.

## 6. Discovery lifecycle integrity proof

The new PostgreSQL MVCC source was not in the packet's original source-hint list. It entered the candidate plane as:

`DISC-e6cd546103c51328c64eb8e7`

and was processed through the lightweight official-reference lifecycle to:

`ADMITTED | T1_OFFICIAL`

During certification a regression defect was found: an ordinary later evidence submission could overwrite an admitted candidate with `DISCOVERED/T4`. This was fixed by making discovery upserts monotonic for lifecycle and trust, while unioning evidence references.

A deliberate live regression probe then resubmitted the same candidate as `DISCOVERED/T4_COMMUNITY_SIGNAL`. The authoritative DB correctly preserved:

`ADMITTED | T1_OFFICIAL`

and retained/unioned the old and new evidence references.

The reference promoter was also hardened so a verified T1 official source can repair a stale candidate-plane trust tier before qualification/admission.

## 7. Existing full-loop research proof preserved

The previously certified end-to-end packet remains unchanged:

- packet: `DU-RSCH-8b1fb6d82ddad0cb0f350010`
- packet hash: `de439bf60af5f55cc01dbf2c35bdc27199fda8d01d01679e80d516025dce3234`
- state: `COMPLETE`
- GROQ_RESEARCH: `81f5cc4e9f422a844cf5773ef329ed5558b12b1b52372dc4de3aa232ba41ad89`
- ANALYSIS: `e4f897c2e2c2bcaf9c49faadbaca872290bccefc043f2b0816b7d3a94a9e081e`
- DEEPER_EVIDENCE: `80596d6d46712fe3630a33c3e3da7d164edaa7e1beb02e7afdcb25cc8175c0e9`

Thus the browser integration did not invalidate the deterministic Groq → ChatGPT → completion-gate pipeline.

## 8. Verification results

Fresh certification tests:

- VEKL Browser Fabric verification: **5/5 PASS**
- VEKL infrastructure verification: **6/6 PASS**
- Open-world discovery architecture: **28/28 PASS**
- Guided frontend architecture: **34/34 PASS**
- n8n DEV runtime architecture: **43/43 PASS**
- syntax checks for every Stagehand/Browser-related changed JavaScript/MJS file: **PASS**
- browser installer shell syntax: **PASS**

The infrastructure verification includes completion-gate behavior, semantic automation inference, reference/executable risk separation, coverage maturity, and discovery lifecycle/trust monotonicity.

## 9. Live service state

At certification:

- DIAL chat-control MCP: active
- browser-fabric SSH tunnel: active
- Stagehand worker-model tunnel: active
- Stagehand Trading-Core reverse tunnel: active
- DIAL Browser Fabric: active + enabled
- Stagehand model proxy: active + enabled
- PostgreSQL on vekl-worker: active
- Groq research timer: active
- ChatGPT deep-research dispatcher timer: active
- reference promoter timer: active
- DIAL n8n DEV: active
- DIAL n8n DB tunnel: active
- DIAL n8n `/healthz`: `{"status":"ok"}`

Deployed browser-server and Stagehand-proxy file hashes were verified byte-identical to the repository checkout.

## 10. Monitor integration

The VEKL live monitor now reports:

- browser-fabric health;
- acquisition methods;
- persisted degraded-route count;
- direct/search/rendered/Stagehand route evidence when present;
- normal packet/evidence/coverage state.

The canonical invariants remain:

- 309 Development Units
- 5,253 research coverage cells
- 18 specialist roles per packet

The research mission remains in progress; certification of the browser acquisition fabric does **not** mean all 309 research packets are complete.

## Certification decision

**DIAL VEKL Stagehand + Browser Harness integration: CERTIFIED FULLY FUNCTIONAL.**

The certified system now provides resilient browser-backed acquisition, real semantic Stagehand extraction, Exa-rate-limit fallback, authoritative evidence persistence, discovery qualification without authority leakage, deterministic monitoring, DIAL/VAN tenancy isolation and fail-closed network/security boundaries.

There is no remaining architectural blocker to using Browser Harness and Stagehand in the ongoing VEKL research harvest. External provider quotas can still cause temporary degraded execution, but the routing/retry/fallback design handles them without weakening VEKL authority or trust rules.

No Union Alpha research execution is claimed by this certification.
