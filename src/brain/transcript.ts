/**
 * Shared transcript helpers for reading Pi message content.
 */

/** Flatten a Pi message's `content` (string or array of text parts) into plain text. */
export function getMessageText(message: unknown): string {
	if (typeof message !== "object" || message === null) return "";
	const content = (message as { content?: unknown }).content;
	if (typeof content === "string") return content.trim();
	if (!Array.isArray(content)) return "";

	const parts: string[] = [];
	for (const block of content) {
		if (typeof block === "string") {
			parts.push(block);
			continue;
		}
		if (typeof block !== "object" || block === null) continue;
		const typed = block as { type?: unknown; text?: unknown; content?: unknown };
		if (typed.type === "text" && typeof typed.text === "string") parts.push(typed.text);
		else if (typed.type === "text" && typeof typed.content === "string") parts.push(typed.content);
	}
	return parts.join("\n").trim();
}
