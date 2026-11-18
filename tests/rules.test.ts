import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { getConfig } from "../lib/config";
import {
  getSchedule,
  istDayStart,
  registrationGate,
  retentionCutoff,
  uploadGate,
} from "../lib/rules";
import { setEnv } from "./helpers";

// Kickoff Mon 14 Dec 2026, 10:00 IST.
const T0 = "2026-12-14T10:00:00+05:30";

beforeEach(() => setEnv());

describe("schedule (rulebook Section 2)", () => {
  it("computes IST day boundaries", () => {
    assert.equal(istDayStart(new Date(T0), 0).toISOString(), "2026-12-13T18:30:00.000Z");
    assert.equal(istDayStart(new Date(T0), 14).toISOString(), "2026-11-29T18:30:00.000Z");
  });

  it("derives open (D-14), close (end of D-5) and lock (D-3)", () => {
    setEnv({ EVENT_START_ISO: T0 });
    const s = getSchedule(getConfig());
    assert.equal(s.opensAt?.toISOString(), "2026-11-29T18:30:00.000Z"); // 30 Nov 00:00 IST
    assert.equal(s.closesAt?.toISOString(), "2026-12-09T18:30:00.000Z"); // 10 Dec 00:00 IST
    assert.equal(s.lockAt?.toISOString(), "2026-12-10T18:30:00.000Z"); // 11 Dec 00:00 IST
  });

  it("lets explicit overrides win", () => {
    setEnv({ EVENT_START_ISO: T0, TEAM_LOCK_AT: "2026-12-12T00:00:00Z" });
    assert.equal(getSchedule(getConfig()).lockAt?.toISOString(), "2026-12-12T00:00:00.000Z");
  });
});

describe("registration gate", () => {
  it("fails closed unless REGISTRATION_OPEN is set", () => {
    setEnv({ REGISTRATION_OPEN: undefined });
    assert.equal(registrationGate(getConfig()).open, false);
  });

  it("is open when switched on and no date is announced", () => {
    assert.equal(registrationGate(getConfig()).open, true);
  });

  it("enforces the D-14 to D-5 window once the date is known", () => {
    setEnv({ EVENT_START_ISO: T0 });
    const config = getConfig();
    assert.equal(registrationGate(config, new Date("2026-11-29T18:29:59Z")).open, false);
    assert.equal(registrationGate(config, new Date("2026-11-29T18:30:00Z")).open, true);
    assert.equal(registrationGate(config, new Date("2026-12-09T18:29:59Z")).open, true);
    assert.equal(registrationGate(config, new Date("2026-12-09T18:30:00Z")).open, false);
  });
});

describe("upload gate (team lock, rulebook 3.6)", () => {
  it("allows uploads before D-3 and blocks them after", () => {
    setEnv({ EVENT_START_ISO: T0 });
    const config = getConfig();
    assert.equal(uploadGate(config, new Date("2026-12-10T18:29:00Z")).open, true);
    assert.equal(uploadGate(config, new Date("2026-12-10T18:30:00Z")).open, false);
  });
});

describe("retention (rulebook 15.6)", () => {
  it("is T0 + 144 h + 180 days, and unknown without a date", () => {
    assert.equal(retentionCutoff(getConfig()), null);
    setEnv({ EVENT_START_ISO: T0 });
    assert.equal(retentionCutoff(getConfig())?.toISOString(), "2027-06-18T04:30:00.000Z");
  });
});
