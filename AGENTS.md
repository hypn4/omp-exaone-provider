# Contributor and agent guidance

This repository is the public Oh My Pi (OMP) provider for EXAONE. Keep changes small, testable, and compatible with the OMP versions declared in package.json.

## Source of truth

- `src/index.ts` registers the provider and credential handling; `src/provider.ts` defines its model and transport integration.
- `test/provider.test.ts` covers behavior through OMP's native transport. Extend these tests for changed behavior, including streaming, reasoning, tools, retries, cancellation, and authentication.
- Prefer public OMP extension APIs and its built-in transport/retry logic. Avoid redundant networking layers, hardcoded tokens, and unnecessary dependencies.
- `package.json` is the source of truth for the package version, supported OMP peer range, Bun version (`packageManager`), and npm `files` list; commit `bun.lock` in sync.

## Changes and verification

- Use Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `ci:`, `chore:`). Keep unrelated changes separate.
- Use the pinned Bun version and run `bun install --frozen-lockfile`, `bun run check`, and `npm pack --dry-run --ignore-scripts` before submitting changes.
- When changing a workflow, also run `actionlint .github/workflows/*.yml` if available.
- The optional `bun run test:live` requires `EXAONE_API_KEY` and makes real, potentially billable requests; use only when explicitly needed, never in CI.
- Do not commit API keys, `.env` files, session logs, generated archives, or local runtime configuration.

## Public documentation

- `README.md` is English; `README.ko.md` is Korean. Keep install, authentication, model support, update, and release instructions aligned, including links and npm package contents.
- Always recommend `omp plugin install github:hypn4/omp-exaone-provider`; `omp plugin install npm:omp-exaone-provider` is an alternative.
- Verify OMP command syntax against the official OMP docs and installed CLI behavior. Avoid claiming support for unverified features.
- Keep public READMEs focused on users; maintainers' rules belong here, not in the package's public installation guide.
- For discoverability, keep the GitHub About description and relevant repository topics aligned with `package.json` description/keywords and both READMEs. Use accurate, natural terminology rather than keyword stuffing. Link to the npm package and GitHub releases.

## Release procedure

- Never manually change only `package.json.version` or create a tag unrelated to that version.
- On a clean `main` branch after checks, run `bun run release:version patch` (or `minor`, `major`, or an explicit version), then `git push --follow-tags`.
- The version command runs preversion checks, updates the lockfile, creates `chore(release): vX.Y.Z`, and adds an annotated `vX.Y.Z` tag.
- A stable tag push triggers `.github/workflows/publish.yml`: CI, version/repository checks, npm Trusted Publishing via GitHub OIDC, and then GitHub Release creation. Verify all jobs, npm `latest`, and provenance before declaring success.
- Never publish to npm manually for normal releases; do not add a long-lived npm token. Never reuse a published npm version or move/delete a released tag: existing provenance must remain verifiable.
- Do not rewrite shared history during normal development. If explicitly asked to clean `main` history, capture its remote SHA and use `--force-with-lease`; preserve all published release tags and their commits.
