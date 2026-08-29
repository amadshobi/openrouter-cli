// Command: or analytics — weekly deep dive (last 7 days) via /activity.
import { defineCommand } from "citty";
import { apiRaw, getClient } from "../core/client.ts";
import { fmtError } from "../core/errors.ts";
import { fmtSection, bar, fmtTokens, fmtUsd } from "../core/format.ts";
import { ICON } from "../core/icon.ts";

export default defineCommand({
	meta: {
		name: "analytics",
		description: "Weekly analytics deep dive (last 7 days)",
	},
	args: {
		days: {
			type: "positional",
			required: false,
			description: "Number of days to analyze (default: 7)",
		},
	},
	async run({ args }) {
		const client = getClient();
		let days = 7;
		if (args.days) {
			days = Number(args.days);
			if (Number.isNaN(days) || days <= 0) {
				return fmtError(
					"ANALYTICS ERROR",
					new Error(
						`Invalid days argument: '${args.days}' (must be a positive number)`,
					),
					"Example: or analytics 14",
				);
			}
		}
		const now = new Date();
		const startDt = new Date(now.getTime() - days * 86_400_000);

		let raw: Array<Record<string, unknown>> = [];
		try {
			// raw GET: /activity fields (requests, prompt_tokens...) arrive as strings — SDK zod rejects them
			const res = await apiRaw<{ data: Array<Record<string, unknown>> }>(
				"activity",
			);
			raw = res.data ?? [];
		} catch (err) {
			return fmtError(
				"ANALYTICS ERROR",
				err,
				"Check MANAGEMENT_KEY in .env (management key required)",
			);
		}

		// filter rows within window
		const rows = raw.filter((item) => {
			const dateStr = String(item.date ?? "");
			if (!dateStr) return false;
			const dt = new Date(
				dateStr.includes("T") ? dateStr : dateStr.replace(" ", "T"),
			);
			return !Number.isNaN(dt.getTime()) && dt >= startDt;
		});

		if (rows.length === 0) {
			return `${fmtSection(ICON.chartLine, "WEEKLY ANALYTICS")}\nNo data for the last ${days} days.`;
		}

		// model name map
		let modelNames: Record<string, string> = {};
		try {
			const iter = await client.models.list();
			for await (const page of iter) {
				for (const m of page.result?.data ?? []) {
					if (m.id && m.name) modelNames[m.id] = m.name;
				}
			}
		} catch {
			// bonus — skip silently
		}

		// aggregate by model
		const byModel = new Map<
			string,
			{ reqs: number; usage: number; tokens: number }
		>();
		let totalReqs = 0;
		let totalUsage = 0;
		let totalTokens = 0;
		for (const row of rows) {
			const model = String(row.model ?? "unknown");
			const reqs = Number(row.requests ?? 0);
			const usage = Number(row.usage ?? 0);
			const tokens =
				Number(row.prompt_tokens ?? 0) + Number(row.completion_tokens ?? 0);
			totalReqs += reqs;
			totalUsage += usage;
			totalTokens += tokens;
			const m = byModel.get(model) ?? { reqs: 0, usage: 0, tokens: 0 };
			m.reqs += reqs;
			m.usage += usage;
			m.tokens += tokens;
			byModel.set(model, m);
		}

		const sortedModels = [...byModel.entries()]
			.sort((a, b) => b[1].reqs - a[1].reqs)
			.slice(0, 10);
		const topReqs = sortedModels[0]?.[1]?.reqs ?? 0;

		const lines = [
			fmtSection(ICON.chartLine, "WEEKLY ANALYTICS"),
			`• Total Requests: ${totalReqs}`,
			`• Total Usage: ${fmtUsd(totalUsage)}`,
			`• Total Tokens: ${fmtTokens(totalTokens)}`,
			"",
			fmtSection(ICON.robot, "TOP MODELS BY REQUESTS"),
			`  ${"Model".padEnd(28)} ${"Reqs".padStart(5)} ${"Tokens".padStart(7)} ${"Usage".padStart(8)}  ${"Bar".padEnd(10)}`,
			`  ${"─".repeat(28)} ${"─".repeat(5)} ${"─".repeat(7)} ${"─".repeat(8)}  ${"─".repeat(10)}`,
		];
		for (const [mid, st] of sortedModels) {
			const short = (modelNames[mid] ?? mid.split("/").pop() ?? mid).slice(
				0,
				26,
			);
			const b = bar(st.reqs, topReqs, 10);
			lines.push(
				`  ${short.padEnd(28)} ${String(st.reqs).padStart(5)} ${fmtTokens(st.tokens).padStart(7)} ${fmtUsd(st.usage).padStart(8)}  ${b}`,
			);
		}
		lines.push(
			`  ${"─".repeat(28)} ${"─".repeat(5)} ${"─".repeat(7)} ${"─".repeat(8)}  ${"─".repeat(10)}`,
		);
		lines.push(
			`  ${"TOTAL".padEnd(28)} ${String(totalReqs).padStart(5)} ${fmtTokens(totalTokens).padStart(7)} ${fmtUsd(totalUsage).padStart(8)}`,
		);

		return lines.join("\n");
	},
});
