/**
 * The `brain` tool — the LLM-facing surface of the vault.
 *
 * Actions: `list`, `read`, `write`. Writes are secret-scanned before they touch
 * disk (the vault is committed to git) and the wikilink index is rebuilt
 * afterwards. File mutations go through pi's per-file queue so a brain write and
 * a concurrent built-in `edit` of the same file can't clobber each other.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { StringEnum } from "@earendil-works/pi-ai";
import {
	type ExtensionAPI,
	type ExtensionContext,
	truncateHead,
	withFileMutationQueue,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { locateBrain } from "../brain/locate.js";
import { nodeBootstrapOps, nodeLocateOps, nodeReindexOps } from "../brain/fs-ops.js";
import { reindexBrain } from "../brain/reindex.js";
import { formatFindings, scanForSecrets } from "../scan/secrets.js";

const parameters = Type.Object({
	action: StringEnum(["list", "read", "write"] as const),
	path: Type.Optional(
		Type.String({
			description: "Vault-relative path, e.g. 'codebase/deploy-gotchas.md'. Required for read/write.",
		}),
	),
	content: Type.Optional(
		Type.String({ description: "Full markdown content to write. Required for write." }),
	),
	allow_secrets: Type.Optional(
		Type.Boolean({
			description: "Set true only if a secret-scan match is a deliberate false positive.",
		}),
	),
});

/** Reject paths that escape the vault (`..`, absolute). */
function resolveInVault(brainDir: string, rel: string): string {
	const normalized = rel.replace(/^@/, "").trim();
	const abs = path.resolve(brainDir, normalized);
	const within = abs === brainDir || abs.startsWith(brainDir + path.sep);
	if (!within) throw new Error(`Path escapes the brain vault: ${rel}`);
	return abs;
}

export function registerBrainTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "brain",
		label: "Brain",
		description:
			"Read, write, and list the project's brain/ memory vault. Use 'write' to persist a " +
			"durable learning (one topic per file, lowercase-hyphenated name); the wikilink index " +
			"is rebuilt automatically. Use 'read' before acting on a topic the brain may cover.",
		promptSnippet: "Read/write the project brain/ memory vault",
		promptGuidelines: [
			"Use brain (action:write) to persist durable codebase knowledge, gotchas, and corrections — not plan-specific notes.",
			"Use brain (action:read) to load a relevant brain file before acting on a topic it may cover.",
		],
		parameters,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx: ExtensionContext) {
			const loc = locateBrain(ctx.cwd, nodeLocateOps);

			if (params.action === "list") {
				const files = nodeReindexOps
					.listMarkdown(loc.brainDir)
					.map((p) => path.relative(loc.brainDir, p))
					.sort();
				const text = files.length
					? `brain/ at ${loc.brainDir}\n\n${files.map((f) => `- ${f}`).join("\n")}`
					: `No brain vault yet. Run /brain init to create one at ${loc.brainDir}.`;
				return { content: [{ type: "text", text }], details: { files } };
			}

			if (!params.path) throw new Error(`'path' is required for action '${params.action}'`);
			const abs = resolveInVault(loc.brainDir, params.path);

			if (params.action === "read") {
				if (!fs.existsSync(abs)) throw new Error(`No such brain file: ${params.path}`);
				const raw = fs.readFileSync(abs, "utf8");
				const { content } = truncateHead(raw, { maxBytes: 50_000, maxLines: 2000 });
				return { content: [{ type: "text", text: content }], details: { path: params.path } };
			}

			// action === "write"
			if (params.content === undefined) throw new Error("'content' is required for action 'write'");

			const findings = scanForSecrets(params.content);
			if (findings.length > 0 && !params.allow_secrets) {
				throw new Error(
					`Refusing to write: possible secret(s) detected (the brain is committed to git):\n${formatFindings(
						findings,
					)}\nRemove them, or pass allow_secrets:true if these are false positives.`,
				);
			}

			return withFileMutationQueue(abs, async () => {
				nodeBootstrapOps.mkdirp(path.dirname(abs));
				fs.writeFileSync(abs, params.content as string, "utf8");

				// Ensure an index exists so reindex can maintain it.
				if (!fs.existsSync(loc.indexFile)) {
					fs.writeFileSync(loc.indexFile, "# Brain\n", "utf8");
				}
				const reindex = reindexBrain(loc.brainDir, nodeReindexOps);

				const warn =
					findings.length > 0 ? ` (secret-scan overridden for ${findings.length} match)` : "";
				return {
					content: [
						{
							type: "text",
							text: `Wrote brain/${params.path}${warn}. Index ${
								reindex.changed ? "rebuilt" : "unchanged"
							}.`,
						},
					],
					details: { path: params.path, indexChanged: reindex.changed },
				};
			});
		},
	});
}
