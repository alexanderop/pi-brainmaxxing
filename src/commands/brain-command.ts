/**
 * `/brain` command — status and one-shot vault bootstrap.
 *
 *   /brain         → show where the brain lives and how many notes it holds
 *   /brain init    → copy the starter vault into the project (idempotent)
 */

import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { bootstrapBrain } from "../brain/bootstrap.js";
import { nodeBootstrapOps, nodeLocateOps, nodeReindexOps } from "../brain/fs-ops.js";
import { locateBrain } from "../brain/locate.js";

/** Absolute path to the bundled starter vault (`src/assets/brain`). */
function assetsBrainDir(): string {
	const here = path.dirname(fileURLToPath(import.meta.url));
	// src/commands -> src/assets/brain
	return path.resolve(here, "..", "assets", "brain");
}

export function registerBrainCommand(pi: ExtensionAPI): void {
	pi.registerCommand("brain", {
		description: "Show brain status, or `init` to create the project vault",
		getArgumentCompletions: (prefix) =>
			"init".startsWith(prefix) ? [{ value: "init", label: "init" }] : null,
		handler: async (args, ctx) => {
			const loc = locateBrain(ctx.cwd, nodeLocateOps);
			const sub = args.trim();

			if (sub === "init") {
				const result = bootstrapBrain(assetsBrainDir(), loc.brainDir, nodeBootstrapOps);
				if (result.created.length === 0) {
					ctx.ui.notify(
						`Brain already present at ${loc.brainDir} (${result.skipped.length} files). Nothing to do.`,
						"info",
					);
					return;
				}
				ctx.ui.notify(
					`Initialized brain/ at ${loc.brainDir} — ${result.created.length} starter notes. Commit it to share with your team.`,
					"info",
				);
				return;
			}

			if (!loc.exists) {
				ctx.ui.notify(
					`No brain vault for this project yet. Run \`/brain init\` to create one at ${loc.brainDir}.`,
					"info",
				);
				return;
			}

			const count = nodeReindexOps.listMarkdown(loc.brainDir).length;
			ctx.ui.notify(`Brain at ${loc.brainDir} — ${count} notes. Index: ${loc.indexFile}`, "info");
		},
	});
}
