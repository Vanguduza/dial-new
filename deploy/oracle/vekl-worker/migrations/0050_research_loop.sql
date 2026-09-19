BEGIN;

CREATE TABLE IF NOT EXISTS vekl_research_missions (
  mission_id text PRIMARY KEY,
  repository_sha text NOT NULL,
  project_truth_hash text NOT NULL,
  graph_generation_id text NOT NULL,
  graph_revision_hash text NOT NULL,
  provider text NOT NULL,
  model_id text NOT NULL,
  state text NOT NULL,
  manifest_json jsonb NOT NULL,
  manifest_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vekl_research_packets (
  packet_id text PRIMARY KEY,
  mission_id text NOT NULL REFERENCES vekl_research_missions(mission_id) ON DELETE CASCADE,
  ordinal integer NOT NULL,
  unit_lineage_id text NOT NULL,
  unit_revision_hash text NOT NULL,
  packet_json jsonb NOT NULL,
  packet_hash text NOT NULL UNIQUE,
  state text NOT NULL CHECK (state IN ('READY','LEASED','RETRY','COMPLETE','REFUSED','BLOCKED')),
  worker_id text,
  lease_id text UNIQUE,
  lease_expires_at timestamptz,
  resume jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mission_id, ordinal),
  UNIQUE (mission_id, unit_lineage_id)
);

CREATE INDEX IF NOT EXISTS vekl_research_packets_queue_idx
  ON vekl_research_packets(state, ordinal, lease_expires_at);

CREATE TABLE IF NOT EXISTS vekl_research_coverage (
  mission_id text NOT NULL REFERENCES vekl_research_missions(mission_id) ON DELETE CASCADE,
  unit_lineage_id text NOT NULL,
  dimension text NOT NULL,
  status text NOT NULL,
  reason text,
  artifact_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (mission_id, unit_lineage_id, dimension)
);

CREATE TABLE IF NOT EXISTS vekl_research_idempotency (
  request_id text PRIMARY KEY,
  action text NOT NULL,
  input_hash text NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vekl_research_events (
  event_id bigserial PRIMARY KEY,
  lease_id text,
  event_kind text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vekl_research_events_lease_idx
  ON vekl_research_events(lease_id, created_at);

CREATE TABLE IF NOT EXISTS vekl_research_evidence (
  evidence_hash text PRIMARY KEY,
  lease_id text NOT NULL,
  packet_hash text NOT NULL,
  worker_id text NOT NULL,
  evidence_kind text NOT NULL CHECK (evidence_kind IN ('ANALYSIS','DEEPER_EVIDENCE','GROQ_RESEARCH')),
  claims jsonb NOT NULL,
  sources jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vekl_research_evidence_packet_idx
  ON vekl_research_evidence(packet_hash, created_at);

CREATE TABLE IF NOT EXISTS vekl_research_sources (
  source_hash text PRIMARY KEY,
  url text NOT NULL,
  source_kind text NOT NULL,
  trust_tier text,
  observed_at timestamptz NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS vekl_research_discovery_links (
  packet_id text NOT NULL REFERENCES vekl_research_packets(packet_id) ON DELETE CASCADE,
  candidate_id text NOT NULL,
  lifecycle_state text NOT NULL,
  trust_tier text NOT NULL,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  PRIMARY KEY (packet_id, candidate_id)
);

CREATE TABLE IF NOT EXISTS vekl_research_artifact_links (
  packet_id text NOT NULL REFERENCES vekl_research_packets(packet_id) ON DELETE CASCADE,
  artifact_hash text NOT NULL,
  artifact_kind text NOT NULL,
  admitted boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (packet_id, artifact_hash)
);
CREATE OR REPLACE FUNCTION vekl_research_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vekl_research_missions_touch ON vekl_research_missions;
CREATE TRIGGER vekl_research_missions_touch
BEFORE UPDATE ON vekl_research_missions
FOR EACH ROW EXECUTE FUNCTION vekl_research_touch_updated_at();

DROP TRIGGER IF EXISTS vekl_research_packets_touch ON vekl_research_packets;
CREATE TRIGGER vekl_research_packets_touch
BEFORE UPDATE ON vekl_research_packets
FOR EACH ROW EXECUTE FUNCTION vekl_research_touch_updated_at();

COMMIT;