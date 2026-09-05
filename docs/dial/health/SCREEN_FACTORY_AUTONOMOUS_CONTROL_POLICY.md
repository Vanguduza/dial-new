# Dial Health Screen Factory — Autonomous Control Policy

**Status:** Canonical  
**Applies to:** dashboard Play / Pause / Resume / Stop controls and the Screen Factory worker daemon.

## Core rule

`Play` latches `requested_state=RUNNING` and starts the Screen Factory worker service. Once latched, processing advances automatically through canonical screen order, internal ten-screen execution groups, required platforms and business units. Batch and platform boundaries never require another user action.

`Pause` is cooperative. It changes the requested state to `PAUSED`; if a screen is already in an atomic GENERATING / RENDERING / QA operation, the current screen is allowed to reach a safe boundary and the worker then holds. The worker service remains alive so `Resume` is immediate.

`Resume` restores `requested_state=RUNNING` and idempotently ensures the worker service is active. Autonomous processing continues from canonical persisted state; it does not restart a completed screen.

`Stop` is cooperative. It changes the requested state to `STOPPED`. If an atomic screen operation is already active, it is allowed to reach a safe persistence boundary before the daemon exits normally. The dashboard must not hard-kill the worker during a normal Stop request.

## Autonomous blocking and recovery

Contract gaps are fail-closed but do not clear the RUN latch. The worker enters `CONTRACT_BLOCKED`, keeps `requested_state=RUNNING`, periodically rechecks the canonical contract and automatically continues when the gap is resolved.

Transient model/runtime unavailability enters `RUNTIME_BLOCKED` without clearing the RUN latch. The worker retries after bounded backoff and continues automatically when the exact-model runtime becomes healthy.

Interrupted `GENERATING` leases are recovered to `NOT_GENERATED` on worker startup so a crash or machine restart cannot permanently strand the canonical queue. The interrupted screen is retried in canonical order.

A screen that exhausts bounded generation retries remains fail-closed in `FAILED`; the worker stays under the RUN latch and periodically rechecks state rather than silently skipping the screen. Manual repair/reset may still be required for a persistent defect.

Natural `COMPLETE` is the only non-manual terminal condition: no remaining REQUIRED work exists.

## Dashboard truth

The dashboard exposes the persisted requested state, actual worker-service state, current factory state and an explicit Autonomous Run badge. A control acknowledgement is not considered successful for Play/Resume unless the worker service is verified active.

Button semantics are therefore:
- **Play:** latch continuous autonomous execution and start worker.
- **Pause:** hold at the next safe screen boundary; keep worker alive.
- **Resume:** continue autonomous execution from persisted canonical state.
- **Stop:** request safe stop; finish the active atomic screen if one exists, persist it, then let the worker exit normally.

The control policy must never turn a ten-screen group or completed platform into a manual continuation gate.

## Runtime-infrastructure fault handling

The canonical queue is strictly sequential. The worker may claim only the first incomplete REQUIRED screen. It must never skip an exhausted or failed earlier screen and continue with a later screen.

Missing local runtime executables, model-runtime timeouts, account/rate limits, or equivalent runtime transport failures are infrastructure blockers rather than screen-generation defects. These conditions enter `RUNTIME_BLOCKED`, preserve the RUN latch, clear the transient task lease, and do not consume the screen's bounded generation-attempt budget.

The worker service must include the authenticated user's local executable paths so the Hermes and Claude Code CLIs resolve under systemd exactly as they do in an interactive shell. Dashboard control calls must also supply the user-systemd bus environment; otherwise a Play acknowledgement is invalid even if `requested_state=RUNNING` was written.

The dashboard may collapse repeated identical retry events for readability, but the append-only factory event log remains unchanged as forensic evidence. Failure cards must expose the actual reason rather than only the event name.

## Storage pressure gate

Oracle storage protection is an autonomous fail-safe, not a manual continuation point. Before a new screen is claimed, the worker checks the bounded local cache and filesystem reserve. Crossing the configured threshold enters `STORAGE_BLOCKED` while keeping `requested_state=RUNNING`; no screen retry is consumed and canonical ordering is preserved.

The independent storage service continues syncing to R2 and Google Drive. Once the local cache or disk reserve returns below the safety threshold, the worker resumes automatically. Current defaults are a 2 GiB Screen Factory local-cache target and an 8 GiB free-disk reserve.
