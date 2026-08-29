// Error handling: fail-fast with actionable hints (no stack traces by default).
import { C_BOLD, C_DIM, C_RED, C_RESET, C_YELLOW } from "./format.ts";

/** Extract the human message from any thrown value. */
function messageOf(err: unknown): string {
	if (err instanceof Error) return err.message;
	return String(err);
}

/** Render a command failure as a clean 3-line block: header, reason, hint. */
export function fmtError(title: string, err: unknown, hint?: string): string {
	const header = `❌ ${C_RED}${C_BOLD}${title}${C_RESET}`;
	const lines = [header, `   ${C_YELLOW}${messageOf(err)}${C_RESET}`];
	if (hint) lines.push(`   ${C_DIM}hint: ${hint}${C_RESET}`);
	return lines.join("\n");
}

/** Error for missing API keys at the CLI boundary. */
export class MissingKeyError extends Error {
	constructor(keyName: string) {
		super(
			`API key ${keyName} tidak ditemukan. Atur di .env atau environment variable.`,
		);
		this.name = "MissingKeyError";
	}
}

/** Resolve the public key or throw a friendly error. */
export function requireApiKey(): string {
	const key = process.env.OPENROUTER_API_KEY;
	if (!key) throw new MissingKeyError("OPENROUTER_API_KEY");
	return key;
}

/** Resolve the management key (falls back to public key) or throw. */
export function requireMgmtKey(): string {
	const key = process.env.MANAGEMENT_KEY || process.env.OPENROUTER_API_KEY;
	if (!key) throw new MissingKeyError("MANAGEMENT_KEY / OPENROUTER_API_KEY");
	return key;
}
