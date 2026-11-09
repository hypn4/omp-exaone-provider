# K-EXAONE 2.5 for Oh My Pi (OMP)

[English](README.md) | [한국어](README.ko.md)

**omp-exaone-provider** is an open-source EXAONE model provider plugin for the [Oh My Pi (OMP)](https://github.com/can1357/oh-my-pi) coding agent. It connects to LG AI Research's **K-EXAONE 2.5** API and supports streaming responses, reasoning, and tool calling.

[View on npm](https://www.npmjs.com/package/omp-exaone-provider) · [Latest GitHub release](https://github.com/hypn4/omp-exaone-provider/releases/latest)

## Install from GitHub (recommended)

Requires Git and OMP `>=18.18.3 <19`. Tested with OMP `18.18.3`.

```sh
omp plugin install github:hypn4/omp-exaone-provider
omp
```

Alternatively, install from npm:

```sh
omp plugin install npm:omp-exaone-provider
```

Start a new OMP session after installation, then sign in and select the model:

```text
/login exaone
/model exaone/k-exaone_v2.5
```

Get an API key from the [EXAONE platform](https://docs.exaone.ai/en/docs/authentication). OMP masks the login input and stores the key in its authentication store.

## Usage

```sh
omp --model exaone/k-exaone_v2.5 --thinking medium
```

You can also authenticate through an environment variable:

```sh
export EXAONE_API_KEY="your-api-key"
omp --model exaone/k-exaone_v2.5
```

A key saved through `/login` takes precedence over the environment variable.

### Model support

| Setting | Value |
| --- | --- |
| Model | `exaone/k-exaone_v2.5` |
| Input | Text |
| Context window | 524,288 tokens |
| Reasoning | `low`, `medium`, `high`, `max` |
| Default reasoning when selecting the model | `max` |

- Reasoning is always enabled. OMP's `off` setting maps to `low`.
- OMP 18.18.3 limits each response to 64,000 output tokens, including reasoning. The combined input and output budget must fit the context window.
- Total output usage is reported, but separate reasoning-token statistics may be unavailable in OMP 18.18.3.
- Cost metadata reflects the [free launch pricing announced on November 9, 2026](https://docs.exaone.ai/en/docs/changelog).

See EXAONE's [model reference](https://docs.exaone.ai/en/docs/k-exaone-2.5) and [agent guide](https://docs.exaone.ai/en/docs/agent-start) for API details.

## Update or remove

Re-run the installation command for the source you used (GitHub is recommended). To remove the plugin:

```sh
omp plugin uninstall omp-exaone-provider
```

## Development

Use Bun `1.4.4`, as pinned in `package.json`.

```sh
bun install --frozen-lockfile
bun run check
omp plugin link .
```

`bun run check` runs type checking and tests without calling EXAONE. OMP loads the TypeScript extension directly; no build step is required.

To run the optional live API checks, set `EXAONE_API_KEY` and run:

```sh
bun run test:live
```

### Releases

From a clean checkout, create a version commit and tag with Bun, then push both:

```sh
bun run release:version patch
git push --follow-tags
```

Use `minor`, `major`, or an explicit version in place of `patch`. The command runs checks and synchronizes the package version before creating the tag. Pushing a stable `vX.Y.Z` tag runs CI, publishes that version to npm through trusted publishing, and creates a GitHub Release. The tag and committed package version must match so GitHub and npm installations report the same version.

## License

[MIT](LICENSE)
