import type { VisualCategoryId } from '../../contracts/src/index.js';

type Mode = 'hero' | 'depth' | 'cgi' | 'technical' | 'line' | 'exploded';
interface SceneOptions { progress: number; mode?: Mode; width?: number; height?: number; selected?: VisualCategoryId }

const clamp = (v: number, min = 0, max = 1) => Math.min(max, Math.max(min, v));
const ease = (v: number) => { const t = clamp(v); return 1 - Math.pow(1 - t, 3); };

export function vehicleSceneSvg({ progress, mode, width = 1600, height = 900, selected }: SceneOptions): string {
  const p = clamp(progress);
  const explode = mode === 'exploded' ? 1 : ease((p - 0.60) / 0.28);
  const line = mode === 'line' || p >= 0.42;
  const technical = mode === 'technical';
  const cgi = mode === 'cgi' || p >= 0.18;
  const paint = line ? '#dbe6ee' : technical ? '#8298a8' : cgi ? '#c7d2da' : '#d94b2b';
  const paintOpacity = line ? 0.08 : technical ? 0.42 : 0.9;
  const stroke = line ? '#9cc7d9' : technical ? '#b8d4df' : '#eef4f7';
  const otherOpacity = selected ? 0.18 : 1;
  const bodyOpacity = selected && selected !== 'VC-BODY' ? 0.14 : 1;
  const stageLabel = mode?.toUpperCase() ?? (p < .18 ? 'HERO' : p < .42 ? 'CGI' : p < .60 ? 'LINE ART' : p < .94 ? 'EXPLOSION' : 'NAVIGATION');
  const group = (id: VisualCategoryId, transform: string, content: string) => `<g data-category="${id}" transform="${transform}" opacity="${selected && selected !== id ? otherOpacity : 1}">${content}</g>`;
  const glow = selected ? `<circle cx="800" cy="470" r="300" fill="url(#focus)" opacity=".45"/>` : '';
  const tx = (x: number) => x * explode;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 1600 900">
  <defs>
    <radialGradient id="bg"><stop offset="0" stop-color="#182430"/><stop offset=".62" stop-color="#09121b"/><stop offset="1" stop-color="#05080d"/></radialGradient>
    <linearGradient id="paint" x1="0" x2="1"><stop stop-color="${paint}"/><stop offset=".48" stop-color="#edf4f7"/><stop offset="1" stop-color="${paint}"/></linearGradient>
    <radialGradient id="focus"><stop stop-color="#ff7548" stop-opacity=".55"/><stop offset="1" stop-color="#ff7548" stop-opacity="0"/></radialGradient>
    <filter id="shadow"><feGaussianBlur stdDeviation="18"/></filter>
  </defs>
  <rect width="1600" height="900" fill="url(#bg)"/>
  <path d="M170 687 C460 724 1120 724 1430 680" fill="none" stroke="#253748" stroke-width="2"/>
  <ellipse cx="820" cy="682" rx="590" ry="48" fill="#000" opacity=".55" filter="url(#shadow)"/>
  ${glow}
  <g transform="translate(${(p < .24 ? Math.sin(p * 18) * 8 : 0).toFixed(1)} 0)">
    ${group('VC-RSUS', `translate(${-tx(78)} ${tx(54)})`, `<path d="M355 550 L452 550 L470 606 L338 606 Z" fill="none" stroke="#4fa5c8" stroke-width="16"/><path d="M374 530 L440 620" stroke="#80c7df" stroke-width="9"/>`)}
    ${group('VC-FSUS', `translate(${tx(92)} ${tx(54)})`, `<path d="M1110 548 L1208 548 L1220 606 L1094 606 Z" fill="none" stroke="#4fa5c8" stroke-width="16"/><path d="M1120 620 L1190 530" stroke="#80c7df" stroke-width="9"/>`)}
    ${group('VC-RBRK', `translate(${-tx(140)} ${tx(22)})`, `<circle cx="438" cy="606" r="63" fill="#15222d" stroke="#ec6c45" stroke-width="12"/><circle cx="438" cy="606" r="25" fill="#ec6c45"/>`)}
    ${group('VC-FBRK', `translate(${tx(150)} ${tx(22)})`, `<circle cx="1160" cy="606" r="63" fill="#15222d" stroke="#ec6c45" stroke-width="12"/><circle cx="1160" cy="606" r="25" fill="#ec6c45"/>`)}
    ${group('VC-TRN', `translate(${tx(14)} ${tx(128)})`, `<path d="M700 522 L845 522 L920 566 L836 604 L704 584 Z" fill="#344c5c" stroke="#84bbd0" stroke-width="4"/><path d="M742 540 L872 571" stroke="#b3d8e5" stroke-width="8"/>`)}
    ${group('VC-ENG', `translate(${tx(112)} ${-tx(122)})`, `<path d="M923 448 h184 l45 80 -68 62 H920 l-42-76 Z" fill="#485f6c" stroke="#ff7548" stroke-width="5"/><path d="M950 470 h118 v76 H950z" fill="#1e303c" stroke="#d6e8ee" stroke-width="4"/><path d="M970 455 v-30 M1010 455v-30 M1050 455v-30" stroke="#ff9b7a" stroke-width="9"/>`)}
    ${group('VC-BODY', `translate(0 ${-tx(118)})`, `<g opacity="${bodyOpacity}"><path d="M286 565 L342 440 L515 403 L650 300 L986 302 L1106 406 L1300 470 L1340 570 L1254 590 L1178 510 L1091 586 L526 586 L445 510 L358 584 L270 570 Z" fill="url(#paint)" fill-opacity="${paintOpacity}" stroke="${stroke}" stroke-width="${line ? 5 : 3}"/><path d="M658 321 L788 321 L790 405 L555 405 Z M814 321 L978 323 L1071 405 L815 405 Z" fill="#0a151e" fill-opacity="${technical ? .32 : .78}" stroke="#91b4c4" stroke-width="3"/><path d="M548 419 H1099 M795 310 V560 M1080 407 L1130 553" fill="none" stroke="${stroke}" stroke-width="3" opacity=".72"/><path d="M1207 451 L1291 484 L1316 536 L1219 528 Z" fill="#f3b69d" fill-opacity="${line ? .1 : .76}" stroke="#ffd8ca" stroke-width="3"/><path d="M294 524 L369 482 L414 490 L389 532 Z" fill="#f3b69d" fill-opacity="${line ? .1 : .76}" stroke="#ffd8ca" stroke-width="3"/></g>`)}
    <circle cx="438" cy="606" r="93" fill="none" stroke="#101923" stroke-width="35"/><circle cx="438" cy="606" r="58" fill="none" stroke="#7e929e" stroke-width="15"/>
    <circle cx="1160" cy="606" r="93" fill="none" stroke="#101923" stroke-width="35"/><circle cx="1160" cy="606" r="58" fill="none" stroke="#7e929e" stroke-width="15"/>
  </g>
  <g font-family="Arial, sans-serif" fill="#b5c9d3"><text x="74" y="85" font-size="22" letter-spacing="6">DIAL VISUAL SYSTEM</text><text x="74" y="121" font-size="16" fill="#6f8794">SYNTHETIC DEVELOPMENT FIXTURE · NOT PRODUCTION VEHICLE ART</text></g>
  <g font-family="Arial, sans-serif" text-anchor="end"><text x="1525" y="85" fill="#ff7548" font-size="20" letter-spacing="4">${stageLabel}</text><text x="1525" y="119" fill="#7f96a2" font-size="15">VF-TOYOTA-HILUX-AN130-DC-FL · DEV</text></g>
  </svg>`;
}
