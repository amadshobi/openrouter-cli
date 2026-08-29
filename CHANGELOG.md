# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.1] - 2026-08-29

### Fixed

- Table alignment and divider indentation in `or credits` recent spend table
- Parser issue where flags with `=` (e.g. `--in=0.1:0.5`, `--out`, `--context`) preserved a leading `=`
- Hardcoded emoji in unknown command error output in favor of `ICON.error` Nerd Font glyph
- Missing input validation for `analytics <days>`, `activity <window>`, and `keys create/update --limit`
- Typo in `or models` help example referencing non-existent `--ctx` flag

### Changed

- Standardized error messages to English in `or keys create`
- Centralized section divider `DIVIDER` export from `src/core/format.ts`
- Cleaned up unused `--force` flags from `models` and `activity` commands
- Subcommand unknown argument dispatcher now shows contextual help at all depth levels

## [1.1.0] - 2026-08-29

### Changed

- Replace all emoji output with Nerd Font glyphs (single source in `src/core/icon.ts`)
- All user-facing output & hints now in English
- Consistent section headers via `fmtSection()` helper
- README rewritten in English with badges, install & examples
- Removed unused imports across all commands

### Added

- Usage examples in `or models` default view

## [1.0.0] - 2026-08-29

### Added

- `or credits` — balance, per-key spend breakdown (day/week/month), recent spend (24h), low-balance alert
- `or models` — list/count/mine, price/context/release filters, live health probe
- `or benchmarks` — Artificial Analysis (intelligence/coding/agentic) and Design Arena rankings
- `or activity` — time-series bar chart + top models (15m–24h / today)
- `or analytics` — weekly deep dive (requests, tokens, spend, top models)
- `or keys` — list/create/update/disable/enable/delete with `--yes` guard
- Dual-level help (`or --help`, `or <cmd> --help`)
- Static binary build via `bun build --compile` (dist/or)
- Legacy Python monitor archived; env fallback kept read-only for migration
