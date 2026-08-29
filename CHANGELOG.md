# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
