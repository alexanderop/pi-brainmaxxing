/**
 * Lightweight secret scanner.
 *
 * The brain is committed to git, so a careless write could persist a credential
 * into history. Before any brain write we scan the content for common secret
 * shapes and block (or warn) on a hit. This is a guardrail, not a vault — it
 * favours obvious, high-confidence patterns over exhaustive coverage.
 *
 * Pure: string-in, findings-out. No IO.
 */

export interface SecretFinding {
	/** Short label for the kind of secret matched. */
	kind: string;
	/** 1-based line number of the match. */
	line: number;
	/** The matched text, redacted to its first few characters. */
	preview: string;
}

interface Rule {
	kind: string;
	re: RegExp;
}

const RULES: Rule[] = [
	{ kind: "AWS access key id", re: /\bAKIA[0-9A-Z]{16}\b/ },
	{ kind: "GitHub token", re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
	{ kind: "OpenAI key", re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/ },
	{ kind: "Anthropic key", re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/ },
	{ kind: "Google API key", re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
	{ kind: "Slack token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
	{ kind: "Private key block", re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/ },
	{ kind: "JWT", re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
	{
		kind: "Generic assigned secret",
		re: /\b(?:api[_-]?key|secret|password|passwd|token|access[_-]?token)\b\s*[:=]\s*["']?[A-Za-z0-9_\-./+]{16,}["']?/i,
	},
];

function redact(value: string): string {
	const trimmed = value.trim();
	const head = trimmed.slice(0, 4);
	return `${head}${"*".repeat(Math.min(8, Math.max(0, trimmed.length - 4)))}`;
}

/** Scan `content` and return every secret-like match. */
export function scanForSecrets(content: string): SecretFinding[] {
	const findings: SecretFinding[] = [];
	const lines = content.split(/\r?\n/);

	lines.forEach((text, idx) => {
		for (const rule of RULES) {
			const m = rule.re.exec(text);
			if (m) {
				findings.push({ kind: rule.kind, line: idx + 1, preview: redact(m[0]) });
			}
		}
	});

	return findings;
}

/** Render findings as a single human-readable warning string. */
export function formatFindings(findings: SecretFinding[]): string {
	return findings.map((f) => `  • ${f.kind} (line ${f.line}): ${f.preview}`).join("\n");
}
