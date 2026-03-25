## Container Hardening Checklist (Primus OSS Baseline)

- **Minimal base image**: use `python:3.11-slim` instead of full images.
- **Non-root user**: create an unprivileged user (e.g. `primus`) and `USER primus` in the Dockerfile.
- **Read-only root filesystem**: run containers with `read_only: true` (see docker-compose) and mount only explicit writable volumes.
- **Drop capabilities**: avoid `privileged: true` except where absolutely needed (e.g. Falco demo); drop Linux capabilities for app containers.
- **HEALTHCHECK**: define a simple `/healthz`-style endpoint and reference it from `HEALTHCHECK` in Dockerfile or Compose.
- **No secrets in image**: load DB credentials and keys from Vault or environment, not baked into the image.
- **Pinned versions**: pin base image and package versions to reduce supply-chain drift.

The `fastapi/Dockerfile` follows these practices and the main `docker-compose.yml` runs the app as non-root.


