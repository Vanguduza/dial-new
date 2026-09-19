import fs from 'node:fs';
import path from 'node:path';

const required = (condition, failure, failures) => {
  if (!condition) failures.push(failure);
};

export function inspectN8nDevDeployment({ repoDir, readFile = fs.readFileSync } = {}) {
  const devDir = path.join(repoDir, 'deploy/n8n/dev');
  const compose = readFile(path.join(devDir, 'docker-compose.yml'), 'utf8');
  const bootstrap = readFile(path.join(devDir, 'bootstrap.sh'), 'utf8');
  const verify = readFile(path.join(devDir, 'verify.sh'), 'utf8');
  const tunnel = readFile(path.join(devDir, 'systemd/dial-n8n-dev-db-tunnel.service.in'), 'utf8');
  const service = readFile(path.join(devDir, 'systemd/dial-n8n-dev.service.in'), 'utf8');
  const failures = [];

  required(!/^\s+[^#\n]*postgres:\s*$/m.test(compose) && !/image:\s*postgres(?::|\s)/.test(compose), 'DEV_EMBEDS_POSTGRES', failures);
  required(/image:\s*n8nio\/n8n:2\.39\.7/.test(compose), 'N8N_NOT_PINNED_2_39_7', failures);
  required(/image:\s*n8nio\/runners:2\.39\.7/.test(compose), 'RUNNER_NOT_PINNED_2_39_7', failures);
  required(/N8N_RUNNERS_MODE:\s*external/.test(compose), 'EXTERNAL_RUNNER_MODE_MISSING', failures);
  required((compose.match(/N8N_RUNNERS_AUTH_TOKEN/g) || []).length >= 2, 'RUNNER_AUTH_NOT_SHARED_SECURELY', failures);
  required(/DB_POSTGRESDB_HOST:\s*host\.docker\.internal/.test(compose), 'DB_DOES_NOT_USE_HOST_TUNNEL', failures);
  required(/127\.0\.0\.1:\$\{N8N_DEV_HTTP_PORT/.test(compose), 'EDITOR_NOT_LOOPBACK_BOUND', failures);
  required(/127\.0\.0\.1:@TUNNEL_PORT@:127\.0\.0\.1:5432/.test(tunnel), 'DB_TUNNEL_NOT_LOOPBACK_ONLY', failures);
  required(/ExitOnForwardFailure=yes/.test(tunnel) && /Restart=always/.test(tunnel), 'DB_TUNNEL_NOT_PERSISTENT', failures);
  required(/openssl rand -hex 48/.test(bootstrap) && /umask 077/.test(bootstrap), 'STRONG_SECRET_GENERATION_MISSING', failures);
  required(!/echo[^\n]*(PASSWORD|ENCRYPTION|AUTH_TOKEN)/.test(bootstrap), 'BOOTSTRAP_MAY_PRINT_SECRETS', failures);
  required(/CREATE ROLE dial_n8n_dev/.test(bootstrap) && /CREATE DATABASE dial_n8n_dev OWNER dial_n8n_dev/.test(bootstrap), 'ISOLATED_DB_PROVISIONING_MISSING', failures);
  required(/current_setting\('data_directory'\)/.test(verify) && /REMOTE_HOST/.test(verify), 'WORKER_DB_PROOF_MISSING', failures);
  required(/Requires=dial-n8n-dev-db-tunnel\.service/.test(service) && /verify\.sh"? --database-only/.test(service), 'N8N_SERVICE_NOT_GATED_BY_TUNNEL', failures);

  return { ok: failures.length === 0, failures };
}
