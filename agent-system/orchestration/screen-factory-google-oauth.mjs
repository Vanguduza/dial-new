#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { appendJsonl, readJson, resolveControlPath, writeJsonAtomic } from './state-store.mjs';
import { storageConfig, storageStatus } from './screen-factory-storage.mjs';

export const GOOGLE_DRIVE_OAUTH_POLICY = 'GOOGLE_OAUTH_OFFLINE_REFRESH_UNTIL_REVOKED_V1';
export const GOOGLE_DRIVE_REDIRECT_URI = 'https://vanguduza.github.io/dial-health-screen-factory-dashboard/oauth/google/callback.html';
const OAUTH_SECRET_REL = 'secrets/google-drive-oauth.json';
const PENDING_REL = 'screen-factory/google-oauth-pending.json';
const RCLONE_BIN = process.env.RCLONE_BIN || '/home/ubuntu/.local/bin/rclone';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';
const USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo';
const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const OAUTH_TTL_MS = 10 * 60_000;

function now() { return new Date().toISOString(); }
function secretPath(root) { return resolveControlPath(OAUTH_SECRET_REL, root); }
function pendingPath(root) { return resolveControlPath(PENDING_REL, root); }
function b64url(value) { return Buffer.from(value).toString('base64url'); }
function sha256(value) { return crypto.createHash('sha256').update(value).digest(); }
function randomToken(bytes = 32) { return crypto.randomBytes(bytes).toString('base64url'); }
function safeEmail(value) { return String(value || '').trim().toLowerCase(); }
function readOauthSecret(root) { return readJson(OAUTH_SECRET_REL, {}, root) || {}; }
function hasRcloneRefreshToken(root) {
  const cfg = storageConfig(root);
  try {
    const text = fs.readFileSync(cfg.rclone_config, 'utf8');
    const section = text.match(/\[dial-drive\]([\s\S]*?)(?:\n\[|$)/)?.[1] || '';
    return /^token\s*=\s*\{.+"refresh_token"\s*:\s*".+"/m.test(section);
  } catch { return false; }
}

export function googleOauthStatus(root) {
  const cfg = storageConfig(root);
  const secret = readOauthSecret(root);
  const clientConfigured = Boolean(secret.client_id && secret.client_secret);
  const refreshTokenStored = hasRcloneRefreshToken(root);
  return {
    policy: GOOGLE_DRIVE_OAUTH_POLICY,
    configured: clientConfigured,
    authenticated: refreshTokenStored,
    account_email: cfg.drive_account_email || null,
    redirect_uri: secret.redirect_uri || GOOGLE_DRIVE_REDIRECT_URI,
    scope: secret.scope || 'https://www.googleapis.com/auth/drive',
    state: refreshTokenStored ? 'CONNECTED' : (clientConfigured ? 'AUTH_REQUIRED' : 'SETUP_REQUIRED'),
  };
}

export function configureGoogleOauthClient({ clientId, clientSecret, root } = {}) {
  const id = String(clientId || '').trim();
  const secret = String(clientSecret || '').trim();
  if (!/^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/.test(id)) throw new Error('invalid Google OAuth client ID');
  if (secret.length < 12) throw new Error('invalid Google OAuth client secret');
  const cfg = storageConfig(root);
  const target = secretPath(root);
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  writeJsonAtomic(OAUTH_SECRET_REL, {
    schema_version: 1,
    policy: GOOGLE_DRIVE_OAUTH_POLICY,
    client_id: id,
    client_secret: secret,
    account_email: cfg.drive_account_email || null,
    redirect_uri: GOOGLE_DRIVE_REDIRECT_URI,
    scope: 'https://www.googleapis.com/auth/drive',
    updated_at: now(),
  }, root);
  try { fs.chmodSync(target, 0o600); } catch {}
  appendJsonl('events/screen-factory.jsonl', { event: 'SCREEN_FACTORY_GOOGLE_OAUTH_CLIENT_CONFIGURED', account_email: cfg.drive_account_email || null, at: now() }, root);
  return googleOauthStatus(root);
}

export function beginGoogleOauth({ root, forceConsent = false } = {}) {
  const cfg = storageConfig(root);
  const secret = readOauthSecret(root);
  if (!secret.client_id || !secret.client_secret) throw new Error('GOOGLE_OAUTH_CLIENT_SETUP_REQUIRED');
  const state = randomToken(32);
  const verifier = randomToken(64);
  const challenge = b64url(sha256(verifier));
  const expiresAt = new Date(Date.now() + OAUTH_TTL_MS).toISOString();
  writeJsonAtomic(PENDING_REL, {
    schema_version: 1, state, verifier, created_at: now(), expires_at: expiresAt,
    account_email: cfg.drive_account_email || null,
  }, root);
  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set('client_id', secret.client_id);
  url.searchParams.set('redirect_uri', secret.redirect_uri || GOOGLE_DRIVE_REDIRECT_URI);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', `openid email ${secret.scope || 'https://www.googleapis.com/auth/drive'}`);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  if (cfg.drive_account_email) url.searchParams.set('login_hint', cfg.drive_account_email);
  if (forceConsent || !hasRcloneRefreshToken(root)) url.searchParams.set('prompt', 'consent select_account');
  else url.searchParams.set('prompt', 'select_account');
  appendJsonl('events/screen-factory.jsonl', { event: 'SCREEN_FACTORY_GOOGLE_OAUTH_STARTED', account_email: cfg.drive_account_email || null, expires_at: expiresAt, at: now() }, root);
  return { authorization_url: url.toString(), expires_at: expiresAt, account_email: cfg.drive_account_email || null, redirect_uri: secret.redirect_uri || GOOGLE_DRIVE_REDIRECT_URI };
}

function requirePending(state, root) {
  const pending = readJson(PENDING_REL, null, root);
  if (!pending || pending.state !== state) throw new Error('GOOGLE_OAUTH_STATE_MISMATCH');
  if (Date.parse(pending.expires_at || '') <= Date.now()) throw new Error('GOOGLE_OAUTH_STATE_EXPIRED');
  return pending;
}

async function postForm(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  const text = await response.text();
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = { error_description: text.slice(0, 400) }; }
  if (!response.ok) throw new Error(`GOOGLE_OAUTH_HTTP_${response.status}: ${payload.error_description || payload.error || 'request failed'}`);
  return payload;
}

function writeRcloneToken(tokenResponse, root) {
  const cfg = storageConfig(root);
  const secret = readOauthSecret(root);
  if (!tokenResponse.refresh_token) throw new Error('GOOGLE_OAUTH_REFRESH_TOKEN_MISSING');
  const expiry = new Date(Date.now() + Math.max(60, Number(tokenResponse.expires_in || 3600)) * 1000).toISOString();
  const token = JSON.stringify({
    access_token: tokenResponse.access_token,
    token_type: tokenResponse.token_type || 'Bearer',
    refresh_token: tokenResponse.refresh_token,
    expiry,
  });
  fs.mkdirSync(path.dirname(cfg.rclone_config), { recursive: true, mode: 0o700 });
  let remotes = '';
  try { remotes = execFileSync(RCLONE_BIN, ['listremotes', '--config', cfg.rclone_config], { encoding: 'utf8', timeout: 10000 }); } catch {}
  const common = ['scope', 'drive', 'client_id', secret.client_id, 'client_secret', secret.client_secret, 'token', token];
  if (cfg.drive_root_folder_id) common.push('root_folder_id', cfg.drive_root_folder_id);
  if (remotes.split(/\r?\n/).includes('dial-drive:')) {
    execFileSync(RCLONE_BIN, ['config', 'update', 'dial-drive', ...common, '--config', cfg.rclone_config, '--non-interactive'], { timeout: 20000, stdio: 'ignore' });
  } else {
    execFileSync(RCLONE_BIN, ['config', 'create', 'dial-drive', 'drive', ...common, '--config', cfg.rclone_config, '--non-interactive'], { timeout: 20000, stdio: 'ignore' });
  }
  try { fs.chmodSync(cfg.rclone_config, 0o600); } catch {}
}

async function verifyGoogleIdentity(accessToken, expectedEmail) {
  const response = await fetch(USERINFO_ENDPOINT, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error(`GOOGLE_USERINFO_HTTP_${response.status}`);
  const info = await response.json();
  const email = safeEmail(info.email);
  if (!email || !info.email_verified) throw new Error('GOOGLE_ACCOUNT_EMAIL_UNVERIFIED');
  if (expectedEmail && email !== safeEmail(expectedEmail)) throw new Error(`GOOGLE_ACCOUNT_MISMATCH:${email}`);
  return { email, sub: info.sub || null };
}

export async function exchangeGoogleOauth({ code, state, root } = {}) {
  const authCode = String(code || '').trim();
  const authState = String(state || '').trim();
  if (!authCode || !authState) throw new Error('GOOGLE_OAUTH_CODE_AND_STATE_REQUIRED');
  const pending = requirePending(authState, root);
  const secret = readOauthSecret(root);
  const cfg = storageConfig(root);
  const tokenResponse = await postForm(TOKEN_ENDPOINT, {
    code: authCode,
    client_id: secret.client_id,
    client_secret: secret.client_secret,
    redirect_uri: secret.redirect_uri || GOOGLE_DRIVE_REDIRECT_URI,
    grant_type: 'authorization_code',
    code_verifier: pending.verifier,
  });
  const identity = await verifyGoogleIdentity(tokenResponse.access_token, cfg.drive_account_email || pending.account_email);
  writeRcloneToken(tokenResponse, root);
  try { fs.rmSync(pendingPath(root), { force: true }); } catch {}
  try {
    execFileSync('/srv/dial/repo/deploy/oracle/hermes-codex/screen-factory-storage-sync.sh', ['once'], {
      timeout: 120000, stdio: 'ignore', env: { ...process.env, DIAL_CONTROL_HOME: process.env.DIAL_CONTROL_HOME || '/var/lib/dial-control' },
    });
  } catch {}
  appendJsonl('events/screen-factory.jsonl', { event: 'SCREEN_FACTORY_GOOGLE_OAUTH_CONNECTED', account_email: identity.email, at: now() }, root);
  return { ...googleOauthStatus(root), storage: storageStatus(root), identity: { email: identity.email } };
}

export async function revokeGoogleOauth({ root } = {}) {
  const cfg = storageConfig(root);
  let revokeToken = null;
  try {
    const text = fs.readFileSync(cfg.rclone_config, 'utf8');
    const section = text.match(/\[dial-drive\]([\s\S]*?)(?:\n\[|$)/)?.[1] || '';
    const line = section.match(/^token\s*=\s*(\{.*\})\s*$/m)?.[1];
    if (line) {
      const parsed = JSON.parse(line);
      revokeToken = parsed.refresh_token || parsed.access_token || null;
    }
  } catch {}
  if (revokeToken) {
    try { await postForm(REVOKE_ENDPOINT, { token: revokeToken }); } catch {}
  }
  try { execFileSync(RCLONE_BIN, ['config', 'update', 'dial-drive', 'token', '', '--config', cfg.rclone_config, '--non-interactive'], { timeout: 15000, stdio: 'ignore' }); } catch {}
  try { fs.rmSync(pendingPath(root), { force: true }); } catch {}
  appendJsonl('events/screen-factory.jsonl', { event: 'SCREEN_FACTORY_GOOGLE_OAUTH_REVOKED', account_email: cfg.drive_account_email || null, at: now() }, root);
  return googleOauthStatus(root);
}
