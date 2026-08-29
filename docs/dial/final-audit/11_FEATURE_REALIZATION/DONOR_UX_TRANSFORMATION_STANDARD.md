# Donor UX/UI Transformation Standard

## Goal

DIAL should inherit **proven usability** without looking like a collage of Mercur, FixItNow, ERPNext, InvenTree, OpenProject and other products.

## Transformation sequence

1. capture donor screen/workflow inventory;
2. identify the user's job-to-be-done and proven task order;
3. identify donor-only infrastructure and remove it from the design;
4. map data/actions onto DIAL FRC/state;
5. recompose in DIAL navigation shell;
6. retokenize typography, spacing, color, radius, iconography and motion;
7. introduce DIAL human-readable refs;
8. add missing exception/recovery/support states;
9. add accessibility/responsive/data-saver states;
10. compare against donor workflow parity and DIAL design quality.

## Preserve

- user mental model;
- useful information hierarchy;
- efficient forms;
- good queue/table patterns;
- proven navigation;
- relevant feedback/progress patterns.

## Never preserve blindly

- donor brand;
- donor authentication/account model;
- donor business states;
- generic CRUD pages that don't match DIAL workflow;
- donor payment/storage/analytics;
- hidden edge cases;
- raw UUIDs;
- inconsistent terminology.

## Branch identity

DIAL can use contextual imagery/iconography and branch-specific content tone, but the customer must always know they are inside DIAL.

Shared:
- typography;
- base controls;
- accessibility;
- account/support/activity patterns;
- state language;
- confirmation/error behavior.

Branch-specific:
- hero imagery;
- catalogue/service presentation;
- domain vocabulary;
- local task navigation;
- specialist rich components such as EPC diagrams, Grocery substitutions or Laundry custody.
