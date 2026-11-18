import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { cleanLine, cleanMultiline, validateContact, validateRegistration } from "../lib/validation";
import { setEnv, validRegistration } from "./helpers";

beforeEach(() => setEnv());

function errorsFor(mutate: (body: ReturnType<typeof validRegistration>) => void) {
  const body = validRegistration();
  mutate(body);
  const result = validateRegistration(body);
  assert.equal(result.ok, false);
  return result.ok ? {} : result.fieldErrors;
}

describe("validateRegistration", () => {
  it("accepts a valid team and normalises it", () => {
    const body = validRegistration();
    body.teamName = "  Orbital   Originals ";
    body.members[0].email = "Asha.Rao@IIST.ac.in";
    const result = validateRegistration(body);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.teamName, "Orbital Originals");
      assert.equal(result.value.members[0].email, "asha.rao@iist.ac.in");
      assert.equal(result.value.members[1].position, 1);
    }
  });

  it("requires 2 to 4 members (rulebook 3.3)", () => {
    assert.ok(errorsFor((b) => b.members.splice(1)).form);
    assert.ok(
      errorsFor((b) => {
        for (let i = 0; i < 3; i++) b.members.push({ ...b.members[1], email: `m${i}@iist.ac.in` });
      }).form,
    );
  });

  it("rejects duplicate emails within the team, case-insensitively", () => {
    const e = errorsFor((b) => (b.members[1].email = "ASHA.RAO@iist.ac.in"));
    assert.ok(e["members.1.email"]);
  });

  it("requires the leader to be a team member (rulebook 3.7)", () => {
    assert.ok(errorsFor((b) => (b.leaderEmail = "someone.else@iist.ac.in")).leaderEmail);
  });

  it("rejects personal mail providers unless disabled (rulebook 3.5)", () => {
    const e = errorsFor((b) => (b.members[1].email = "vihaan@gmail.com"));
    assert.ok(e["members.1.email"]);

    setEnv({ BLOCK_FREE_EMAIL_DOMAINS: "false" });
    const b = validRegistration();
    b.members[1].email = "vihaan@gmail.com";
    assert.equal(validateRegistration(b).ok, true);
  });

  it("keeps Advanced-only members off the Beginner track (rulebook 3.1, 4.1)", () => {
    const e = errorsFor((b) => (b.members[1].programme = "UG year 3"));
    assert.ok(e.track);
    assert.ok(e["members.1.programme"]);
  });

  it("sends graduates to Advanced only", () => {
    const e = errorsFor((b) => (b.members[0].programme = "Graduate within six months"));
    assert.match(e.track, /Graduates/);
  });

  it("lets Beginner-eligible teams opt up to Advanced (rulebook 4.2)", () => {
    const b = validRegistration();
    b.track = "Advanced";
    assert.equal(validateRegistration(b).ok, true);
  });

  it("rejects unknown tracks and programmes", () => {
    assert.ok(errorsFor((b) => (b.track = "Intermediate")).track);
    assert.ok(errorsFor((b) => (b.members[0].programme = "Postdoc"))["members.0.programme"]);
  });

  it("requires all three consent flags to be literally true", () => {
    const e = errorsFor((b) => {
      (b as Record<string, unknown>).rulebookAccepted = "true";
      b.declarationAccepted = false;
      b.seniorityConfirmed = false;
    });
    assert.ok(e.rulebookAccepted && e.declarationAccepted && e.seniorityConfirmed);
  });

  it("rejects non-object bodies and ignores unknown fields", () => {
    assert.equal(validateRegistration(null).ok, false);
    assert.equal(validateRegistration([]).ok, false);
    const b = { ...validRegistration(), clientRequestId: "abc", isAdmin: true };
    assert.equal(validateRegistration(b).ok, true);
  });
});

describe("text cleaning", () => {
  it("strips control and bidi characters and collapses whitespace", () => {
    assert.equal(cleanLine("  A\u0000B\u202Ec \n d  "), "ABc d");
    assert.equal(cleanLine(42), "");
  });

  it("keeps newlines in multi-line text but limits blank runs", () => {
    assert.equal(cleanMultiline("a\r\n\r\n\r\n\r\nb\u0007"), "a\n\nb");
  });
});

describe("validateContact", () => {
  const valid = { name: "Asha", email: "a@b.co", topic: "Technical support", message: "Hello" };

  it("accepts a valid message with any email provider", () => {
    const r = validateContact({ ...valid, email: "asha@gmail.com" });
    assert.equal(r.ok, true);
  });

  it("validates every field", () => {
    const r = validateContact({ name: "", email: "x", topic: "Spam", message: " " });
    assert.equal(r.ok, false);
    if (!r.ok) assert.deepEqual(Object.keys(r.fieldErrors).sort(), ["email", "message", "name", "topic"]);
  });

  it("caps the message at 4000 characters", () => {
    assert.equal(validateContact({ ...valid, message: "x".repeat(4001) }).ok, false);
    assert.equal(validateContact({ ...valid, message: "x".repeat(4000) }).ok, true);
  });

  it("flags a filled honeypot as spam", () => {
    const r = validateContact({ ...valid, website: "http://spam.example" });
    assert.equal(r.ok && r.value.spam, true);
  });
});
