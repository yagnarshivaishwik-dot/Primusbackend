## Supply-Chain Security and Free Checks

- **Signed commits**
  - Generate a GPG key: `gpg --full-generate-key`.
  - Add the public key to your Git hosting provider.
  - Configure git to sign by default: `git config commit.gpgsign true`.
  - Enforce in branch protection: require **signed commits** and disallow force-pushes on `main` and `security/oss-baseline`.

- **Branch protection**
  - Require PRs with at least one review.
  - Require status checks to pass (e.g. CI workflow from `ci/oss-security-baseline.yml`).
  - Optionally require linear history and restrict who can push.

- **Artifact signing with cosign**
  - Install cosign (see `ci/oss-security-baseline.yml` for GitHub Actions).
  - Generate a test key: `cosign generate-key-pair` (do **not** commit private keys).
  - Sign an image: `COSIGN_EXPERIMENTAL=1 cosign sign --key cosign.key primus/fastapi-security-demo:latest`.
  - Verify: `cosign verify --key cosign.pub primus/fastapi-security-demo:latest`.

- **Free supply-chain checks**
  - Enable vulnerability scanning on your registry where available (e.g. GHCR, Docker Hub free tier).
  - Run Trivy locally as a pre-push hook: `trivy image primus/fastapi-security-demo:latest`.
  - Periodically review dependency manifests (`requirements.txt`, `package.json`) with `pip-audit` or `npm audit` as free tooling.


