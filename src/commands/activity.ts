// Command: or activity — real-time usage telemetry (time-series bar chart + top models).
// Uses the same analytics/query payload as the legacy monitor, via the official SDK.
import { defineCommand } from "citty";
import { apiPost, getClient } from "../core/client.ts";
import { fmtError } from "../core/errors.ts";
import {
	ansi,
	bar,
	fmtTokens,
	fmtUsd,
	C_BOLD,
	C_RESET,
} from "../core/format.ts";

// window key → { label, granularity, minutes }
const WINDOWS: Record<
	string,
	{ label: string; granularity: string; minutes: number | null }
> = {
	"15m": { label: "LAST 15 MINUTES", granularity: "minute", minutes: 15 },
	"30m": { label: "LAST 30 MINUTES", granularity: "minute", minutes: 30 },
	"1h": { label: "LAST 1 HOUR", granularity: "minute", minutes: 60 },
	"2h": { label: "LAST 2 HOURS", granularity: "hour", minutes: 120 },
	"3h": { label: "LAST 3 HOURS", granularity: "hour", minutes: 180 },
	"6h": { label: "LAST 6 HOURS", granularity: "hour", minutes: 360 },
	"12h": { label: "LAST 12 HOURS", granularity: "hour", minutes: 720 },
	"24h": { label: "LAST 24 HOURS", granularity: "hour", minutes: 1440 },
	today: { label: "TODAY (LOCAL TIME)", granularity: "hour", minutes: null },
};

/** Bucket key + label for the time axis (5-min buckets for small windows, hourly otherwise). */
function timeBucket(dt: Date, window: string): { key: string; label: string } {
	if (window === "15m" || window === "30m" || window === "1h") {
		const bucketMin = Math.floor(dt.getUTCMinutes() / 5) * 5;
		const key = `${String(dt.getUTCHours()).padStart(2, "0")}:${String(bucketMin).padStart(2, "0")}`;
		return { key, label: key };
	}
	const key = String(dt.getUTCHours()).padStart(2, "0");
	return { key, label: key };
}

export default defineCommand({
	meta: {
		name: "activity",
		description: "Real-time usage activity (time-series + top models)",
	},
	args: {
		window: {
			type: "positional",
			required: false,
			description:
				"15m | 30m | 1h | 2h | 3h | 6h | 12h | 24h | today (default: today)",
		},
		force: {
			type: "boolean",
			alias: "f",
			description: "Force re-fetch from API",
		},
	},
	async run({ args }) {
		const client = getClient();
		const window = (args.window ?? "today").toLowerCase();
		const win = WINDOWS[window] ?? WINDOWS.today!;

		// today → start of local day in UTC; otherwise now - window
		const now = new Date();
		let start: Date;
		if (win.minutes === null) {
			const local = new Date();
			const startLocal = new Date(
				local.getFullYear(),
				local.getMonth(),
				local.getDate(),
			);
			start = new Date(
				startLocal.getTime() - startLocal.getTimezoneOffset() * 60_000,
			);
		} else {
			start = new Date(now.getTime() - win.minutes * 60_000);
		}

		let rows: Array<Record<string, unknown>> = [];
		try {
			// raw fetch: SDK zod schema rejects string-typed metrics (request_count as "14")
			const res = await apiPost<{
				data: { data: Array<Record<string, unknown>> };
			}>("analytics/query", {
				time_range: { start: start.toISOString(), end: now.toISOString() },
				granularity: win.granularity,
				metrics: [
					"request_count",
					"total_usage",
					"tokens_prompt",
					"tokens_completion",
				],
				dimensions: ["model"],
			});
			rows = res.data?.data ?? [];
		} catch (err) {
			return fmtError(
				"ACTIVITY ERROR",
				err,
				"Cek MANAGEMENT_KEY di .env (butuh management key)",
			);
		}

		if (rows.length === 0) {
			return `📊 ${ansi(`ACTIVITY — ${win.label}`, C_BOLD)}\n━━━━━━━━━━━━━━━━━━━━\nBelum ada aktivitas dalam periode ini.`;
		}

		// ── Fetch model name map (paginated) ────────────────────────────────
		let modelNames: Record<string, string> = {};
		try {
			const iter = await client.models.list();
			for await (const page of iter) {
				for (const m of page.result?.data ?? []) {
					if (m.id && m.name) modelNames[m.id] = m.name;
				}
			}
		} catch {
			// names are a bonus — skip silently
		}

		// ── Aggregate ───────────────────────────────────────────────────────
		const hourly = new Map<
			string,
			{ reqs: number; tokens: number; usage: number }
		>();
		const perModel = new Map<
			string,
			{ reqs: number; tokens: number; usage: number }
		>();
		let totalReqs = 0;
		let totalUsage = 0;
		let totalTokens = 0;

		for (const r of rows) {
			const dtStr = String(r.date__minute ?? r.date__hour ?? "");
			if (!dtStr) continue;
			const dt = new Date(dtStr.replace(" ", "T") + "Z");
			if (Number.isNaN(dt.getTime()) || dt < start) continue;

			const reqs = Number(r.request_count ?? 0);
			const usage = Number(r.total_usage ?? 0);
			const tok =
				Number(r.tokens_prompt ?? 0) + Number(r.tokens_completion ?? 0);
			const model = String(r.model ?? "unknown");

			totalReqs += reqs;
			totalUsage += usage;
			totalTokens += tok;

			const { key, label } = timeBucket(dt, window);
			const h = hourly.get(key) ?? { reqs: 0, tokens: 0, usage: 0 };
			h.reqs += reqs;
			h.tokens += tok;
			h.usage += usage;
			hourly.set(key, h);

			const m = perModel.get(model) ?? { reqs: 0, tokens: 0, usage: 0 };
			m.reqs += reqs;
			m.tokens += tok;
			m.usage += usage;
			perModel.set(model, m);
		}

		// ── Render: time series ─────────────────────────────────────────────
		const sortedHours = [...hourly.entries()].sort((a, b) =>
			a[0].localeCompare(b[0]),
		);
		const nBuckets = sortedHours.length;
		const barW =
			nBuckets <= 8 ? 24 : nBuckets <= 16 ? 14 : nBuckets <= 24 ? 10 : 6;
		const topReqs = Math.max(...sortedHours.map(([, h]) => h.reqs), 0);

		const lines = [
			`📊 ${ansi(`ACTIVITY — ${win.label}`, C_BOLD)}`,
			"━━━━━━━━━━━━━━━━━━━━",
		];
		for (const [bk, h] of sortedHours) {
			const b = bar(h.reqs, topReqs, barW);
			lines.push(
				` ${bk.padEnd(5)} ${b}  ${String(h.reqs).padStart(5)} reqs  ${fmtTokens(h.tokens).padStart(6)}`,
			);
		}
		lines.push(` ${"─".repeat(barW + 32)}`);
		lines.push(
			` Total  ${String(totalReqs).padStart(5)} reqs  ${fmtTokens(totalTokens).padStart(6)}  ${fmtUsd(totalUsage)}`,
		);
		lines.push("");

		// ── Render: top models ──────────────────────────────────────────────
		const sortedModels = [...perModel.entries()].sort(
			(a, b) => b[1].usage - a[1].usage,
		);
		const topReqsM = sortedModels[0]?.[1]?.reqs ?? 0;
		const barMw = 10;

		lines.push(`🧠 ${ansi("TOP MODELS", C_BOLD)}`);
		lines.push(
			`  ${"Model".padEnd(28)} ${"Reqs".padStart(5)} ${"Usage".padStart(8)}  ${"Bar".padEnd(barMw)}`,
		);
		lines.push(
			`  ${"─".repeat(28)} ${"─".repeat(5)} ${"─".repeat(8)}  ${"─".repeat(barMw)}`,
		);
		for (const [modelId, m] of sortedModels.slice(0, 10)) {
			const short = (
				modelNames[modelId] ??
				modelId.split("/").pop() ??
				modelId
			).slice(0, 26);
			const b = bar(m.reqs, topReqsM, barMw);
			lines.push(
				`  ${short.padEnd(28)} ${String(m.reqs).padStart(5)} ${fmtUsd(m.usage).padStart(8)}  ${b}`,
			);
		}
		lines.push(
			`  ${"─".repeat(28)} ${"─".repeat(5)} ${"─".repeat(8)}  ${"─".repeat(barMw)}`,
		);
		lines.push(
			`  ${"TOTAL".padEnd(28)} ${String(totalReqs).padStart(5)} ${fmtUsd(totalUsage).padStart(8)}`,
		);

		return lines.join("\n");
	},
});
