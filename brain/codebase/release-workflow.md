# Release Workflow

First release `v0.1.0` established the extension's release path:

1. Prepare release docs and metadata:
   - `CHANGELOG.md` with Keep-a-Changelog style entries.
   - README install docs should prefer tagged git install, e.g. `pi install git:github.com/alexanderop/pi-brainmaxxing@v0.1.0`, with npm as an alternate path only when npm publication is actually available.
   - `package.json.files` should include `src`, `README.md`, `CHANGELOG.md`, and `LICENSE`.
   - Pi core packages and `typebox` belong in `peerDependencies` with `"*"`, while exact versions stay in `devDependencies`.
2. Verify before release:
   - `pnpm run verify`
   - `npm pack --dry-run`
   - `pnpm publish --dry-run --access public --no-git-checks`
3. Commit, tag, and push:
   - `git commit -m "chore: prepare vX.Y.Z release"`
   - `git tag -a vX.Y.Z -m "vX.Y.Z"`
   - `git push origin main --tags`
4. Create the GitHub release with `gh release create vX.Y.Z --title "vX.Y.Z" --notes-file CHANGELOG.md`.
5. Publish to npm only after registry/package access is confirmed:
   - First run `npm whoami` or `pnpm whoami`; if it returns `E401 Unauthorized`, stop and authenticate before publishing.
   - `npm view pi-brainmaxxing` returning `E404` means the package is not visible/published under the current registry/credentials; do not advertise npm install availability until fixed.
   - `pnpm publish --access public --no-git-checks`
   - For `v0.1.2`, actual publish failed after the GitHub release with `E404 Not Found - PUT https://registry.npmjs.org/pi-brainmaxxing - Not found`; the follow-up diagnostics showed `npm whoami` returned `E401 Unauthorized` and `npm view pi-brainmaxxing` returned `E404`. Treat GitHub releases and npm publication as separate outcomes, and verify npm package name/auth/permissions before advertising npm availability.

For `v0.1.0`, commit `67e32da` and tag `v0.1.0` were pushed, and the GitHub release was created at `https://github.com/alexanderop/pi-brainmaxxing/releases/tag/v0.1.0`.
