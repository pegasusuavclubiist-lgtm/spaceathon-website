import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { contactTopics, programmeOptions } from "../app/content/event-data";
import { CONTACT_TOPICS, PROGRAMMES } from "../lib/rules";

// Fails if the frontend's option lists change without the backend following.
describe("frontend/backend parity", () => {
  it("programme options match", () => {
    assert.deepEqual([...PROGRAMMES], programmeOptions);
  });
  it("contact topics match", () => {
    assert.deepEqual([...CONTACT_TOPICS], contactTopics);
  });
});
