#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { renderedPolicyFailures, SCREEN_FACTORY_DESIGN_SYSTEM } from './screen-factory-design-policy.mjs';
import { PREMIUM_COMPONENT_CSS_ALL } from './screen-factory-premium-visual-standard.mjs';

export const SCREEN_RENDER_AUTHORITY = 'DETERMINISTIC_IMPLEMENTATION_FIRST_RENDERER';
export const DESIGN_SYSTEM_VERSION = SCREEN_FACTORY_DESIGN_SYSTEM;

const PLATFORM_VIEWPORTS = Object.freeze({
  android_mobile: { width: 390, height: 844, dpr: 3 },
  ios_mobile: { width: 393, height: 852, dpr: 3 },
  responsive_web: { width: 1440, height: 1024, dpr: 2 },
  desktop_web: { width: 1440, height: 1024, dpr: 2 },
  tablet: { width: 1024, height: 1366, dpr: 2 },
  pos_terminal: { width: 1280, height: 800, dpr: 2 },
  wallboard: { width: 1920, height: 1080, dpr: 2 },
  cross_platform: { width: 1440, height: 1024, dpr: 2 },
  mobile_approval: { width: 393, height: 852, dpr: 3 },
});

function now() { return new Date().toISOString(); }
function safeName(value) { return String(value || 'screen').replace(/[^a-zA-Z0-9_.-]+/g, '_'); }
export function viewportForPlatform(platform) {
  return PLATFORM_VIEWPORTS[platform] ?? PLATFORM_VIEWPORTS.cross_platform;
}

function rejectUnsafeMarkup(markup) {
  const text = String(markup ?? '');
  if (!text.trim()) throw new Error('screen semantic_html is required');
  if (/<script\b/i.test(text)) throw new Error('screen markup may not contain script tags');
  if (/<iframe\b/i.test(text)) throw new Error('screen markup may not contain iframe tags');
  if (/\b(?:src|href)\s*=\s*["']https?:/i.test(text)) throw new Error('screen markup may not load external resources');
  if (/url\s*\(\s*["']?https?:/i.test(text)) throw new Error('screen CSS may not load external resources');
  return text;
}

const BASE_CSS = `
:root{--dh-navy:#0f172a;--dh-muted:#64748b;--dh-teal:#0f766e;--dh-teal2:#14b8a6;
--dh-blue:#2563eb;--dh-purple:#7c3aed;--dh-orange:#ea580c;--dh-red:#dc2626;
--dh-bg:#f8fafc;--dh-card:#ffffff;--dh-border:#e2e8f0;--dh-soft:#f1f5f9;
--dh-radius:18px;--dh-shadow:0 8px 30px rgba(15,23,42,.08);--dh-space:8px}
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;background:var(--dh-bg);color:var(--dh-navy)}
body{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision;overflow-x:hidden;overflow-y:auto}
button,input,select,textarea{font:inherit;min-height:44px}button,[role=button],a{min-height:44px}input[type=checkbox],input[type=radio]{min-width:44px!important;width:44px!important;min-height:44px!important;height:44px!important;margin:0;cursor:pointer}a{display:inline-flex;align-items:center;padding-block:12px}
[data-ui]{position:relative}.dh-card{background:var(--dh-card);border:1px solid var(--dh-border);
border-radius:var(--dh-radius);box-shadow:var(--dh-shadow)}
.dh-chip{display:inline-flex;align-items:center;min-height:28px;padding:4px 10px;border-radius:999px;background:#ccfbf1;color:#115e59;font-weight:650;font-size:12px}
`;
const FINAL_GUARDRAIL_CSS = `
button,input,select,textarea,a,[role="button"],[role="tab"]{min-width:44px!important;min-height:44px!important}
html,body{max-width:100%;overflow-x:hidden!important}
`;
export function composeScreenDocument({ task, packet }) {
  const semanticHtml = rejectUnsafeMarkup(packet?.semantic_html);
  const title = String(task?.title || packet?.title || task?.screen_id || 'Dial Health Screen');
  const screenId = String(task?.screen_id || packet?.screen_id || 'UNKNOWN');
  const platform = String(task?.platform || packet?.platform || 'cross_platform');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
<title>${escapeHtml(title)}</title><style>${BASE_CSS}\n${PREMIUM_COMPONENT_CSS_ALL}\n${String(packet?.css ?? '')}\n${FINAL_GUARDRAIL_CSS}</style></head>
<body data-screen-id="${escapeHtml(screenId)}" data-platform="${escapeHtml(platform)}" data-design-system="${DESIGN_SYSTEM_VERSION}">
${semanticHtml}</body></html>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  }[char]));
}

function atomicWrite(target, content) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temp = `${target}.partial-${process.pid}`;
  fs.writeFileSync(temp, content);
  fs.renameSync(temp, target);
}
function atomicJson(target, value) {
  atomicWrite(target, `${JSON.stringify(value, null, 2)}\n`);
}

async function collectLayout(page) {
  return page.evaluate(() => {
    const selectors = '[data-ui],button,input,select,textarea,a,[role="button"],[role="tab"]';
    const nodes = [...document.querySelectorAll(selectors)];
    return nodes.map((element, index) => {
      const r = element.getBoundingClientRect();
      return {
        index,
        tag: element.tagName.toLowerCase(),
        ui: element.getAttribute('data-ui'),
        action: element.getAttribute('data-action'),
        feature_id: element.getAttribute('data-feature-id'),
        role: element.getAttribute('role'),
        aria_label: element.getAttribute('aria-label'),
        text: (element.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 160),
        rect: { x: r.x, y: r.y, width: r.width, height: r.height },
      };
    });
  });
}

async function deterministicQa(page, task, packet, layout) {
  const metrics = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('*')];
    const rects = nodes.map((element) => element.getBoundingClientRect()).filter((rect) => rect.width || rect.height);
    const maxRight = rects.length ? Math.max(...rects.map((rect) => rect.right)) : innerWidth;
    const maxBottom = rects.length ? Math.max(...rects.map((rect) => rect.bottom)) : innerHeight;
    return {
      viewport_width: innerWidth,
      viewport_height: innerHeight,
      scroll_width: Math.ceil(Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0, maxRight)),
      scroll_height: Math.ceil(Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0, maxBottom)),
    };
  });
  const actionable = layout.filter((item) => ['button', 'input', 'select', 'textarea', 'a'].includes(item.tag) || item.role === 'button');
  // Hidden/inactive state controls legitimately have zero-size boxes. Accessibility QA
  // applies to controls rendered in the current state, not controls hidden for other states.
  const visibleActionable = actionable.filter((item) => Number(item.rect?.width || 0) > 0 && Number(item.rect?.height || 0) > 0);
  const tinyTargets = visibleActionable.filter((item) => item.rect.width < 44 || item.rect.height < 44);
  const unlabeled = visibleActionable.filter((item) => !item.text && !item.aria_label && item.tag !== 'input');
  const horizontalOverflow = metrics.scroll_width > metrics.viewport_width + 2;
  const failures = [];
  if (horizontalOverflow) failures.push('HORIZONTAL_OVERFLOW');
  if (tinyTargets.length) failures.push('TOUCH_TARGET_TOO_SMALL');
  if (unlabeled.length) failures.push('UNLABELED_ACTIONABLE_CONTROL');
  if (!layout.length) failures.push('NO_SEMANTIC_LAYOUT_NODES');
  failures.push(...renderedPolicyFailures({ task, packet, layout, metrics }));
  return {
    schema_version: 1,
    authority: SCREEN_RENDER_AUTHORITY,
    screen_id: task.screen_id,
    platform: task.platform,
    pass: failures.length === 0,
    failures,
    metrics,
    counts: { semantic_nodes: layout.length, actionable: actionable.length, visible_actionable: visibleActionable.length, tiny_targets: tinyTargets.length, unlabeled: unlabeled.length },
    note: 'Deterministic render QA is not visual approval and never implies UX_GREEN.',
    observed_at: now(),
  };
}
export async function renderScreenBundle({ task, packet, outputRoot } = {}) {
  if (!task?.screen_id || !task?.platform) throw new Error('task requires screen_id and platform');
  const viewport = viewportForPlatform(task.platform);
  const bundleName = safeName(`${task.screen_id}__${task.platform}`);
  const bundleDir = path.join(outputRoot, bundleName);
  fs.mkdirSync(bundleDir, { recursive: true });
  const html = composeScreenDocument({ task, packet });
  const htmlPath = path.join(bundleDir, `${bundleName}.html`);
  atomicWrite(htmlPath, html);

  const browser = await chromium.launch({ headless: true });
  let page;
  try {
    page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: viewport.dpr });
    await page.route('**/*', (route) => {
      const url = route.request().url();
      if (url.startsWith('data:') || url.startsWith('about:')) return route.continue();
      return route.abort();
    });
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => document.fonts?.ready);
    const layout = await collectLayout(page);
    const qa = await deterministicQa(page, task, packet, layout);
    const tempPng = path.join(bundleDir, `${bundleName}.png.partial`);
    const pngPath = path.join(bundleDir, `${bundleName}.png`);
    await page.screenshot({ path: tempPng, type: 'png', fullPage: true, animations: 'disabled' });
    fs.renameSync(tempPng, pngPath);
    atomicJson(path.join(bundleDir, `${bundleName}.layout.json`), {
      schema_version: 1, screen_id: task.screen_id, platform: task.platform,
      viewport, design_system: DESIGN_SYSTEM_VERSION, nodes: layout, generated_at: now(),
    });
    atomicJson(path.join(bundleDir, `${bundleName}.contract.json`), { task, packet, generated_at: now() });
    atomicJson(path.join(bundleDir, `${bundleName}.interactions.json`), {
      schema_version: 1, screen_id: task.screen_id, platform: task.platform,
      interaction_map: packet?.interaction_map ?? [], data_bindings: packet?.data_bindings ?? [],
      state_map: packet?.state_map ?? [], generated_at: now(),
    });
    atomicJson(path.join(bundleDir, `${bundleName}.qa.json`), qa);
    return { bundle_dir: bundleDir, png_path: pngPath, html_path: htmlPath, viewport, qa };
  } finally {
    await browser.close();
  }
}
