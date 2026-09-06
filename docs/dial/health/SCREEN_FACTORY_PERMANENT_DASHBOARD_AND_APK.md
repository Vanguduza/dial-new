# Dial Health Screen Factory — Permanent Dashboard Entry & APK

Status: implemented 2026-09-05.

## Stable entry architecture

The user-facing entry URL is fixed at:

`https://vanguduza.github.io/dial-health-screen-factory-dashboard/`

The stable page contains no Screen Factory access token. It resolves a public `endpoint.json` document and loads the currently healthy protected Oracle tunnel inside the wrapper.

The Oracle host runs two persistent user services:

- `dial-health-screen-factory-public-proxy.service` — protected localhost proxy on port 9122.
- `dial-health-screen-factory-tunnel.service` — Cloudflare quick-tunnel supervisor.

The supervisor detects each newly assigned `trycloudflare.com` endpoint and commits only that non-secret base URL to the public entry repository. GitHub Pages therefore remains the stable address even when the underlying quick-tunnel hostname changes.

## Access-key boundary

The protected proxy token is never committed to the public entry repository. The stable page accepts it on first use, stores it only in browser/WebView local storage, removes it from the visible URL when supplied as a fragment, and combines it with the live tunnel only in the client.

## APK wrapper

The Android wrapper package is `zw.co.dialhealth.screenfactory` and loads only the stable GitHub Pages entrypoint. It enables JavaScript and DOM storage required by the live dashboard, rejects cleartext HTTP and mixed content, preserves WebView back navigation, and uses Android DownloadManager for platform ZIP downloads.

The APK deliberately does not embed the protected Screen Factory access key in public source. On first launch the operator supplies the key once; WebView local storage retains it for subsequent launches.

The wrapper source and reproducible build workflow live in `Vanguduza/dial-health-screen-factory-dashboard/android` and `.github/workflows/build-apk.yml`.

## Reliability boundary

The entry URL itself is stable. The current origin transport is an account-less Cloudflare Quick Tunnel supervised and automatically re-published after reconnects. This removes hostname churn from users and the APK but does not turn Quick Tunnel into an SLA-backed production service.

A future Cloudflare named tunnel and owned Dial Health hostname can replace the Quick Tunnel without changing the APK architecture; only the endpoint resolver would need to be updated. The permanent entry layer is intentionally decoupled from the origin transport.

No dashboard control action is moved into GitHub Pages. Play, Pause, Resume and Stop still execute against the protected Oracle Screen Factory APIs through the live tunnel.
