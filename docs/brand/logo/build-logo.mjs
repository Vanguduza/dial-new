#!/usr/bin/env node
// DIAL logo generator: the single source of geometry for every SVG in this folder.
// Run: node docs/brand/logo/build-logo.mjs
//
// The mark is a solid capital D (the one place you go) with two rings cut out of it,
// radiating from the stem (the call going out), and an amber half-disc at the origin
// (the answer coming back). See README.md for the rationale and usage rules.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = dirname(fileURLToPath(import.meta.url));

export const COLORS = {
  navy: '#0F2354',   // Dial Navy: the line that is always open
  amber: '#FFB300',  // Dial Amber: the light that comes on when you call
  paper: '#F7F8FA',  // Paper: letterform colour on dark surfaces
  black: '#000000',
  white: '#FFFFFF',
};

// ---- Geometry (200 x 200 cell, cap height 128: y 36..164) --------------------
const TOP = 36, BOT = 164;
const STEM_L = 44, STEM_R = 66;      // stem occupies x 44..66 (22 wide)
const BOWL_CX = 100, BOWL_R = 64;    // bowl: semicircle centred (100,100) r 64 -> right edge x 164
const OX = STEM_R, OY = 100;         // ripple origin: inner edge of the stem, mid height
const RINGS = [[41, 51], [19, 29]];  // cut-out rings [inner r, outer r], 10 wide, 12 apart
const LANDING_R = 12;                // amber half-disc at the origin
const f = (n) => Number(n.toFixed(2));

/** Solid D outline as a subpath (clockwise). */
function dOutline(x0) {
  return `M${STEM_L + x0} ${TOP} H${BOWL_CX + x0} A${BOWL_R} ${BOWL_R} 0 0 1 ${BOWL_CX + x0} ${BOT} H${STEM_L + x0} Z`;
}
/** Right-hand half-annulus centred on the origin, as a subpath (used as an even-odd hole). */
function ringHole(x0, ri, ro) {
  const x = OX + x0;
  return `M${x} ${OY - ro} A${ro} ${ro} 0 0 1 ${x} ${OY + ro} L${x} ${OY + ri} A${ri} ${ri} 0 0 0 ${x} ${OY - ri} Z`;
}

/**
 * The mark. `ink` = letterform colour, `signal` = landing colour.
 * The rings are true holes, so whatever sits behind the logo shows through them.
 * rings=false yields the simplified small-size form (one ring), used for the 16-32 px icon.
 */
export function mark({ ink, signal, x0 = 0, rings = true }) {
  const holes = (rings ? RINGS : [[19, 31]]).map(([ri, ro]) => ringHole(x0, ri, ro)).join(' ');
  const x = OX + x0, r = rings ? LANDING_R : 13;
  return [
    `<path d="${dOutline(x0)} ${holes}" fill="${ink}" fill-rule="evenodd"/>`,
    `<path d="M${x} ${OY - r} A${r} ${r} 0 0 1 ${x} ${OY + r} Z" fill="${signal}"/>`,
  ].join('\n');
}

// ---- Wordmark: I A L drawn from the same 22-unit stem -----------------------
const S = 22;
function letterI(x0, ink) {
  return `<rect x="${x0}" y="${TOP}" width="${S}" height="${BOT - TOP}" fill="${ink}"/>`;
}
function letterA(x0, ink) {
  // Flat-topped A: outer trapezoid with two even-odd counters either side of the crossbar (y 112..134).
  const o = [[0, BOT], [48, TOP], [76, TOP], [124, BOT]];
  const upper = [[62, 62.67], [80.5, 112], [43.5, 112]];
  const lower = [[35.25, 134], [88.75, 134], [100, BOT], [24, BOT]];
  const poly = (p) => p.map(([x, y], i) => `${i ? 'L' : 'M'}${f(x + x0)} ${f(y)}`).join(' ') + ' Z';
  return `<path d="${poly(o)} ${poly(upper)} ${poly(lower)}" fill="${ink}" fill-rule="evenodd"/>`;
}
function letterL(x0, ink) {
  return `<path d="M${x0} ${TOP} h${S} v${BOT - TOP - S} h${84 - S} v${S} h-84 Z" fill="${ink}"/>`;
}
/** Plain solid D (no ripple) for the stacked wordmark, where the mark sits above it. */
function letterD(x0, ink) {
  return `<path d="${dOutline(x0)}" fill="${ink}"/>`;
}

// Horizontal lockup: the mark IS the D. Letters start after the bowl's right edge (x 164).
const IAL_X = { I: 196, A: 246, L: 398 }; // L ends at 482
const LOCKUP_W = 526;                      // 44 left margin mirrored on the right
export function wordmarkIAL(ink) {
  return [letterI(IAL_X.I, ink), letterA(IAL_X.A, ink), letterL(IAL_X.L, ink)].join('\n');
}

function svg({ w, h, body, title, desc, vb }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb ?? `0 0 ${w} ${h}`}" width="${w}" height="${h}" role="img" aria-labelledby="t d">
<title id="t">${title}</title>
<desc id="d">${desc}</desc>
${body}
</svg>
`;
}

const DESC = 'A solid capital D with two rings cut out of it, radiating from the stem, and an amber half-disc at their origin: one call goes out, and the answer comes back to you.';
const DESC_L = DESC + ' Followed by the letters I A L.';

const two = (ink, signal) => mark({ ink, signal }) + '\n' + wordmarkIAL(ink);

const files = {
  'dial-mark.svg':            svg({ w: 200, h: 200, title: 'DIAL mark', desc: DESC, body: mark({ ink: COLORS.navy, signal: COLORS.amber }) }),
  'dial-mark-on-dark.svg':    svg({ w: 200, h: 200, title: 'DIAL mark (dark surfaces)', desc: DESC, body: mark({ ink: COLORS.paper, signal: COLORS.amber }) }),
  'dial-mark-mono-black.svg': svg({ w: 200, h: 200, title: 'DIAL mark (one colour, black)', desc: DESC, body: mark({ ink: COLORS.black, signal: COLORS.black }) }),
  'dial-mark-mono-white.svg': svg({ w: 200, h: 200, title: 'DIAL mark (one colour, white)', desc: DESC, body: mark({ ink: COLORS.white, signal: COLORS.white }) }),

  'dial-logo.svg':            svg({ w: LOCKUP_W, h: 200, title: 'DIAL logo', desc: DESC_L, body: two(COLORS.navy, COLORS.amber) }),
  'dial-logo-on-dark.svg':    svg({ w: LOCKUP_W, h: 200, title: 'DIAL logo (dark surfaces)', desc: DESC_L, body: two(COLORS.paper, COLORS.amber) }),
  'dial-logo-mono-black.svg': svg({ w: LOCKUP_W, h: 200, title: 'DIAL logo (one colour, black)', desc: DESC_L, body: two(COLORS.black, COLORS.black) }),
  'dial-logo-mono-white.svg': svg({ w: LOCKUP_W, h: 200, title: 'DIAL logo (one colour, white)', desc: DESC_L, body: two(COLORS.white, COLORS.white) }),

  'dial-logo-stacked.svg': (() => {
    // Mark at 1.15x, centred; plain wordmark DIAL beneath at 0.72x. Wordmark ink spans x 44..482 (438 wide).
    const wm = [letterD(0, COLORS.navy), wordmarkIAL(COLORS.navy)].join('\n');
    const s = 0.72, left = (630 - 438 * s) / 2 - 44 * s;
    const body = `<g transform="translate(200 0) scale(1.15)">${mark({ ink: COLORS.navy, signal: COLORS.amber })}</g>
<g transform="translate(${f(left)} 214) scale(${s})">${wm}</g>`;
    return svg({ w: 630, h: 340, title: 'DIAL logo (stacked)', desc: DESC + ' Above the wordmark DIAL.', body });
  })(),

  // App icon / favicon: navy tile, paper D, single ring so it survives 16-32 px.
  'dial-app-icon.svg': svg({ w: 512, h: 512, vb: '0 0 200 200', title: 'DIAL app icon', desc: DESC,
    body: `<rect width="200" height="200" rx="44" fill="${COLORS.navy}"/>\n<g transform="translate(100 100) scale(0.84) translate(-104 -100)">${mark({ ink: COLORS.paper, signal: COLORS.amber, rings: false })}</g>` }),
};

for (const [name, content] of Object.entries(files)) writeFileSync(join(OUT, name), content);
console.log(`wrote ${Object.keys(files).length} files to ${OUT}`);
