#!/usr/bin/env node
/**
 * Extract user + assistant text from Pi session JSONL files into readable
 * batches for the `ruminate` skill.
 *
 * Pi stores sessions at:
 *   ~/.pi/agent/sessions/--<cwd-with-slashes-as-dashes>--/<timestamp>_<id>.jsonl
 *
 * Each line is a JSON object. Lines with `type:"message"` carry
 * `.message.role` ("user" | "assistant" | "toolResult") and `.message.content`,
 * an array of parts ({ type:"text", text } among others).
 *
 * Usage:
 *   node extract-sessions.mjs <sessions-dir> <out-dir> [--batches N] [--from YYYY-MM-DD] [--to YYYY-MM-DD]
 *
 * Output:
 *   <out-dir>/NNN_<id>.txt          one readable transcript per session
 *   <out-dir>/batches/batch_K.txt   manifest listing the transcripts in batch K
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function parseArgs(argv) {
	const args = { batches: 4 };
	const positional = [];
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--batches") args.batches = Number(argv[++i]);
		else if (a === "--from") args.from = argv[++i];
		else if (a === "--to") args.to = argv[++i];
		else positional.push(a);
	}
	args.sessionsDir = positional[0];
	args.outDir = positional[1];
	return args;
}

/** Default sessions dir for a given cwd, matching Pi's dashed-slug scheme. */
export function sessionsDirForCwd(cwd) {
	const slug = `-${cwd.replace(/\//g, "-")}-`;
	return path.join(os.homedir(), ".pi", "agent", "sessions", slug);
}

/** Pull readable text from one session file. Returns "" if nothing useful. */
export function extractSession(jsonl) {
	const out = [];
	for (const line of jsonl.split("\n")) {
		if (!line.trim()) continue;
		let entry;
		try {
			entry = JSON.parse(line);
		} catch {
			continue;
		}
		if (entry.type !== "message" || !entry.message) continue;
		const { role, content } = entry.message;
		if (role !== "user" && role !== "assistant") continue;
		const text = Array.isArray(content)
			? content
					.filter((p) => p && p.type === "text" && typeof p.text === "string")
					.map((p) => p.text)
					.join("\n")
			: typeof content === "string"
				? content
				: "";
		if (text.trim()) out.push(`### ${role}\n${text.trim()}`);
	}
	return out.join("\n\n");
}

function withinDate(mtime, from, to) {
	if (from && mtime < new Date(`${from}T00:00:00Z`).getTime()) return false;
	if (to && mtime > new Date(`${to}T23:59:59Z`).getTime()) return false;
	return true;
}

function main() {
	const args = parseArgs(process.argv.slice(2));
	if (!args.sessionsDir || !args.outDir) {
		console.error("Usage: extract-sessions.mjs <sessions-dir> <out-dir> [--batches N] [--from D] [--to D]");
		process.exit(1);
	}
	if (!fs.existsSync(args.sessionsDir)) {
		console.error(`No sessions dir: ${args.sessionsDir}`);
		process.exit(1);
	}

	const files = fs
		.readdirSync(args.sessionsDir)
		.filter((f) => f.endsWith(".jsonl"))
		.map((f) => path.join(args.sessionsDir, f))
		.filter((p) => {
			const st = fs.statSync(p);
			return st.size > 0 && withinDate(st.mtimeMs, args.from, args.to);
		})
		.sort();

	console.error(`Found ${files.length} session(s) in ${args.sessionsDir}`);
	fs.mkdirSync(path.join(args.outDir, "batches"), { recursive: true });

	const transcripts = [];
	files.forEach((file, i) => {
		const text = extractSession(fs.readFileSync(file, "utf8"));
		if (!text.trim()) return;
		const id = path.basename(file).replace(/\.jsonl$/, "");
		const outPath = path.join(args.outDir, `${String(i).padStart(3, "0")}_${id}.txt`);
		fs.writeFileSync(outPath, text);
		transcripts.push(outPath);
	});

	console.error(`Extracted ${transcripts.length} session(s) with content`);

	const n = Math.max(1, Math.min(args.batches || 1, transcripts.length || 1));
	for (let b = 0; b < n; b++) {
		const batch = transcripts.filter((_, idx) => idx % n === b);
		fs.writeFileSync(path.join(args.outDir, "batches", `batch_${b}.txt`), batch.join("\n"));
		console.error(`Batch ${b}: ${batch.length} session(s)`);
	}
}

// Run only when invoked directly (keeps the helpers importable for tests).
if (import.meta.url === `file://${process.argv[1]}`) main();
