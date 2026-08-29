// Format helpers: terminal rendering utilities (ported from the legacy Python monitor).
export const C_RESET = "\x1b[0m";
export const C_BOLD = "\x1b[1m";
export const C_DIM = "\x1b[2m";
export const C_RED = "\x1b[91m";
export const C_GREEN = "\x1b[92m";
export const C_YELLOW = "\x1b[93m";
export const C_BLUE = "\x1b[94m";
export const C_CYAN = "\x1b[96m";

/** Wrap text in an ANSI code sequence. */
export function ansi(text: string | number, code: string): string {
	return `${code}${text}${C_RESET}`;
}

export const DIVIDER = "━".repeat(20);

/**
 * Section header: `<icon> <TITLE>` over a divider line.
 * Usage: `fmtSection(ICON.credits, "CREDIT BALANCE")`.
 */
export function fmtSection(icon: string, title: string): string {
	return `${icon} ${ansi(title, C_BOLD)}\n${DIVIDER}`;
}

/** Format a USD value to 4 decimals. */
export function fmtUsd(v: number | string | null | undefined): string {
	const n = Number(v ?? 0);
	return `$${n.toFixed(4)}`;
}

/** Percentage of value/total, 1 decimal. */
export function fmtPct(v: number, total: number): string {
	if (!total) return "0.0%";
	return `${((Number(v) / Number(total)) * 100).toFixed(1)}%`;
}

/** Compact token count: 1_500_000 -> "1.5M", 12_000 -> "12K". */
export function fmtTokens(v: number | string | null | undefined): string {
	const n = Number(v ?? 0);
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
	return String(n);
}

/** Horizontal bar: █ filled / ░ empty, dimmed empty cells. */
export function bar(value: number, maxVal: number, width = 12): string {
	if (maxVal <= 0) return `${C_DIM}${"░".repeat(width)}${C_RESET}`;
	const filled = Math.floor((value / maxVal) * width);
	const filledStr = "█".repeat(filled);
	const emptyStr =
		filled < width ? `${C_DIM}${"░".repeat(width - filled)}${C_RESET}` : "";
	return filledStr + emptyStr;
}

/** Convert simple HTML to Markdown-like plain text and unescape entities. */
export function stripHtml(text: string | null | undefined): string {
	if (!text) return "";
	let out = String(text);
	// normalize newlines for block tags
	out = out.replace(/<\s*(br|br\s*\/|p|div)\s*[^>]*>/gi, "\n");
	out = out.replace(/<\s*(b|strong)\s*>/gi, "**");
	out = out.replace(/<\s*\/\s*(b|strong)\s*>/gi, "**");
	out = out.replace(/<\s*(i|em)\s*>/gi, "_");
	out = out.replace(/<\s*\/\s*(i|em)\s*>/gi, "_");
	out = out.replace(/<\s*code\s*>/gi, "`");
	out = out.replace(/<\s*\/\s*code\s*>/gi, "`");
	out = out.replace(/<\s*pre\s*><\s*code\s*>/gis, "```");
	out = out.replace(/<\s*\/\s*code\s*><\s*\/\s*pre\s*>/gis, "```");
	out = out.replace(/<\s*pre\s*>/gi, "```");
	out = out.replace(/<\s*\/\s*pre\s*>/gi, "```");
	out = out.replace(/<[^>]+>/g, "");
	out = out.replace(/\r\n|\r/g, "\n");
	out = out.replace(/\n{3,}/g, "\n\n");
	return out.trim();
}
