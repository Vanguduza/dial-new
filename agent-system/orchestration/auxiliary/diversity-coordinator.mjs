function score(route, archetype) {
  const metrics = route?.performance?.[archetype] ?? route?.performance ?? {};
  return Number(metrics.score ?? 0) || 0;
}

export function eligibleRoutes(routes, { archetype, requiredCapabilities = {}, minContext = 0 } = {}) {
  return (routes ?? []).filter((route) => {
    if (route.access_tier !== 'free') return false;
    if (!['APPROVED', 'CHAMPION', 'CHALLENGER'].includes(route.haif_status)) return false;
    if (Array.isArray(route.approved_archetypes) && !route.approved_archetypes.includes(archetype)) return false;
    if (Number(route.context_length ?? 0) < Number(minContext || 0)) return false;
    for (const [capability, required] of Object.entries(requiredCapabilities)) {
      if (required === true && route.capabilities?.[capability] !== true) return false;
    }
    return route.health_state !== 'OPEN' && route.health_state !== 'QUARANTINED';
  }).sort((a, b) => score(b, archetype) - score(a, archetype) || String(a.model_id).localeCompare(String(b.model_id)));
}

export function selectDiverseRoutes(routes, { archetype, strategy = 'S1', requiredCapabilities = {}, minContext = 0 } = {}) {
  const eligible = eligibleRoutes(routes, { archetype, requiredCapabilities, minContext });
  if (!eligible.length) return { strategy, routes: [], diversity_strength: 'NONE' };
  const count = strategy === 'S3' ? 3 : strategy === 'S2' ? 2 : 1;
  const selected = [eligible[0]];
  while (selected.length < count) {
    const usedIndependence = new Set(selected.map((r) => r.independence_class).filter((x) => x && x !== 'UNKNOWN'));
    const usedFamily = new Set(selected.map((r) => r.base_model_family).filter(Boolean));
    const next = eligible.find((route) => !selected.includes(route) && route.independence_class !== 'UNKNOWN' && !usedIndependence.has(route.independence_class))
      ?? eligible.find((route) => !selected.includes(route) && !usedFamily.has(route.base_model_family))
      ?? eligible.find((route) => !selected.includes(route));
    if (!next) break;
    selected.push(next);
  }
  const strong = selected.length > 1 && new Set(selected.map((r) => r.independence_class)).size === selected.length && !selected.some((r) => r.independence_class === 'UNKNOWN');
  return { strategy, routes: selected, diversity_strength: selected.length === 1 ? 'SINGLE' : strong ? 'STRONG' : 'WEAK' };
}
