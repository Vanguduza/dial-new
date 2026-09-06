import crypto from 'node:crypto';
import { assertTaskContractReady } from './screen-factory-design-policy.mjs';

export const SCREEN_COMPOSITION_DSL_VERSION = 'DIAL_HEALTH_SCREEN_COMPOSITION_DSL_V1';
export const ALLOWED_REGION_TYPES = Object.freeze([
  'hero','action_grid','highlight','search','segmented','list','metrics','timeline',
  'form','detail','document_list','support','confirmation','emergency',
]);
export const REGION_VARIANT_CATALOG = Object.freeze({
  hero: ['summary','split','soft','compact'],
  action_grid: ['tiles','compact','feature-first'],
  highlight: ['featured','status','soft'],
  search: ['prominent','compact'],
  segmented: ['pills','compact'],
  list: ['rich','cards','compact'],
  metrics: ['two-up','strip'],
  timeline: ['vertical','compact'],
  form: ['single-step','stacked'],
  detail: ['summary','grouped','compact'],
  document_list: ['compact','cards'],
  support: ['calm','contact'],
  confirmation: ['success','compact'],
  emergency: ['urgent','calm'],
});
const PROMINENCE = new Set(['primary','secondary','quiet']);

export function contractList(value) {
  if (Array.isArray(value)) return value.map((x) => String(x).trim()).filter(Boolean);
  return String(value || '').split(/;|\n/).map((x) => x.trim().replace(/[.]$/,'')).filter(Boolean);
}
function esc(value) { return String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }
function slug(value) { return String(value || 'action').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,64) || 'action'; }
function routeLabel(route) {
  const tail=String(route||'').split('/').filter(Boolean).at(-1)||'destination';
  return `Open ${tail.split('-').map((w)=>w?`${w[0].toUpperCase()}${w.slice(1)}`:'').join(' ')}`;
}
export function canonicalActionCatalog(task) {
  const explicit=contractList(task.interaction).map((label,index)=>({label,source:'interaction',source_index:index,route:null}));
  const routes=contractList(task.next_routes);
  const routeDerived=routes.map((route,index)=>({label:routeLabel(route),source:'documented_route',source_index:index,route}));
  const shortcutDerived=[];
  for(const feature of contractList(task.features)){
    const match=feature.match(/shortcuts?\s+to\s+(.+)$/i); if(!match)continue;
    const names=match[1].split(/,|\band\b/i).map((x)=>x.trim()).filter(Boolean);
    for(const name of names){
      const key=slug(name); const route=routes.find((r)=>slug(r).includes(key))||`module://${key}`;
      shortcutDerived.push({label:`Open ${name}`,source:'documented_shortcut_feature',source_index:shortcutDerived.length,route});
    }
  }
  const seen=new Set(); return [...explicit,...routeDerived,...shortcutDerived].filter((item)=>{const key=`${slug(item.label)}|${item.route||''}`;if(seen.has(key))return false;seen.add(key);return true;});
}
function uniqInts(value, max) {
  const seen = new Set(); const out = [];
  for (const raw of Array.isArray(value) ? value : []) {
    const n = Number(raw); if (!Number.isInteger(n) || n < 0 || n >= max || seen.has(n)) continue;
    seen.add(n); out.push(n);
  }
  return out;
}
export function compositionRecipeFor(task) {
  const a=String(task.archetype||'').toLowerCase();
  if(a.includes('consumer home'))return ['hero','action_grid','highlight','list'];
  if(a.includes('guided'))return ['hero','search','action_grid','highlight'];
  if(a.includes('focused detail'))return ['hero','detail','list','action_grid'];
  if(a.includes('selection'))return ['hero','segmented','list','action_grid'];
  if(a.includes('success'))return ['confirmation','detail','action_grid'];
  if(a.includes('journey'))return ['hero','timeline','highlight','list'];
  if(a.includes('comparison'))return ['hero','segmented','list','highlight'];
  if(a.includes('form'))return ['hero','form','highlight'];
  if(a.includes('document'))return ['hero','document_list','action_grid'];
  if(a.includes('emergency'))return ['hero','emergency','support'];
  return ['hero','highlight','list'];
}
export function compositionContractHash(task) {
  const shape = {screen_id:task.screen_id,title:task.title,purpose:task.purpose,features:task.features,interaction:task.interaction,next_routes:task.next_routes,archetype:task.archetype,platform:task.platform,design_version:task.design_version,design_policy_version:task.design_policy_version};
  return crypto.createHash('sha256').update(JSON.stringify(shape)).digest('hex');
}
export function compactCompositionContract(task) {
  assertTaskContractReady(task);
  return { id:task.screen_id, title:task.title, archetype:task.archetype, recipe:compositionRecipeFor(task), purpose:task.purpose, features:contractList(task.features), actions:canonicalActionCatalog(task).map((x)=>x.label), routes:contractList(task.next_routes) };
}
export function validateComposition(composition, task) {
  assertTaskContractReady(task);
  if (!composition || String(composition.screen_id) !== String(task.screen_id)) throw new Error(`composition identity mismatch for ${task.screen_id}`);
  if (!Array.isArray(composition.regions) || composition.regions.length < 2 || composition.regions.length > 6) throw new Error(`composition ${task.screen_id} requires 2-6 regions`);
  const features = contractList(task.features), actions = canonicalActionCatalog(task);
  const regions = composition.regions.map((region, index) => {
    const type = ALLOWED_REGION_TYPES.includes(String(region?.type)) ? String(region.type) : null;
    if (!type) throw new Error(`composition ${task.screen_id} region ${index} has unsupported type`);
    const allowedVariants = REGION_VARIANT_CATALOG[type] || [];
    const requestedVariant = slug(region.variant || allowedVariants[0] || 'default');
    const variant = allowedVariants.includes(requestedVariant) ? requestedVariant : allowedVariants[0] || 'default';
    return { type, feature_refs:uniqInts(region.feature_refs, features.length), action_refs:uniqInts(region.action_refs, actions.length), prominence:PROMINENCE.has(region.prominence)?region.prominence:'secondary', variant };
  });
  // Normalize common model deviations locally so quota is not wasted repairing mechanics.
  // Product truth still comes only from the canonical action catalog; normalization may
  // remove duplicate/excess placement but never invent an action.
  const shortcutFeature = features.find((feature) => /shortcuts?\s+to\s+/i.test(String(feature)));
  if (shortcutFeature) {
    const match = String(shortcutFeature).match(/shortcuts?\s+to\s+(.+)$/i);
    const names = (match?.[1] || '').split(/,|\band\b/i).map((x) => x.trim()).filter(Boolean).slice(0,4);
    const preferred = names.map((name) => actions.findIndex((item) => slug(item.label) === slug(`Open ${name}`))).filter((i) => i >= 0);
    const grid = regions.find((region) => region.type === 'action_grid');
    if (grid && preferred.length >= 2) {
      grid.action_refs = [...new Set(preferred)].slice(0,4);
      const owned = new Set(grid.action_refs);
      for (const region of regions) if (region !== grid) region.action_refs = region.action_refs.filter((ref) => !owned.has(ref));
    }
  }
  const seenActions = new Set(); let visibleActionCount = 0;
  for (const region of regions) {
    const normalized = [];
    for (const ref of region.action_refs) {
      if (seenActions.has(ref) || visibleActionCount >= 10) continue;
      if (region.type === 'action_grid' && normalized.length >= 4) continue;
      seenActions.add(ref); normalized.push(ref); visibleActionCount += 1;
    }
    region.action_refs = normalized;
  }
  const allActionRefs = regions.flatMap((r) => r.action_refs);
  const selectedActions = new Set(allActionRefs);
  if (actions.length && !selectedActions.size) throw new Error(`composition ${task.screen_id} does not expose any canonical action`);
  const selectedFeatures=new Set(regions.flatMap((r)=>r.feature_refs));
  if(features.length>1&&selectedFeatures.size<Math.min(3,features.length))throw new Error(`composition ${task.screen_id} under-represents first-load feature hierarchy`);
  const recipe=compositionRecipeFor(task), types=regions.map((r)=>r.type);
  if(recipe.length&&types[0]!==recipe[0])throw new Error(`composition ${task.screen_id} must start with recommended ${recipe[0]} region`);
  const fit=recipe.filter((type)=>types.includes(type)).length; if(fit<Math.min(2,recipe.length))throw new Error(`composition ${task.screen_id} does not fit its archetype recipe`);
  const actionGrid=regions.find((r)=>r.type==='action_grid'); if(actionGrid&&actionGrid.action_refs.length>4)throw new Error(`composition ${task.screen_id} action grid normalization failed`);
  return { dsl_version:SCREEN_COMPOSITION_DSL_VERSION, screen_id:task.screen_id, archetype:slug(composition.archetype || task.archetype || 'screen'), regions };
}

const ICONS = {
  care:'<path d="M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 11c0 5.6-7 10-7 10Z"/>',
  medicine:'<path d="M8 4h8v5a4 4 0 0 1-8 0V4Zm-2 8h12v8H6v-8Z"/>',
  record:'<path d="M7 3h8l4 4v14H7V3Zm8 0v5h5M10 12h6M10 16h6"/>',
  appointment:'<path d="M5 5h14v15H5V5Zm3-2v4m8-4v4M5 9h14M9 13h2m3 0h2m-7 4h2"/>',
  search:'<circle cx="11" cy="11" r="6"/><path d="m16 16 5 5"/>',
  support:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.7 2.7 0 1 1 4.5 2c-1.2 1-2 1.5-2 3m0 3h.01"/>',
  notification:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  alert:'<path d="M12 3 2.5 20h19L12 3Zm0 6v5m0 3h.01"/>',
  default:'<path d="M5 12h14M13 6l6 6-6 6"/>',
};
function iconSvg(label) {
  const s=String(label).toLowerCase(); let key='default';
  if(/emerg|urgent|alert/.test(s)) key='alert'; else if(/care|health|provider/.test(s)) key='care'; else if(/medicin|prescription|pharmacy/.test(s)) key='medicine'; else if(/record|result|document|claim|report/.test(s)) key='record'; else if(/appointment|booking|slot|visit/.test(s)) key='appointment'; else if(/search|find/.test(s)) key='search'; else if(/notif|bell/.test(s)) key='notification'; else if(/support|help/.test(s)) key='support';
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[key]}</svg>`;
}
function chooseRoute(action, routes) {
  if (!routes.length) return `local://${slug(action)}`;
  const words = new Set(slug(action).split('-').filter((w)=>w.length>3));
  let best=routes[0], bestScore=-1;
  for(const route of routes){const r=slug(route);const score=[...words].filter((w)=>r.includes(w)).length;if(score>bestScore){best=route;bestScore=score;}}
  return best;
}
function actionId(action,index){return `a${index}-${slug(action).slice(0,36)}`;}
function actionMap(task){
  const actions=canonicalActionCatalog(task), routes=contractList(task.next_routes);
  return actions.map((item,index)=>{const action=item.label;return {element_id:actionId(action,index),action_id:actionId(action,index),data_action:actionId(action,index),action_type:/search/i.test(action)?'search':/select|choose/i.test(action)?'select':/dismiss/i.test(action)?'dismiss':/refresh/i.test(action)?'refresh':/download|export/i.test(action)?'export':/share/i.test(action)?'share':'route',target_route:item.route||chooseRoute(action,routes),label:action,source:item.source};});
}
function displayFeature(value) {
  let s=String(value||'').trim();
  const exact=[
    [/^greeting\/context$/i,'Today'],[/^next appointment summary$/i,'Next appointment'],
    [/^one health\/cover attention card when relevant$/i,'Health & cover'],[/^recent result\/record teaser$/i,'Recent result'],
    [/^primary shortcuts?\b/i,'Quick actions'],[/^notifications badge$/i,'Notifications'],
  ];
  for(const [re,label] of exact) if(re.test(s)) return label;
  s=s.replace(/\b(summary|teaser|context)\b/gi,'').replace(/\bwhen relevant\b/gi,'').replace(/\s+/g,' ').trim();
  return s ? `${s[0].toUpperCase()}${s.slice(1)}` : 'Information';
}
function displayAction(value) {
  let s=String(value||'').trim().replace(/[.]$/,'');
  if(/^open next appointment$/i.test(s))return 'View details';
  if(/^open recent result$/i.test(s))return 'View result';
  if(/^view all for collections$/i.test(s))return 'View all';
  if(/^dismiss/i.test(s))return 'Dismiss';
  if(/^open focused module$/i.test(s))return 'Open';
  s=s.replace(/^open\s+/i,'').replace(/^choose\s+/i,'').trim();
  return s ? `${s[0].toUpperCase()}${s.slice(1)}` : 'Continue';
}
function heroArtwork(task){
  if(/consumer home/i.test(String(task.archetype||''))) return '<svg class="dh-wellness-art" viewBox="0 0 96 96" aria-hidden="true"><circle cx="48" cy="34" r="15" fill="rgba(255,255,255,.92)" stroke="none"/><path d="M22 83c3-19 13-29 26-29s23 10 26 29" fill="rgba(255,255,255,.78)" stroke="none"/><path d="M65 20c7 4 11 10 12 18M19 48c2-13 8-23 18-29" stroke="rgba(255,255,255,.35)" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M48 67c-6-7-15-2-13 5 1 5 7 9 13 14 6-5 12-9 13-14 2-7-7-12-13-5Z" fill="rgba(49,199,192,.95)" stroke="none"/></svg>';
  return iconSvg(`${task.title} health`);
}
function heroSubtitle(task){
  const a=String(task.archetype||'').toLowerCase();
  if(a.includes('consumer home'))return 'Care, medicines, cover and records — organised around what matters now.';
  if(a.includes('guided'))return 'Find the right next step quickly and clearly.';
  if(a.includes('focused detail'))return 'The important details, clearly organised.';
  if(a.includes('selection'))return 'Choose the option that works best for you.';
  if(a.includes('success'))return 'Confirmed, clear and ready for the next step.';
  if(a.includes('journey'))return 'See where you are and what happens next.';
  const p=String(task.purpose||'').trim(); return p.length>105?`${p.slice(0,102).replace(/\s+\S*$/,'')}…`:p;
}
function compactButton(action,index,primary=false){const id=actionId(action,index);return `<button class="${primary?'dh-primary':'dh-secondary'} dh-inline-cta" data-ui="${primary?'primary-action':'secondary-action'}" data-action="${esc(id)}">${esc(displayAction(action))}</button>`;}
function actionTile(action,index){const id=actionId(action,index);return `<button class="dh-action-card dh-dsl-action-tile" data-ui="quick-action" data-action="${esc(id)}"><span class="dh-icon">${iconSvg(action)}</span><strong>${esc(displayAction(action))}</strong></button>`;}
function featureCard(feature,index,kind='compact'){return `<article class="dh-list-row dh-feature-row ${kind}" data-ui="feature-${index}" data-feature-id="f${index}"><span class="dh-icon">${iconSvg(feature)}</span><div class="dh-list-main"><div class="dh-list-title">${esc(displayFeature(feature))}</div><div class="dh-list-meta">Live information appears here when available.</div></div></article>`;}
function renderRegion(region, idx, task, features, actions) {
  const fs=region.feature_refs.map((i)=>({i,label:features[i]})).filter((f)=>!/notifications? badge/i.test(String(f.label))), as=region.action_refs.map((i)=>({i,label:actions[i]}));
  const id=`region-${idx}-${region.type}`, variantClass=`dh-v-${region.variant}`;
  if(region.type==='hero') return `<section class="dh-hero dh-dsl-hero ${variantClass}" data-ui="${id}" ${fs[0]?`data-feature-id="f${fs[0].i}"`:''}><div class="dh-hero-copy"><span class="dh-eyebrow">${esc(task.business_unit||'Dial Health')}</span><h1>${esc(task.title)}</h1><p>${esc(heroSubtitle(task))}</p>${as[0]?compactButton(as[0].label,as[0].i,true):''}</div><div class="dh-hero-mark">${heroArtwork(task)}</div></section>`;
  if(region.type==='action_grid') return `<section class="dh-section dh-dsl-actions ${variantClass}" data-ui="${id}" ${fs[0]?`data-feature-id="f${fs[0].i}"`:''}><div class="dh-section-head"><div class="dh-section-title">Quick actions</div></div><div class="dh-action-grid">${as.slice(0,4).map((a)=>actionTile(a.label,a.i)).join('')}</div></section>`;
  if(region.type==='search') return `<section class="dh-section dh-card dh-pad ${variantClass}" data-ui="${id}"><label class="dh-field-label" for="search-${idx}">Search</label><div class="dh-search-wrap"><span class="dh-icon">${iconSvg('search')}</span><input id="search-${idx}" class="dh-search" aria-label="Search ${esc(task.title)}" placeholder="Search ${esc(task.title.toLowerCase())}" /></div>${as[0]?`<div class="dh-inline-actions">${compactButton(as[0].label,as[0].i,true)}</div>`:''}</section>`;
  if(region.type==='segmented') return `<section class="dh-section ${variantClass}" data-ui="${id}"><div class="dh-segmented" role="tablist">${fs.slice(0,3).map((f,i)=>as[i]?`<button role="tab" aria-selected="${i===0?'true':'false'}" data-action="${esc(actionId(as[i].label,as[i].i))}">${esc(displayFeature(f.label))}</button>`:`<span role="tab" aria-selected="${i===0?'true':'false'}">${esc(displayFeature(f.label))}</span>`).join('')}</div></section>`;
  if(region.type==='metrics') return `<section class="dh-section ${variantClass}" data-ui="${id}"><div class="dh-section-head"><div class="dh-section-title">At a glance</div></div><div class="dh-metric-grid">${fs.slice(0,4).map((f)=>`<article class="dh-card dh-metric" data-ui="metric" data-feature-id="f${f.i}"><span class="dh-metric-label">${esc(displayFeature(f.label))}</span><strong>Available</strong><small>Live service data</small></article>`).join('')}</div></section>`;
  if(region.type==='timeline') return `<section class="dh-section dh-card dh-pad ${variantClass}" data-ui="${id}"><div class="dh-section-title">Journey</div><div class="dh-timeline">${fs.slice(0,4).map((f,i)=>`<div class="dh-timeline-item" data-feature-id="f${f.i}"><span>${i+1}</span><div><strong>${esc(displayFeature(f.label))}</strong><small>Current status from the service</small></div></div>`).join('')}</div></section>`;
  if(region.type==='form') return `<section class="dh-section dh-card dh-pad ${variantClass}" data-ui="${id}"><div class="dh-section-title">${esc(task.title)}</div>${fs.slice(0,3).map((f)=>`<label class="dh-field"><span>${esc(displayFeature(f.label))}</span><div class="dh-field-surface">Select or enter information</div></label>`).join('')}${as[0]?`<div class="dh-inline-actions">${compactButton(as[0].label,as[0].i,true)}</div>`:''}</section>`;
  if(region.type==='confirmation') return `<section class="dh-section dh-card dh-pad dh-confirmation ${variantClass}" data-ui="${id}"><span class="dh-confirm-icon">✓</span><div><div class="dh-section-title">${esc(task.title)}</div>${fs.slice(0,3).map((f)=>`<p data-feature-id="f${f.i}">${esc(displayFeature(f.label))}</p>`).join('')}</div>${as.slice(0,2).map((a,i)=>compactButton(a.label,a.i,i===0)).join('')}</section>`;
  if(region.type==='emergency') return `<section class="dh-section dh-emergency ${variantClass}" data-ui="${id}"><span class="dh-icon">${iconSvg('emergency')}</span><div><strong>${esc(displayFeature(fs[0]?.label||task.title))}</strong><p>Use the documented urgent route when this situation applies.</p></div>${as[0]?compactButton(as[0].label,as[0].i,true):''}</section>`;
  if(region.type==='highlight'){
    const primary=fs[0], secondary=fs[1];
    return `<section class="dh-section dh-featured ${variantClass}" data-ui="${id}" ${primary?`data-feature-id="f${primary.i}"`:''}><div class="dh-featured-icon"><span class="dh-icon">${iconSvg(primary?.label||task.title)}</span></div><div class="dh-featured-main"><span class="dh-kicker">Up next</span><strong>${esc(displayFeature(primary?.label||task.title))}</strong>${secondary?`<small>${esc(displayFeature(secondary.label))}</small>`:'<small>Current information appears here when available.</small>'}</div>${as[0]?compactButton(as[0].label,as[0].i,false):''}</section>`;
  }
  const title = region.type==='document_list'?'Documents':region.type==='support'?'Help and support':region.type==='detail'?'Details':'Recent';
  return `<section class="dh-section ${variantClass}" data-ui="${id}"><div class="dh-section-head"><div class="dh-section-title">${title}</div></div><div class="dh-list">${fs.slice(0,3).map((f)=>featureCard(f.label,f.i,region.type)).join('')}</div>${as.length?`<div class="dh-inline-actions">${as.slice(0,2).map((a,i)=>compactButton(a.label,a.i,i===0&&region.prominence==='primary')).join('')}</div>`:''}</section>`;
}

const DSL_CSS = `
.dh-shell{width:100%;max-width:760px;margin:0 auto;padding-top:10px}.dh-dsl-header{display:flex;align-items:center;justify-content:space-between;min-height:48px;margin-bottom:8px}.dh-brand-lockup{display:flex;align-items:center;gap:9px;font-weight:850;letter-spacing:-.02em}.dh-brand-mark{position:relative;width:32px;height:32px;display:inline-block;flex:0 0 32px}.dh-brand-mark i{position:absolute;width:14px;height:14px;border-radius:6px;background:var(--dh-teal)}.dh-brand-mark i:nth-child(1){left:9px;top:0}.dh-brand-mark i:nth-child(2){right:0;top:9px;background:var(--dh-aqua)}.dh-brand-mark i:nth-child(3){left:9px;bottom:0;background:#087f79}.dh-brand-mark i:nth-child(4){left:0;top:9px;background:#1fb7b0}.dh-screen-title{font-size:12px;color:var(--dh-muted);font-weight:750}.dh-header-status{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:#f2f8fa;border:1px solid var(--dh-border)}.dh-header-status .dh-icon{width:32px;height:32px;background:transparent}.dh-dsl-hero{display:grid;grid-template-columns:minmax(0,1fr) 68px;align-items:center;gap:14px;min-height:142px;padding:18px;background:linear-gradient(135deg,var(--dh-navy),#0b6175 72%,var(--dh-teal));box-shadow:0 12px 28px rgba(5,37,72,.12)}.dh-hero-copy h1{font-size:29px;line-height:1.04;margin:4px 0 0}.dh-hero-copy p{font-size:13px;line-height:1.45;max-width:250px;margin-top:8px}.dh-eyebrow{font-size:10px;font-weight:850;text-transform:uppercase;letter-spacing:.09em;color:rgba(255,255,255,.72)}.dh-hero-copy .dh-inline-cta{margin-top:12px;background:#fff;color:var(--dh-navy);border-color:#fff}.dh-hero-mark{width:64px;height:64px;border-radius:22px;background:rgba(255,255,255,.12);display:grid;place-items:center}.dh-hero-mark svg{width:32px;height:32px;stroke:#fff;fill:none;stroke-width:1.8}.dh-hero-mark .dh-wellness-art{width:76px;height:76px;stroke:none}.dh-dsl-hero.dh-v-split .dh-hero-mark .dh-wellness-art{width:78px;height:78px}.dh-pad{padding:14px}.dh-inline-cta{min-height:44px;width:auto;padding:0 14px;border-radius:12px;font-size:12px;font-weight:850;justify-content:center}.dh-inline-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.dh-dsl-action-tile{min-height:86px!important;padding:12px!important;gap:7px!important;box-shadow:0 4px 14px rgba(8,44,92,.045)!important}.dh-dsl-action-tile strong{font-size:13px;line-height:1.2;color:var(--dh-ink)}.dh-dsl-action-tile .dh-icon{width:38px;height:38px}.dh-feature-row{min-height:66px!important;padding:10px 12px!important;box-shadow:none}.dh-feature-row .dh-icon{width:38px;height:38px}.dh-featured{display:grid;grid-template-columns:44px minmax(0,1fr) auto;align-items:center;gap:11px;background:linear-gradient(135deg,#f2fbfb,#edf6fa);border:1px solid #d8e9ec;border-radius:18px;padding:14px}.dh-featured-icon .dh-icon{width:42px;height:42px}.dh-featured-main{min-width:0}.dh-featured-main .dh-kicker{display:block;color:var(--dh-teal-deep);font-size:10px;font-weight:850;text-transform:uppercase;letter-spacing:.07em}.dh-featured-main strong{display:block;font-size:15px;color:var(--dh-ink);margin-top:2px}.dh-featured-main small{display:block;color:var(--dh-muted);font-size:11px;line-height:1.35;margin-top:3px}.dh-search-wrap{display:flex;align-items:center;gap:8px;background:#f8fbfc;border:1px solid var(--dh-border);border-radius:14px;padding-left:10px}.dh-search-wrap .dh-search{border:0;background:transparent;flex:1;min-width:0}.dh-field-label,.dh-field>span{display:block;font-size:12px;font-weight:800;color:var(--dh-muted);margin-bottom:6px}.dh-field{display:block;margin-top:12px}.dh-field-surface{min-height:48px;border:1px solid var(--dh-border);border-radius:13px;background:#f8fbfc;padding:14px;color:var(--dh-muted);font-size:13px}.dh-metric-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.dh-metric{padding:13px;box-shadow:none}.dh-metric span,.dh-metric small{display:block;color:var(--dh-muted);font-size:11px}.dh-metric strong{display:block;margin:6px 0 3px;font-size:18px}.dh-timeline{display:grid;gap:11px;margin-top:12px}.dh-timeline-item{display:grid;grid-template-columns:30px 1fr;gap:10px;align-items:start}.dh-timeline-item>span{width:28px;height:28px;border-radius:50%;background:var(--dh-mint);display:grid;place-items:center;font-size:12px;font-weight:850;color:var(--dh-teal-deep)}.dh-timeline-item small{display:block;color:var(--dh-muted);margin-top:2px}.dh-confirmation{display:grid;grid-template-columns:42px 1fr;gap:12px}.dh-confirm-icon{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;background:#e5f6f1;color:var(--dh-positive);font-weight:900}.dh-confirmation p{margin:5px 0;color:var(--dh-muted);font-size:13px}.dh-confirmation .dh-compact-action{grid-column:1/-1}.dh-emergency{display:grid;grid-template-columns:42px 1fr;gap:11px;border:1px solid #f0caca;background:#fff7f7;border-radius:17px;padding:14px}.dh-emergency p{margin:4px 0 0;color:#7f4a4a;font-size:12px}.dh-emergency .dh-compact-action{grid-column:1/-1}.dh-more{margin-top:14px;border-top:1px solid var(--dh-border);padding-top:10px}.dh-more summary{cursor:pointer;color:var(--dh-teal-deep);font-size:13px;font-weight:800;padding:8px 0}.dh-more:not([open])>:not(summary){display:none!important}.dh-more .dh-list{margin-top:7px}.dh-more-actions{display:grid;gap:8px;margin-top:8px}.dh-dsl-bottom-nav{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px;margin:18px -18px -18px;padding:9px 12px 12px;background:rgba(255,255,255,.98);border-top:1px solid var(--dh-border);border-radius:0 0 18px 18px}.dh-dsl-bottom-nav button{border:0;background:transparent;color:var(--dh-muted);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-width:0!important;padding:4px 2px;font-size:10px;font-weight:750}.dh-dsl-bottom-nav button.active{color:var(--dh-teal-deep)}.dh-nav-icon{width:22px;height:22px;display:grid;place-items:center}.dh-nav-icon svg{width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.dh-dsl-hero.dh-v-split{grid-template-columns:minmax(0,1fr) 88px;min-height:154px}.dh-dsl-hero.dh-v-split .dh-hero-mark{width:82px;height:82px;border-radius:28px}.dh-dsl-hero.dh-v-soft{background:linear-gradient(135deg,#0b3f66,#0b6d75);box-shadow:0 8px 24px rgba(5,37,72,.09)}.dh-dsl-hero.dh-v-compact{min-height:118px;padding:15px 17px}.dh-dsl-actions.dh-v-compact .dh-action-card{min-height:72px!important;display:grid;grid-template-columns:34px 1fr;align-items:center}.dh-dsl-actions.dh-v-compact .dh-icon{width:34px;height:34px}.dh-dsl-actions.dh-v-feature-first .dh-action-card:first-child{grid-column:1/-1;min-height:78px!important;display:grid;grid-template-columns:40px 1fr;align-items:center;background:linear-gradient(135deg,#f2fbfb,#edf6fa)}.dh-featured.dh-v-status{border-left:4px solid var(--dh-teal);background:#fff}.dh-featured.dh-v-soft{box-shadow:none}.dh-list.dh-v-cards .dh-list-row,.dh-v-cards .dh-list-row{box-shadow:0 5px 16px rgba(8,44,92,.055)}.dh-v-compact .dh-list-row{min-height:58px!important}.dh-v-rich .dh-list-row{min-height:76px!important}.dh-v-strip .dh-metric-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.dh-v-compact .dh-timeline-item{gap:8px}.dh-v-single-step .dh-field:not(:first-of-type){display:none}.dh-v-grouped .dh-list-row{background:#f8fbfc}.dh-confirmation.dh-v-success{border-color:#cde9df;background:linear-gradient(135deg,#f5fcf9,#fff)}.dh-emergency.dh-v-urgent{border-width:2px}.dh-emergency.dh-v-calm{background:#fff;border-color:#e5dada}
body[data-platform="responsive_web"] .dh-shell,body[data-platform="desktop_web"] .dh-shell{max-width:1120px}.dh-screen[data-platform="responsive_web"]{}@media(min-width:900px){body[data-platform="responsive_web"] .dh-dsl-body,body[data-platform="desktop_web"] .dh-dsl-body{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;align-items:start}body[data-platform="responsive_web"] .dh-dsl-body>.dh-dsl-hero,body[data-platform="desktop_web"] .dh-dsl-body>.dh-dsl-hero{grid-column:1/-1}.dh-section{margin-top:14px}}
`;

export function compileCompositionToPacket(task, rawComposition) {
  const composition=validateComposition(rawComposition,task);
  const features=contractList(task.features), actionCatalog=canonicalActionCatalog(task), actions=actionCatalog.map((x)=>x.label), actionMapEntries=actionMap(task);
  const usedFeatures=new Set(composition.regions.flatMap((r)=>r.feature_refs)); const usedActions=new Set(composition.regions.flatMap((r)=>r.action_refs));
  const remainingFeatures=features.map((_,i)=>i).filter((i)=>!usedFeatures.has(i)); const remainingActions=actions.map((_,i)=>i).filter((i)=>!usedActions.has(i));
  const notificationIndex=features.findIndex((f)=>/notifications? badge/i.test(String(f)));
  const regions=composition.regions.map((r,i)=>renderRegion(r,i,task,features,actions)).join('');
  const remainingVisibleFeatures=remainingFeatures.filter((i)=>i!==notificationIndex);
  const moreInfo=remainingVisibleFeatures.length?`<details class="dh-more" data-ui="progressive-more-information"><summary>More information</summary><div class="dh-list">${remainingVisibleFeatures.map((i)=>featureCard(features[i],i)).join('')}</div></details>`:'';
  const moreActions=remainingActions.length?`<details class="dh-more" data-ui="progressive-more-actions"><summary>More actions</summary><div class="dh-more-actions">${remainingActions.map((i)=>compactButton(actions[i],i,false)).join('')}</div></details>`:'';
  const headerStatus=notificationIndex>=0?`<span class="dh-header-status" data-ui="notification-badge" data-feature-id="f${notificationIndex}"><span class="dh-icon">${iconSvg('notification')}</span></span>`:`<span class="dh-screen-title">${esc(task.title)}</span>`;
  const brandMark='<span class="dh-brand-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span>';
  const homeNav=/consumer home/i.test(String(task.archetype||''));
  const navCandidates=homeNav?actionCatalog.map((item,i)=>({item,i})).filter(({item})=>item.route&&String(item.route).startsWith('/my-health/')).slice(0,5):[];
  const bottomNav=navCandidates.length?`<nav class="dh-dsl-bottom-nav" data-ui="primary-navigation">${navCandidates.map(({item,i},n)=>`<button class="${n===0?'active':''}" data-action="${esc(actionId(item.label,i))}"><span class="dh-nav-icon">${iconSvg(item.label)}</span><span>${esc(displayAction(item.label))}</span></button>`).join('')}</nav>`:'';
  const semantic_html=`<main class="dh-screen" data-ui="screen" data-platform="${esc(task.platform)}"><div class="dh-shell"><header class="dh-dsl-header" data-ui="app-header"><div class="dh-brand-lockup">${brandMark}<span>Dial Health</span></div>${headerStatus}</header><div class="dh-dsl-body">${regions}</div>${moreInfo}${moreActions}${bottomNav}</div></main>`;
  const states=contractList(task.required_variants);
  const evidence=Array.isArray(task.evidence_basis)?task.evidence_basis:contractList(task.evidence_basis);
  const featureRegion=new Map(); composition.regions.forEach((r,ri)=>r.feature_refs.forEach((fi)=>featureRegion.set(fi,`region-${ri}-${r.type}`))); if(notificationIndex>=0)featureRegion.set(notificationIndex,'app-header');
  const packet={
    screen_id:task.screen_id,title:task.title,platform:task.platform,semantic_html,css:DSL_CSS,
    experience_profile:{information_density:'LOW_TO_MODERATE',progressive_disclosure:true,composition_dsl:SCREEN_COMPOSITION_DSL_VERSION},
    interaction_map:actionMapEntries,
    data_bindings:features.map((feature,i)=>({binding_id:`f${i}`,feature,source:'screen_read_model',field:`feature_${i}`,authoritative:true,placeholder_policy:'NEUTRAL_NO_INVENTED_VALUE'})),
    state_map:states.map((state)=>({state,trigger:'screen state transition',visible_change:`Render ${state.toLowerCase().replace(/[_/]+/g,' ')} presentation using the same composition contract`})),
    feature_coverage:features.map((feature,i)=>({feature,element_id:featureRegion.get(i)||'progressive-more-information',realization:featureRegion.has(i)?'visible composition region':'progressive disclosure',evidence:evidence[0]||task.contract_evidence?.source||'CANONICAL_SCREEN_CONTRACT'})),
    evidence_map:features.map((feature)=>({feature,source:evidence[0]||task.contract_evidence?.source||'CANONICAL_SCREEN_CONTRACT'})),
    additional_features:[],
    component_contracts:composition.regions.map((r,i)=>({component_id:`region-${i}-${r.type}`,type:r.type,data_owner:'screen_read_model',feature_refs:r.feature_refs,action_refs:r.action_refs,prominence:r.prominence,variant:r.variant})),
  };
  return {packet,composition};
}
