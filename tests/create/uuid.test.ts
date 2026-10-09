import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { isCreateUuid } from "../../lib/create/uuid.ts";

test("Create actions accept browser UUIDs and reject malformed operation IDs", () => {
  for (let index = 0; index < 20; index += 1) assert.equal(isCreateUuid(randomUUID()), true);
  assert.equal(isCreateUuid("33333333-3333-4333-8333-333-333333333333"), false);
  assert.equal(isCreateUuid("33333333-3333-4333-8333-333333333333"), true);
  assert.equal(isCreateUuid("javascript:alert(1)"), false);
});
