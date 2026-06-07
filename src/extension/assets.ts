/** Asset path helpers for bundled extension resources. */

import * as path from "node:path";
import { fileURLToPath } from "node:url";

/** `src/extension` -> `src/assets/skills` (bundled learning-loop skills). */
export function bundledSkillsDir(): string {
	const here = path.dirname(fileURLToPath(import.meta.url));
	return path.resolve(here, "..", "assets", "skills");
}
