# OpenRouter CLI (`or`)

OpenRouter Control Center — CLI terminal untuk credits, models, benchmarks, analytics & API key management.

## Install

```bash
bun install
bun run build   # menghasilkan dist/or (binary statis)
```

Set env di `.env` (lihat `.env.example`):

```
OPENROUTER_API_KEY=sk-or-v1-xxx   # read-only commands
MANAGEMENT_KEY=sk-or-v1-xxx       # keys CRUD, analytics, activity
```

## Commands

| Command                                     | Deskripsi                                                  |
| ------------------------------------------- | ---------------------------------------------------------- |
| `or credits`                                | Balance + per-key spend breakdown + recent spend 24h       |
| `or models`                                 | Daftar model + filter harga/context/release + health probe |
| `or benchmarks`                             | Rankings Artificial Analysis & Design Arena                |
| `or activity [15m..24h\|today]`             | Time-series usage + top models                             |
| `or analytics [days]`                       | Weekly deep dive                                           |
| `or keys list`                              | Multi-window spend, BYOK, limit reset                      |
| `or keys create NAME --limit --limit-reset` | Buat key                                                   |
| `or keys update HASH --name --limit`        | Update key                                                 |
| `or keys disable\|enable HASH`              | Toggle status                                              |
| `or keys delete HASH --yes`                 | Hapus (butuh konfirmasi)                                   |

## Contoh

```bash
or credits --summary
or models --list --in=0.1:0.5 --ctx=128k: -r=30d
or models --check --healthy-only
or benchmarks --source=design-arena --category=codecategories
or activity 24h
or analytics 7
or keys create ci-key --limit=5 --limit-reset=monthly
```

## Notes

- `--json` belum ada; semua output human-readable.
- Management key diperlukan untuk `or keys *`, `or activity`, `or analytics`, dan `or credits` (per-key breakdown).
- Plaintext API key tidak dikembalikan oleh OpenRouter (write-only) — hanya label truncated.
