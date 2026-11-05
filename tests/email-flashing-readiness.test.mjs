import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workspacePath = new URL("../src/components/dashboard/email-flashing-workspace.tsx", import.meta.url);

test("Email Flashing is clearly marked as coming soon", async () => {
  const source = await readFile(workspacePath, "utf8");

  assert.match(source, /Coming soon/i);
  assert.match(source, /not available for use yet/i);
  assert.match(source, /no email can be created or sent/i);
});

test("Email Flashing exposes no active compose or send controls", async () => {
  const source = await readFile(workspacePath, "utf8");

  assert.doesNotMatch(source, /<input\b/i);
  assert.doesNotMatch(source, /<textarea\b/i);
  assert.doesNotMatch(source, /<button\b/i);
  assert.doesNotMatch(source, /api\(/i);
});
