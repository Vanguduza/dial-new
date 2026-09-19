# DIAL n8n DEV bootstrap

This directory implements the owner-approved DEV topology only:

- n8n `2.39.7` and the external task runner `2.39.7` run as containers on Hermes;
- PostgreSQL stays native on `vekl-worker`;
- PostgreSQL is available to Hermes only through `127.0.0.1:55432`, maintained by a user systemd SSH service;
- the dedicated `dial_n8n_dev` login owns the dedicated `dial_n8n_dev` database; and
- n8n's editor is published on Hermes loopback only. A separately governed reverse proxy may terminate HTTPS.

Nothing in this bootstrap reads or modifies the PROD estate, master, or DDE.

## Preconditions

Run on Hermes as the service user. The host must have Docker with Compose v2,
OpenSSH, OpenSSL, `psql`, curl, and a running user systemd manager. The SSH
target `vekl-worker` must already use key-only authentication and a pinned host
key. That account needs passwordless permission for exactly the remote
`sudo -u postgres psql` provisioning command. PostgreSQL must listen on worker
loopback port 5432; it does not need network exposure.

If the worker's SSH alias or hostname differs, set
`VEKL_WORKER_SSH_TARGET` and `VEKL_WORKER_EXPECTED_HOSTNAME`. Optionally set the
non-secret URL/port variables shown in `.env.example` before invoking:

```bash
bash deploy/n8n/dev/bootstrap.sh
```

The script is convergent. On first run it generates a 384-bit database
password, a 256-bit n8n encryption key, and a 384-bit runner token using
OpenSSL. It never prints them. They remain in
`~/.config/dial/n8n-dev/runtime.env` with mode `0600`; later runs preserve them.
It then provisions/repairs the remote role and database, installs and starts the
two user units, waits for Compose health, and runs the live proof.

## Verification and evidence

```bash
bash deploy/n8n/dev/verify.sh
```

The verifier checks both user services, `/healthz`, container health, exact
image pins, and runner liveness. Its database proof connects through the tunnel
as `dial_n8n_dev` and reports the database, role, PostgreSQL data directory and
server address alongside the independently queried SSH hostname. It prints no
credential. A successful proof names `vekl-worker`; therefore a local Hermes
PostgreSQL instance cannot satisfy it.

For diagnosis without disclosing the environment file:

```bash
systemctl --user status dial-n8n-dev-db-tunnel.service dial-n8n-dev.service
journalctl --user -u dial-n8n-dev-db-tunnel.service -u dial-n8n-dev.service
```

Stopping `dial-n8n-dev.service` removes DEV containers but retains the n8n data
volume and the remote database. Secret rotation is deliberate: stop the service,
replace the selected value in the protected environment file, rerun the
bootstrap (which reconciles the database password), then verify again.
