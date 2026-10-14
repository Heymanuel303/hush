const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { isQuiet, nextBoundary } = require("../src/lib/schedule.js");

const cases = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures/schedule/cases.json"), "utf8")
);

for (const c of cases) {
  test(`isQuiet: ${c.name}`, () => {
    assert.equal(isQuiet(c.quietHours, new Date(c.now)), c.expected);
  });
}

const workday = {
  timezone: "UTC",
  windows: [{ days: [1], start: "09:00", end: "17:00" }],
};

test("nextBoundary: before a window returns its start", () => {
  const next = nextBoundary(workday, new Date("2026-10-12T08:00:30Z"));
  assert.equal(next.toISOString(), "2026-10-12T09:00:00.000Z");
});

test("nextBoundary: inside a window returns its end", () => {
  const next = nextBoundary(workday, new Date("2026-10-12T12:00:00Z"));
  assert.equal(next.toISOString(), "2026-10-12T17:00:00.000Z");
});

test("nextBoundary: exactly at a boundary moves to the following one", () => {
  const next = nextBoundary(workday, new Date("2026-10-12T09:00:00Z"));
  assert.equal(next.toISOString(), "2026-10-12T17:00:00.000Z");
});

test("nextBoundary: after the last window wraps to next week", () => {
  const next = nextBoundary(workday, new Date("2026-10-12T18:00:00Z"));
  assert.equal(next.toISOString(), "2026-10-19T09:00:00.000Z");
});

test("nextBoundary: crossing-midnight window ends the next day", () => {
  const q = { timezone: "UTC", windows: [{ days: [1], start: "22:00", end: "06:00" }] };
  const next = nextBoundary(q, new Date("2026-10-12T23:30:00Z"));
  assert.equal(next.toISOString(), "2026-10-13T06:00:00.000Z");
});

test("nextBoundary: respects the window's timezone", () => {
  const q = { timezone: "Pacific/Auckland", windows: [{ days: [1], start: "09:00", end: "17:00" }] };
  // Sunday 20:30 UTC = Monday 09:30 NZDT → ends 17:00 NZDT = 04:00 UTC.
  const next = nextBoundary(q, new Date("2026-10-11T20:30:00Z"));
  assert.equal(next.toISOString(), "2026-10-12T04:00:00.000Z");
});

test("nextBoundary: null when there is nothing to schedule", () => {
  const now = new Date("2026-10-12T12:00:00Z");
  assert.equal(nextBoundary({ timezone: "UTC", windows: [] }, now), null);
  assert.equal(nextBoundary(null, now), null);
});

test("garbage input never throws and is not quiet", () => {
  const now = new Date("2026-10-12T12:00:00Z");
  const garbage = [
    undefined,
    null,
    42,
    "x",
    [],
    {},
    { timezone: "UTC" },
    { timezone: "UTC", windows: "nope" },
    { timezone: "Not/AZone", windows: [{ days: [1], start: "00:00", end: "23:59" }] },
    { timezone: "UTC", windows: [null, 3, { days: "1" }, { days: [1], start: "9", end: "x" }] },
    { timezone: "UTC", windows: [{ days: [1], start: "09:00", end: "09:00" }] },
    { timezone: 5, windows: [] },
  ];
  for (const q of garbage) {
    assert.equal(isQuiet(q, now), false);
    assert.doesNotThrow(() => nextBoundary(q, now));
  }
  assert.equal(isQuiet(workday, new Date("nope")), false);
  assert.equal(isQuiet(workday, null), false);
  assert.equal(nextBoundary(workday, new Date("nope")), null);
});
