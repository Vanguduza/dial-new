import pg from 'pg';
import { VeklPostgresResearchStore } from './vekl-research-postgres-store.mjs';

const { Pool } = pg;
export const DEFAULT_VEKL_SOCKET_DIR =
  process.env.DIAL_VEKL_PG_SOCKET_DIR || '/home/ubuntu/.local/state/dial-control-plane/vekl-pg';

export function createVeklResearchPool({
  socketDir = DEFAULT_VEKL_SOCKET_DIR,
  database = process.env.DIAL_VEKL_DATABASE || 'dial_vekl',
  user = process.env.DIAL_VEKL_DATABASE_USER || 'dial_research_loop',
  max = Number(process.env.DIAL_VEKL_DATABASE_POOL_MAX || 2),
} = {}) {
  return new Pool({
    host: socketDir,
    port: 5432,
    database,
    user,
    max: Math.max(1, Math.min(4, max || 2)),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    application_name: 'dial-vekl-research-mcp',
  });
}

export function createVeklResearchStore(options = {}) {
  const pool = options.pool || createVeklResearchPool(options);
  const store = new VeklPostgresResearchStore({
    client: pool,
    executionHostRole: process.env.DIAL_HOST_ROLE || 'dial-hermes-control',
    databaseHostRole: process.env.DIAL_VEKL_DATABASE_HOST_ROLE || 'vekl-worker',
    databaseRole: process.env.DIAL_VEKL_DATABASE_ROLE || 'AUTHORITATIVE_VEKL',
  });
  return { pool, store };
}
