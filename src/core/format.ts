// Format helpers: terminal rendering utilities (ported from the legacy Python monitor).
export const C_RESET = "\x1b[0m";
export const C_BOLD = "\x1b[1m";
export const C_DIM = "\x1b[2m";
export const C_RED = "\x1b[91m";
export const C_GREEN = "\x1b[92m";
export const C_YELLOW = "\x1b[93m";
export const C_BLUE = "\x1b[94m";
export const C_MAGENTA = "\x1b[95m";
export const C_CYAN = "\x1b[96m";
export const C_WHITE = "\x1b[97m";

/** Wrap text in an ANSI code sequence. */
export function ansi(text: string | number, code: string): string {
	return `${code}${text}${C_RESET}`;
}

export const DIVIDER = "━".repeat(20);

/** Strip ANSI color and style escape codes to get visible length. */
export function stripAnsi(text: string): string {
	return text.replace(/\x1b\[[0-9;]*m/g, "");
}

/** Get visible string width in terminal characters (ignoring ANSI sequences). */
export function visibleWidth(text: string): number {
	return stripAnsi(text).length;
}

/** Pad string to target visual width while preserving ANSI sequences. */
export function padVisual(
	text: string,
	targetWidth: number,
	align: "left" | "right" | "center" = "left",
): string {
	const current = visibleWidth(text);
	if (current >= targetWidth) return text;
	const diff = targetWidth - current;

	if (align === "right") {
		return " ".repeat(diff) + text;
	}
	if (align === "center") {
		const left = Math.floor(diff / 2);
		const right = diff - left;
		return " ".repeat(left) + text + " ".repeat(right);
	}
	return text + " ".repeat(diff);
}

export interface TableColumn {
	header: string;
	align?: "left" | "right" | "center";
	minWidth?: number;
}

export interface RenderTableOptions {
	columns: TableColumn[];
	rows: string[][];
	footerRows?: string[][];
}

/**
 * Render data table with single-line box drawing characters (┌ ┬ ┐ │ ├ ┼ ┤ └ ┴ ┘).
 */
export function renderBoxTable(opts: RenderTableOptions): string {
	const { columns, rows, footerRows = [] } = opts;
	const colCount = columns.length;
	if (colCount === 0) return "";

	// Calculate column widths based on headers, rows, and footers
	const widths: number[] = columns.map((col, idx) => {
		let maxW = Math.max(visibleWidth(col.header), col.minWidth ?? 0);
		for (const row of rows) {
			const cell = row[idx] ?? "";
			maxW = Math.max(maxW, visibleWidth(cell));
		}
		for (const fRow of footerRows) {
			const cell = fRow[idx] ?? "";
			maxW = Math.max(maxW, visibleWidth(cell));
		}
		return maxW;
	});

	const borderTop = `┌─${widths.map((w) => "─".repeat(w)).join("─┬─")}─┐`;
	const borderSep = `├─${widths.map((w) => "─".repeat(w)).join("─┼─")}─┤`;
	const borderBottom = `└─${widths.map((w) => "─".repeat(w)).join("─┴─")}─┘`;

	const formatRow = (cells: string[], isHeader = false) => {
		const formattedCells = widths.map((w, idx) => {
			const cell = cells[idx] ?? "";
			const col = columns[idx];
			const align = isHeader ? "left" : (col?.align ?? "left");
			return padVisual(cell, w, align);
		});
		return `│ ${formattedCells.join(" │ ")} │`;
	};

	const lines: string[] = [];
	lines.push(borderTop);
	lines.push(
		formatRow(
			columns.map((c) => ansi(c.header, C_BOLD)),
			true,
		),
	);
	lines.push(borderSep);

	for (const r of rows) {
		lines.push(formatRow(r));
	}

	if (footerRows.length > 0) {
		lines.push(borderSep);
		for (const fr of footerRows) {
			lines.push(formatRow(fr));
		}
	}

	lines.push(borderBottom);
	return lines.join("\n");
}

export interface RenderBoxCardOptions {
	title?: string;
	lines: string[];
	minWidth?: number;
}

/**
 * Render a single-box card with optional header title.
 */
export function renderBoxCard(opts: RenderBoxCardOptions): string {
	const { title, lines: contentLines, minWidth = 40 } = opts;

	let maxW = minWidth;
	if (title) {
		maxW = Math.max(maxW, visibleWidth(title) + 4);
	}
	for (const line of contentLines) {
		maxW = Math.max(maxW, visibleWidth(line));
	}

	const borderTop = `┌─${"─".repeat(maxW)}─┐`;
	const borderSep = `├─${"─".repeat(maxW)}─┤`;
	const borderBottom = `└─${"─".repeat(maxW)}─┘`;

	const result: string[] = [];
	result.push(borderTop);

	if (title) {
		result.push(`│ ${padVisual(title, maxW, "left")} │`);
		result.push(borderSep);
	}

	for (const line of contentLines) {
		result.push(`│ ${padVisual(line, maxW, "left")} │`);
	}

	result.push(borderBottom);
	return result.join("\n");
}

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
