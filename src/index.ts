// Entry point — boot the CLI (bun build --compile target).
import { runCommand, showUsage } from "citty";
import { main as rootCmd } from "./cli.ts";

const rawArgs = process.argv.slice(2);

/**
 * citty's runMain does NOT print a subcommand's run() return value (v0.2.2 quirk),
 * and nested subcommand results are swallowed too. So we resolve the command tree
 * manually: walk rawArgs down subCommands → run the deepest command → print result.
 */
async function dispatch(): Promise<string> {
	if (rawArgs.length === 0) {
		await showUsage(rootCmd);
		return "";
	}
	if (rawArgs.includes("--version") || rawArgs.includes("-v")) {
		return "1.0.0";
	}

	// walk down the command tree
	let cmd: any = rootCmd;
	let rest = [...rawArgs];
	let args: string[] = [];

	while (true) {
		const subCommands = (await cmd.subCommands) as
			| Record<string, any>
			| undefined;
		const next = rest[0];
		// unknown command at root level → fail fast with actionable message
		if (
			cmd === rootCmd &&
			subCommands &&
			next &&
			!(next in subCommands) &&
			!next.startsWith("-")
		) {
			await showUsage(rootCmd);
			return `❌ Unknown command: ${next}\n   Run \`or --help\` to list commands.`;
		}
		if (!subCommands || !next || !(next in subCommands)) break;
		cmd = subCommands[next];
		rest = rest.slice(1);
		args = rest;
	}

	// builtin help for the resolved command (deepest level)
	if (args.includes("--help") || args.includes("-h")) {
		await showUsage(cmd);
		return "";
	}

	// root help / unknown command
	if (rest.includes("--help") || rest.includes("-h")) {
		await showUsage(rootCmd);
		return "";
	}

	const { result } = await runCommand(cmd, { rawArgs: args });
	return typeof result === "string" ? result : "";
}

// citty throws for missing required positional args / unknown subcommands —
// surface them as clean errors instead of raw stack traces.
async function boot(): Promise<void> {
	try {
		const out = await dispatch();
		if (out.length > 0) console.log(out);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		// strip citty's internal stack preamble (line numbers) if present
		const clean = msg
			.split("\n")
			.find((l) => !/^\s*\d+ \|/.test(l) && !/^\s*$/.test(l))
			?.trim();
		console.error(clean ?? msg);
		process.exit(1);
	}
}

await boot();
