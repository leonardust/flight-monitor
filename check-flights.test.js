"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildLabel,
  buildMessage,
  findCheapest,
  fmt,
} = require("./check-flights");

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

// ── buildLabel tests ────────────────────────────────

test("buildLabel combines route label and date label", () => {
  assert.equal(buildLabel("WRO→BGY", "8 lis"), "WRO→BGY 8 lis");
});

test("buildLabel returns only route label when dateLabel is null", () => {
  assert.equal(buildLabel("WRO→BGY", null), "WRO→BGY");
});

// ── findCheapest tests ──────────────────────────────

test("findCheapest returns null when all prices are null", () => {
  assert.equal(
    findCheapest([
      { date: "2026-11-08", label: "8 lis", price: null },
      { date: "2026-11-09", label: "9 lis", price: null },
    ]),
    null,
  );
});

test("findCheapest returns the single entry when there is one date", () => {
  assert.deepEqual(
    findCheapest([{ date: "2026-11-08", label: "8 lis", price: 199.99 }]),
    { date: "2026-11-08", label: "8 lis", price: 199.99 },
  );
});

test("findCheapest returns the cheapest entry when there are multiple dates", () => {
  assert.deepEqual(
    findCheapest([
      { date: "2026-11-08", label: "8 lis", price: 199.99 },
      { date: "2026-11-09", label: "9 lis", price: 149.99 },
      { date: "2026-11-10", label: "10 lis", price: 179.99 },
    ]),
    { date: "2026-11-09", label: "9 lis", price: 149.99 },
  );
});

test("findCheapest ignores null prices and returns cheapest non-null", () => {
  assert.deepEqual(
    findCheapest([
      { date: "2026-11-08", label: "8 lis", price: null },
      { date: "2026-11-09", label: "9 lis", price: 149.99 },
      { date: "2026-11-10", label: "10 lis", price: null },
    ]),
    { date: "2026-11-09", label: "9 lis", price: 149.99 },
  );
});

// ── Integration: findCheapest + buildMessage ──────────────────

test("cheapest date disappears, next date becomes cheapest and price rises", () => {
  const results = [
    { date: "2026-11-08", label: "8 lis", price: null },
    { date: "2026-11-09", label: "9 lis", price: 179.99 },
  ];
  const cheapest = findCheapest(results);
  assert.deepEqual(cheapest, {
    date: "2026-11-09",
    label: "9 lis",
    price: 179.99,
  });
  assert.equal(
    buildMessage(buildLabel("WRO→BGY", cheapest.label), 149.99, cheapest.price),
    "DROŻEJE 📈 WRO→BGY 9 lis: 149.99 → 179.99 PLN (+30.00 PLN)",
  );
});

test("new cheaper date appears and becomes cheapest", () => {
  const results = [
    { date: "2026-11-08", label: "8 lis", price: 199.99 },
    { date: "2026-11-09", label: "9 lis", price: 149.99 },
  ];
  const cheapest = findCheapest(results);
  assert.deepEqual(cheapest, {
    date: "2026-11-09",
    label: "9 lis",
    price: 149.99,
  });
  assert.equal(
    buildMessage(buildLabel("WRO→BGY", cheapest.label), 199.99, cheapest.price),
    "TANIEJE 📉 WRO→BGY 9 lis: 199.99 → 149.99 PLN (-50.00 PLN)",
  );
});

test("all dates become unavailable marks flight as unavailable", () => {
  const results = [
    { date: "2026-11-08", label: "8 lis", price: null },
    { date: "2026-11-09", label: "9 lis", price: null },
  ];
  const cheapest = findCheapest(results);
  assert.equal(cheapest, null);
  // prev dateLabel used as fallback in msgLabel
  assert.equal(
    buildMessage(buildLabel("WRO→BGY", "8 lis"), 149.99, null),
    "LOT NIEDOSTĘPNY ❌ WRO→BGY 8 lis",
  );
});

test("flight appears for first time on one of many dates", () => {
  const results = [
    { date: "2026-11-08", label: "8 lis", price: null },
    { date: "2026-11-09", label: "9 lis", price: 249.99 },
  ];
  const cheapest = findCheapest(results);
  assert.deepEqual(cheapest, {
    date: "2026-11-09",
    label: "9 lis",
    price: 249.99,
  });
  assert.equal(
    buildMessage(buildLabel("WRO→BGY", cheapest.label), null, cheapest.price),
    "NOWY LOT ✈️ WRO→BGY 9 lis: 249.99 PLN",
  );
});
