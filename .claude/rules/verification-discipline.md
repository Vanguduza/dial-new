---
paths:
  - "**"
always: true
---

# Probe before concluding

A conclusion reached without running something is a hypothesis. State it as one, or verify it.

This rule exists because it was learned expensively. During the VEKL retrieval work a
root cause was asserted three times and was wrong all three times. Each correction came
from running a probe, not from thinking harder:

| Asserted | Probe | Actual |
| --- | --- | --- |
| "Bounded traversal broke recall" | Ran the same eval on both commits | Recall identical: 0.7292 / 0.7292 |
| "The n8n corpus lost its edge" | Queried the compiled graph for that edge | Zero edges ever existed; it arrived by cross-unit leakage |
| "`WHATSAPP ⊃ MESSAGING` will fix it" | Read the resource's declared classes | It declares `AI_SECURITY, EXTERNAL_RESEARCH, SECURITY` — no messaging |
| "51 task classes are unreachable" | Read the classifier's own rule table | The rules exist; the records carry no prose for them to match |

Every one of those would have shipped a wrong fix.

## The method

1. **Name the claim.** One sentence, falsifiable. "The corpus is unreachable because the
   edge is missing" — not "retrieval seems off".
2. **Find the cheapest thing that could disprove it.** Usually one command: compile the
   graph and count, run the resolver and print, grep the registry. Seconds, not minutes.
3. **Run it before writing the fix.** Not after. A fix written first becomes the thing
   you defend.
4. **Measure both sides of a change.** "Better" is a comparison. Run the old path and the
   new path through the same instrument and print both numbers.
5. **When the probe contradicts you, say so plainly and move on.** No hedging, no
   retrofitting the story. The correction is the deliverable.
6. **Check the instrument before trusting it.** An eval that measures the wrong layer
   gives false confidence — worse than no eval. If two things that cannot both be true
   agree, the instrument is wrong.

## Applies especially to

- **Root-cause claims.** Never report a cause you have not reproduced.
- **"This is a regression."** Run it on the base commit first. It may predate the change.
- **"This fix will also handle X."** Test X. Related-sounding problems rarely share a cause.
- **Counts and coverage.** Derive them from the artefact. Remembered numbers drift.
- **"The test is wrong."** Establish what the test actually asserts and whether it ever
  passed for the right reason. A test passing by accident is a finding about the system.
- **Autonomous gates.** A gate whose failure mode you have not induced is not known to
  work. Break it deliberately and watch it fail before trusting it.

## What good looks like

Report the command and its output next to the claim. A reader who does not trust you
should be able to re-derive every number without asking. Where something could not be
measured, say it is an estimate and say why.
