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

/**
 * Each loop command forwards to its `/skill:<name>` by default. A `message`
 * override lets a command drive something other than the skill markdown — e.g.
 * `ruminate` is backed by the `ruminate` tool, so it routes the agent there
 * instead. `suffix` is the user's trailing args (already space-prefixed).
 */
interface LoopSkill {
	name: string;
	description: string;
	message?: (suffix: string) => string;
}

const LOOP_SKILLS: LoopSkill[] = [
	{ name: "reflect", description: "Reflect on this session and persist learnings to the brain" },
	{
		name: "ruminate",
		description: "Mine past sessions for patterns reflect missed",
		message: (suffix) =>
			`Use the ruminate tool to mine past sessions${suffix}. Present the report and do not apply changes without approval.`,
	},
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
				// Default: forward to the skill command; pi expands /skill:<name> on input.
				pi.sendUserMessage(skill.message ? skill.message(suffix) : `/skill:${skill.name}${suffix}`);
			},
		});
	}
}
