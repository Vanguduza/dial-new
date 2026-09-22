# DIAL logo

Master-brand identity for DIAL. Every SVG in this folder is generated from one geometry
file, `build-logo.mjs`, so the variants never drift apart. Regenerate with:

```text
node docs/brand/logo/build-logo.mjs
```

## What DIAL is, and what the mark says

DIAL is one point of contact for the ordinary services of a household or a business: a
spare part, a technician, groceries, laundry, a vehicle, care. The customer does not go
to seven companies. They dial once, and the right thing comes to them.

The mark encodes exactly that promise, and nothing else:

| Element | Meaning |
| --- | --- |
| A solid capital **D** | The one place you go. Heavy, planted, dependable. |
| Two rings cut out of the D, radiating from its stem | The call going out: one request reaching every service in the family. |
| An amber half-disc at the origin of the rings | The answer coming back to you. The light that comes on when you dial. |

The rings are true holes, not painted lines. Whatever surface the logo sits on shows
through them, which is how it should feel: DIAL sits in your life, not on top of it.

Read left to right, the lockup is the product story in one word. The D carries the
signal; the plain, engineered letters **I A L** carry the reliability.

## Personality

Direct. Dependable. Warm without being soft. The letterforms are geometric and
flat-topped, drawn from one 22-unit stem, so the wordmark reads as built rather than
typeset. There is no gradient, no bevel, no italics and no tagline inside the logo.

## Colour

| Token | Hex | Role |
| --- | --- | --- |
| Dial Navy | `#0F2354` | Letterforms on light surfaces; primary surface on dark. The line that is always open. |
| Dial Amber | `#FFB300` | The landing half-disc only. Never used for letterforms or large fills. |
| Paper | `#F7F8FA` | Letterforms on navy or photographic surfaces. |

Contrast: Navy on white is 15.1:1. Paper on Navy is 14.2:1. Both clear WCAG AAA for
text. Amber is a signal, not a text colour, and it is never placed on white as type.

The amber mark stays amber on every coloured surface except two: one-colour reproduction
(engraving, embroidery, fax-grade print) and any surface that is itself amber. Use the
mono files for those.

## Files

| File | Use |
| --- | --- |
| `dial-logo.svg` | Primary horizontal lockup, light surfaces. Default choice. |
| `dial-logo-on-dark.svg` | Primary lockup, navy or dark photographic surfaces. |
| `dial-logo-stacked.svg` | Square-ish spaces: social avatars with text, print corners, splash screens. |
| `dial-logo-mono-black.svg`, `dial-logo-mono-white.svg` | One-colour reproduction. |
| `dial-mark.svg`, `dial-mark-on-dark.svg` | Mark alone, once the name is already established on the surface. |
| `dial-mark-mono-black.svg`, `dial-mark-mono-white.svg` | One-colour mark. |
| `dial-app-icon.svg` | App icon and favicon. Navy tile, one ring, tuned for 16 to 512 px. Installed at `apps/preview-player/public/favicon.svg`. |

## Clear space and minimum size

Clear space on every side is the width of the D's stem (22 units at the 200-unit cap
cell, so 11 percent of the mark's height). Nothing else sits inside that band.

| Asset | Minimum |
| --- | --- |
| Horizontal lockup | 96 px wide on screen, 24 mm in print |
| Mark, two rings | 24 px |
| App icon, one ring | 16 px |

Below 24 px use the app-icon form, which drops to one ring. Do not scale the two-ring
mark below that; the inner ring closes up.

## Rules

- Do not rotate, skew, outline, shadow or add effects to the mark.
- Do not recolour the letterforms outside Navy, Paper, black or white.
- Do not fill the rings. They are open on purpose.
- Do not redraw the D with a typeface. The D in the lockup is the mark itself.
- Do not place the lockup on amber. Use the white mono mark there.
- Do not add a division name inside the lockup. Division lockups (Dial a Spare, Dial a
  Tech, and so on) are a separate owner decision under GMPC section 19 and must be
  designed against this master, not improvised.

## Geometry reference

Cap height 128 units on a 200-unit cell (y 36 to 164). Stem 22 wide at x 44 to 66. Bowl
is a true semicircle, radius 64, centred at (100, 100). Rings are centred on the stem's
inner edge at (66, 100): radii 41 to 51 and 19 to 29. Landing half-disc radius 12.
Letters I, A and L share the 22-unit stem; the A is flat-topped with its crossbar at
y 112 to 134.
