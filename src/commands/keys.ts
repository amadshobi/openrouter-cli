// Command: or keys — full API key management via official SDK.
// list | create | update | disable/enable | delete
import { defineCommand } from "citty";
import { getClient } from "../core/client.ts";
import { fmtError } from "../core/errors.ts";
import {
	ansi,
	fmtUsd,
	C_BOLD,
	C_GREEN,
	C_RED,
	C_YELLOW,
} from "../core/format.ts";
import { ICON } from "../core/icon.ts";

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
						`${ICON.key} ${ansi("API KEYS", C_BOLD)} (${keys.length})`,
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
							? ansi(`${ICON.circleOff} disabled`, C_RED)
							: ansi(`${ICON.circle} active`, C_GREEN);
						lines.push(
							`  ${name} ${fmtUsd(k.usage).padStart(8)} ${fmtUsd(k.usageMonthly).padStart(8)} ${fmtUsd(k.usageWeekly).padStart(7)} ${fmtUsd(k.usageDaily).padStart(7)} ${byok.padStart(8)}  ${limit.padStart(9)} ${reset.padEnd(4)} ${status}`,
						);
					}
					return lines.join("\n");
				} catch (err) {
					return fmtError(
						"KEYS ERROR",
						err,
						"Check MANAGEMENT_KEY in .env (management key required)",
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
						"Example: or keys create my-key --limit=5 --limit-reset=daily",
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
							"Example: --limit=5.00",
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
								"Example: --expires=2027-01-01 or 30d",
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
						`${ICON.key} ${ansi("KEY CREATED", C_BOLD)}`,
						"━━━━━━━━━━━━━━━━━━━━",
						`  • Name:   ${key?.name ?? name}`,
						`  • Hash:   ${key?.hash ?? "?"}`,
						`  • Label:  ${label}`,
						`  • Limit:  ${key?.limit !== null && key?.limit !== undefined ? fmtUsd(key.limit) : "∞"}`,
						`  • Reset:  ${resetLabel(key?.limitReset ?? null)}`,
						"",
						`${ICON.info}  OpenRouter does not return the plaintext key (write-only).`,
						`   The hash above identifies the key for later operations.`,
					];
					return lines.join("\n");
				} catch (err) {
					return fmtError(
						"KEYS CREATE ERROR",
						err,
						"Check MANAGEMENT_KEY in .env (management key required)",
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
						new Error("No fields to update"),
						"Example: or keys update <hash> --name=new-name --limit=10 --limit-reset=monthly",
					);
				}
				try {
					await client.apiKeys.update({ hash, requestBody: body as any });
					return `${ICON.check} ${ansi("KEY UPDATED", C_GREEN)}\n  • Hash: ${hash}\n  • Field: ${Object.keys(body).join(", ")}`;
				} catch (err) {
					return fmtError(
						"KEYS UPDATE ERROR",
						err,
						"Check MANAGEMENT_KEY in .env",
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
					return `${ICON.circleOff} ${ansi("KEY DISABLED", C_RED)}\n  • Hash: ${args.hash}`;
				} catch (err) {
					return fmtError(
						"KEYS DISABLE ERROR",
						err,
						"Check MANAGEMENT_KEY in .env",
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
					return `${ICON.circle} ${ansi("KEY ENABLED", C_GREEN)}\n  • Hash: ${args.hash}`;
				} catch (err) {
					return fmtError(
						"KEYS ENABLE ERROR",
						err,
						"Check MANAGEMENT_KEY in .env",
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
					return `${ICON.warning}  ${ansi("CONFIRMATION REQUIRED", C_YELLOW)}\n  Key hash: ${hash}\n  Re-run with --yes to confirm permanent deletion.`;
				}
				try {
					await client.apiKeys.delete({ hash });
					return `${ICON.trash}  ${ansi("KEY DELETED", C_RED)}\n  • Hash: ${hash}`;
				} catch (err) {
					return fmtError(
						"KEYS DELETE ERROR",
						err,
						"Check MANAGEMENT_KEY in .env",
					);
				}
			},
		}),
	},
});
