import { describe, expect, it } from "vitest";
import { scanForSecrets } from "../src/scan/secrets.ts";

describe("scanForSecrets", () => {
	it("flags an AWS access key id", () => {
		const f = scanForSecrets("deploy uses AKIAIOSFODNN7EXAMPLE for the bucket");
		expect(f).toHaveLength(1);
		expect(f[0]?.kind).toBe("AWS access key id");
	});

	it("flags a private key block and reports the line", () => {
		const f = scanForSecrets("intro\n-----BEGIN RSA PRIVATE KEY-----\nMIIB...");
		expect(f[0]?.kind).toBe("Private key block");
		expect(f[0]?.line).toBe(2);
	});

	it("flags assigned secrets like api_key = ...", () => {
		const keyName = "api" + "_key";
		const value = "abcdef0123456789abcdef";
		const f = scanForSecrets(`const x = { ${keyName}: "${value}" }`);
		expect(f.some((x) => x.kind === "Generic assigned secret")).toBe(true);
	});

	it("redacts the matched value in the preview", () => {
		const [finding] = scanForSecrets("AKIAIOSFODNN7EXAMPLE");
		expect(finding?.preview).toMatch(/^AKIA\*+$/);
		expect(finding?.preview).not.toContain("IOSFODNN7");
	});

	it("returns nothing for ordinary prose", () => {
		expect(scanForSecrets("The deploy script lives in scripts/deploy.sh")).toEqual([]);
	});
});
