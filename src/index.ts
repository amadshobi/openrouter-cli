// Entry point — boot the CLI (bun build --compile target).
import { runCommand, showUsage } from "citty";
import { main as rootCmd } from "./cli.ts";
import { ICON } from "./core/icon.ts";

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
		// read version from the root command meta — single source of truth
		const metaVal = await rootCmd.meta;
		const meta = typeof metaVal === "function" ? await metaVal() : metaVal;
		return meta?.version ?? "0.0.0";
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
		// unknown command at current level → fail fast with actionable message
		if (
			subCommands &&
			Object.keys(subCommands).length > 0 &&
			next &&
			!(next in subCommands) &&
			!next.startsWith("-")
		) {
			await showUsage(cmd);
			const cmdName = cmd.meta?.name
				? cmd === rootCmd
					? "or"
					: `or ${cmd.meta.name}`
				: "or";
			return `${ICON.error} Unknown command: ${next}\n   Run \`${cmdName} --help\` to list commands.`;
		}
		if (!subCommands || !next || !(next in subCommands)) break;
		cmd = subCommands[next];
		rest = rest.slice(1);
		args = rest;
	}

	// builtin help for the resolved command (deepest level)
	if (args.includes("--help") || args.includes("-h")) {
		await showUsage(cmd);
		const examples =
			(cmd as { examples?: string[] }).examples ??
			(
				(await (typeof cmd.meta === "function" ? cmd.meta() : cmd.meta)) as
					| { examples?: string[] }
					| undefined
			)?.examples;
		if (examples && Array.isArray(examples) && examples.length > 0) {
			console.log("EXAMPLES\n");
			for (const ex of examples) {
				console.log(`  ${ex}`);
			}
			console.log();
		}
		return "";
	}

	// root help / unknown command
	if (rest.includes("--help") || rest.includes("-h")) {
		await showUsage(rootCmd);
		const examples =
			(rootCmd as { examples?: string[] }).examples ??
			(
				(await (typeof rootCmd.meta === "function"
					? rootCmd.meta()
					: rootCmd.meta)) as { examples?: string[] } | undefined
			)?.examples;
		if (examples && Array.isArray(examples) && examples.length > 0) {
			console.log("EXAMPLES\n");
			for (const ex of examples) {
				console.log(`  ${ex}`);
			}
			console.log();
		}
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
