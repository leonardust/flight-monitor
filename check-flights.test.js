"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildMessage, fmt } = require("./check-flights");

test("fmt formats whole numbers with two decimals", () => {
  assert.equal(fmt(100), "100.00");
});

test("fmt formats fractional numbers with two decimals", () => {
  assert.equal(fmt(1234.5), "1234.50");
});

test("buildMessage returns a message for a newly available flight", () => {
  assert.equal(
    buildMessage("WRO→BGY 8 lis", null, 199.99),
    "NOWY LOT ✈️ WRO→BGY 8 lis: 199.99 PLN",
  );
});

test("buildMessage returns a message when a flight becomes unavailable", () => {
  assert.equal(
    buildMessage("WRO→BGY 8 lis", 199.99, null),
    "LOT NIEDOSTĘPNY ❌ WRO→BGY 8 lis",
  );
});

test("buildMessage returns a message when the price drops", () => {
  assert.equal(
    buildMessage("WRO→BGY 8 lis", 100, 80),
    "TANIEJE 📉 WRO→BGY 8 lis: 100.00 → 80.00 PLN (-20.00 PLN)",
  );
});

test("buildMessage returns a message when the price rises", () => {
  assert.equal(
    buildMessage("WRO→BGY 8 lis", 80, 100),
    "DROŻEJE 📈 WRO→BGY 8 lis: 80.00 → 100.00 PLN (+20.00 PLN)",
  );
});

test("buildMessage returns null when an unavailable flight stays unavailable", () => {
  assert.equal(buildMessage("WRO→BGY 8 lis", null, null), null);
});

test("buildMessage returns null when the price does not change", () => {
  assert.equal(buildMessage("WRO→BGY 8 lis", 100, 100), null);
});

// ── PRICE_THRESHOLD tests ────────────────────────────────

test("buildMessage returns null when price drops but stays at or above threshold", () => {
  assert.equal(buildMessage("WRO→BGY 8 lis", 200, 150, 150), null);
});

test("buildMessage returns null when price drops but is above threshold", () => {
  assert.equal(buildMessage("WRO→BGY 8 lis", 200, 160, 150), null);
});

test("buildMessage returns TANIEJE when price drops below threshold", () => {
  assert.equal(
    buildMessage("WRO→BGY 8 lis", 200, 140, 150),
    "TANIEJE 📉 WRO→BGY 8 lis: 200.00 → 140.00 PLN (-60.00 PLN)",
  );
});

test("buildMessage returns TANIEJE when threshold is null and price drops", () => {
  assert.equal(
    buildMessage("WRO→BGY 8 lis", 100, 80, null),
    "TANIEJE 📉 WRO→BGY 8 lis: 100.00 → 80.00 PLN (-20.00 PLN)",
  );
});

test("buildMessage returns NOWY LOT regardless of threshold", () => {
  assert.equal(
    buildMessage("WRO→BGY 8 lis", null, 200, 150),
    "NOWY LOT ✈️ WRO→BGY 8 lis: 200.00 PLN",
  );
});

test("buildMessage returns LOT NIEDOSTĘPNY regardless of threshold", () => {
  assert.equal(
    buildMessage("WRO→BGY 8 lis", 200, null, 150),
    "LOT NIEDOSTĘPNY ❌ WRO→BGY 8 lis",
  );
});

test("buildMessage returns TANIEJE when threshold is NaN (treated as null)", () => {
  assert.equal(
    buildMessage("WRO→BGY 8 lis", 100, 80, NaN),
    "TANIEJE 📉 WRO→BGY 8 lis: 100.00 → 80.00 PLN (-20.00 PLN)",
  );
});
