// Command: or models — list/count/mine + filters (price, context, release) + live health probe.
import { defineCommand } from "citty";
import { getClient } from "../core/client.ts";
import { fmtError } from "../core/errors.ts";
import {
	fmtSection,
	ansi,
	fmtTokens,
	C_BOLD,
	C_GREEN,
	C_RED,
	C_CYAN,
	DIVIDER,
} from "../core/format.ts";
import { ICON } from "../core/icon.ts";

// SDK model fields are camelCase (contextLength, pricing.prompt as string $/token).
type Model = {
	id: string;
	name?: string | null;
	contextLength?: number | null;
	created?: number | null;
	pricing?: {
		prompt?: string | null;
		completion?: string | null;
	} | null;
	benchmarks?: unknown;
};

/** Parse "0.1:0.5" or "0.15" into [min, max]. Throws on non-numeric input. */
function parseRange(val: string, suffix = false): [number, number] {
	const num = (s: string): number => {
		const t = s.trim();
		if (suffix) {
			if (t.endsWith("k") || t.endsWith("K"))
				return Number(t.slice(0, -1)) * 1_000;
			if (t.endsWith("m") || t.endsWith("M"))
				return Number(t.slice(0, -1)) * 1_000_000;
		}
		const n = Number(t);
		// reject garbage input (e.g. --in=abc) instead of silently producing NaN
		if (Number.isNaN(n)) throw new Error(`not a number: '${t}'`);
		return n;
	};
	const parts = val.split(":");
	if (parts.length === 1) return [0, num(parts[0]!)];
	const lo = parts[0] !== "" ? num(parts[0]!) : 0;
	const hi = parts[1] !== "" ? num(parts[1]!) : Number.POSITIVE_INFINITY;
	return [lo, hi];
}

/** Human-readable context: 262144 -> "262k", 1M -> "1M". */
function fmtCtx(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
	return String(n);
}

/** Release age label: <7d green, <30d cyan, <1y "Xmo", else "Xy". */
function releaseLabel(created: number | null): string {
	if (!created) return "N/A";
	const days = Math.floor((Date.now() / 1000 - created) / 86400);
	if (days < 7) return ansi(`${days}d`, C_GREEN);
	if (days < 30) return ansi(`${days}d`, C_CYAN);
	if (days < 365) return `${Math.floor(days / 30)}mo`;
	return `${Math.floor(days / 365)}y`;
}

export default defineCommand({
	meta: {
		name: "models",
		description:
			"List models with price/context/release filters and live health probe",
	},
	args: {
		list: { type: "boolean", alias: "l", description: "Show full table" },
		count: {
			type: "boolean",
			alias: "n",
			description: "Show total model count",
		},
		mine: {
			type: "boolean",
			alias: "m",
			description: "Show user-specific models",
		},
		check: {
			type: "boolean",
			alias: "c",
			description: "Live health probe (latency + status)",
		},
		"healthy-only": {
			type: "boolean",
			alias: "H",
			description: "With --check: show healthy models only",
		},
		in: {
			type: "string",
			valueHint: "RANGE",
			description: "Input price $/M: 0.15 | 0.1:0.5 | 0.5:",
		},
		out: {
			type: "string",
			valueHint: "RANGE",
			description: "Output price $/M: same format",
		},
		context: {
			type: "string",
			alias: "x",
			valueHint: "RANGE",
			description: "Context length: 128k | 200k:1M | :500k",
		},
		release: {
			type: "string",
			alias: "r",
			valueHint: "DATE",
			description: "Released after: YYYY-MM-DD | 30d | 1m | 1y",
		},
	},
	async run({ args }) {
		const client = getClient();
		const errors: string[] = [];

		// ── Shortcuts ──────────────────────────────────────────────────────
		if (args.count) {
			try {
				const res = await client.models.count();
				const n = res.data?.count ?? "?";
				return fmtSection(ICON.count, "MODEL COUNT") + `\n• Total: ${n}`;
			} catch (err) {
				return fmtError(
					"MODELS ERROR",
					err,
					"Check OPENROUTER_API_KEY in .env",
				);
			}
		}
		if (args.mine) {
			try {
				const iter = await client.models.listForUser({
					bearer: process.env.OPENROUTER_API_KEY ?? "",
				});
				const models: Array<{ id: string; authentication?: string | null }> =
					[];
				for await (const page of iter) {
					models.push(
						...((page.result?.data ?? []) as Array<{
							id: string;
							authentication?: string | null;
						}>),
					);
				}
				const lines = [
					`${ICON.user} ${ansi("MY MODELS", C_BOLD)} (${models.length})`,
					DIVIDER,
				];
				for (const m of models) {
					lines.push(
						`  • ${m.id}${m.authentication ? ` [${m.authentication}]` : ""}`,
					);
				}
				return lines.join("\n");
			} catch (err) {
				return fmtError(
					"MODELS ERROR",
					err,
					"Check OPENROUTER_API_KEY in .env",
				);
			}
		}

		// ── Parse filters ──────────────────────────────────────────────────
		let inMin = 0,
			inMax = Number.POSITIVE_INFINITY;
		let outMin = 0,
			outMax = Number.POSITIVE_INFINITY;
		let ctxMin = 0,
			ctxMax = Number.POSITIVE_INFINITY;
		let releaseDate: Date | null = null;

		const inRaw = args.in
			? String(args.in).startsWith("=")
				? String(args.in).slice(1)
				: String(args.in)
			: undefined;
		const outRaw = args.out
			? String(args.out).startsWith("=")
				? String(args.out).slice(1)
				: String(args.out)
			: undefined;
		const ctxRaw = args.context
			? String(args.context).startsWith("=")
				? String(args.context).slice(1)
				: String(args.context)
			: undefined;

		if (inRaw) {
			try {
				[inMin, inMax] = parseRange(inRaw);
			} catch {
				errors.push(
					`Invalid --in: '${args.in}' (format: 0.15 | 0.1:0.5 | 0.5:)`,
				);
			}
		}
		if (outRaw) {
			try {
				[outMin, outMax] = parseRange(outRaw);
			} catch {
				errors.push(
					`Invalid --out: '${args.out}' (format: 0.15 | 0.1:0.5 | 0.5:)`,
				);
			}
		}
		if (ctxRaw) {
			try {
				[ctxMin, ctxMax] = parseRange(ctxRaw, true);
			} catch {
				errors.push(
					`Invalid --context: '${args.context}' (format: 128k | 200k:1M | :500k)`,
				);
			}
		}
		if (args.release) {
			// citty quirk: -r=30d arrives as "=30d" — strip the stray "="
			const v = args.release.startsWith("=")
				? args.release.slice(1)
				: args.release;
			try {
				if (v.endsWith("d"))
					releaseDate = new Date(
						Date.now() - Number(v.slice(0, -1)) * 86400_000,
					);
				else if (v.endsWith("m"))
					releaseDate = new Date(
						Date.now() - Number(v.slice(0, -1)) * 30 * 86400_000,
					);
				else if (v.endsWith("y"))
					releaseDate = new Date(
						Date.now() - Number(v.slice(0, -1)) * 365 * 86400_000,
					);
				else {
					releaseDate = new Date(v);
					if (Number.isNaN(releaseDate.getTime())) throw new Error("bad date");
				}
			} catch {
				errors.push(
					`Invalid --release: '${v}' (format: YYYY-MM-DD | 30d | 1m | 1y)`,
				);
			}
		}

		if (errors.length > 0) {
			return (
				`${ICON.error} ${ansi("INPUT ERROR", C_RED)}\n• ` +
				errors.join("\n• ") +
				"\n\nExample: or models --list --in=5 --out=5:10 -r=30d --context=200k"
			);
		}

		// ── Fetch models (paginated) ──────────────────────────────────────
		let models: Model[] = [];
		try {
			const iter = await client.models.list();
			for await (const page of iter) {
				models.push(...((page.result?.data ?? []) as Model[]));
			}
		} catch (err) {
			return fmtError("MODELS ERROR", err, "Check OPENROUTER_API_KEY in .env");
		}

		const modelNames: Record<string, string> = {};
		for (const m of models) if (m.id && m.name) modelNames[m.id] = m.name;

		if (!args.list && !args.check) {
			return (
				`${ICON.robot} ${ansi("MODELS", C_BOLD)}\n${DIVIDER}\n• Total models: ${models.length}\n` +
				`\nUse --list for the table, --check for health probe, --count for total, --mine for your models.\n` +
				`Examples:\n  or models --list --in=0.1:0.5 -x=128k: -r=30d\n  or models --check --in=0.1:0.5\n  or models --count`
			);
		}

		// ── Filter + process ───────────────────────────────────────────────
		const filterDesc: string[] = [];
		if (inMax !== Number.POSITIVE_INFINITY || inMin > 0)
			filterDesc.push(
				`in=${inMin}-${inMax === Number.POSITIVE_INFINITY ? "∞" : inMax}`,
			);
		if (outMax !== Number.POSITIVE_INFINITY || outMin > 0)
			filterDesc.push(
				`out=${outMin}-${outMax === Number.POSITIVE_INFINITY ? "∞" : outMax}`,
			);
		if (releaseDate)
			filterDesc.push(`since=${releaseDate.toISOString().slice(0, 10)}`);
		if (ctxMax !== Number.POSITIVE_INFINITY || ctxMin > 0)
			filterDesc.push(
				`ctx=${fmtCtx(ctxMin)}-${ctxMax === Number.POSITIVE_INFINITY ? "∞" : fmtCtx(ctxMax)}`,
			);
		const filterStr = filterDesc.length > 0 ? filterDesc.join(" | ") : "none";

		const processed: Array<{ model: Model; prompt: number; comp: number }> = [];
		for (const m of models) {
			const pPrompt = Number(m.pricing?.prompt ?? 0) * 1_000_000;
			const pComp = Number(m.pricing?.completion ?? 0) * 1_000_000;
			const createdDt = m.created ? new Date(m.created * 1000) : new Date(0);
			const dateOk = !releaseDate || createdDt >= releaseDate;
			const ctxLen = m.contextLength ?? 0;
			const ctxOk = ctxMin <= ctxLen && ctxLen <= ctxMax;
			if (
				pPrompt >= inMin &&
				pPrompt <= inMax &&
				pComp >= outMin &&
				pComp <= outMax &&
				dateOk &&
				ctxOk
			) {
				processed.push({ model: m, prompt: pPrompt, comp: pComp });
			}
		}

		if (processed.length === 0) {
			return `${ICON.warning} ${ansi("NO MODELS FOUND", C_BOLD)}\n${DIVIDER}\nFilter: ${filterStr}\nTotal scanned: ${models.length}\n\nFilter too strict, try widening the range.`;
		}

		processed.sort((a, b) => a.prompt - b.prompt);

		// ── Health probe ───────────────────────────────────────────────────
		let statusMap: Record<string, { label: string; latency: number }> = {};
		let lastCheckStr = "N/A";
		if (args.check) {
			const statuses: Array<[string, number]> = await Promise.all(
				processed.map((p) => probe(p.model.id)),
			);
			statusMap = Object.fromEntries(
				statuses.map(([id, lat]) => [
					id,
					{ label: lat < 0 ? ICON.eye : ICON.circle, latency: lat },
				]),
			);
			lastCheckStr = "just now";
		}

		// ── Build table ────────────────────────────────────────────────────
		const lines = [
			`${ICON.robot} ${ansi("AVAILABLE MODELS", C_BOLD)} (${processed.length}/${models.length})`,
			`Filter: ${filterStr}`,
		];
		if (args.check) lines.push(`Last Check: ${lastCheckStr}`);
		lines.push(DIVIDER);

		if (args.check) {
			lines.push(
				`  ${"Model".padEnd(28)} ${"Status".padEnd(18)} ${"Lat".padEnd(8)}`,
			);
			lines.push(`  ${"─".repeat(28)} ${"─".repeat(18)} ${"─".repeat(8)}`);
		} else {
			lines.push(
				`  ${"Model".padEnd(28)} | ${"Ctx".padEnd(6)} | ${"In $/M".padStart(6)} | ${"Out $/M".padStart(6)} | ${"Released".padEnd(10)}`,
			);
			lines.push(
				`  ${"─".repeat(28)} | ${"─".repeat(6)} | ${"─".repeat(6)} | ${"─".repeat(6)} | ${"─".repeat(10)}`,
			);
		}

		for (const item of processed) {
			const m = item.model;
			const display = (modelNames[m.id] ?? m.id.split("/").pop() ?? m.id).slice(
				0,
				26,
			);
			if (args.check) {
				const info = statusMap[m.id] ?? { label: ICON.eye, latency: 0 };
				const latStr = info.latency > 0 ? `${info.latency.toFixed(0)}ms` : "-";
				lines.push(
					`  ${display.padEnd(28)} ${info.label.padEnd(18)} ${latStr.padEnd(8)}`,
				);
			} else {
				const ctx = fmtTokens(m.contextLength ?? 0);
				const released = releaseLabel(m.created ?? null);
				const inPrice = item.prompt.toFixed(4).replace(/\.?0+$/, "");
				const outPrice = item.comp.toFixed(4).replace(/\.?0+$/, "");
				lines.push(
					`  ${display.padEnd(28)} | ${ctx.padEnd(6)} | ${inPrice.padStart(6)} | ${outPrice.padStart(6)} | ${released.padEnd(10)}`,
				);
			}
		}

		if (args.check) {
			lines.push(
				`\nLegend: ${ICON.circle} ok · ${ICON.eye} unknown · — no latency data`,
			);
		}

		return lines.join("\n");
	},
});

// ── Health probe helper (standalone function, no client needed) ─────────────
async function probe(modelId: string): Promise<[string, number]> {
	const base = "https://openrouter.ai/api/v1";
	const key =
		process.env.MANAGEMENT_KEY ?? process.env.OPENROUTER_API_KEY ?? "";
	const start = performance.now();
	try {
		const res = await fetch(`${base}/chat/completions`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${key}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model: modelId,
				messages: [{ role: "user", content: "ping" }],
				max_tokens: 16,
			}),
			signal: AbortSignal.timeout(15_000),
		});
		const latency = performance.now() - start;
		if (res.status === 200) return [modelId, latency];
		return [modelId, -res.status]; // negative => non-200, shown as unverified/unknown with no latency
	} catch {
		return [modelId, 0]; // timeout/network => unverified
	}
}
