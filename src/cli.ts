// CLI registry: root command + subcommand wiring (dual-level help via citty).
import { defineCommand } from "citty";

import creditsCmd from "./commands/credits.ts";
import modelsCmd from "./commands/models.ts";
import benchmarksCmd from "./commands/benchmarks.ts";
import activityCmd from "./commands/activity.ts";
import analyticsCmd from "./commands/analytics.ts";
import keysCmd from "./commands/keys.ts";

export const main = defineCommand({
	meta: {
		name: "or",
		version: "1.1.0",
		description:
			"OpenRouter Control Center — credits, models, benchmarks, analytics & API key management",
	},
	subCommands: {
		credits: creditsCmd,
		models: modelsCmd,
		benchmarks: benchmarksCmd,
		activity: activityCmd,
		analytics: analyticsCmd,
		keys: keysCmd,
	},
});
