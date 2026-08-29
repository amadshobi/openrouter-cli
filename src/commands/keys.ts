// Command: or keys — full API key management via official SDK.
// list | create | update | disable/enable | delete
import { defineCommand } from "citty";
import { getClient } from "../core/client.ts";
import { fmtError } from "../core/errors.ts";
import {
	ansi,
	bar,
	fmtUsd,
	C_BOLD,
	C_GREEN,
	C_RED,
	C_RESET,
	C_YELLOW,
} from "../core/format.ts";

type KeyRow = {
	name: string;
	label: string;
	hash: string;
	disabled: boolean;
	usage: number;
	usageDaily: number;
	usageWeekly: number;
	usageMonthly: number;
	byokUsage: number;
	byokUsageDaily: number;
	byokUsageWeekly: number;
	byokUsageMonthly: number;
	includeByokInLimit: boolean;
	limit: number | null;
	limitRemaining: number | null;
	limitReset: string | null;
	expiresAt: string | null;
	createdAt: string;
	updatedAt: string | null;
};

/** Limit-reset label: "daily" → "D", "weekly" → "W", "monthly" → "M", null → "—". */
function resetLabel(r: string | null): string {
	if (r === "daily") return "D";
	if (r === "weekly") return "W";
	if (r === "monthly") return "M";
	return "—";
}

export default defineCommand({
	meta: {
		name: "keys",
		description: "API key management (list/create/update/disable/delete)",
	},
	subCommands: {
		list: defineCommand({
			meta: {
				name: "list",
				description: "List all API keys with multi-window spend",
			},
			args: {
				search: {
					type: "positional",
					required: false,
					description: "Filter by key name",
				},
			},
			async run({ args }) {
				const client = getClient();
				try {
					const res = await client.apiKeys.list({
						includeDisabled: true,
						offset: 0,
					});
					let keys = (res.data ?? []) as KeyRow[];
					if (args.search) {
						const term = String(args.search).toLowerCase();
						keys = keys.filter((k) => k.name.toLowerCase().includes(term));
					}
					keys.sort((a, b) => b.usage - a.usage);

					const lines = [
						`🔑 ${ansi("API KEYS", C_BOLD)} (${keys.length})`,
						"━━━━━━━━━━━━━━━━━━━━",
						`  ${"Name".padEnd(22)} ${"Total".padStart(8)} ${"Mo".padStart(8)} ${"Wk".padStart(7)} ${"Today".padStart(7)} ${"BYOK".padStart(8)}  ${"Limit".padStart(9)} ${"Reset".padEnd(4)} ${"Status".padEnd(8)}`,
						`  ${"─".repeat(22)} ${"─".repeat(8)} ${"─".repeat(8)} ${"─".repeat(7)} ${"─".repeat(7)} ${"─".repeat(8)}  ${"─".repeat(9)} ${"─".repeat(4)} ${"─".repeat(8)}`,
					];

					for (const k of keys) {
						const name = k.name.slice(0, 20).padEnd(22);
						const byok = k.byokUsage > 0 ? fmtUsd(k.byokUsage) : "—";
						const limit = k.limit !== null ? fmtUsd(k.limit) : "∞";
						const reset = resetLabel(k.limitReset);
						const status = k.disabled
							? ansi("✗ disabled", C_RED)
							: ansi("✓ active", C_GREEN);
						lines.push(
							`  ${name} ${fmtUsd(k.usage).padStart(8)} ${fmtUsd(k.usageMonthly).padStart(8)} ${fmtUsd(k.usageWeekly).padStart(7)} ${fmtUsd(k.usageDaily).padStart(7)} ${byok.padStart(8)}  ${limit.padStart(9)} ${reset.padEnd(4)} ${status}`,
						);
					}
					return lines.join("\n");
				} catch (err) {
					return fmtError(
						"KEYS ERROR",
						err,
						"Cek MANAGEMENT_KEY di .env (butuh management key)",
					);
				}
			},
		}),
		create: defineCommand({
			meta: {
				name: "create",
				description: "Create a new API key (plaintext key shown ONCE)",
			},
			args: {
				name: { type: "positional", description: "Key name", required: true },
				limit: {
					type: "string",
					description: "Spending limit in USD (e.g. 5.00)",
				},
				"limit-reset": {
					type: "enum",
					options: ["daily", "weekly", "monthly"],
					description: "Limit reset period",
				},
				expires: {
					type: "string",
					description: "Expiry (ISO date, e.g. 2027-01-01 or 30d)",
				},
				"include-byok": {
					type: "boolean",
					description: "Include BYOK usage in limit",
				},
			},
			async run({ args }) {
				const client = getClient();
				const name = String(args.name).trim();
				if (!name)
					return fmtError(
						"KEYS ERROR",
						new Error("Nama key wajib diisi"),
						"Contoh: or keys create my-key --limit=5 --limit-reset=daily",
					);

				let limit: number | null = null;
				if (args.limit) {
					limit = Number(
						String(args.limit).startsWith("=")
							? String(args.limit).slice(1)
							: args.limit,
					);
					if (Number.isNaN(limit))
						return fmtError(
							"KEYS ERROR",
							new Error(`Invalid --limit: '${args.limit}'`),
							"Contoh: --limit=5.00",
						);
				}

				let expiresAt: Date | null = null;
				if (args.expires) {
					const v = String(args.expires).startsWith("=")
						? String(args.expires).slice(1)
						: String(args.expires);
					if (v.endsWith("d"))
						expiresAt = new Date(
							Date.now() + Number(v.slice(0, -1)) * 86400_000,
						);
					else {
						expiresAt = new Date(v);
						if (Number.isNaN(expiresAt.getTime()))
							return fmtError(
								"KEYS ERROR",
								new Error(`Invalid --expires: '${v}'`),
								"Contoh: --expires=2027-01-01 atau 30d",
							);
					}
				}

				try {
					const res = await client.apiKeys.create({
						requestBody: {
							name,
							limit: limit ?? null,
							limitReset: args["limit-reset"] as
								| "daily"
								| "weekly"
								| "monthly"
								| null
								| undefined,
							expiresAt: expiresAt ?? null,
							includeByokInLimit: args["include-byok"] ?? false,
						},
					});
					const key = res.data;
					// OpenRouter no longer returns plaintext key (write-only) — only truncated label
					const label = (key as any)?.label ?? "?";
					const lines = [
						`🔑 ${ansi("KEY CREATED", C_BOLD)}`,
						"━━━━━━━━━━━━━━━━━━━━",
						`  • Name:   ${key?.name ?? name}`,
						`  • Hash:   ${key?.hash ?? "?"}`,
						`  • Label:  ${label}`,
						`  • Limit:  ${key?.limit !== null && key?.limit !== undefined ? fmtUsd(key.limit) : "∞"}`,
						`  • Reset:  ${resetLabel(key?.limitReset ?? null)}`,
						"",
						`ℹ️  OpenRouter tidak mengembalikan plaintext key (write-only).`,
						`   Hash di atas adalah pengenal key untuk operasi selanjutnya.`,
					];
					return lines.join("\n");
				} catch (err) {
					return fmtError(
						"KEYS CREATE ERROR",
						err,
						"Cek MANAGEMENT_KEY di .env (butuh management key)",
					);
				}
			},
		}),
		update: defineCommand({
			meta: {
				name: "update",
				description: "Update key: name, limit, limit-reset",
			},
			args: {
				hash: {
					type: "positional",
					description: "Key hash (from list)",
					required: true,
				},
				name: { type: "string", description: "New key name" },
				limit: { type: "string", description: "New spending limit (USD)" },
				"limit-reset": {
					type: "enum",
					options: ["daily", "weekly", "monthly"],
					description: "New limit reset period",
				},
			},
			async run({ args }) {
				const client = getClient();
				const hash = String(args.hash);
				const body: Record<string, unknown> = {};
				if (args.name) body.name = String(args.name);
				if (args.limit) {
					const v = String(args.limit).startsWith("=")
						? String(args.limit).slice(1)
						: String(args.limit);
					const n = Number(v);
					if (Number.isNaN(n))
						return fmtError(
							"KEYS UPDATE ERROR",
							new Error(`Invalid --limit: '${v}'`),
						);
					body.limit = n;
				}
				if (args["limit-reset"]) body.limitReset = args["limit-reset"];
				if (Object.keys(body).length === 0) {
					return fmtError(
						"KEYS UPDATE ERROR",
						new Error("Tidak ada field yang diupdate"),
						"Contoh: or keys update <hash> --name=new-name --limit=10 --limit-reset=monthly",
					);
				}
				try {
					await client.apiKeys.update({ hash, requestBody: body as any });
					return `✅ ${ansi("KEY UPDATED", C_GREEN)}\n  • Hash: ${hash}\n  • Field: ${Object.keys(body).join(", ")}`;
				} catch (err) {
					return fmtError(
						"KEYS UPDATE ERROR",
						err,
						"Cek MANAGEMENT_KEY di .env",
					);
				}
			},
		}),
		disable: defineCommand({
			meta: { name: "disable", description: "Disable an API key" },
			args: {
				hash: {
					type: "positional",
					description: "Key hash (from list)",
					required: true,
				},
			},
			async run({ args }) {
				const client = getClient();
				try {
					await client.apiKeys.update({
						hash: String(args.hash),
						requestBody: { disabled: true },
					});
					return `🔴 ${ansi("KEY DISABLED", C_RED)}\n  • Hash: ${args.hash}`;
				} catch (err) {
					return fmtError(
						"KEYS DISABLE ERROR",
						err,
						"Cek MANAGEMENT_KEY di .env",
					);
				}
			},
		}),
		enable: defineCommand({
			meta: { name: "enable", description: "Re-enable a disabled API key" },
			args: {
				hash: {
					type: "positional",
					description: "Key hash (from list)",
					required: true,
				},
			},
			async run({ args }) {
				const client = getClient();
				try {
					await client.apiKeys.update({
						hash: String(args.hash),
						requestBody: { disabled: false },
					});
					return `🟢 ${ansi("KEY ENABLED", C_GREEN)}\n  • Hash: ${args.hash}`;
				} catch (err) {
					return fmtError(
						"KEYS ENABLE ERROR",
						err,
						"Cek MANAGEMENT_KEY di .env",
					);
				}
			},
		}),
		delete: defineCommand({
			meta: { name: "delete", description: "Delete an API key (irreversible)" },
			args: {
				hash: {
					type: "positional",
					description: "Key hash (from list)",
					required: true,
				},
				yes: { type: "boolean", alias: "y", description: "Skip confirmation" },
			},
			async run({ args }) {
				const client = getClient();
				const hash = String(args.hash);
				// Non-interactive guard: never auto-confirm destructive ops
				if (!args.yes) {
					return `⚠️  ${ansi("KONFIRMASI DIBUTUHKAN", C_YELLOW)}\n  Key hash: ${hash}\n  Jalankan ulang dengan flag --yes untuk konfirmasi penghapusan permanen.`;
				}
				try {
					await client.apiKeys.delete({ hash });
					return `🗑️  ${ansi("KEY DELETED", C_RED)}\n  • Hash: ${hash}`;
				} catch (err) {
					return fmtError(
						"KEYS DELETE ERROR",
						err,
						"Cek MANAGEMENT_KEY di .env",
					);
				}
			},
		}),
	},
});
