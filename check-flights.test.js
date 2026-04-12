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
