import test from "node:test";
import assert from "node:assert/strict";

import { resolveAuthenticatedModelPattern } from "./model-resolution.js";

const authenticatedModels = [
  { provider: "github-copilot", id: "claude-sonnet-4", name: "claude-sonnet-4" },
  { provider: "github-copilot", id: "claude-sonnet-4.6", name: "claude-sonnet-4.6" },
  { provider: "github-copilot", id: "gpt-5.4", name: "gpt-5.4" },
];

test("resolveAuthenticatedModelPattern prefers the best authenticated match for an alias", () => {
  assert.equal(
    resolveAuthenticatedModelPattern("sonnet", authenticatedModels),
    "github-copilot/claude-sonnet-4.6",
  );
});

test("resolveAuthenticatedModelPattern supports exact provider/model references", () => {
  assert.equal(
    resolveAuthenticatedModelPattern("github-copilot/claude-sonnet-4.6", authenticatedModels),
    "github-copilot/claude-sonnet-4.6",
  );
});

test("resolveAuthenticatedModelPattern falls back when no authenticated model matches", () => {
  assert.equal(resolveAuthenticatedModelPattern("sonnet", [{ provider: "github-copilot", id: "gpt-5.4", name: "gpt-5.4" }]), undefined);
});
