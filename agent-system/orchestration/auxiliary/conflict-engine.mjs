function norm(value) { return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' '); }
function refSet(claim) { return new Set((claim?.evidence_refs ?? []).map(String)); }

export function compareEvidencePackets(packets = []) {
  const keyed = new Map();
  const unkeyed = [];
  for (const packet of packets) {
    for (const claim of packet?.claims ?? []) {
      const entry = { packet_id: packet.task_id, model: packet.model, independence_class: packet.independence_class, ...claim };
      if (!claim.claim_key) { unkeyed.push(entry); continue; }
      const key = norm(claim.claim_key);
      const list = keyed.get(key) ?? [];
      list.push(entry); keyed.set(key, list);
    }
  }
  const disputes = [];
  const agreements = [];
  for (const [claimKey, claims] of keyed) {
    const variants = new Map();
    for (const claim of claims) {
      const value = norm(claim.claim);
      const list = variants.get(value) ?? [];
      list.push(claim); variants.set(value, list);
    }
    if (variants.size > 1) {
      disputes.push({ claim_key: claimKey, variants: [...variants.entries()].map(([value, items]) => ({ value, claims: items })) });
      continue;
    }
    const allRefs = new Set();
    const classes = new Set();
    for (const claim of claims) {
      for (const ref of refSet(claim)) allRefs.add(ref);
      if (claim.independence_class && claim.independence_class !== 'UNKNOWN') classes.add(claim.independence_class);
    }
    agreements.push({ claim_key: claimKey, claim: claims[0]?.claim ?? '', supporting_models: claims.length, independent_classes: classes.size, evidence_refs: [...allRefs], source_convergence: allRefs.size > 1 });
  }
  return {
    agreement_count: agreements.length,
    dispute_count: disputes.length,
    agreements,
    disputes,
    unkeyed_claims: unkeyed,
    model_agreement_is_truth: false,
    premium_adjudication_required: disputes.length > 0,
  };
}

export function premiumAdjudicationCandidate({ project, taskId, packets, conflict }) {
  if (!conflict?.premium_adjudication_required) return null;
  return {
    schema_version: 1,
    type: 'PREMIUM_ADJUDICATION_CANDIDATE',
    project,
    source_task_id: taskId,
    authority: 'NON_AUTHORITATIVE_AUXILIARY_EVIDENCE',
    disputed_claims: conflict.disputes,
    supporting_evidence_refs: [...new Set(packets.flatMap((p) => p.input_evidence_refs ?? []))],
    route_requirement: 'EXISTING_AUTHORIZED_PROJECT_ROUTER_ONLY',
    direct_premium_credentials_allowed: false,
    created_at: new Date().toISOString(),
  };
}
