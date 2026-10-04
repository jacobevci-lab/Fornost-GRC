"""Isolated CI fixture: prove a local account survives an actual restore."""
import hashlib
import http.cookiejar
import json
import os
from pathlib import Path
import secrets
import ssl
import sys
import urllib.request

os.umask(0o077)
action, state_arg, port = sys.argv[1:]
assert action in ('init', 'check') and port.isdigit()
state = Path(state_arg)
base = 'https://127.0.0.1:' + port
# CI installer generates a self-signed certificate on this fixed loopback endpoint.
context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
context.check_hostname = False
context.verify_mode = ssl.CERT_NONE
opener = urllib.request.build_opener(urllib.request.HTTPSHandler(context=context), urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
def post(body):
    request = urllib.request.Request(base + '/fornost-grc/api/auth', data=json.dumps(body).encode(), headers={'Content-Type': 'application/json', 'Origin': base})
    with opener.open(request, timeout=30) as response:
        assert response.status == 200
        return json.load(response)

if action == 'init':
    password = secrets.token_urlsafe(32) + 'aA1!'
    (state / 'restore-test-password').write_text(password)
    key = (state / 'settings-encryption.key').read_text().strip()
    post({'action': 'authorize_bootstrap', 'token': hashlib.sha256(('fornost-bootstrap-v1:' + key).encode()).hexdigest()})
    post({'action': 'bootstrap', 'name': 'Restore Drill', 'email': 'restore-drill@fornost.test', 'password': password})
else:
    post({'action': 'login', 'email': 'restore-drill@fornost.test', 'password': (state / 'restore-test-password').read_text()})
    with opener.open(base + '/fornost-grc/api/auth', timeout=30) as response:
        body = json.load(response)
        assert not body['bootstrapRequired'], 'Restored database lost its admin account'
    print('Recovered database login verified.')
