export const ELITE_FREE_MODEL_POLICY_VERSION = 'xkiro-elite-free-v1';

export const ELITE_FREE_MODEL_CANDIDATES = Object.freeze([
  { model_id: 'deepseek/deepseek-v4-flash', tier: 1, strengths: ['reasoning', 'long_context', 'synthesis'] },
  { model_id: 'qwen/qwen3.5-omni-plus:free', tier: 1, strengths: ['reasoning', 'multimodal', 'synthesis'] },
  { model_id: 'minimax/minimax-m3:free', tier: 1, strengths: ['reasoning', 'long_context', 'synthesis'] },
  { model_id: 'mistralai/mistral-medium-3.5', tier: 2, strengths: ['reasoning', 'independent_review'] },
  { model_id: 'openai/gpt-5.3-codex-spark', tier: 2, strengths: ['technical_analysis', 'ci_evidence'] },
]);

const ELITE_BY_ID = new Map(ELITE_FREE_MODEL_CANDIDATES.map((entry) => [entry.model_id, entry]));

export function eliteModelPolicy(modelId) {
  return ELITE_BY_ID.get(String(modelId)) ?? null;
}

export function isEliteFreeCandidate(modelId) {
  return ELITE_BY_ID.has(String(modelId));
}

export function eliteCandidateIds() {
  return ELITE_FREE_MODEL_CANDIDATES.map((entry) => entry.model_id);
}
