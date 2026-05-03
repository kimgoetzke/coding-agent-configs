import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

describe("command-policy extension packaging", () => {
  it("declares an in-folder command-policy.ts entry point in package.json", () => {
    const packageJson = JSON.parse(readFileSync(join(here, "package.json"), "utf8")) as {
      pi?: { extensions?: string[] };
    };

    expect(packageJson.pi?.extensions).toEqual(["./command-policy.ts"]);
    expect(existsSync(join(here, "command-policy.ts"))).toBe(true);
    expect(existsSync(join(here, "..", "command-policy.ts"))).toBe(false);
  });
});
