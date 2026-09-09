export class XKiroError extends Error {
  constructor(message, { status = null, code = null, retryAfter = null, retryable = false, category = 'PROVIDER_ERROR' } = {}) {
    super(message);
    this.name = 'XKiroError';
    this.status = status;
    this.code = code;
    this.retry_after = retryAfter;
    this.retryable = retryable;
    this.category = category;
  }
}

export function classifyXKiroHttpError(status, payload = {}, headers = null) {
  const code = payload?.error?.code ?? payload?.error?.type ?? null;
  const message = payload?.error?.message ?? `xKiro returned HTTP ${status}`;
  const retryAfterRaw = headers?.get?.('retry-after') ?? null;
  const retryAfter = retryAfterRaw && Number.isFinite(Number(retryAfterRaw)) ? new Date(Date.now() + Number(retryAfterRaw) * 1000).toISOString() : null;
  if (status === 401) return new XKiroError(message, { status, code, category: 'AUTH_FAILED' });
  if (status === 403) return new XKiroError(message, { status, code, category: 'ROUTE_INELIGIBLE' });
  if (status === 402) return new XKiroError(message, { status, code, category: 'PAID_CAPACITY_REQUIRED' });
  if (status === 429) return new XKiroError(message, { status, code, retryAfter, retryable: true, category: 'RATE_OR_FREE_QUOTA_LIMITED' });
  if ([500, 502, 503].includes(status)) return new XKiroError(message, { status, code, retryAfter, retryable: true, category: 'PROVIDER_TRANSIENT' });
  if (status >= 400 && status < 500) return new XKiroError(message, { status, code, category: 'REQUEST_REJECTED' });
  return new XKiroError(message, { status, code, retryAfter, retryable: status >= 500, category: 'PROVIDER_ERROR' });
}
