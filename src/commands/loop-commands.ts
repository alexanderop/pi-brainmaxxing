/**
 * Convenience aliases for the learning-loop skills.
 *
 * The skills themselves are shipped in `assets/skills` and exposed to every
 * project via `resources_discover`, so pi already registers them as
 * `/skill:reflect`, `/skill:meditate`, etc. These thin commands mirror
 * brainmaxxing's bare `/reflect` UX by forwarding to the skill — arguments are
 * passed straight through.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const LOOP_SKILLS: Array<{ name: string; description: string }> = [
	{ name: "reflect", description: "Reflect on this session and persist learnings to the brain" },
	{ name: "ruminate", description: "Mine past sessions for patterns reflect missed" },
	{ name: "meditate", description: "Audit and prune the brain; evolve principles and skills" },
	{ name: "plan", description: "Break a task into phased plans grounded in your principles" },
	{ name: "review", description: "Principle-grounded review of code or a plan" },
];

export function registerLoopCommands(pi: ExtensionAPI): void {
	for (const skill of LOOP_SKILLS) {
		pi.registerCommand(skill.name, {
			description: skill.description,
			handler: async (args, _ctx) => {
				const suffix = args.trim() ? ` ${args.trim()}` : "";
				// Forward to the skill command; pi expands /skill:<name> on input.
				pi.sendUserMessage(`/skill:${skill.name}${suffix}`);
			},
		});
	}
}
