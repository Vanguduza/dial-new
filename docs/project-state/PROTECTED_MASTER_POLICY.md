# Protected `master` policy

`master` remains DIAL's canonical integration branch. Repository files declare the expected
GitHub controls; they do not prove those controls are applied.

Changes reach `master` through a pull request with the expected `verify` and `project-truth`
checks, owner CODEOWNER review, stale-review dismissal, signed commits, and no force-push or
deletion. Project Truth automation is read-only after merge, as required by
`PROJECT_TRUTH_PROTOCOL.md`.

The external gate is satisfied only by a current owner export of the live GitHub enforcement API state—either native branch protection or an equivalent ruleset—
normalised as `BRANCH_PROTECTION_EVIDENCE.json` and validated against
`BRANCH_PROTECTION_EVIDENCE.schema.json`. The expectation file and CODEOWNERS alone must remain
`OWNER_ACTION_REQUIRED`; no agent or CI run may infer applied settings from them.
