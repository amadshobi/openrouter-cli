# AGENTS.md — openrouter-cli

CLI `or` (OpenRouter Control Center). Bun + TypeScript, deps: `@openrouter/sdk@1.2.83` (Speakeasy-generated) + `citty@0.2.2` (CLI framework).

## Build & verify

```bash
bun install
bun run typecheck        # tsc --noEmit (typescript v7, strict + noUncheckedIndexedAccess)
bun run build            # bun build --compile → dist/or (static binary ~96MB)
bun run src/index.ts     # dev: run from source
```

- **No test suite / lint / CI.** Verification = run the binary: `or <cmd>` (or from the repo: `bun run src/index.ts <cmd>`).
- Rebuild is required after editing source — `~/.local/bin/or` is a symlink to `dist/or`, and zsh PATH already prioritizes `~/.local/bin` (legacy monitor removed from PATH 2026-08).
- Env is read from: process env → project `.env` → read-only fallback `~/archive/monitor/.env` & `~/.kilo/gateway.systemd.env`. A `MANAGEMENT_KEY` (or at least `OPENROUTER_API_KEY`) is required for live testing.

## Architecture

- `src/index.ts` = entry point. **Do NOT switch to citty's `runMain`** — manual dispatch is mandatory: citty v0.2.2 does not print the subcommand `run()` return value (parent result = `undefined`), so `dispatch()` resolves the tree itself and prints the result.
- `src/cli.ts` = subcommand registry (`credits`, `models`, `benchmarks`, `activity`, `analytics`, `keys`). New command: create in `src/commands/` + register here.
- `src/core/` = `config.ts` (env), `client.ts` (SDK singleton + raw fetch), `format.ts` (ansi/bar/fmt helpers), `errors.ts` (fmtError).
- Each command's `run({ args })` returns a **string** (table/text) printed by index.ts. Non-string returns are silently dropped.
- `src/core/format.ts` provides `ansi`, `bar`, `fmtUsd`, `fmtTokens`, `stripHtml` — use these, don't reinvent. Files use **tab** indentation.

## SDK quirks (critical — already paid for in blood)

- **`analytics.queryAnalytics()` and `analytics.getUserActivity()` are BROKEN** — the zod schema rejects numeric metrics arriving as strings (`"request_count": "14"`) → returns `{}`. Use `apiPost`/`apiRaw` from `src/core/client.ts` (snake_case payload: `time_range`, `order_by`) for analytics/activity/recent-spend. Do NOT "fix" by switching to the SDK.
- **`models.list()` & `models.listForUser()` return `PageIterator`**, not plain data. Must be `for await (const page of iter) { page.result?.data }`. Direct `.data` = undefined.
- **Model fields are camelCase**: `contextLength` (not `context_length`), `pricing.prompt`/`.completion` = **string** $/token (not number) — multiply by 1e6 for $/M.
- **`apiKeys.create()` does not return plaintext key** — OpenRouter API is write-only, response only has truncated `label` (`sk-or-v1-84d...52f`). Don't expect/display a `key` field.
- Model display-name mapping (`models.list()` paginated) is expensive — do it once per command (pattern exists in activity/analytics/credits).

## citty quirks

- **Single-char alias with `=` is broken**: `-r=30d` / `-n=5` are parsed as `=30d` / `=5` by citty. Any command using string/limit aliases must strip a leading `=` first (see `models.ts` release & `benchmarks.ts` limit).
- Required positional args: `or keys delete` without hash → citty throws `Missing required positional argument` (handled into a clean error in index.ts `boot()`).
- Boolean flags can clash: `-n` in `models` = `--count` (don't add a limit flag aliased `-n`).

## Keys command notes

- `keys delete` requires `--yes` (destructive guard, non-interactive).
- `keys create`: `--limit` USD, `--limit-reset daily|weekly|monthly`, `--expires` (ISO or `30d`), `--include-byok`.
- Safe lifecycle test: create → disable → enable → update → delete --yes, then `or keys list` to verify clean state.

## Table styling standards

- Use single-line box drawing characters (`┌ ┬ ┐`, `│`, `├ ┼ ┤`, `└ ┴ ┘`) modeled after Goblin Nexus (`gn`).
- Always use `renderBoxTable` and `renderBoxCard` from `src/core/format.ts` for tabular data, balance cards, and inspectors.
- Formatting must be ANSI-aware (use `padVisual` / `visibleWidth` to prevent alignment breakage from color escapes).
- Column alignment: left for text/names, right for currency/numeric values, center for badges/gauges.

## Level 2 help & command ordering standards

- Dual-Level Help ordering is strictly enforced across all subcommands:
  1. **Description**: Concise summary of command purpose.
  2. **USAGE**: Formatted command syntax (`or <cmd> [OPTIONS] [ARGS]`).
  3. **ARGUMENTS**: List of positional arguments and descriptions.
  4. **OPTIONS**: Flag options and short aliases.
  5. **EXAMPLES**: Placed strictly at the **bottom** via `examples: string[]` attached to command definition objects (rendered by `src/index.ts`).
- Avoid cluttering command descriptions with separate visual indicator legends; keep descriptions clean and put practical CLI invocations in `examples`.
