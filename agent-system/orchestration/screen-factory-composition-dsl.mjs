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
  if(a.includes('guided choice'))return ['search','action_grid','highlight','list'];
  if(a.includes('focused detail'))return ['detail','highlight','action_grid'];
  if(a==='selection')return ['segmented','list','detail','highlight'];
  if(a.includes('success detail'))return ['confirmation','detail','action_grid'];
  if(a==='journey'||a.includes('transaction journey')||a.includes('live status'))return ['timeline','highlight','detail','action_grid'];
  if(a.includes('record detail')||a.includes('transaction detail'))return ['detail','metrics','list','action_grid'];
  if(a==='comparison')return ['segmented','list','highlight','action_grid'];
  if(a.includes('consumer summary'))return ['highlight','metrics','action_grid','list'];
  if(a==='collection')return ['list','highlight','action_grid'];
  if(a.includes('transaction collection')||a.includes('record collection'))return ['segmented','list','highlight','action_grid'];
  if(a.includes('financial collection'))return ['metrics','list','highlight','action_grid'];
  if(a.includes('eligibility check'))return ['search','form','highlight','detail'];
  if(a.includes('document collection'))return ['search','segmented','document_list','action_grid'];
  if(a==='timeline')return ['segmented','timeline','highlight','list'];
  if(a.includes('identity & delegation'))return ['highlight','list','action_grid'];
  if(a==='settings')return ['segmented','list','action_grid'];
  if(a.includes('privacy & identity'))return ['highlight','list','action_grid'];
  if(a.includes('emergency action'))return ['emergency','support','detail'];
  if(a==='support')return ['support','list','action_grid'];
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
function firstMatch(values, pattern) { return values.findIndex((value) => pattern.test(String(value))); }
function actionMatch(actions, pattern) { return actions.findIndex((item) => pattern.test(String(item?.label || ''))); }
function pickedVariant(regions, type, fallback) {
  const allowed = REGION_VARIANT_CATALOG[type] || [];
  const found = regions.find((region) => region.type === type)?.variant;
  return allowed.includes(found) ? found : (allowed.includes(fallback) ? fallback : allowed[0] || 'default');
}
function shortcutActionIndexes(task, actions) {
  const feature = contractList(task.features).find((value) => /shortcuts?\s+to\s+/i.test(String(value)));
  const match = String(feature || '').match(/shortcuts?\s+to\s+(.+)$/i);
  if (!match) return [];
  const names = match[1].split(/,|\band\b/i).map((x) => x.trim()).filter(Boolean).slice(0,4);
  return names.map((name) => actions.findIndex((item) => slug(item.label) === slug(`Open ${name}`))).filter((i) => i >= 0);
}
const LOCKED_MY_HEALTH_TITLES=Object.freeze({
  'MH-S001':'Home / Today','MH-S002':'Need Care','MH-S003':'Provider Profile','MH-S004':'Slot Selection','MH-S005':'Booking Confirmation','MH-S006':'Appointment Journey','MH-S007':'Live Queue / Remote Waiting','MH-S008':'Need Medicine','MH-S009':'Prescription Detail','MH-S010':'Fulfilment Comparison','MH-S011':'Pharmacy Order / Tracking','MH-S012':'Medical Aid Overview','MH-S013':'Benefits','MH-S014':'Check a Service','MH-S015':'Pre-authorisations','MH-S016':'Claims','MH-S017':'Claim Detail','MH-S018':'Payments & Shortfalls','MH-S019':'Labs & Imaging','MH-S020':'Result / Report Detail','MH-S021':'Documents','MH-S022':'Health Timeline','MH-S023':'My Family / Proxy','MH-S024':'Notifications & Preferences','MH-S025':'Profile, Privacy & Consent','MH-S026':'Emergency','MH-S027':'Support'
});
function myHealthCanonicalRegions(task, rawRegions, features, actions) {
  if (String(task.business_unit || '') !== 'My Health') return null;
  const id=String(task.screen_id||'');
  if (LOCKED_MY_HEALTH_TITLES[id] !== String(task.title||'')) return null;
  const f = (re) => firstMatch(features, re), a = (re) => actionMatch(actions, re);
  const refs = (...items) => [...new Set(items.flat().filter((n) => Number.isInteger(n) && n >= 0))];
  const mk = (type, featureRefs, actionRefs, prominence, fallback) => ({ type, feature_refs:refs(featureRefs), action_refs:refs(actionRefs), prominence, variant:(REGION_VARIANT_CATALOG[type]||[]).includes(fallback)?fallback:(REGION_VARIANT_CATALOG[type]||[])[0]||'default' });
  const shortcuts=shortcutActionIndexes(task,actions);
  const map={
    'MH-S001':()=>[
      mk('hero',[f(/greeting|context/i)],[],'primary','split'),
      mk('action_grid',[f(/primary shortcuts?/i)],shortcuts,'primary','tiles'),
      mk('highlight',[f(/next appointment/i)],[a(/open next appointment/i)],'secondary','status'),
      mk('list',[f(/recent result|record teaser/i)],[a(/open recent result/i)],'quiet','compact'),
    ],
    'MH-S002':()=>[
      mk('search',[f(/symptom\/service search/i)],[a(/^search$/i)],'primary','compact'),
      mk('action_grid',[f(/common care categories/i)],[a(/choose care category/i),a(/answer guided questions/i),a(/open provider results/i)],'primary','tiles'),
      mk('highlight',[f(/location\/availability context/i)],[],'secondary','soft'),
      mk('list',[f(/plain-language care need chooser/i),f(/emergency escalation/i)],[a(/invoke emergency route/i)],'quiet','compact'),
    ],
    'MH-S003':()=>[
      mk('detail',[f(/provider identity/i),f(/specialties\/services/i),f(/^location$/i)],[],'primary','grouped'),
      mk('highlight',[f(/availability summary/i),f(/accepted payment\/medical-aid/i)],[],'secondary','status'),
      mk('list',[f(/accessibility\/contact/i),f(/trust information/i)],[],'quiet','compact'),
      mk('action_grid',[],[a(/^book$/i),a(/view slots/i),a(/call|contact/i),a(/directions/i)],'primary','compact'),
    ],
    'MH-S004':()=>[
      mk('segmented',[f(/date strip/i)],[a(/select date/i)],'primary','compact'),
      mk('list',[f(/available slots/i)],[a(/select slot/i)],'primary','rich'),
      mk('detail',[f(/visit mode/i),f(/^location$/i),f(/price|cover estimate/i)],[a(/change visit mode|location/i)],'secondary','compact'),
      mk('highlight',[f(/earliest alternative/i),f(/selected provider|service context/i)],[a(/^continue$/i)],'primary','soft'),
    ],
    'MH-S005':()=>[
      mk('confirmation',[f(/confirmed provider|service/i),f(/date\/time/i),f(/location\/visit mode/i)],[a(/view appointment/i)],'primary','success'),
      mk('detail',[f(/reference/i),f(/preparation summary/i),f(/payment\/cover status/i)],[],'secondary','compact'),
      mk('action_grid',[f(/calendar\/export\/share actions/i)],[a(/add to calendar/i),a(/download|share confirmation/i),a(/directions/i),a(/reschedule|cancel/i)],'primary','compact'),
    ],
    'MH-S006':()=>[
      mk('timeline',[f(/appointment status timeline/i),f(/check-in readiness/i),f(/preparation/i)],[],'primary','vertical'),
      mk('highlight',[f(/next required action/i)],[],'primary','status'),
      mk('detail',[f(/location\/remote link/i),f(/provider/i),f(/related payment|cover state/i)],[],'secondary','compact'),
      mk('action_grid',[],[a(/full appointment detail/i),a(/^check in$/i),a(/join remote visit/i),a(/reschedule|cancel/i)],'primary','compact'),
    ],
    'MH-S007':()=>[
      mk('timeline',[f(/current queue|wait state/i),f(/estimated wait/i),f(/member position/i)],[],'primary','compact'),
      mk('highlight',[f(/alert when action required/i)],[a(/join consultation/i)],'primary','status'),
      mk('detail',[f(/provider\/site status/i),f(/remote waiting instructions/i)],[],'secondary','compact'),
      mk('action_grid',[],[a(/^refresh$/i),a(/leave|rejoin queue/i),a(/open appointment/i),a(/contact reception|support/i)],'primary','compact'),
    ],
    'MH-S008':()=>[
      mk('search',[f(/medicine\/prescription search/i)],[],'primary','compact'),
      mk('action_grid',[f(/pharmacy availability entry point/i)],[a(/open prescription/i),a(/request refill/i),a(/compare fulfilment/i),a(/search pharmacy/i)],'primary','tiles'),
      mk('highlight',[f(/safety notice/i)],[],'secondary','soft'),
      mk('list',[f(/active prescriptions teaser/i),f(/refill eligibility/i),f(/delivery\/collection choice/i)],[a(/contact care team/i)],'quiet','compact'),
    ],
    'MH-S009':()=>[
      mk('detail',[f(/^medicine$/i),f(/dose\/instructions/i),f(/prescriber/i)],[],'primary','grouped'),
      mk('metrics',[f(/issue\/expiry\/status/i),f(/repeats remaining/i),f(/substitution constraints/i)],[],'secondary','two-up'),
      mk('list',[f(/dispensing history/i),f(/warnings\/provenance/i)],[],'quiet','compact'),
      mk('action_grid',[],[a(/request refill/i),a(/compare fulfilment/i),a(/dispensing record/i),a(/download|export prescription/i)],'primary','compact'),
    ],
    'MH-S010':()=>[
      mk('segmented',[f(/collection\/delivery/i)],[a(/choose collection|delivery/i)],'primary','pills'),
      mk('list',[f(/pharmacy options/i),f(/verified availability/i),f(/distance\/ETA/i)],[],'primary','rich'),
      mk('highlight',[f(/price\/shortfall/i),f(/service status/i)],[],'secondary','status'),
      mk('action_grid',[],[a(/select pharmacy/i),a(/refresh quote|availability/i),a(/pharmacy detail/i),a(/continue to order/i)],'primary','compact'),
    ],
    'MH-S011':()=>[
      mk('timeline',[f(/order status timeline/i),f(/delivery tracking/i),f(/receipt\/reference/i)],[],'primary','vertical'),
      mk('highlight',[f(/amount\/shortfall/i),f(/collection\/delivery/i)],[],'secondary','status'),
      mk('detail',[f(/pharmacy/i),f(/items summary/i),f(/fulfilment exceptions/i)],[],'secondary','compact'),
      mk('action_grid',[],[a(/full order detail/i),a(/contact pharmacy|support/i),a(/track delivery/i),a(/download receipt|order summary/i)],'primary','compact'),
    ],
    'MH-S012':()=>[
      mk('highlight',[f(/scheme\/member identity/i),f(/cover status/i)],[],'primary','status'),
      mk('metrics',[f(/benefit highlights/i),f(/contributions\/payment status/i)],[],'secondary','two-up'),
      mk('action_grid',[f(/quick links to benefits/i)],[a(/open benefits/i),a(/check service/i),a(/claim|preauth detail/i),a(/contact funder|support/i)],'primary','tiles'),
      mk('list',[f(/recent claim\/preauth/i)],[],'quiet','compact'),
    ],
    'MH-S013':()=>[
      mk('list',[f(/benefit categories/i),f(/available\/used\/remaining/i),f(/limits\/conditions/i)],[],'primary','rich'),
      mk('highlight',[f(/waiting periods\/exclusions/i),f(/freshness\/provenance/i)],[],'secondary','soft'),
      mk('action_grid',[],[a(/expand category/i),a(/full benefit detail/i),a(/search benefits/i),a(/start service check/i)],'primary','compact'),
    ],
    'MH-S014':()=>[
      mk('search',[f(/service search/i)],[a(/run check/i)],'primary','prominent'),
      mk('form',[f(/selected provider context/i)],[a(/change service|provider/i)],'secondary','single-step'),
      mk('highlight',[f(/eligibility\/benefit result/i),f(/estimated member shortfall/i)],[a(/start preauthorisation/i)],'primary','status'),
      mk('detail',[f(/preauthorisation requirement/i),f(/limitations\/exclusions/i),f(/freshness/i)],[],'secondary','compact'),
    ],
    'MH-S015':()=>[
      mk('segmented',[f(/requests list with status/i)],[],'primary','pills'),
      mk('list',[f(/service\/provider/i),f(/submitted date/i),f(/next action/i)],[],'primary','rich'),
      mk('highlight',[f(/expiry/i),f(/documents needed/i)],[],'secondary','status'),
      mk('action_grid',[],[a(/open request detail/i),a(/submit requested document/i),a(/start new request/i),a(/withdraw/i)],'primary','compact'),
    ],
    'MH-S016':()=>[
      mk('segmented',[f(/simple filters/i)],[a(/filter\/search/i)],'primary','pills'),
      mk('list',[f(/recent claims/i),f(/provider\/service/i),f(/amount summary/i)],[],'primary','rich'),
      mk('highlight',[f(/member responsibility/i),f(/status/i)],[],'secondary','status'),
      mk('action_grid',[],[a(/full claim detail/i),a(/export claims statement/i),a(/contact support|dispute/i)],'primary','compact'),
    ],
    'MH-S017':()=>[
      mk('detail',[f(/claim reference/i),f(/provider\/service/i),f(/dates/i)],[],'primary','grouped'),
      mk('metrics',[f(/billed\/allowed\/paid\/member amounts/i)],[],'primary','two-up'),
      mk('list',[f(/line-item breakdown/i),f(/status timeline/i),f(/denial\/reason codes/i)],[],'secondary','compact'),
      mk('action_grid',[],[a(/export\/download claim statement/i),a(/supporting document/i),a(/query\/dispute/i),a(/pay valid shortfall/i)],'primary','compact'),
    ],
    'MH-S018':()=>[
      mk('metrics',[f(/amount due/i),f(/due date\/status/i),f(/credits\/refunds/i)],[],'primary','two-up'),
      mk('list',[f(/balances grouped/i),f(/payment history teaser/i),f(/payment method entry/i)],[],'secondary','rich'),
      mk('highlight',[f(/dispute route/i)],[],'secondary','soft'),
      mk('action_grid',[],[a(/full balance|transaction detail/i),a(/^pay$/i),a(/download receipt|statement/i),a(/payment history/i)],'primary','compact'),
    ],
    'MH-S019':()=>[
      mk('segmented',[f(/test type/i),f(/status/i)],[],'primary','pills'),
      mk('list',[f(/recent tests\/imaging/i),f(/ordering provider/i),f(/result availability/i)],[],'primary','rich'),
      mk('highlight',[f(/abnormal\/critical labels/i),f(/unread indicator/i)],[],'secondary','status'),
      mk('action_grid',[],[a(/full result|report/i),a(/filter by type|date/i),a(/download available report/i),a(/share through approved flow/i)],'primary','compact'),
    ],
    'MH-S020':()=>[
      mk('detail',[f(/result\/report header/i),f(/ordering provider\/facility/i),f(/specimen\/study date/i)],[],'primary','grouped'),
      mk('metrics',[f(/values\/findings/i),f(/reference ranges/i)],[],'primary','two-up'),
      mk('list',[f(/attachments\/images link/i),f(/clinician note/i),f(/provenance\/freshness/i)],[],'secondary','compact'),
      mk('action_grid',[],[a(/download\/export report/i),a(/share via approved/i),a(/related encounter/i),a(/contact care team/i)],'primary','compact'),
    ],
    'MH-S021':()=>[
      mk('search',[f(/^search$/i)],[],'primary','compact'),
      mk('segmented',[f(/document categories/i)],[],'primary','pills'),
      mk('document_list',[f(/recent documents/i),f(/type\/date\/source/i),f(/access status/i)],[],'primary','cards'),
      mk('action_grid',[],[a(/document detail|viewer/i),a(/download\/export/i),a(/share through consented/i),a(/upload to supported/i)],'primary','compact'),
    ],
    'MH-S022':()=>[
      mk('segmented',[f(/compact timeline with filters/i)],[a(/filter event types/i)],'primary','compact'),
      mk('timeline',[f(/appointments\/encounters/i),f(/prescriptions\/dispensing/i),f(/^results$/i),f(/claims\/payments/i)],[],'primary','vertical'),
      mk('highlight',[f(/documents/i),f(/care events/i)],[],'secondary','soft'),
      mk('action_grid',[],[a(/event full detail/i),a(/jump by date/i),a(/export selected timeline/i),a(/share through consented/i)],'primary','compact'),
    ],
    'MH-S023':()=>[
      mk('highlight',[f(/switch-profile context/i)],[a(/switch context/i)],'primary','status'),
      mk('list',[f(/family\/dependant list/i),f(/relationship/i),f(/consent\/delegation scope/i)],[],'primary','rich'),
      mk('action_grid',[],[a(/dependant profile/i),a(/request\/grant\/revoke access/i),a(/review consent/i),a(/export delegation evidence/i)],'primary','compact'),
    ],
    'MH-S024':()=>[
      mk('segmented',[f(/notification categories/i)],[],'primary','pills'),
      mk('list',[f(/channel preferences/i),f(/quiet\/non-urgent settings/i),f(/language\/accessibility/i)],[],'primary','compact'),
      mk('action_grid',[],[a(/toggle permitted preferences/i),a(/choose channels/i),a(/test\/verify channel/i),a(/restore defaults/i)],'primary','compact'),
    ],
    'MH-S025':()=>[
      mk('highlight',[f(/identity verification status/i)],[a(/verify contact/i)],'primary','status'),
      mk('list',[f(/personal\/contact information/i),f(/privacy choices/i),f(/consent grants\/revocations/i)],[],'primary','compact'),
      mk('action_grid',[],[a(/edit permitted profile/i),a(/manage consent/i),a(/request data export/i),a(/revoke session/i)],'primary','compact'),
    ],
    'MH-S026':()=>[
      mk('emergency',[f(/emergency call instructions/i)],[a(/call emergency service/i)],'primary','urgent'),
      mk('support',[f(/emergency contacts/i),f(/nearest\/available network support/i)],[a(/contact emergency network/i)],'secondary','contact'),
      mk('detail',[f(/location sharing consent/i),f(/medical summary share consent/i),f(/outage fallback/i)],[a(/share location\/summary/i),a(/emergency contact/i)],'secondary','compact'),
    ],
    'MH-S027':()=>[
      mk('support',[f(/topic chooser/i),f(/contact channels/i),f(/operating\/response expectations/i)],[a(/start case/i),a(/call\/contact channel/i)],'primary','contact'),
      mk('list',[f(/recent\/open cases/i),f(/self-help links/i),f(/escalation for urgent/i)],[a(/open full case detail/i),a(/message\/respond/i)],'secondary','compact'),
      mk('action_grid',[],[a(/attach document/i),a(/close\/reopen/i),a(/export case transcript/i)],'primary','compact'),
    ],
  };
  return map[id]?.() || null;
}
export function lockedCanonicalComposition(task) {
  const features=contractList(task.features), actions=canonicalActionCatalog(task);
  const regions=myHealthCanonicalRegions(task,[],features,actions);
  if(!regions) return null;
  return {dsl_version:SCREEN_COMPOSITION_DSL_VERSION,screen_id:task.screen_id,archetype:slug(task.archetype||'screen'),regions};
}

export function validateComposition(composition, task) {
  assertTaskContractReady(task);
  if (!composition || String(composition.screen_id) !== String(task.screen_id)) throw new Error(`composition identity mismatch for ${task.screen_id}`);
  if (!Array.isArray(composition.regions) || composition.regions.length < 2 || composition.regions.length > 6) throw new Error(`composition ${task.screen_id} requires 2-6 regions`);
  const features = contractList(task.features), actions = canonicalActionCatalog(task);
  let regions = composition.regions.map((region, index) => {
    const type = ALLOWED_REGION_TYPES.includes(String(region?.type)) ? String(region.type) : null;
    if (!type) throw new Error(`composition ${task.screen_id} region ${index} has unsupported type`);
    const allowedVariants = REGION_VARIANT_CATALOG[type] || [];
    const requestedVariant = slug(region.variant || allowedVariants[0] || 'default');
    const variant = allowedVariants.includes(requestedVariant) ? requestedVariant : allowedVariants[0] || 'default';
    return { type, feature_refs:uniqInts(region.feature_refs, features.length), action_refs:uniqInts(region.action_refs, actions.length), prominence:PROMINENCE.has(region.prominence)?region.prominence:'secondary', variant };
  });
  const canonicalMyHealth = myHealthCanonicalRegions(task, regions, features, actions);
  if (canonicalMyHealth) regions = canonicalMyHealth;
  // Normalize common model deviations locally so quota is not wasted repairing mechanics.
  // Product truth still comes only from the canonical action catalog; normalization may
  // remove duplicate/excess placement but never invent an action.
  const preferred = shortcutActionIndexes(task, actions);
  const grid = regions.find((region) => region.type === 'action_grid');
  if (grid && preferred.length >= 2) {
    grid.action_refs = [...new Set(preferred)].slice(0,4);
    const owned = new Set(grid.action_refs);
    for (const region of regions) if (region !== grid) region.action_refs = region.action_refs.filter((ref) => !owned.has(ref));
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
  const featureLimits={hero:1,action_grid:1,highlight:2,search:1,segmented:3,list:3,metrics:4,timeline:4,form:3,detail:3,document_list:3,support:3,confirmation:3,emergency:1};
  const seenFeatures=new Set();
  for(const region of regions){
    const limit=featureLimits[region.type]||3; const normalized=[];
    for(const ref of region.feature_refs){if(seenFeatures.has(ref)||normalized.length>=limit)continue;seenFeatures.add(ref);normalized.push(ref);} region.feature_refs=normalized;
    if(String(task.business_unit||'')==='My Health'&&region.type==='hero'&&!/emergency action|success detail/i.test(String(task.archetype||''))) region.action_refs=[];
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
  provider:'<circle cx="12" cy="8" r="3.5"/><path d="M5.5 20c.8-4.3 3.1-6.6 6.5-6.6s5.7 2.3 6.5 6.6M17 5l2 2 3-3"/>',
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
  if(/emerg|urgent|alert/.test(s)) key='alert'; else if(/provider|doctor|clinic/.test(s)) key='provider'; else if(/care|health/.test(s)) key='care'; else if(/medicin|prescription|pharmacy/.test(s)) key='medicine'; else if(/record|result|document|claim|report/.test(s)) key='record'; else if(/appointment|booking|slot|visit/.test(s)) key='appointment'; else if(/search|find/.test(s)) key='search'; else if(/notif|bell/.test(s)) key='notification'; else if(/support|help/.test(s)) key='support';
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
  const labels=[
    [/^greeting\/context$/i,'Today'],[/^next appointment summary$/i,'Next appointment'],
    [/health\/cover attention/i,'Health & cover'],[/recent result\/record teaser/i,'Recent result'],
    [/primary shortcuts?/i,'Quick actions'],[/notifications? badge/i,'Notifications'],
    [/plain-language care need chooser/i,'What do you need help with?'],[/symptom\/service search/i,'Symptoms or services'],
    [/common care categories/i,'Common care needs'],[/location\/availability context/i,'Nearby & available'],[/emergency escalation/i,'Emergency help'],
    [/provider identity and credentials/i,'Provider details'],[/specialties\/services/i,'Specialties & services'],[/^location$/i,'Location'],
    [/availability summary/i,'Availability'],[/accepted payment\/medical-aid/i,'Cover & payment'],[/accessibility\/contact/i,'Contact & access'],[/trust information/i,'About this provider'],
    [/selected provider\/service context/i,'Provider & service'],[/date strip/i,'Choose a date'],[/available slots/i,'Available times'],[/visit mode/i,'Visit type'],[/price\/cover estimate/i,'Cover estimate'],[/earliest alternative/i,'Earliest alternative'],
    [/confirmed provider\/service/i,'Booking confirmed'],[/date\/time/i,'Date & time'],[/location\/visit mode/i,'Visit details'],[/preparation summary/i,'Before your visit'],[/payment\/cover status/i,'Cover status'],[/calendar\/export\/share actions/i,'Save & share'],
    [/appointment status timeline/i,'Appointment status'],[/next required action/i,'Next step'],[/check-in readiness/i,'Check-in'],[/location\/remote link/i,'Visit access'],[/related payment\/cover state/i,'Cover & payment'],[/completed-visit summary/i,'Visit summary'],
    [/current queue\/wait state/i,'Queue status'],[/estimated wait/i,'Estimated wait'],[/member position/i,'Queue position'],[/provider\/site status/i,'Provider status'],[/remote waiting instructions/i,'While you wait'],[/alert when action required/i,'Action needed'],
    [/active prescriptions teaser/i,'Your prescriptions'],[/medicine\/prescription search/i,'Find a medicine'],[/refill eligibility/i,'Refill status'],[/pharmacy availability entry point/i,'Find a pharmacy'],[/safety notice/i,'Medicine safety'],[/delivery\/collection choice/i,'Delivery or collection'],
    [/^medicine$/i,'Medicine'],[/dose\/instructions/i,'Dose & instructions'],[/^prescriber$/i,'Prescriber'],[/issue\/expiry\/status/i,'Prescription status'],[/repeats remaining/i,'Repeats'],[/substitution constraints/i,'Substitution'],[/dispensing history/i,'Dispensing history'],[/warnings\/provenance/i,'Safety & source'],
    [/pharmacy options/i,'Pharmacy options'],[/verified availability\/freshness/i,'Availability'],[/collection\/delivery/i,'Collection or delivery'],[/authoritative price\/shortfall/i,'Price & shortfall'],[/distance\/ETA/i,'Distance & ETA'],[/substitution state/i,'Substitution'],[/service status/i,'Service status'],
    [/order status timeline/i,'Order status'],[/items summary/i,'Items'],[/amount\/shortfall/i,'Amount & shortfall'],[/delivery tracking/i,'Delivery tracking'],[/fulfilment exceptions/i,'Order issues'],[/receipt\/reference/i,'Receipt & reference'],
    [/scheme\/member identity/i,'Medical aid'],[/cover status/i,'Cover status'],[/benefit highlights/i,'Benefit highlights'],[/recent claim\/preauth/i,'Recent activity'],[/contributions\/payment status/i,'Contributions'],[/quick links to benefits/i,'Quick actions'],
    [/benefit categories/i,'Benefit categories'],[/available\/used\/remaining/i,'Available benefit'],[/limits\/conditions/i,'Limits & conditions'],[/waiting periods\/exclusions/i,'Waiting periods & exclusions'],[/freshness\/provenance/i,'Last updated'],
    [/service search/i,'Service'],[/eligibility\/benefit result/i,'Eligibility result'],[/estimated member shortfall/i,'Estimated shortfall'],[/preauthorisation requirement/i,'Pre-authorisation'],[/limitations\/exclusions/i,'Limitations'],
    [/requests list with status/i,'Pre-authorisations'],[/submitted date/i,'Submitted'],[/decision summary/i,'Decision'],[/documents needed/i,'Documents needed'],
    [/recent claims/i,'Recent claims'],[/provider\/service/i,'Provider & service'],[/member responsibility/i,'Your responsibility'],[/submitted\/processed dates/i,'Claim dates'],[/simple filters/i,'Filters'],
    [/claim reference/i,'Claim reference'],[/billed\/allowed\/paid\/member amounts/i,'Claim amounts'],[/line-item breakdown/i,'Line items'],[/status timeline/i,'Status'],[/denial\/reason codes/i,'Decision explanation'],[/related documents/i,'Documents'],
    [/balances grouped/i,'Balances'],[/amount due/i,'Amount due'],[/due date\/status/i,'Due status'],[/payment history teaser/i,'Recent payments'],[/credits\/refunds/i,'Credits & refunds'],[/payment method entry/i,'Payment method'],[/dispute route/i,'Query a balance'],
    [/recent tests\/imaging/i,'Recent tests & imaging'],[/test type/i,'Test type'],[/ordering provider/i,'Ordered by'],[/result availability/i,'Result status'],[/abnormal\/critical labels/i,'Clinical flags'],[/unread indicator/i,'Unread'],
    [/result\/report header/i,'Report'],[/ordering provider\/facility/i,'Ordered by'],[/specimen\/study date/i,'Study date'],[/values\/findings/i,'Findings'],[/reference ranges/i,'Reference range'],[/attachments\/images link/i,'Attachments'],[/clinician note/i,'Clinician note'],[/provenance\/freshness/i,'Source & freshness'],
    [/document categories/i,'Document categories'],[/recent documents/i,'Recent documents'],[/type\/date\/source/i,'Document details'],[/^search$/i,'Search'],[/access status/i,'Access'],[/expiry where relevant/i,'Expiry'],[/upload entry/i,'Upload'],
    [/appointments\/encounters/i,'Appointments & visits'],[/prescriptions\/dispensing/i,'Medicines'],[/^results$/i,'Results'],[/claims\/payments/i,'Claims & payments'],[/^documents$/i,'Documents'],[/care events/i,'Care events'],[/compact timeline/i,'Timeline filters'],
    [/family\/dependant list/i,'Family'],[/^relationship$/i,'Relationship'],[/consent\/delegation scope/i,'Access permissions'],[/pending invitations/i,'Pending access'],[/age\/guardian transitions/i,'Guardian access'],[/switch-profile context/i,'Switch profile'],
    [/notification categories/i,'Notifications'],[/channel preferences/i,'Channels'],[/quiet\/non-urgent settings/i,'Quiet settings'],[/language\/accessibility/i,'Language & accessibility'],[/critical-message exceptions/i,'Critical messages'],[/consent state/i,'Consent'],
    [/personal\/contact information/i,'Personal details'],[/identity verification status/i,'Identity verification'],[/privacy choices/i,'Privacy choices'],[/consent grants\/revocations/i,'Consent'],[/active sessions\/devices/i,'Sessions & devices'],[/security actions/i,'Security'],[/data export request entry/i,'Data export'],[/audit\/access history/i,'Access history'],
    [/emergency call instructions/i,'Emergency call'],[/location sharing consent/i,'Location sharing'],[/emergency contacts/i,'Emergency contacts'],[/nearest\/available network support/i,'Nearby emergency support'],[/medical summary share consent/i,'Share medical summary'],[/outage fallback/i,'Offline fallback'],
    [/topic chooser/i,'How can we help?'],[/recent\/open cases/i,'Your cases'],[/contact channels/i,'Contact support'],[/operating\/response expectations/i,'Response times'],[/self-help links/i,'Help articles'],[/escalation for urgent/i,'Urgent escalation'],
  ];
  for(const [re,label] of labels) if(re.test(s)) return label;
  s=s.replace(/\b(summary|teaser|context|when relevant|when known|only when authoritative|where available|where supplied|when supported|where relevant)\b/gi,'').replace(/\s+/g,' ').trim();
  return s ? `${s[0].toUpperCase()}${s.slice(1)}` : 'Information';
}
function displayAction(value) {
  let s=String(value||'').trim().replace(/[.]$/,'');
  const labels=[
    [/^open next appointment$/i,'View appointment'],[/^open recent result$/i,'View result'],[/^view all for collections$/i,'View all'],[/^open focused module$/i,'Open'],
    [/^choose care category$/i,'Choose care'],[/^answer guided questions$/i,'Guide me'],[/^open provider results$/i,'View providers'],[/^invoke emergency route$/i,'Emergency help'],
    [/^call\/contact where permitted$/i,'Contact'],[/^open directions$/i,'Directions'],[/^expand credentials\/services$/i,'View credentials'],[/^share provider$/i,'Share'],
    [/^change visit mode\/location$/i,'Change visit'],[/^refresh availability$/i,'Refresh'],[/^download\/share confirmation$/i,'Share confirmation'],[/^reschedule\/cancel through appointment detail$/i,'Manage booking'],
    [/^open full appointment detail$/i,'View appointment'],[/^join remote visit$/i,'Join visit'],[/^reschedule\/cancel$/i,'Manage booking'],[/^open documents\/results when available$/i,'Documents & results'],[/^export appointment summary$/i,'Export summary'],
    [/^leave\/rejoin queue where allowed$/i,'Manage queue'],[/^contact reception\/support$/i,'Contact reception'],[/^join consultation when enabled$/i,'Join consultation'],
    [/^compare fulfilment$/i,'Compare options'],[/^search pharmacy$/i,'Find pharmacy'],[/^contact care team for prescription issue$/i,'Contact care team'],
    [/^open dispensing record$/i,'Dispensing history'],[/^download\/export prescription copy where legally allowed$/i,'Export prescription'],[/^contact prescriber\/pharmacy$/i,'Contact'],
    [/^choose collection\/delivery$/i,'Delivery or collection'],[/^refresh quote\/availability$/i,'Refresh'],[/^open pharmacy detail$/i,'Pharmacy details'],[/^continue to order$/i,'Continue'],
    [/^download receipt\/order summary$/i,'Receipt'],[/^report issue$/i,'Report issue'],[/^cancel when policy allows$/i,'Cancel'],
    [/^check service$/i,'Check service'],[/^download member\/cover document where available$/i,'Member document'],[/^contact funder\/support$/i,'Contact support'],
    [/^expand category$/i,'View benefit'],[/^open full benefit detail$/i,'Benefit details'],[/^search benefits$/i,'Search benefits'],[/^start service check$/i,'Check a service'],
    [/^run check$/i,'Check service'],[/^change service\/provider$/i,'Change selection'],[/^start preauthorisation$/i,'Start pre-authorisation'],[/^save\/export result$/i,'Save result'],
    [/^submit requested document$/i,'Upload document'],[/^start new request where supported$/i,'New request'],[/^withdraw where allowed$/i,'Withdraw'],[/^export decision\/request$/i,'Export'],
    [/^filter\/search$/i,'Filter'],[/^export claims statement$/i,'Export claims'],[/^contact support\/dispute incorrect item through detail$/i,'Get help'],
    [/^export\/download claim statement$/i,'Download statement'],[/^open supporting document$/i,'Documents'],[/^start query\/dispute$/i,'Query claim'],[/^pay valid shortfall$/i,'Pay shortfall'],[/^contact funder\/provider$/i,'Contact'],
    [/^open full balance\/transaction detail$/i,'View balance'],[/^download receipt\/statement$/i,'Receipt'],[/^view payment history$/i,'Payment history'],[/^dispute incorrect balance$/i,'Query balance'],
    [/^open full result\/report$/i,'View report'],[/^filter by type\/date$/i,'Filter'],[/^download available report$/i,'Download'],[/^share through approved flow$/i,'Share'],
    [/^download\/export report$/i,'Download report'],[/^share via approved consented flow$/i,'Share'],[/^open related encounter$/i,'Related visit'],[/^acknowledge critical communication where required$/i,'Acknowledge'],
    [/^open document detail\/viewer$/i,'Open document'],[/^download\/export$/i,'Download'],[/^share through consented flow$/i,'Share'],[/^upload to supported workflow$/i,'Upload'],
    [/^open event full detail$/i,'View event'],[/^filter event types$/i,'Filter'],[/^jump by date$/i,'Jump to date'],[/^export selected timeline\/range where permitted$/i,'Export timeline'],
    [/^open dependant profile$/i,'Open profile'],[/^request\/grant\/revoke access subject to rules$/i,'Manage access'],[/^switch context$/i,'Switch profile'],[/^review consent$/i,'Review consent'],
    [/^toggle permitted preferences$/i,'Update preferences'],[/^choose channels$/i,'Choose channels'],[/^test\/verify channel where needed$/i,'Verify channel'],[/^restore defaults$/i,'Restore defaults'],
    [/^edit permitted profile fields$/i,'Edit profile'],[/^verify contact$/i,'Verify contact'],[/^manage consent$/i,'Manage consent'],[/^request data export$/i,'Request export'],[/^revoke session$/i,'Revoke session'],
    [/^call emergency service$/i,'Call emergency'],[/^contact emergency network$/i,'Emergency support'],[/^share location\/summary with explicit consent$/i,'Share safely'],[/^open emergency contact$/i,'Emergency contact'],[/^cancel accidental activation$/i,'Cancel'],
    [/^start case$/i,'Start a case'],[/^open full case detail$/i,'View case'],[/^message\/respond$/i,'Message'],[/^attach document$/i,'Attach document'],[/^export case transcript$/i,'Export transcript'],[/^call\/contact channel$/i,'Contact'],
  ];
  for(const [re,label] of labels) if(re.test(s)) return label;
  if(/^dismiss/i.test(s))return 'Dismiss';
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
function featureMeta(feature){const s=String(feature||'').toLowerCase();if(/availability|queue|status|freshness|eta/.test(s))return 'Current status updates securely when available.';if(/provider|location|facility|pharmacy/.test(s))return 'Verified directory details appear here.';if(/amount|price|shortfall|payment|benefit|cover|claim/.test(s))return 'Authoritative values appear from the owning service.';if(/result|report|document|record/.test(s))return 'Secure record details appear here when available.';return 'Details update securely when available.';}
function featureCard(feature,index,kind='compact'){return `<article class="dh-list-row dh-feature-row ${kind}" data-ui="feature-${index}" data-feature-id="f${index}"><span class="dh-icon">${iconSvg(feature)}</span><div class="dh-list-main"><div class="dh-list-title">${esc(displayFeature(feature))}</div><div class="dh-list-meta">${esc(featureMeta(feature))}</div></div></article>`;}
function renderRegion(region, idx, task, features, actions) {
  const fs=region.feature_refs.map((i)=>({i,label:features[i]})).filter((f)=>!/notifications? badge/i.test(String(f.label))), as=region.action_refs.map((i)=>({i,label:actions[i]}));
  const id=`region-${idx}-${region.type}`, variantClass=`dh-v-${region.variant}`;
  if(region.type==='hero') return `<section class="dh-hero dh-dsl-hero ${variantClass}" data-ui="${id}" ${fs[0]?`data-feature-id="f${fs[0].i}"`:''}><div class="dh-hero-copy"><span class="dh-eyebrow">${esc(task.business_unit||'Dial Health')}</span><h1>${esc(task.title)}</h1><p>${esc(heroSubtitle(task))}</p>${as[0]?compactButton(as[0].label,as[0].i,true):''}</div><div class="dh-hero-mark">${heroArtwork(task)}</div></section>`;
  if(region.type==='action_grid'){const gridTitle=/consumer home/i.test(String(task.archetype||''))?'Quick actions':/guided choice/i.test(String(task.archetype||''))?'Choose an option':'Actions';return `<section class="dh-section dh-dsl-actions ${variantClass}" data-ui="${id}" ${fs[0]?`data-feature-id="f${fs[0].i}"`:''}><div class="dh-section-head"><div class="dh-section-title">${gridTitle}</div></div><div class="dh-action-grid">${as.slice(0,4).map((a)=>actionTile(a.label,a.i)).join('')}</div></section>`;}
  if(region.type==='search') return `<section class="dh-section dh-search-section ${variantClass}" data-ui="${id}"><div class="dh-search-wrap"><span class="dh-icon">${iconSvg('search')}</span><input id="search-${idx}" class="dh-search" aria-label="Search ${esc(task.title)}" placeholder="${esc(displayFeature(fs[0]?.label||`Search ${task.title}`))}" />${as[0]?`<button class="dh-search-go" aria-label="${esc(displayAction(as[0].label))}" data-action="${esc(actionId(as[0].label,as[0].i))}">${iconSvg('search')}</button>`:''}</div></section>`;
  if(region.type==='segmented') {
    if(fs.length<=1) return `<section class="dh-section dh-filter-row ${variantClass}" data-ui="${id}"><span class="dh-filter-label">${esc(displayFeature(fs[0]?.label||'Filters'))}</span>${as[0]?`<button class="dh-filter-button" data-action="${esc(actionId(as[0].label,as[0].i))}">${esc(displayAction(as[0].label))}</button>`:''}</section>`;
    return `<section class="dh-section ${variantClass}" data-ui="${id}"><div class="dh-segmented" role="tablist">${fs.slice(0,3).map((f,i)=>as[i]?`<button role="tab" aria-selected="${i===0?'true':'false'}" data-action="${esc(actionId(as[i].label,as[i].i))}">${esc(displayFeature(f.label))}</button>`:`<span role="tab" aria-selected="${i===0?'true':'false'}">${esc(displayFeature(f.label))}</span>`).join('')}</div></section>`;
  }
  if(region.type==='metrics') return `<section class="dh-section ${variantClass}" data-ui="${id}"><div class="dh-section-head"><div class="dh-section-title">At a glance</div></div><div class="dh-metric-grid">${fs.slice(0,4).map((f)=>`<article class="dh-card dh-metric" data-ui="metric" data-feature-id="f${f.i}"><span class="dh-metric-label">${esc(displayFeature(f.label))}</span><strong>—</strong><small>Live value</small></article>`).join('')}</div></section>`;
  if(region.type==='timeline') return `<section class="dh-section dh-card dh-pad ${variantClass}" data-ui="${id}"><div class="dh-section-title">Journey</div><div class="dh-timeline">${fs.slice(0,4).map((f,i)=>`<div class="dh-timeline-item" data-feature-id="f${f.i}"><span>${i+1}</span><div><strong>${esc(displayFeature(f.label))}</strong><small>Current status from the service</small></div></div>`).join('')}</div></section>`;
  if(region.type==='form') return `<section class="dh-section dh-card dh-pad ${variantClass}" data-ui="${id}"><div class="dh-section-title">${esc(task.title)}</div>${fs.slice(0,3).map((f)=>`<label class="dh-field"><span>${esc(displayFeature(f.label))}</span><div class="dh-field-surface">Select or enter information</div></label>`).join('')}${as[0]?`<div class="dh-inline-actions">${compactButton(as[0].label,as[0].i,true)}</div>`:''}</section>`;
  if(region.type==='confirmation') return `<section class="dh-section dh-card dh-pad dh-confirmation ${variantClass}" data-ui="${id}"><span class="dh-confirm-icon">✓</span><div><div class="dh-section-title">${esc(task.title)}</div>${fs.slice(0,3).map((f)=>`<p data-feature-id="f${f.i}">${esc(displayFeature(f.label))}</p>`).join('')}</div>${as.slice(0,2).map((a,i)=>compactButton(a.label,a.i,i===0)).join('')}</section>`;
  if(region.type==='emergency') return `<section class="dh-section dh-emergency ${variantClass}" data-ui="${id}"><span class="dh-icon">${iconSvg('emergency')}</span><div><strong>${esc(displayFeature(fs[0]?.label||task.title))}</strong><p>Use the documented urgent route when this situation applies.</p></div>${as[0]?compactButton(as[0].label,as[0].i,true):''}</section>`;
  if(region.type==='highlight'){
    const primary=fs[0], secondary=fs[1], text=String(primary?.label||task.title);
    const kicker=/next|required action|appointment|earliest alternative|queue/i.test(text)?'Up next':/cover|payment|status|benefit|eligib/i.test(text)?'Status':/contact|access|support|safety/i.test(text)?'Good to know':'Important';
    return `<section class="dh-section dh-featured ${variantClass}" data-ui="${id}" ${primary?`data-feature-id="f${primary.i}"`:''}><div class="dh-featured-icon"><span class="dh-icon">${iconSvg(primary?.label||task.title)}</span></div><div class="dh-featured-main"><span class="dh-kicker">${kicker}</span><strong>${esc(displayFeature(primary?.label||task.title))}</strong>${secondary?`<small>${esc(displayFeature(secondary.label))}</small>`:`<small>${esc(featureMeta(primary?.label||task.title))}</small>`}</div>${as[0]?compactButton(as[0].label,as[0].i,region.prominence==='primary'):''}</section>`;
  }
  if(task.screen_id==='MH-S003'&&region.type==='detail') return `<section class="dh-section dh-provider-card ${variantClass}" data-ui="${id}" ${fs[0]?`data-feature-id="f${fs[0].i}"`:''}><div class="dh-provider-avatar">${iconSvg('provider')}</div><div class="dh-provider-main"><span class="dh-kicker">Provider profile</span><strong>${esc(displayFeature(fs[0]?.label||'Provider details'))}</strong><small>${esc(fs.slice(1).map((f)=>displayFeature(f.label)).join(' · ')||'Credentials and services')}</small><div class="dh-provider-tags"><span>Credentials</span><span>Services</span><span>Location</span></div></div></section>`;
  if(region.type==='list'&&/transaction collection|record collection/i.test(String(task.archetype||''))&&fs.length>1){const lead=fs[0],meta=fs.slice(1).map((f)=>displayFeature(f.label)).join(' · ');return `<section class="dh-section ${variantClass}" data-ui="${id}"><div class="dh-section-head"><div class="dh-section-title">${/claim/i.test(task.title)?'Recent claims':/pre-author/i.test(task.title)?'Requests':'Recent records'}</div></div><article class="dh-collection-card" ${lead?`data-feature-id="f${lead.i}"`:''}><span class="dh-icon">${iconSvg(task.title)}</span><div class="dh-list-main"><div class="dh-list-title">${esc(displayFeature(lead?.label||task.title))}</div><div class="dh-list-meta">${esc(meta||'Secure details')}</div></div><span class="dh-chip">Status</span></article>${as.length?`<div class="dh-inline-actions">${as.slice(0,2).map((a,i)=>compactButton(a.label,a.i,i===0&&region.prominence==='primary')).join('')}</div>`:''}</section>`;}
  const title = region.type==='document_list'?'Documents':region.type==='support'?'Help & support':region.type==='detail'?'Details':/guided choice/i.test(String(task.archetype||''))?'Options':/focused detail/i.test(String(task.archetype||''))?'Provider information':/settings/i.test(String(task.archetype||''))?'Preferences':'Recent';
  return `<section class="dh-section ${variantClass}" data-ui="${id}"><div class="dh-section-head"><div class="dh-section-title">${title}</div></div><div class="dh-list">${fs.slice(0,3).map((f)=>featureCard(f.label,f.i,region.type)).join('')}</div>${as.length?`<div class="dh-inline-actions">${as.slice(0,2).map((a,i)=>compactButton(a.label,a.i,i===0&&region.prominence==='primary')).join('')}</div>`:''}</section>`;
}

const DSL_CSS = `
.dh-shell{width:100%;max-width:760px;margin:0 auto;padding-top:10px}.dh-dsl-header{display:flex;align-items:center;justify-content:space-between;min-height:48px;margin-bottom:8px}.dh-brand-lockup{display:flex;align-items:center;gap:9px;font-weight:850;letter-spacing:-.02em}.dh-brand-mark{position:relative;width:32px;height:32px;display:inline-block;flex:0 0 32px}.dh-brand-mark i{position:absolute;width:14px;height:14px;border-radius:6px;background:var(--dh-teal)}.dh-brand-mark i:nth-child(1){left:9px;top:0}.dh-brand-mark i:nth-child(2){right:0;top:9px;background:var(--dh-aqua)}.dh-brand-mark i:nth-child(3){left:9px;bottom:0;background:#087f79}.dh-brand-mark i:nth-child(4){left:0;top:9px;background:#1fb7b0}.dh-screen-title{font-size:12px;color:var(--dh-muted);font-weight:750}.dh-header-status{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:#f2f8fa;border:1px solid var(--dh-border)}.dh-header-status .dh-icon{width:32px;height:32px;background:transparent}.dh-dsl-hero{display:grid;grid-template-columns:minmax(0,1fr) 68px;align-items:center;gap:14px;min-height:142px;padding:18px;background:linear-gradient(135deg,var(--dh-navy),#0b6175 72%,var(--dh-teal));box-shadow:0 12px 28px rgba(5,37,72,.12)}.dh-hero-copy h1{font-size:29px;line-height:1.04;margin:4px 0 0}.dh-hero-copy p{font-size:13px;line-height:1.45;max-width:250px;margin-top:8px}.dh-eyebrow{font-size:10px;font-weight:850;text-transform:uppercase;letter-spacing:.09em;color:rgba(255,255,255,.72)}.dh-hero-copy .dh-inline-cta{margin-top:12px;background:#fff;color:var(--dh-navy);border-color:#fff}.dh-hero-mark{width:64px;height:64px;border-radius:22px;background:rgba(255,255,255,.12);display:grid;place-items:center}.dh-hero-mark svg{width:32px;height:32px;stroke:#fff;fill:none;stroke-width:1.8}.dh-hero-mark .dh-wellness-art{width:76px;height:76px;stroke:none}.dh-dsl-hero.dh-v-split .dh-hero-mark .dh-wellness-art{width:78px;height:78px}.dh-pad{padding:14px}.dh-inline-cta{min-height:44px;width:auto;padding:0 14px;border-radius:12px;font-size:12px;font-weight:850;justify-content:center}.dh-inline-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.dh-dsl-action-tile{min-height:86px!important;padding:12px!important;gap:7px!important;box-shadow:0 4px 14px rgba(8,44,92,.045)!important}.dh-dsl-action-tile strong{font-size:13px;line-height:1.2;color:var(--dh-ink)}.dh-dsl-action-tile .dh-icon{width:38px;height:38px}.dh-feature-row{min-height:66px!important;padding:10px 12px!important;box-shadow:none}.dh-feature-row .dh-icon{width:38px;height:38px}.dh-featured{display:grid;grid-template-columns:44px minmax(0,1fr);align-items:center;gap:11px;background:linear-gradient(135deg,#f2fbfb,#edf6fa);border:1px solid #d8e9ec;border-radius:18px;padding:14px}.dh-featured-icon .dh-icon{width:42px;height:42px}.dh-featured-main{min-width:0}.dh-featured-main .dh-kicker{display:block;color:var(--dh-teal-deep);font-size:10px;font-weight:850;text-transform:uppercase;letter-spacing:.07em}.dh-featured-main strong{display:block;font-size:15px;color:var(--dh-ink);margin-top:2px}.dh-featured-main small{display:block;color:var(--dh-muted);font-size:11px;line-height:1.35;margin-top:3px}.dh-featured>.dh-inline-cta{grid-column:2;justify-self:start;margin-top:2px;max-width:100%}.dh-search-section{margin-top:16px}.dh-search-wrap{display:flex;align-items:center;gap:8px;background:#fff;border:1px solid var(--dh-border);border-radius:15px;padding:4px 5px 4px 10px;box-shadow:0 5px 18px rgba(8,44,92,.045)}.dh-search-wrap .dh-search{border:0;background:transparent;flex:1;min-width:0;box-shadow:none}.dh-search-go{width:44px!important;height:44px!important;min-width:44px!important;min-height:44px!important;border:0;border-radius:12px;background:var(--dh-teal);color:#fff;display:grid;place-items:center}.dh-search-go svg{width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.dh-field-label,.dh-field>span{display:block;font-size:12px;font-weight:800;color:var(--dh-muted);margin-bottom:6px}.dh-field{display:block;margin-top:12px}.dh-field-surface{min-height:48px;border:1px solid var(--dh-border);border-radius:13px;background:#f8fbfc;padding:14px;color:var(--dh-muted);font-size:13px}.dh-metric-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.dh-metric{padding:13px;box-shadow:none}.dh-metric span,.dh-metric small{display:block;color:var(--dh-muted);font-size:11px}.dh-metric strong{display:block;margin:6px 0 3px;font-size:18px}.dh-timeline{display:grid;gap:11px;margin-top:12px}.dh-timeline-item{display:grid;grid-template-columns:30px 1fr;gap:10px;align-items:start}.dh-timeline-item>span{width:28px;height:28px;border-radius:50%;background:var(--dh-mint);display:grid;place-items:center;font-size:12px;font-weight:850;color:var(--dh-teal-deep)}.dh-timeline-item small{display:block;color:var(--dh-muted);margin-top:2px}.dh-confirmation{display:grid;grid-template-columns:42px 1fr;gap:12px}.dh-confirm-icon{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;background:#e5f6f1;color:var(--dh-positive);font-weight:900}.dh-confirmation p{margin:5px 0;color:var(--dh-muted);font-size:13px}.dh-confirmation .dh-compact-action{grid-column:1/-1}.dh-emergency{display:grid;grid-template-columns:42px 1fr;gap:11px;border:1px solid #f0caca;background:#fff7f7;border-radius:17px;padding:14px}.dh-emergency p{margin:4px 0 0;color:#7f4a4a;font-size:12px}.dh-emergency .dh-compact-action{grid-column:1/-1}.dh-more{margin-top:14px;border-top:1px solid var(--dh-border);padding-top:10px}.dh-more summary{cursor:pointer;color:var(--dh-teal-deep);font-size:13px;font-weight:800;padding:8px 0}.dh-more:not([open])>:not(summary){display:none!important}.dh-more .dh-list{margin-top:7px}.dh-more-actions{display:grid;gap:8px;margin-top:8px}.dh-dsl-bottom-nav{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px;margin:18px -18px -18px;padding:9px 12px 12px;background:rgba(255,255,255,.985);border-top:1px solid var(--dh-border);border-radius:16px 16px 0 0;box-shadow:0 -8px 24px rgba(8,44,92,.07)}body[data-platform="android_mobile"] .dh-dsl-bottom-nav,body[data-platform="ios_mobile"] .dh-dsl-bottom-nav{position:fixed;left:18px;right:18px;bottom:0;margin:0;z-index:30;max-width:724px;margin-left:auto;margin-right:auto}.dh-has-bottom-nav{padding-bottom:78px}.dh-dsl-bottom-nav button{border:0;background:transparent;color:var(--dh-muted);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-width:0!important;padding:4px 2px;font-size:10px;font-weight:750}.dh-dsl-bottom-nav button.active{color:var(--dh-teal-deep)}.dh-nav-icon{width:22px;height:22px;display:grid;place-items:center}.dh-nav-icon svg{width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.dh-dsl-hero.dh-v-split{grid-template-columns:minmax(0,1fr) 88px;min-height:154px}.dh-dsl-hero.dh-v-split .dh-hero-mark{width:82px;height:82px;border-radius:28px}.dh-dsl-hero.dh-v-soft{background:linear-gradient(135deg,#0b3f66,#0b6d75);box-shadow:0 8px 24px rgba(5,37,72,.09)}.dh-dsl-hero.dh-v-compact{min-height:108px;padding:14px 16px;grid-template-columns:minmax(0,1fr) 54px}.dh-dsl-hero.dh-v-compact .dh-hero-mark{width:52px;height:52px;border-radius:18px}.dh-dsl-hero.dh-v-compact .dh-hero-copy h1{font-size:25px}.dh-dsl-hero.dh-v-compact .dh-hero-copy p{font-size:12px;margin-top:6px}.dh-dsl-actions.dh-v-compact .dh-action-card{min-height:72px!important;display:grid;grid-template-columns:34px 1fr;align-items:center}.dh-dsl-actions.dh-v-compact .dh-icon{width:34px;height:34px}.dh-dsl-actions.dh-v-feature-first .dh-action-card:first-child{grid-column:1/-1;min-height:78px!important;display:grid;grid-template-columns:40px 1fr;align-items:center;background:linear-gradient(135deg,#f2fbfb,#edf6fa)}.dh-featured.dh-v-status{border-left:4px solid var(--dh-teal);background:#fff}.dh-featured.dh-v-soft{box-shadow:none}.dh-list.dh-v-cards .dh-list-row,.dh-v-cards .dh-list-row{box-shadow:0 5px 16px rgba(8,44,92,.055)}.dh-v-compact .dh-list-row{min-height:58px!important}.dh-v-rich .dh-list-row{min-height:76px!important}.dh-v-strip .dh-metric-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.dh-v-compact .dh-timeline-item{gap:8px}.dh-v-single-step .dh-field:not(:first-of-type){display:none}.dh-v-grouped .dh-list-row{background:#f8fbfc}.dh-confirmation.dh-v-success{border-color:#cde9df;background:linear-gradient(135deg,#f5fcf9,#fff)}.dh-emergency.dh-v-urgent{border-width:2px}.dh-emergency.dh-v-calm{background:#fff;border-color:#e5dada}
@media(max-width:520px){.dh-featured>.dh-inline-cta{grid-column:2;width:auto;max-width:165px;justify-self:start}.dh-featured{align-items:start}.dh-dsl-hero.dh-v-split{grid-template-columns:minmax(0,1fr) 72px;min-height:146px}.dh-dsl-hero.dh-v-split .dh-hero-mark{width:68px;height:68px;border-radius:22px}.dh-inline-cta{white-space:normal;line-height:1.2;padding:10px 13px}.dh-action-card{min-width:0}.dh-action-card strong{overflow-wrap:anywhere}}

.dh-subpage-header{height:54px;min-height:54px;margin:0 -18px 16px;padding:0 18px;background:linear-gradient(90deg,var(--dh-navy),#083f6b);color:#fff;border-radius:0 0 14px 14px;display:grid;grid-template-columns:34px 1fr 34px;align-items:center}.dh-subpage-header strong{text-align:center;color:#fff;font-size:15px;font-weight:800;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dh-back-glyph{font-size:32px;line-height:1;color:#fff;font-weight:300;margin-top:-2px}.dh-header-spacer{width:34px}.dh-subpage-screen .dh-shell{padding-top:0}.dh-subpage-screen .dh-section:first-child{margin-top:12px}
.dh-home-screen .dh-action-grid{grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.dh-home-screen .dh-dsl-action-tile{min-height:82px!important;padding:9px 6px!important;align-items:center!important;text-align:center!important;justify-content:center!important}.dh-home-screen .dh-dsl-action-tile strong{font-size:11px;line-height:1.15;text-align:center}.dh-home-screen .dh-dsl-action-tile .dh-icon{width:36px;height:36px}.dh-home-screen .dh-featured.dh-v-status{background:linear-gradient(120deg,#074a70,#087f79);border:0;color:#fff;box-shadow:0 10px 24px rgba(5,62,91,.14)}.dh-home-screen .dh-featured.dh-v-status .dh-kicker,.dh-home-screen .dh-featured.dh-v-status strong,.dh-home-screen .dh-featured.dh-v-status small{color:#fff}.dh-home-screen .dh-featured.dh-v-status .dh-icon{background:rgba(255,255,255,.16);color:#fff}.dh-home-screen .dh-featured.dh-v-status .dh-inline-cta{background:rgba(255,255,255,.94);border-color:rgba(255,255,255,.94);color:var(--dh-navy)}.dh-home-screen .dh-v-compact .dh-list-row{background:linear-gradient(135deg,#f3f9fb,#eef6fa)}
.dh-dsl-bottom-nav{grid-template-columns:repeat(5,minmax(0,1fr))}.dh-dsl-bottom-nav .dh-nav-static{color:var(--dh-muted);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;font-size:10px;font-weight:750}.dh-dsl-bottom-nav .dh-nav-static.active{color:var(--dh-teal-deep)}
.dh-confirmation>.dh-inline-cta,.dh-emergency>.dh-inline-cta{grid-column:2;justify-self:start;max-width:210px;white-space:normal;text-align:center}.dh-confirmation .dh-section-title{font-size:20px}.dh-confirmation p{font-size:12px;line-height:1.35}.dh-emergency{grid-template-columns:42px minmax(0,1fr)}

.dh-filter-row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px}.dh-filter-label{font-size:12px;font-weight:800;color:var(--dh-muted);background:#eef4f7;border-radius:999px;padding:8px 12px}.dh-filter-button{min-height:38px;border:1px solid var(--dh-border);border-radius:11px;background:#fff;color:var(--dh-ink);font-size:12px;font-weight:800;padding:0 12px}.dh-provider-card{display:grid;grid-template-columns:72px minmax(0,1fr);gap:14px;align-items:center;padding:16px;background:linear-gradient(135deg,#fff,#f2f9fb);border:1px solid var(--dh-border);border-radius:20px;box-shadow:0 8px 24px rgba(8,44,92,.055)}.dh-provider-avatar{width:72px;height:72px;border-radius:20px;background:linear-gradient(145deg,var(--dh-mint),#eaf5fa);display:grid;place-items:center;color:var(--dh-ink)}.dh-provider-avatar svg{width:36px;height:36px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.dh-provider-main .dh-kicker{font-size:10px;text-transform:uppercase;letter-spacing:.08em;font-weight:850;color:var(--dh-teal-deep)}.dh-provider-main strong{display:block;font-size:18px;margin-top:2px}.dh-provider-main small{display:block;color:var(--dh-muted);font-size:12px;margin-top:4px}.dh-provider-tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:9px}.dh-provider-tags span{font-size:10px;font-weight:800;color:var(--dh-teal-deep);background:var(--dh-mint);padding:5px 7px;border-radius:999px}.dh-collection-card{min-height:82px;padding:13px;border-radius:17px;background:#fff;border:1px solid var(--dh-border);box-shadow:0 5px 16px rgba(8,44,92,.05);display:grid;grid-template-columns:42px minmax(0,1fr) auto;align-items:center;gap:11px}.dh-collection-card .dh-chip{align-self:center}.dh-dsl-bottom-nav>button>span:last-child,.dh-dsl-bottom-nav>.dh-nav-static>span:last-child{font-size:8.5px;line-height:1.08;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:clip;max-width:68px}.dh-home-screen .dh-more{display:none}
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
  const navCandidates=homeNav?actionCatalog.map((item,i)=>({item,i})).filter(({item})=>item.route&&String(item.route).startsWith('/my-health/')).slice(0,4):[];
  const bottomNav=navCandidates.length?`<nav class="dh-dsl-bottom-nav" data-ui="primary-navigation"><span class="active dh-nav-static"><span class="dh-nav-icon">${iconSvg('health home')}</span><span>Home</span></span>${navCandidates.map(({item,i})=>`<button data-action="${esc(actionId(item.label,i))}"><span class="dh-nav-icon">${iconSvg(item.label)}</span><span>${esc(displayAction(item.label))}</span></button>`).join('')}</nav>`:'';
  const header=homeNav?`<header class="dh-dsl-header dh-home-header" data-ui="app-header"><div class="dh-brand-lockup">${brandMark}<span>Dial Health</span></div>${headerStatus}</header>`:`<header class="dh-dsl-header dh-subpage-header" data-ui="app-header"><span class="dh-back-glyph" aria-hidden="true">‹</span><strong>${esc(task.title)}</strong><span class="dh-header-spacer" aria-hidden="true"></span></header>`;
  const semantic_html=`<main class="dh-screen ${homeNav?'dh-home-screen dh-has-bottom-nav':'dh-subpage-screen'}" data-ui="screen" data-screen-id="${esc(task.screen_id)}" data-platform="${esc(task.platform)}"><div class="dh-shell">${header}<div class="dh-dsl-body">${regions}</div>${moreInfo}${moreActions}${bottomNav}</div></main>`;
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
