/**
 * `/brain` command — status, vault bootstrap, and docs adoption.
 *
 *   /brain                         → show where the brain lives and how many notes it holds
 *   /brain init                    → create the project vault, asking first if docs exist
 *   /brain init --mode index       → create the vault plus an external-docs index
 *   /brain init --mode empty       → create the starter vault and ignore existing docs
 *   /brain migrate                 → ask how to adopt existing docs
 *   /brain migrate --mode index    → create/update brain/external-docs.md
 */

import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { bootstrapBrain } from "../brain/bootstrap.js";
import {
	nodeBootstrapOps,
	nodeDocsDiscoveryOps,
	nodeDocsIndexOps,
	nodeLocateOps,
	nodeReindexOps,
} from "../brain/fs-ops.js";
import { locateBrain } from "../brain/locate.js";
import { discoverExistingDocs, type ExistingDoc, writeExternalDocsIndex } from "../brain/migrate.js";
import { reindexBrain } from "../brain/reindex.js";

/** Absolute path to the bundled starter vault (`src/assets/brain`). */
function assetsBrainDir(): string {
	const here = path.dirname(fileURLToPath(import.meta.url));
	// src/commands -> src/assets/brain
	return path.resolve(here, "..", "assets", "brain");
}

type BrainMode = "ask" | "index" | "empty";

function parseMode(args: string): { command: string; mode: BrainMode } {
	const parts = args.trim().split(/\s+/).filter(Boolean);
	const command = parts[0] ?? "";
	const modeFlag = parts.find((part) => part.startsWith("--mode="));
	const modeIndex = parts.indexOf("--mode");
	const mode = modeFlag?.slice("--mode=".length) ?? (modeIndex === -1 ? undefined : parts[modeIndex + 1]);
	return { command, mode: mode === "index" || mode === "empty" ? mode : "ask" };
}

function docsList(docs: ExistingDoc[]): string {
	return docs
		.slice(0, 8)
		.map((doc) => `- ${doc.path}`)
		.join("\n");
}

function askForDocsChoice(
	command: "init" | "migrate",
	docs: ExistingDoc[],
	ctx: { ui: { notify: (message: string, level: "info") => void } },
): void {
	ctx.ui.notify(
		`Found existing project docs:\n${docsList(docs)}\n\nHow should Brain handle them?\n\nRecommended: keep them where they are and create a Brain index.\n\nRun one of:\n  /brain ${command} --mode=index   # index existing docs only\n  /brain ${command} --mode=empty   # create Brain and ignore existing docs`,
		"info",
	);
}

function bootstrap(loc: { brainDir: string }) {
	return bootstrapBrain(assetsBrainDir(), loc.brainDir, nodeBootstrapOps);
}

function indexDocs(loc: { brainDir: string }, docs: ExistingDoc[]): boolean {
	const result = writeExternalDocsIndex(loc.brainDir, docs, nodeDocsIndexOps);
	reindexBrain(loc.brainDir, nodeReindexOps);
	return result.created;
}

export function registerBrainCommand(pi: ExtensionAPI): void {
	pi.registerCommand("brain", {
		description: "Show brain status, `init` a vault, or `migrate` existing docs",
		getArgumentCompletions: (prefix) =>
			["init", "migrate"].filter((cmd) => cmd.startsWith(prefix)).map((value) => ({ value, label: value })),
		handler: async (args, ctx) => {
			const loc = locateBrain(ctx.cwd, nodeLocateOps);
			const { command, mode } = parseMode(args);
			const docs = discoverExistingDocs(loc.root, nodeDocsDiscoveryOps);

			if (command === "init") {
				if (!loc.exists && docs.length > 0 && mode === "ask") {
					askForDocsChoice("init", docs, ctx);
					return;
				}

				const result = bootstrap(loc);
				const indexed = mode === "index" && docs.length > 0 ? indexDocs(loc, docs) : false;
				if (result.created.length === 0 && !indexed) {
					ctx.ui.notify(
						`Brain already present at ${loc.brainDir} (${result.skipped.length} files). Nothing to do.`,
						"info",
					);
					return;
				}
				ctx.ui.notify(
					`Initialized brain/ at ${loc.brainDir} — ${result.created.length} starter notes${indexed ? " plus external-docs.md" : ""}. Commit it to share with your team.`,
					"info",
				);
				return;
			}

			if (command === "migrate") {
				if (docs.length === 0) {
					ctx.ui.notify("No existing project docs detected. Nothing to migrate.", "info");
					return;
				}
				if (mode === "ask") {
					askForDocsChoice("migrate", docs, ctx);
					return;
				}
				if (mode === "empty") {
					ctx.ui.notify("Skipped docs migration. Existing docs were left untouched.", "info");
					return;
				}

				if (!loc.exists) bootstrap(loc);
				const created = indexDocs(loc, docs);
				ctx.ui.notify(
					`${created ? "Created" : "Kept existing"} ${path.join(loc.brainDir, "external-docs.md")} pointing at existing docs. Existing docs were left untouched.`,
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
