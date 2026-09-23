#!/usr/bin/env python3
"""Stand-in for oci-cli 3.93.0's StoppableHttpRequestHandler: answers 200 to every GET, and only
when the query carries security_token does it 'persist the session' (write the token file).
Records each received query so the test can check what was forwarded."""
import os
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse

PORT, TOKEN_FILE, SEEN = int(sys.argv[1]), sys.argv[2], sys.argv[3]
PERSIST = os.environ.get("FAKE_PERSIST", "1") == "1"


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        return

    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        q = urlparse(self.path).query
        with open(SEEN, "a") as f:
            f.write(q + "\n")
        if "security_token" in parse_qs(q) and PERSIST:
            os.makedirs(os.path.dirname(TOKEN_FILE), exist_ok=True)
            with open(TOKEN_FILE, "w") as f:
                f.write(parse_qs(q)["security_token"][0])


HTTPServer(("127.0.0.1", PORT), H).serve_forever()
