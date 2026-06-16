"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { formatNumber, formatDuration } = require("../src/lib/format.js");

test("formatNumber coerces and formats integers", () => {
  // Avoid asserting locale-specific thousands separators; check the safe cases.
  assert.equal(formatNumber(0), "0");
  assert.equal(formatNumber(5), "5");
  assert.equal(formatNumber(null), "0");
  assert.equal(formatNumber(undefined), "0");
  assert.equal(typeof formatNumber(1234567), "string");
});

test("formatDuration shows <1m below a minute", () => {
  assert.equal(formatDuration(0), "<1m");
  assert.equal(formatDuration(6), "<1m");
  assert.equal(formatDuration(29), "<1m");
});

test("formatDuration shows whole minutes under an hour", () => {
  assert.equal(formatDuration(60), "1m");
  assert.equal(formatDuration(600), "10m");
  assert.equal(formatDuration(3540), "59m");
});

test("formatDuration shows hours (and minutes) under a day", () => {
  assert.equal(formatDuration(3600), "1h");
  assert.equal(formatDuration(3660), "1h 1m");
  assert.equal(formatDuration(7200), "2h");
  assert.equal(formatDuration(9000), "2h 30m");
});

test("formatDuration shows days (and hours) at and beyond a day", () => {
  assert.equal(formatDuration(86400), "1d");
  assert.equal(formatDuration(90000), "1d 1h");
  assert.equal(formatDuration(172800), "2d");
});
