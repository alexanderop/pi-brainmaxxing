/**
 * Shared helpers for spawning bounded child Pi runs.
 *
 * Both auto-reflect and ruminate fan work out to a child `pi -p` process marked
 * with one or more recursion-guard env vars so the child does not re-trigger the
 * same background work. Keeping the invocation contract in one place means a new
 * required flag only has to change here.
 */

export const AUTO_REFLECT_CHILD_ENV = "PI_BRAIN_AUTO_REFLECT_CHILD";
export const RUMINATE_CHILD_ENV = "PI_BRAIN_RUMINATE_CHILD";

/** Forward the parent's `-e/--extension` flags so the child loads the same extensions. */
export function inheritedExtensionArgs(argv: string[] = process.argv.slice(2)): string[] {
	const args: string[] = [];

	for (let i = 0; i < argv.length; i++) {
		const current = argv[i];
		if (!current) continue;
		if (current === "-e" || current === "--extension") {
			const next = argv[i + 1];
			if (next) {
				args.push(current, next);
				i++;
			}
			continue;
		}
		if (current.startsWith("--extension=")) args.push(current);
	}

	return args;
}

/** Build `env GUARD=1 ... pi -p --no-session --no-skills <extensions> <prompt>` for `pi.exec("env", ...)`. */
export function childPiArgs(prompt: string, guards: string[]): string[] {
	return [
		...guards.map((guard) => `${guard}=1`),
		"pi",
		"-p",
		"--no-session",
		"--no-skills",
		...inheritedExtensionArgs(),
		prompt,
	];
}
