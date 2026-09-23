#!/usr/bin/env python3
"""Owner-facing capture page for the OCI browser login on dial-control.

`oci session authenticate` (oci-cli 3.93.0) redirects the browser to http://localhost:8181/#...
and its own page reports "Authorization completed" whenever its XHR gets ANY response, even
when the #fragment was lost and no security_token arrived. On a phone, hand-editing that
address is where the fragment gets lost. This page sits in front of the CLI listener:

  GET  /          sign-in link, auto-capture when the #fragment is present, otherwise a
                  paste box for the whole localhost:8181/#... address
  POST /capture   {"url": "<pasted address or fragment>"} -> forwards the fragment to the CLI
                  listener exactly as its own page would, then reports success ONLY after
                  the session token file exists
  GET  /status    {"captured": bool}

Nothing here logs, stores or echoes the token. The tenant check in oci-edge-login.sh finish
remains the defence against a login to the wrong tenancy.
"""
import html
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

LISTEN_PORT = int(os.environ.get("DIAL_OCI_CAPTURE_PORT", "8182"))
CLI_URL = os.environ.get("DIAL_OCI_CLI_CALLBACK", "http://127.0.0.1:8181")
TOKEN_FILE = os.environ["DIAL_OCI_SESSION_TOKEN_FILE"]
AUTH_URL = os.environ.get("DIAL_OCI_AUTH_URL", "")
WAIT_SECONDS = float(os.environ.get("DIAL_OCI_CAPTURE_WAIT", "20"))
MAX_BODY = 64 * 1024

PAGE = """<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>DIAL OCI sign-in</title>
<style>
body{font-family:system-ui,sans-serif;max-width:40rem;margin:0 auto;padding:1rem;line-height:1.45}
a.btn,button{display:inline-block;padding:.7rem 1rem;border-radius:.4rem;border:0;background:#1f6feb;color:#fff;
text-decoration:none;font-size:1rem}
textarea{width:100%;min-height:7rem;font-size:.9rem;box-sizing:border-box}
#msg{margin-top:1rem;padding:.8rem;border-radius:.4rem;display:none}
.ok{background:#dafbe1;color:#0a3622}.bad{background:#ffebe9;color:#5a0a0a}.wait{background:#eef;color:#123}
</style></head><body>
<h1>DIAL OCI sign-in</h1>
<p><b>1.</b> <a class="btn" href="__AUTH__" target="_blank" rel="noopener">Sign in to OCI</a></p>
<p><b>2.</b> After signing in, the browser tries to open an address starting with
<code>http://localhost:8181/#</code> and fails. That is expected. Copy that <b>whole</b> address
(it is very long) and paste it here:</p>
<textarea id="u" placeholder="http://localhost:8181/#...security_token=..."></textarea>
<p><button id="go">Send to Dial Control</button></p>
<div id="msg"></div>
<script>
function show(cls,t){var m=document.getElementById('msg');m.className=cls;m.style.display='block';m.textContent=t;}
function send(u){
  if(u.indexOf('security_token=')<0){show('bad','That address has no security_token. Copy the full address, including everything after #.');return;}
  show('wait','Sending... waiting for Dial Control to confirm.');
  fetch('capture',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:u})})
   .then(function(r){return r.json();})
   .then(function(j){show(j.ok?'ok':'bad',j.message);})
   .catch(function(){show('bad','Could not reach Dial Control. The sign-in window may have closed; ask for a new one.');});
}
document.getElementById('go').onclick=function(){send(document.getElementById('u').value.trim());};
if(location.hash.indexOf('security_token=')>=0){send(location.href);}
</script></body></html>"""


def fragment_of(value):
    """Accept a full URL, '#...' or a bare query string; return the part after '#'."""
    value = (value or "").strip()
    if "#" in value:
        value = value.split("#", 1)[1]
    return value.lstrip("?")


def token_present():
    try:
        return os.path.getsize(TOKEN_FILE) > 0
    except OSError:
        return False


class Handler(BaseHTTPRequestHandler):
    server_version = "dial-oci-capture"
    sys_version = ""

    def log_message(self, *args):  # never log request lines: they can carry the token
        return

    def _send(self, code, body, ctype):
        data = body.encode("utf-8")
        self.send_response(code)
        self.send_header("content-type", ctype)
        self.send_header("cache-control", "no-store")
        self.send_header("referrer-policy", "no-referrer")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _json(self, code, obj):
        self._send(code, json.dumps(obj), "application/json")

    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path
        if path == "/":
            self._send(200, PAGE.replace("__AUTH__", html.escape(AUTH_URL, quote=True)), "text/html; charset=utf-8")
        elif path == "/status":
            self._json(200, {"captured": token_present()})
        else:
            self._json(404, {"ok": False, "message": "not found"})

    def do_POST(self):
        if urllib.parse.urlparse(self.path).path != "/capture":
            return self._json(404, {"ok": False, "message": "not found"})
        length = int(self.headers.get("content-length") or 0)
        if length <= 0 or length > MAX_BODY:
            return self._json(400, {"ok": False, "message": "Empty or oversized request."})
        try:
            body = json.loads(self.rfile.read(length))
            frag = fragment_of(body.get("url", ""))
        except (ValueError, AttributeError):
            return self._json(400, {"ok": False, "message": "Malformed request."})
        tokens = urllib.parse.parse_qs(frag).get("security_token", [])
        if not tokens or tokens[0].count(".") != 2:
            return self._json(400, {"ok": False, "message":
                "No usable security_token in that address. Copy the full address, including everything after #."})
        if token_present():
            return self._json(200, {"ok": True, "message": "Already captured. Tell Claude to finish."})
        # Exactly what the CLI's own page does: GET /token?<fragment>.
        try:
            urllib.request.urlopen(CLI_URL + "/token?" + frag, timeout=10).read()
        except (urllib.error.URLError, OSError):
            return self._json(502, {"ok": False, "message":
                "The sign-in listener on Dial Control is not running; the window probably expired. Ask for a new one."})
        deadline = time.monotonic() + WAIT_SECONDS
        while time.monotonic() < deadline:
            if token_present():
                return self._json(200, {"ok": True, "message": "Captured. Dial Control has the session. Tell Claude to finish."})
            time.sleep(0.5)
        return self._json(502, {"ok": False, "message":
            "Dial Control received the address but did not save a session. Ask Claude to check the login status."})


def main():
    server = ThreadingHTTPServer(("127.0.0.1", LISTEN_PORT), Handler)
    server.daemon_threads = True
    print("DIAL_OCI_CAPTURE_READY port=%d" % LISTEN_PORT, flush=True)
    server.serve_forever()


if __name__ == "__main__":
    sys.exit(main())
