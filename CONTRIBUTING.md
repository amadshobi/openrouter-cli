# Contributing to OpenRouter CLI

Thanks for your interest in contributing! This project is small and focused — keep it that way.

## Development setup

Requirements: [Bun](https://bun.sh) (>= 1.3)

```bash
bun install
bun run typecheck
bun run src/index.ts credits --summary   # sanity check against the live API
```

## Project layout

```
src/
  index.ts        # entry point — manual citty dispatch (do not switch to runMain)
  cli.ts          # subcommand registry
  core/           # config, client, format, errors
  commands/       # one file per subcommand
```

## Rules

- **Scope discipline.** Only change what the task asks. No speculative features, no unrelated refactors.
- **Reuse `src/core/format.ts`** (`ansi`, `bar`, `fmtUsd`, `fmtTokens`, `stripHtml`) — don't reinvent formatting.
- **Files use tab indentation.** Match surrounding style.
- **Read before you touch.** Never modify a file you haven't read.
- **SDK is generated.** `@openrouter/sdk` is Speakeasy-generated — never patch it. Work around quirks via `src/core/client.ts` raw helpers (see `AGENTS.md`).

## Commit conventions

Strictly enforce [Conventional Commits](https://www.conventionalcommits.org):

```
feat(keys): add limit-reset option
fix(models): strip stray "=" from -r=30d
chore(release): bump version to v1.1.0
```

- Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`, `build`, `revert`.
- Lowercase description, no trailing period, max 72 chars, **no emojis**.

## Verification

There is no test suite or CI for edge cases — the repo relies on:

```bash
bun run typecheck   # must pass
bun run build       # must produce dist/or
or <cmd>            # manual smoke test of the affected command
```

Run these before opening a PR.

## Pull requests

1. Fork the repo and branch from `main`.
2. Keep changes small and focused.
3. Update `CHANGELOG.md` under an `[Unreleased]` section if user-facing.
4. Open the PR with a clear description of what and why.
