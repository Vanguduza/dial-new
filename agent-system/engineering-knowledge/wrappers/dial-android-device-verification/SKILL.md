---
name: dial-android-device-verification
description: DIAL-safe Android build, device, emulator, layout and screenshot verification procedure derived from the official Android CLI skill with unsafe installation behaviour removed.
license: Apache-2.0; see LICENSE.txt and PROVENANCE.json
---
# DIAL Android Device Verification

Use only after the DIAL Feature/FRC, screen contract, security profile and VEKL activation manifest are resolved.

## Hard boundaries
- This procedure is engineering guidance only. DIAL canon and evidence win.
- Never install or update Android CLI, SDKs, Java, Gradle, emulator images or system packages automatically. If a required tool is absent, report `ANDROID_TOOLING_BLOCKER`.
- Never use `curl | sh`, global package installation, privileged installation, or arbitrary remote scripts.
- Do not modify product requirements, navigation authority, identity/permission rules, data ownership or release gates.
- Use synthetic/test data. Never place secrets, customer payment data or identifiable Health data into device tooling or screenshots.

## Verification sequence
1. Inspect the current project and its documented toolchain before running anything.
2. If an approved `android` CLI is already present, record `android --version` and `android info` as environment evidence.
3. Build using the repository's existing approved build command. Do not change dependencies merely to make the build pass.
4. Select an already provisioned device/emulator. Record device identity and API level.
5. Run/install the built app using the existing approved toolchain.
6. Inspect UI structure with `android layout --pretty` where available. Prefer `layout --diff` after actions to reduce context.
7. Capture screenshots with `android screen capture -o <path>` where available. The upstream summary's old `android screenshot` wording is not used.
8. Use `adb shell input` only against a test device and only for the bounded journey under verification.
9. Run the Feature's required functional, accessibility, security and journey tests. The FRC defines acceptance, not this skill.
10. Persist screenshot/layout/test evidence using DIAL's normal evidence path. This skill never advances a gate itself.

If `android` CLI is absent but the repository already has approved Gradle/ADB tooling, use only that existing tooling for the bounded verification and record that the Android CLI-specific checks were unavailable. Do not fabricate their output.
