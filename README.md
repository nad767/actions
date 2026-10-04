# GitHub Actions Suite

Reusable composite GitHub Actions for continuous delivery and package publishing.

| Action | Description | Documentation |
| :--- | :--- | :--- |
| **[`publish-npm-packages`](publish-npm-packages/)** | Build, prune, resolve version conflicts, and publish NPM packages to `npmjs.org` and/or GitHub Packages. | [Read Guide](publish-npm-packages/README.md) |
| **[`publish-devcontainer-features`](publish-devcontainer-features/)** | Prune, stage, semver-check, and publish Devcontainer Features to GitHub Container Registry (`ghcr.io`). | [Read Guide](publish-devcontainer-features/README.md) |
| **[`publish-deb-releases`](publish-deb-releases/)** | Build `.deb` Debian bundles, generate binary wrappers, and publish assets directly to GitHub Releases. | [Read Guide](publish-deb-releases/README.md) |
