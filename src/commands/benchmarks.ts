// Command: or benchmarks — rankings from Artificial Analysis & Design Arena via official SDK.
import { defineCommand } from "citty";
import { getClient } from "../core/client.ts";
import { fmtError } from "../core/errors.ts";
import { ansi, C_BOLD, C_RED, C_RESET } from "../core/format.ts";

type AaItem = {
	agenticIndex: number | null;
	codingIndex: number | null;
	displayName: string;
	intelligenceIndex: number | null;
	modelPermaslug: string;
	pricing: { completion: string; prompt: string } | null;
	source: string;
};

type DaItem = {
	arena: string;
	avgGenerationTimeMs: number | null;
	category: string;
	displayName: string;
	elo: number;
	modelPermaslug: string;
	pricing: { completion: string; prompt: string } | null;
	source: string;
	winRate: number;
};

const TASK_TYPE_LABEL: Record<string, string> = {
	coding: "Coding",
	intelligence: "Intelligence",
	agentic: "Agentic",
};

export default defineCommand({
	meta: {
		name: "benchmarks",
		description: "Benchmark rankings from Artificial Analysis & Design Arena",
	},
	args: {
		source: {
			type: "enum",
			options: ["artificial-analysis", "design-arena", "openrouter"],
			description: "Benchmark source",
		},
		task: {
			type: "enum",
			alias: "t",
			options: ["coding", "intelligence", "agentic"],
			description: "Task type (Artificial Analysis index)",
		},
		arena: {
			type: "enum",
			options: ["models", "builders", "agents"],
			description: "Design Arena arena",
		},
		category: {
			type: "string",
			alias: "c",
			description: "Design Arena category (e.g. codecategories, uicomponent)",
		},
		limit: {
			type: "string",
			alias: "n",
			description: "Max rows (default 10)",
		},
	},
	async run({ args }) {
		const client = getClient();
		// citty quirk: -n=5 arrives as "=5" — strip the stray "="
		const limitRaw = args.limit?.startsWith("=")
			? args.limit.slice(1)
			: args.limit;
		const maxResults = limitRaw ? Number(limitRaw) : 20;

		let data: Array<any>;
		try {
			const res = await client.benchmarks.getBenchmarks({
				source: args.source,
				taskType: args.task,
				arena: args.arena,
				category: args.category,
				maxResults,
			});
			data = res.data ?? [];
		} catch (err) {
			return fmtError(
				"BENCHMARKS ERROR",
				err,
				"Cek OPENROUTER_API_KEY / MANAGEMENT_KEY di .env",
			);
		}

		if (data.length === 0) {
			return `🏆 ${ansi("BENCHMARK RANKINGS", C_BOLD)}\n━━━━━━━━━━━━━━━━━━━━\nBelum ada data benchmark.`;
		}

		const lines = [
			`🏆 ${ansi("BENCHMARK RANKINGS", C_BOLD)}`,
			"━━━━━━━━━━━━━━━━━━━━",
		];

		// ── Split by source ─────────────────────────────────────────────────
		const aaItems = data.filter(
			(i) => i.source === "artificial-analysis",
		) as AaItem[];
		const daItems = data.filter((i) => i.source === "design-arena") as DaItem[];

		if (aaItems.length > 0) {
			const tt = args.task ?? "intelligence";
			const idxKey =
				tt === "coding"
					? "codingIndex"
					: tt === "agentic"
						? "agenticIndex"
						: "intelligenceIndex";
			const idxLabel = TASK_TYPE_LABEL[tt] ?? "Intel";

			aaItems.sort((a, b) => (b[idxKey] ?? 0) - (a[idxKey] ?? 0));
			lines.push(
				`\n📊 ${ansi(`ARTIFICIAL ANALYSIS — ${idxLabel.toUpperCase()}`, C_BOLD)}`,
			);
			lines.push(
				`  ${"Model".padEnd(32)} ${idxLabel.padEnd(9)} ${"Cost $/M".padStart(10)}`,
			);
			lines.push(`  ${"─".repeat(32)} ${"─".repeat(9)} ${"─".repeat(10)}`);
			for (const item of aaItems.slice(0, 10)) {
				const display = (
					item.displayName ||
					item.modelPermaslug.split("/").pop() ||
					item.modelPermaslug
				).slice(0, 30);
				const score = item[idxKey] ?? "—";
				let costStr = "-";
				if (item.pricing) {
					try {
						costStr = (
							(Number(item.pricing.prompt) + Number(item.pricing.completion)) *
							1_000_000
						).toFixed(2);
					} catch {
						costStr = "-";
					}
				}
				lines.push(
					`  ${display.padEnd(32)} ${String(score).padEnd(9)} ${costStr.padStart(10)}`,
				);
			}
		}

		if (daItems.length > 0) {
			daItems.sort((a, b) => b.elo - a.elo);
			lines.push(`\n🎨 ${ansi("DESIGN ARENA", C_BOLD)}`);
			lines.push(
				`  ${"Model".padEnd(30)} ${"ELO".padEnd(8)} ${"Win%".padEnd(7)} ${"Category".padEnd(12)}`,
			);
			lines.push(
				`  ${"─".repeat(30)} ${"─".repeat(8)} ${"─".repeat(7)} ${"─".repeat(12)}`,
			);
			for (const item of daItems.slice(0, 10)) {
				const display = (
					item.displayName ||
					item.modelPermaslug.split("/").pop() ||
					item.modelPermaslug
				).slice(0, 28);
				// winRate is already percent (65.6 = 65.6%) — display as-is
				const winRate =
					item.winRate != null ? `${item.winRate.toFixed(1)}%` : "-";
				lines.push(
					`  ${display.padEnd(30)} ${String(item.elo).padEnd(8)} ${winRate.padEnd(7)} ${String(item.category).slice(0, 10).padEnd(12)}`,
				);
			}
		}

		if (aaItems.length === 0 && daItems.length === 0) {
			lines.push(`\nRaw entries (${data.length}):`);
			for (const item of data.slice(0, 5)) {
				lines.push(
					`  • ${(item as any).displayName ?? (item as any).modelPermaslug ?? "?"}`,
				);
			}
		}

		return lines.join("\n");
	},
});
