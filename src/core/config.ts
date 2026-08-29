// Config module: env resolution with legacy fallback.
// Precedence: process env → project .env → legacy monitor/.env (read-only, for smooth migration).
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Project root = parent of src/
const PROJECT_ROOT = join(import.meta.dir, "..");
const LEGACY_ENV_CANDIDATES = [
	// legacy monitor diarsipkan 2026-08-29 — fallback read-only untuk migrasi
	join(homedir(), "archive", "monitor", ".env"),
	join(homedir(), ".kilo", "gateway.systemd.env"),
];

/** Parse a dotenv file and apply keys only if not already set (immutable: never overwrites). */
function loadEnvFile(path: string): void {
	if (!existsSync(path)) return;
	const content = readFileSync(path, "utf8");
	for (const line of content.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const eq = trimmed.indexOf("=");
		if (eq <= 0) continue;
		const key = trimmed.slice(0, eq).trim();
		let value = trimmed.slice(eq + 1).trim();
		// strip matching surrounding quotes
		if (
			value.length >= 2 &&
			(value[0] === '"' || value[0] === "'") &&
			value.at(-1) === value[0]
		) {
			value = value.slice(1, -1);
		}
		if (!(key in process.env)) process.env[key] = value;
	}
}

// Load order matters: project .env wins over legacy fallbacks.
loadEnvFile(join(PROJECT_ROOT, ".env"));
for (const p of LEGACY_ENV_CANDIDATES) loadEnvFile(p);

/** API key for read-only commands (models, benchmarks, credits balance). */
export const API_KEY = process.env.OPENROUTER_API_KEY ?? "";

/** Management key for privileged commands (keys CRUD, analytics, activity). Falls back to public key. */
export const MGMT_KEY =
	process.env.MANAGEMENT_KEY ?? process.env.OPENROUTER_API_KEY ?? "";

/** Low-balance threshold (USD) for the credits alert. */
export const CREDIT_ALERT_THRESHOLD = 9.0;

/** App identity sent to OpenRouter for rankings attribution. */
export const APP_REFERER = "https://github.com/shobixlinuxdev/openrouter-cli";
export const APP_TITLE = "OpenRouter CLI";
