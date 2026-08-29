// Command: or credits — balance summary + per-key usage breakdown + recent spend (24h).
import { defineCommand } from "citty";
import { apiPost, getClient } from "../core/client.ts";
import { CREDIT_ALERT_THRESHOLD } from "../core/config.ts";
import { fmtError } from "../core/errors.ts";
import {
	fmtSection,
	ansi,
	bar,
	fmtPct,
	fmtUsd,
	C_GREEN,
	C_RED,
	C_YELLOW,
} from "../core/format.ts";
import { ICON } from "../core/icon.ts";

/** Format a "date__hour" like "2026-07-13 10:00:00" into "Today 10:00" or "Sun 07:00". */
function fmtTime(dtStr: string, todayStr: string): string {
	if (!dtStr) return "—";
	const dt = new Date(dtStr.replace(" ", "T") + "Z");
	if (Number.isNaN(dt.getTime())) return dtStr.slice(0, 14);
	const datePart = dt.toISOString().slice(0, 10);
	const timePart = dt.toISOString().slice(11, 16);
	if (datePart === todayStr) return `Today ${timePart}`;
	const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
	return `${days[dt.getUTCDay()]} ${timePart}`;
}

export default defineCommand({
	meta: {
		name: "credits",
		description:
			"Credit balance, per-key spend breakdown, and recent spend (24h)",
	},
	args: {
		search: {
			type: "positional",
			required: false,
			description: "Filter keys by name (e.g. or credits prod)",
		},
		summary: {
			type: "boolean",
			alias: "s",
			description: "Show balance summary only (skip key table)",
		},
	},
	async run({ args }) {
		const client = getClient();

		// ── Credits balance ───────────────────────────────────────────────
		let total = 0;
		let used = 0;
		try {
			const res = await client.credits.getCredits();
			total = res.data?.totalCredits ?? 0;
			used = res.data?.totalUsage ?? 0;
		} catch (err) {
			return fmtError(
				"CREDITS ERROR",
				err,
				"Check MANAGEMENT_KEY/OPENROUTER_API_KEY in .env",
			);
		}
		const balance = Math.max(0, total - used);
		const tier = total > 0 ? ansi("Paid", C_GREEN) : ansi("Free", C_YELLOW);

		const balColor = balance < CREDIT_ALERT_THRESHOLD ? C_RED : C_GREEN;
		const alert =
			balance < CREDIT_ALERT_THRESHOLD
				? `\n\n${ICON.alert} ${ansi("LOW BALANCE ALERT!", C_RED)} Credit < $${CREDIT_ALERT_THRESHOLD} — top up now!`
				: "";

		const lines = [
			fmtSection(ICON.credits, "CREDIT BALANCE"),
			`• Balance: ${ansi(fmtUsd(balance), balColor)}`,
			`• Total:   ${fmtUsd(total)}`,
			`• Used:    ${fmtUsd(used)} (${fmtPct(used, total)})`,
			`• Tier:    ${tier}`,
		];

		if (args.summary) return lines.join("\n") + alert;

		// ── Per-key usage breakdown ────────────────────────────────────────
		let keys: Array<{
			name: string;
			usage: number;
			usageDaily: number;
			usageWeekly: number;
			usageMonthly: number;
			limit: number | null;
			limitRemaining: number | null;
			disabled: boolean;
		}> = [];
		try {
			const kres = await client.apiKeys.list({
				includeDisabled: true,
				offset: 0,
			});
			keys = (kres.data ?? []).map((k) => ({
				name: k.name || k.label || "?",
				usage: k.usage ?? 0,
				usageDaily: k.usageDaily ?? 0,
				usageWeekly: k.usageWeekly ?? 0,
				usageMonthly: k.usageMonthly ?? 0,
				limit: k.limit ?? null,
				limitRemaining: k.limitRemaining ?? null,
				disabled: k.disabled ?? false,
			}));
		} catch (err) {
			lines.push(
				`\n${ICON.warning}  ${ansi("Keys Error", C_RED)}: ${err instanceof Error ? err.message : err}`,
			);
			return lines.join("\n") + alert;
		}

		if (keys.length === 0) {
			lines.push("\nNo API keys.");
			return lines.join("\n") + alert;
		}

		// ── Search filter ──────────────────────────────────────────────────
		if (args.search) {
			const term = args.search.toLowerCase();
			keys = keys.filter((k) => k.name.toLowerCase().includes(term));
		}
		if (keys.length === 0) {
			lines.push("\nNo API key matches.");
			return lines.join("\n") + alert;
		}

		// ── Sort by usage desc + render table ──────────────────────────────
		keys.sort((a, b) => b.usage - a.usage);
		const topUsage = Math.max(...keys.map((k) => k.usage), 0);
		const maxLimit = Math.max(...keys.map((k) => k.limit ?? 0), 0);
		const limitW = Math.max(String(maxLimit.toFixed(2)).length + 1, 9);

		lines.push(fmtSection(ICON.table, "KEY USAGE"));
		const header = (l: string) => `  ${l}`;
		lines.push(
			header(
				`${"Key Name".padEnd(22)} ${"Total".padStart(8)} ${"Mo".padStart(8)} ${"Wk".padStart(7)} ${"Today".padStart(7)}  ${"Limit".padStart(limitW)} ${"Remain".padStart(limitW)}  ${"Bar".padEnd(10)} ${"Status".padEnd(8)}`,
			),
		);
		lines.push(
			header(
				"─".repeat(22) +
					" " +
					"─".repeat(8) +
					" " +
					"─".repeat(8) +
					" " +
					"─".repeat(7) +
					" " +
					"─".repeat(7) +
					"  " +
					"─".repeat(limitW) +
					" " +
					"─".repeat(limitW) +
					"  " +
					"─".repeat(10) +
					" " +
					"─".repeat(8),
			),
		);

		let tUsage = 0;
		let tMonthly = 0;
		let tWeekly = 0;
		let tDaily = 0;
		for (const k of keys) {
			const nameShort = k.name.slice(0, 20);
			const b = bar(k.usage, topUsage, 10);
			const limitStr = k.limit !== null ? fmtUsd(k.limit) : "—";
			const remainStr =
				k.limitRemaining !== null ? fmtUsd(k.limitRemaining) : "—";
			const status = k.disabled
				? ansi(ICON.circleOff, C_RED)
				: ansi(ICON.circle, C_GREEN);

			tUsage += k.usage;
			tMonthly += k.usageMonthly;
			tWeekly += k.usageWeekly;
			tDaily += k.usageDaily;

			lines.push(
				header(
					`${nameShort.padEnd(22)} ${fmtUsd(k.usage).padStart(8)} ${fmtUsd(k.usageMonthly).padStart(8)} ${fmtUsd(k.usageWeekly).padStart(7)} ${fmtUsd(k.usageDaily).padStart(7)}  ${limitStr.padStart(limitW)} ${remainStr.padStart(limitW)}  ${b} ${status.padStart(8)}`,
				),
			);
		}
		lines.push(
			header(
				"─".repeat(22) +
					" " +
					"─".repeat(8) +
					" " +
					"─".repeat(8) +
					" " +
					"─".repeat(7) +
					" " +
					"─".repeat(7) +
					"  " +
					"─".repeat(limitW) +
					" " +
					"─".repeat(limitW) +
					"  " +
					"─".repeat(10) +
					" " +
					"─".repeat(8),
			),
		);
		lines.push(
			header(
				`${"TOTAL".padEnd(22)} ${fmtUsd(tUsage).padStart(8)} ${fmtUsd(tMonthly).padStart(8)} ${fmtUsd(tWeekly).padStart(7)} ${fmtUsd(tDaily).padStart(7)}`,
			),
		);

		// ── Recent spend (24h) by model + key ──────────────────────────────
		if (!args.search) {
			try {
				const now = new Date();
				const start = new Date(now.getTime() - 24 * 3600 * 1000);
				// raw fetch: SDK zod rejects string-typed metrics in analytics/query
				const ares = await apiPost<{
					data: { data: Array<Record<string, unknown>> };
				}>("analytics/query", {
					time_range: { start: start.toISOString(), end: now.toISOString() },
					granularity: "hour",
					metrics: ["request_count", "total_usage"],
					dimensions: ["model", "api_key_id"],
					order_by: { field: "total_usage", direction: "desc" },
					limit: 15,
				});
				const rows = ares.data?.data ?? [];
				if (rows.length > 0) {
					// model name map from a single /models call (paginated)
					let modelNames: Record<string, string> = {};
					try {
						const miter = await client.models.list();
						for await (const page of miter) {
							for (const m of page.result?.data ?? []) {
								if (m.id && m.name) modelNames[m.id] = m.name;
							}
						}
					} catch {
						// names are a bonus — skip silently
					}
					const today = now.toISOString().slice(0, 10);

					lines.push(fmtSection(ICON.search, "RECENT SPEND (24h)"));
					lines.push(
						header(
							`${"Model".padEnd(36)}  ${"Spend".padStart(8)}  ${"Key".padEnd(16)}  ${"Time".padEnd(12)}`,
						),
					);
					lines.push(
						header(
							"─".repeat(36) +
								"  " +
								"─".repeat(8) +
								"  " +
								"─".repeat(16) +
								"  " +
								"─".repeat(12),
						),
					);
					for (const r of rows) {
						const model = typeof r.model === "string" ? r.model : "?";
						const short = model.split("/").pop() ?? "?";
						const display = (
							modelNames[model] ??
							modelNames[short] ??
							short
						).slice(0, 36);
						const spend = Number(r.total_usage ?? 0);
						const key = String(r.api_key_id ?? "?").slice(0, 16);
						const timeLabel = fmtTime(String(r.date__hour ?? ""), today);
						lines.push(
							header(
								`${display.padEnd(36)}  ${fmtUsd(spend).padStart(8)}  ${key.padEnd(16)}  ${timeLabel.padEnd(12)}`,
							),
						);
					}
					lines.push(
						header(
							"─".repeat(36) +
								"  " +
								"─".repeat(8) +
								"  " +
								"─".repeat(16) +
								"  " +
								"─".repeat(12),
						),
					);
				}
			} catch {
				// recent spend is bonus — skip silently on error
			}
		}

		return lines.join("\n") + alert;
	},
});
