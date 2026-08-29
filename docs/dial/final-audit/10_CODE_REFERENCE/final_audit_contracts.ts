export type FeatureStatus =
  | "SPECIFIED" | "MAPPED" | "CODE_PRESENT" | "DOMAIN_TESTED"
  | "INTEGRATION_GREEN" | "STAGING_GREEN" | "PRODUCTION_GREEN"
  | "CERTIFIED_DORMANT" | "ACTIVE";

export interface FeatureRecord {
  feature_id: string;
  module: string;
  outcome: string;
  owner: string;
  aggregate?: string;
  status: FeatureStatus;
  current_gate: string;
  source_doc: string;
  code_paths: string[];
  test_paths: string[];
  evidence_refs: string[];
  donor_refs: string[];
}

export interface EventualityRecord {
  id: string;
  feature_id: string;
  condition: string;
  detection: string;
  allowed_state: string;
  command: string;
  transition: string;
  financial_effect?: string;
  inventory_effect?: string;
  delivery_effect?: string;
  owner: string;
  evidence: string[];
  compensation?: string;
  operator_repair?: string;
  test_refs: string[];
}

export type DonorAdoption =
  | "PORT-WHOLESALE-QUARANTINE" | "PORT-WHOLESALE"
  | "PORT-SELECTED-MODULE" | "PORT-ALGORITHM-ENGINE"
  | "PORT-SCHEMA-WORKFLOW" | "PORT-UX-UI"
  | "LIBRARY" | "INTEGRATE-SERVICE" | "EXTERNAL-ADAPTER"
  | "REFERENCE" | "CONFORMANCE-REFERENCE"
  | "QUARANTINE-PENDING-LICENCE";
