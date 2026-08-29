# OpenRouter CLI (`or`)

[![CI](https://github.com/amadshobi/openrouter-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/amadshobi/openrouter-cli/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Bun](https://img.shields.io/badge/bun-1.3+-black?logo=bun)](https://bun.sh)

OpenRouter Control Center — a terminal CLI for credits, models, benchmarks, analytics and API key management.

## Features

- 💰 **Credits** — balance, per-key spend breakdown (day/week/month), recent 24h spend, low-balance alert
- 🤖 **Models** — list/count/mine, filter by price/context/release, live health probe
- 🏆 **Benchmarks** — Artificial Analysis (intelligence/coding/agentic) and Design Arena rankings
- 📊 **Activity** — time-series bar chart + top models (15m–24h / today)
- 📈 **Analytics** — weekly deep dive (requests, tokens, spend, top models)
- 🔑 **Keys** — list/create/update/disable/enable/delete with confirmation guard

> **Note:** Output uses Nerd Font glyphs — install a [Nerd Font](https://www.nerdfonts.com/) (e.g. JetBrainsMono Nerd Font) for best rendering.

## Install

### From release (recommended)

Download the `or` binary from the [latest release](https://github.com/amadshobi/openrouter-cli/releases), then:

```bash
chmod +x or
sudo mv or /usr/local/bin/
```

### From source

```bash
bun install
bun run build          # produces dist/or (static binary)
```

### Environment

Create `.env` (see `.env.example`):

```
OPENROUTER_API_KEY=sk-or-v1-xxx   # read-only commands
MANAGEMENT_KEY=sk-or-v1-xxx       # keys CRUD, analytics, activity
```

Env precedence: process env → project `.env` → read-only fallback (`~/archive/monitor/.env`).

## Commands

| Command                                                     | Description                                            |
| ----------------------------------------------------------- | ------------------------------------------------------ |
| `or credits`                                                | Balance + per-key spend breakdown + recent spend (24h) |
| `or credits --summary`                                      | Balance summary only                                   |
| `or models`                                                 | List models with price/context/release filters         |
| `or models --count`                                         | Total model count                                      |
| `or models --mine`                                          | Models for your user                                   |
| `or models --check`                                         | Live health probe (latency + status)                   |
| `or benchmarks`                                             | Artificial Analysis + Design Arena rankings            |
| `or activity [15m\|30m\|1h\|2h\|3h\|6h\|12h\|24h\|today]`   | Time-series usage + top models                         |
| `or analytics [days]`                                       | Weekly deep dive (default 7 days)                      |
| `or keys list`                                              | All keys with multi-window spend, BYOK, limit reset    |
| `or keys create NAME [--limit] [--limit-reset] [--expires]` | Create a key                                           |
| `or keys update HASH [--name] [--limit] [--limit-reset]`    | Update a key                                           |
| `or keys disable\|enable HASH`                              | Toggle key status                                      |
| `or keys delete HASH --yes`                                 | Delete a key (requires confirmation)                   |

## Examples

```bash
or credits
or credits --summary
or models --list --in=0.1:0.5 --ctx=128k: -r=30d
or models --check --in=0.1:0.5
or benchmarks --source=design-arena --category=codecategories
or benchmarks --source=artificial-analysis --task=coding
or activity 24h
or analytics 7
or keys list
or keys create ci-key --limit=5 --limit-reset=monthly
or keys delete <hash> --yes
```

## Notes

- `--json` is not implemented yet — all output is human-readable.
- Management key is required for `or keys *`, `or activity`, `or analytics`, and the per-key breakdown of `or credits`.
- OpenRouter does not return the plaintext API key (write-only) — only a truncated label.
- Requires [Bun](https://bun.sh) >= 1.3 to build from source.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). This project enforces Conventional Commits and has pre-commit/pre-push hooks.

## License

MIT — see [LICENSE](LICENSE).
