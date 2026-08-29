// Command: or credits — balance summary + per-key usage breakdown + deep-dive inspector + recent spend (24h).
import { defineCommand } from "citty";
import { apiPost, getClient } from "../core/client.ts";
import { CREDIT_ALERT_THRESHOLD } from "../core/config.ts";
import { fmtError } from "../core/errors.ts";
import {
	ansi,
	bar,
	fmtPct,
	fmtUsd,
	renderBoxCard,
	renderBoxTable,
	C_BOLD,
	C_GREEN,
	C_RED,
	C_YELLOW,
	C_CYAN,
	C_DIM,
	C_RESET,
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

interface KeyEntry {
	name: string;
	label: string;
	hash?: string;
	usage: number;
	usageDaily: number;
	usageWeekly: number;
	usageMonthly: number;
	byokUsage: number;
	byokUsageDaily: number;
	byokUsageWeekly: number;
	byokUsageMonthly: number;
	limit: number | null;
	limitRemaining: number | null;
	limitReset: string | null;
	includeByokInLimit: boolean;
	isFreeTier?: boolean;
	isManagementKey?: boolean;
	disabled: boolean;
	createdAt?: Date | string | null;
	expiresAt?: Date | string | null;
}

export default Object.assign(
	defineCommand({
		meta: {
			name: "credits",
			description:
				"Credit balance, per-key spend breakdown, key inspector, and recent spend (24h)",
		},
		args: {
			search: {
				type: "positional",
				required: false,
				description:
					"Inspect specific key by name/hash, or filter key list (e.g. or credits monitoring)",
			},
			current: {
				type: "boolean",
				alias: "c",
				description: "Inspect the currently active session API key metadata",
			},
			summary: {
				type: "boolean",
				alias: "s",
				description: "Show balance summary card only (skip tables)",
			},
			json: {
				type: "boolean",
				alias: "j",
				description: "Output raw JSON data for automation/scripts",
			},
		},
		async run({ args }) {
			const client = getClient();

			// ── Fetch credits balance & active key in parallel ────────────────
			let total = 0;
			let used = 0;
			let activeKeyMeta: Record<string, unknown> | null = null;

			try {
				const [credRes, keyRes] = await Promise.all([
					client.credits.getCredits(),
					client.apiKeys.getCurrentKeyMetadata().catch(() => null),
				]);
				total = credRes.data?.totalCredits ?? 0;
				used = credRes.data?.totalUsage ?? 0;
				if (keyRes?.data) {
					activeKeyMeta = keyRes.data as unknown as Record<string, unknown>;
				}
			} catch (err) {
				return fmtError(
					"CREDITS ERROR",
					err,
					"Check MANAGEMENT_KEY/OPENROUTER_API_KEY in .env",
				);
			}

			const balance = Math.max(0, total - used);
			const tier = total > 0 ? "Paid Tier" : "Free Tier";

			// ── Deep-Dive: Current Active Session Key (--current / -c) ────────
			if (args.current) {
				if (!activeKeyMeta) {
					return fmtError(
						"CURRENT KEY ERROR",
						new Error("Could not retrieve metadata for active API key"),
						"Ensure OPENROUTER_API_KEY or MANAGEMENT_KEY is valid.",
					);
				}

				const keyData: KeyEntry = {
					name: String(activeKeyMeta.label ?? "Active Session Key"),
					label: String(activeKeyMeta.label ?? "?"),
					usage: Number(activeKeyMeta.usage ?? 0),
					usageDaily: Number(activeKeyMeta.usageDaily ?? 0),
					usageWeekly: Number(activeKeyMeta.usageWeekly ?? 0),
					usageMonthly: Number(activeKeyMeta.usageMonthly ?? 0),
					byokUsage: Number(activeKeyMeta.byokUsage ?? 0),
					byokUsageDaily: Number(activeKeyMeta.byokUsageDaily ?? 0),
					byokUsageWeekly: Number(activeKeyMeta.byokUsageWeekly ?? 0),
					byokUsageMonthly: Number(activeKeyMeta.byokUsageMonthly ?? 0),
					limit:
						activeKeyMeta.limit !== null && activeKeyMeta.limit !== undefined
							? Number(activeKeyMeta.limit)
							: null,
					limitRemaining:
						activeKeyMeta.limitRemaining !== null &&
						activeKeyMeta.limitRemaining !== undefined
							? Number(activeKeyMeta.limitRemaining)
							: null,
					limitReset: (activeKeyMeta.limitReset as string) ?? null,
					includeByokInLimit: Boolean(activeKeyMeta.includeByokInLimit),
					isFreeTier: Boolean(activeKeyMeta.isFreeTier),
					isManagementKey: Boolean(activeKeyMeta.isManagementKey),
					disabled: false,
					expiresAt: (activeKeyMeta.expiresAt as Date | string) ?? null,
				};

				if (args.json) {
					return JSON.stringify(
						{ key: keyData, accountBalance: { total, used, balance } },
						null,
						2,
					);
				}

				return await renderKeyDeepDive(keyData, balance);
			}

			// ── Fetch all API keys (with pagination support) ───────────────────
			let allKeys: KeyEntry[] = [];
			try {
				let offset = 0;
				while (true) {
					const kres = await client.apiKeys.list({
						includeDisabled: true,
						offset,
					});
					const page = kres.data ?? [];
					for (const k of page) {
						allKeys.push({
							name: k.name || k.label || "?",
							label: k.label || "?",
							hash: k.hash,
							usage: k.usage ?? 0,
							usageDaily: k.usageDaily ?? 0,
							usageWeekly: k.usageWeekly ?? 0,
							usageMonthly: k.usageMonthly ?? 0,
							byokUsage: k.byokUsage ?? 0,
							byokUsageDaily: k.byokUsageDaily ?? 0,
							byokUsageWeekly: k.byokUsageWeekly ?? 0,
							byokUsageMonthly: k.byokUsageMonthly ?? 0,
							limit: k.limit ?? null,
							limitRemaining: k.limitRemaining ?? null,
							limitReset: k.limitReset ?? null,
							includeByokInLimit: k.includeByokInLimit ?? false,
							disabled: k.disabled ?? false,
							createdAt: k.createdAt ?? null,
							expiresAt: k.expiresAt ?? null,
						});
					}
					if (page.length < 100) break;
					offset += page.length;
				}
			} catch (err) {
				if (args.json) {
					return JSON.stringify(
						{ error: String(err), total, used, balance },
						null,
						2,
					);
				}
				return fmtError(
					"KEYS ERROR",
					err,
					"Failed to list API keys. Check MANAGEMENT_KEY permissions.",
				);
			}

			// ── Deep-Dive: Specific Key Match (Exact 1 key match via search) ──
			if (args.search) {
				const term = args.search.toLowerCase().trim();
				const matched = allKeys.filter(
					(k) =>
						k.name.toLowerCase() === term ||
						k.label.toLowerCase() === term ||
						(k.hash && k.hash.toLowerCase() === term),
				);

				if (matched.length === 1 && matched[0]) {
					const key = matched[0];
					if (args.json) {
						return JSON.stringify(
							{ key, accountBalance: { total, used, balance } },
							null,
							2,
						);
					}
					return await renderKeyDeepDive(key, balance);
				}
			}

			// ── Fetch Recent 24h Spend (if not filtered or json) ───────────────
			let recentSpendRows: Array<Record<string, unknown>> = [];
			let modelNames: Record<string, string> = {};
			const now = new Date();
			const start24h = new Date(now.getTime() - 24 * 3600 * 1000);

			try {
				const ares = await apiPost<{
					data: { data: Array<Record<string, unknown>> };
				}>("analytics/query", {
					time_range: { start: start24h.toISOString(), end: now.toISOString() },
					granularity: "hour",
					metrics: ["request_count", "total_usage"],
					dimensions: ["model", "api_key_id"],
					order_by: { field: "total_usage", direction: "desc" },
					limit: 15,
				});
				recentSpendRows = ares.data?.data ?? [];

				if (recentSpendRows.length > 0) {
					try {
						const miter = await client.models.list();
						for await (const page of miter) {
							for (const m of page.result?.data ?? []) {
								if (m.id && m.name) modelNames[m.id] = m.name;
							}
						}
					} catch {
						// model names are optional enhancement
					}
				}
			} catch {
				// skip silently on recent spend error
			}

			// ── JSON Output Mode ───────────────────────────────────────────────
			if (args.json) {
				return JSON.stringify(
					{
						account: {
							balance,
							totalCredits: total,
							totalUsage: used,
							tier: total > 0 ? "paid" : "free",
						},
						activeSessionKey: activeKeyMeta,
						keys: allKeys,
						recentSpend24h: recentSpendRows,
					},
					null,
					2,
				);
			}

			// ── Filter keys if search query provided ───────────────────────────
			let displayKeys = [...allKeys];
			if (args.search) {
				const term = args.search.toLowerCase().trim();
				displayKeys = displayKeys.filter(
					(k) =>
						k.name.toLowerCase().includes(term) ||
						k.label.toLowerCase().includes(term) ||
						(k.hash && k.hash.toLowerCase().includes(term)),
				);
			}

			const balColor = balance < CREDIT_ALERT_THRESHOLD ? C_RED : C_GREEN;
			const alertStr =
				balance < CREDIT_ALERT_THRESHOLD
					? `\n\n${ICON.alert} ${ansi("LOW BALANCE ALERT!", C_RED)} Credit < $${CREDIT_ALERT_THRESHOLD} — please top up soon.`
					: "";

			// ── Render 1: Account Balance Box Card ─────────────────────────────
			const balanceCardLines: string[] = [
				`Balance: ${ansi(fmtUsd(balance), balColor)}        Total: ${fmtUsd(total)}        Used: ${fmtUsd(used)} (${fmtPct(used, total)})        Tier: ${tier === "Paid Tier" ? ansi(tier, C_GREEN) : ansi(tier, C_YELLOW)}`,
			];

			if (activeKeyMeta) {
				const activeLabel = String(activeKeyMeta.label ?? "sk-or-v1-...");
				const keyType = activeKeyMeta.isManagementKey
					? "Management Key"
					: "Standard Key";
				const limitStr =
					activeKeyMeta.limit !== null && activeKeyMeta.limit !== undefined
						? fmtUsd(Number(activeKeyMeta.limit))
						: "Unlimited";
				balanceCardLines.push(
					`${C_DIM}Active Key:${C_RESET} ${ansi(activeLabel, C_CYAN)} (${keyType})          ${C_DIM}Session Limit:${C_RESET} ${limitStr}`,
				);
			}

			const balanceCard = renderBoxCard({
				title: `${ICON.credits} ${ansi("CREDIT BALANCE & ACCOUNT", C_BOLD)}`,
				lines: balanceCardLines,
			});

			if (args.summary) {
				return balanceCard + alertStr;
			}

			const outputSections: string[] = [balanceCard];

			// ── Render 2: Per-Key Usage Table ──────────────────────────────────
			if (displayKeys.length === 0) {
				outputSections.push(
					renderBoxCard({
						title: `${ICON.key} ${ansi("KEY USAGE", C_BOLD)}`,
						lines: [
							args.search
								? `No keys matched filter '${args.search}'.`
								: "No API keys found on this account.",
						],
					}),
				);
			} else {
				displayKeys.sort((a, b) => b.usage - a.usage);
				const topUsage = Math.max(...displayKeys.map((k) => k.usage), 0);

				let tUsage = 0;
				let tMonthly = 0;
				let tWeekly = 0;
				let tDaily = 0;
				let activeCount = 0;

				const tableRows: string[][] = displayKeys.map((k) => {
					tUsage += k.usage;
					tMonthly += k.usageMonthly;
					tWeekly += k.usageWeekly;
					tDaily += k.usageDaily;
					if (!k.disabled) activeCount++;

					const nameDisplay =
						k.name.length > 22 ? `${k.name.slice(0, 20)}..` : k.name;
					const limitStr = k.limit !== null ? fmtUsd(k.limit) : "—";
					const remainStr =
						k.limitRemaining !== null ? fmtUsd(k.limitRemaining) : "—";
					const pctOfTop = topUsage > 0 ? (k.usage / topUsage) * 100 : 0;
					const gaugeStr = `[${pctOfTop.toFixed(0).padStart(3)}%]`;
					const statusStr = k.disabled
						? `${ansi(ICON.circleOff, C_RED)} off`
						: `${ansi(ICON.circle, C_GREEN)} active`;

					return [
						nameDisplay,
						fmtUsd(k.usage),
						fmtUsd(k.usageMonthly),
						fmtUsd(k.usageWeekly),
						fmtUsd(k.usageDaily),
						limitStr,
						remainStr,
						gaugeStr,
						statusStr,
					];
				});

				const footerRows: string[][] = [
					[
						`TOTAL (${displayKeys.length} keys)`,
						fmtUsd(tUsage),
						fmtUsd(tMonthly),
						fmtUsd(tWeekly),
						fmtUsd(tDaily),
						"",
						"",
						"",
						`${activeCount} active`,
					],
				];

				const keyTable = renderBoxTable({
					columns: [
						{ header: "Key Name", align: "left", minWidth: 18 },
						{ header: "Total", align: "right", minWidth: 8 },
						{ header: "Month", align: "right", minWidth: 8 },
						{ header: "Week", align: "right", minWidth: 7 },
						{ header: "Today", align: "right", minWidth: 7 },
						{ header: "Limit", align: "right", minWidth: 9 },
						{ header: "Remain", align: "right", minWidth: 9 },
						{ header: "Gauge", align: "center", minWidth: 7 },
						{ header: "Status", align: "left", minWidth: 10 },
					],
					rows: tableRows,
					footerRows,
				});

				outputSections.push(keyTable);
			}

			// ── Render 3: Recent Spend (24h) Table ─────────────────────────────
			if (!args.search && recentSpendRows.length > 0) {
				const todayStr = now.toISOString().slice(0, 10);
				const recentTableRows: string[][] = recentSpendRows.map((r) => {
					const model = typeof r.model === "string" ? r.model : "?";
					const short = model.split("/").pop() ?? "?";
					const display = (
						modelNames[model] ??
						modelNames[short] ??
						model
					).slice(0, 38);
					const spend = Number(r.total_usage ?? 0);
					const key = String(r.api_key_id ?? "?").slice(0, 16);
					const timeLabel = fmtTime(String(r.date__hour ?? ""), todayStr);

					return [display, fmtUsd(spend), key, timeLabel];
				});

				const recentTable = renderBoxTable({
					columns: [
						{ header: "Model (24h Spend)", align: "left", minWidth: 32 },
						{ header: "Spend", align: "right", minWidth: 8 },
						{ header: "Key", align: "left", minWidth: 16 },
						{ header: "Time", align: "left", minWidth: 12 },
					],
					rows: recentTableRows,
				});

				outputSections.push(recentTable);
			}

			return outputSections.join("\n\n") + alertStr;
		},
	}),
	{
		examples: [
			"or credits                 # Full overview: balance, key usage table & 24h spend",
			"or credits monitoring      # Deep-dive inspector for specific key",
			"or credits -c, --current   # Deep-dive inspector for active session key (.env)",
			"or credits -s, --summary   # Quick balance summary card only",
			"or credits --json          # Machine-readable JSON output for scripts",
		],
	},
);

/**
 * Render complete Deep-Dive card for a single API Key.
 */
async function renderKeyDeepDive(
	key: KeyEntry,
	accountBalance: number,
): Promise<string> {
	const statusBadge = key.disabled
		? `${ansi(ICON.circleOff, C_RED)} Disabled`
		: `${ansi(ICON.circle, C_GREEN)} Active`;

	const keyType = key.isManagementKey
		? "Management Key"
		: key.isFreeTier
			? "Free Tier Key"
			: "Standard API Key";

	const lines: string[] = [];

	// 1. Identity Box Card
	const createdStr = key.createdAt ? String(key.createdAt).slice(0, 10) : "—";
	const expiresStr = key.expiresAt
		? String(key.expiresAt).slice(0, 10)
		: "Never";

	lines.push(
		renderBoxCard({
			title: `${ICON.key} ${ansi(`KEY DEEP-DIVE: ${key.name}`, C_BOLD)}`,
			lines: [
				`• Label / Hash:   ${ansi(key.label, C_CYAN)}${key.hash ? ` (${key.hash.slice(0, 12)}...)` : ""}`,
				`• Type:           ${keyType}`,
				`• Status:         ${statusBadge}`,
				`• Created / Exp:  ${createdStr}  (Expires: ${expiresStr})`,
				`• BYOK in Limit:  ${key.includeByokInLimit ? "Yes" : "No"}`,
			],
		}),
	);

	// 2. Multi-Window Spend Breakdown Table
	const spendRows: string[][] = [
		[
			"Today",
			fmtUsd(key.usageDaily),
			fmtUsd(key.byokUsageDaily),
			fmtUsd(key.usageDaily + key.byokUsageDaily),
		],
		[
			"This Week",
			fmtUsd(key.usageWeekly),
			fmtUsd(key.byokUsageWeekly),
			fmtUsd(key.usageWeekly + key.byokUsageWeekly),
		],
		[
			"This Month",
			fmtUsd(key.usageMonthly),
			fmtUsd(key.byokUsageMonthly),
			fmtUsd(key.usageMonthly + key.byokUsageMonthly),
		],
		[
			"All-Time Total",
			fmtUsd(key.usage),
			fmtUsd(key.byokUsage),
			fmtUsd(key.usage + key.byokUsage),
		],
	];

	const spendTable = renderBoxTable({
		columns: [
			{ header: "Window", align: "left", minWidth: 14 },
			{ header: "Credits Spend", align: "right", minWidth: 14 },
			{ header: "BYOK Spend", align: "right", minWidth: 12 },
			{ header: "Combined Total", align: "right", minWidth: 15 },
		],
		rows: spendRows,
	});

	lines.push(spendTable);

	// 3. Quota & Limits Card
	const limitStr = key.limit !== null ? fmtUsd(key.limit) : "Unlimited";
	const remainStr =
		key.limitRemaining !== null ? fmtUsd(key.limitRemaining) : "Unlimited";
	const resetStr = key.limitReset ? key.limitReset.toUpperCase() : "None";
	let quotaGauge = "N/A (Unlimited)";

	if (key.limit !== null && key.limit > 0) {
		const usedInPeriod = Math.max(0, key.limit - (key.limitRemaining ?? 0));
		const pct = Math.min(100, (usedInPeriod / key.limit) * 100);
		const b = bar(usedInPeriod, key.limit, 10);
		const color = pct > 85 ? C_RED : pct > 60 ? C_YELLOW : C_GREEN;
		quotaGauge = `${b} ${ansi(`${pct.toFixed(1)}% used`, color)} (${fmtUsd(usedInPeriod)} / ${fmtUsd(key.limit)})`;
	}

	lines.push(
		renderBoxCard({
			title: `${ICON.table} ${ansi("SPENDING LIMITS & QUOTA", C_BOLD)}`,
			lines: [
				`• Spending Limit:    ${limitStr} (Reset: ${resetStr})`,
				`• Remaining Limit:   ${remainStr}`,
				`• Quota Gauge:       ${quotaGauge}`,
				`• Account Balance:   ${fmtUsd(accountBalance)}`,
			],
		}),
	);

	// 4. Query recent model spend for this specific key
	try {
		const now = new Date();
		const start24h = new Date(now.getTime() - 24 * 3600 * 1000);
		const ares = await apiPost<{
			data: { data: Array<Record<string, unknown>> };
		}>("analytics/query", {
			time_range: { start: start24h.toISOString(), end: now.toISOString() },
			granularity: "hour",
			metrics: ["request_count", "total_usage"],
			dimensions: ["model", "api_key_id"],
			order_by: { field: "total_usage", direction: "desc" },
			limit: 10,
		});

		const allRows = ares.data?.data ?? [];
		// Match rows by key label or hash or name
		const keyRows = allRows.filter((r) => {
			const kId = String(r.api_key_id ?? "");
			return (
				kId === key.name ||
				kId === key.label ||
				kId.startsWith(key.name) ||
				(key.hash && kId.startsWith(key.hash.slice(0, 8)))
			);
		});

		if (keyRows.length > 0) {
			const todayStr = now.toISOString().slice(0, 10);
			const modelRows = keyRows.map((r) => {
				const model = typeof r.model === "string" ? r.model : "?";
				const reqs = String(r.request_count ?? "0");
				const spend = Number(r.total_usage ?? 0);
				const timeLabel = fmtTime(String(r.date__hour ?? ""), todayStr);
				return [model, reqs, fmtUsd(spend), timeLabel];
			});

			lines.push(
				renderBoxTable({
					columns: [
						{ header: "Model Used (24h)", align: "left", minWidth: 32 },
						{ header: "Requests", align: "right", minWidth: 9 },
						{ header: "Spend", align: "right", minWidth: 9 },
						{ header: "Time", align: "left", minWidth: 12 },
					],
					rows: modelRows,
				}),
			);
		}
	} catch {
		// skip recent models on error
	}

	return lines.join("\n\n");
}
