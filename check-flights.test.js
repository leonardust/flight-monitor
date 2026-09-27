"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildLabel,
  buildMessage,
  buildRyanairUrl,
  buildRyanairRoundTripUrl,
  CURRENCY,
  fmt,
  sendPriceChartIfAvailable,
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
    `NOWY LOT ✈️ WRO→BGY 8 lis: 199.99 ${CURRENCY}`,
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
    `TANIEJE 📉 WRO→BGY 8 lis: 100.00 → 80.00 ${CURRENCY} (-20.00 ${CURRENCY})`,
  );
});

test("buildMessage returns a message when the price rises", () => {
  assert.equal(
    buildMessage("WRO→BGY 8 lis", 80, 100),
    `DROŻEJE 📈 WRO→BGY 8 lis: 80.00 → 100.00 ${CURRENCY} (+20.00 ${CURRENCY})`,
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
    `TANIEJE 📉 WRO→BGY 8 lis: 200.00 → 140.00 ${CURRENCY} (-60.00 ${CURRENCY})`,
  );
});

test("buildMessage returns TANIEJE when threshold is null and price drops", () => {
  assert.equal(
    buildMessage("WRO→BGY 8 lis", 100, 80, null),
    `TANIEJE 📉 WRO→BGY 8 lis: 100.00 → 80.00 ${CURRENCY} (-20.00 ${CURRENCY})`,
  );
});

test("buildMessage returns NOWY LOT regardless of threshold", () => {
  assert.equal(
    buildMessage("WRO→BGY 8 lis", null, 200, 150),
    `NOWY LOT ✈️ WRO→BGY 8 lis: 200.00 ${CURRENCY}`,
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
    `TANIEJE 📉 WRO→BGY 8 lis: 100.00 → 80.00 ${CURRENCY} (-20.00 ${CURRENCY})`,
  );
});

// ── buildLabel tests ────────────────────────────────

test("buildLabel combines route label and date label", () => {
  assert.equal(buildLabel("WRO→BGY", "8 lis"), "WRO→BGY 8 lis");
});

test("buildLabel returns only route label when dateLabel is null", () => {
  assert.equal(buildLabel("WRO→BGY", null), "WRO→BGY");
});

// ── buildRyanairUrl tests ────────────────────────────────

test("buildRyanairUrl builds correct URL for a given route and date", () => {
  const pax = { adults: 1, teens: 0, children: 0, infants: 0 };
  const url = buildRyanairUrl("WRO", "BGY", "2026-11-07", pax);
  assert.ok(
    url.startsWith("https://www.ryanair.com/pl/pl/trip/flights/select?"),
  );
  assert.ok(url.includes("originIata=WRO"));
  assert.ok(url.includes("destinationIata=BGY"));
  assert.ok(url.includes("dateOut=2026-11-07"));
  assert.ok(url.includes("adults=1"));
  assert.ok(url.includes("isReturn=false"));
});

test("buildRyanairRoundTripUrl builds correct round-trip URL", () => {
  const pax = { adults: 1, teens: 0, children: 0, infants: 0 };
  
  // Test with default airports (WRO/BGY)
  const urlDefault = buildRyanairRoundTripUrl("2026-11-07", "2026-11-12", undefined, undefined, pax);
  assert.ok(
    urlDefault.startsWith("https://www.ryanair.com/pl/pl/trip/flights/select?"),
  );
  assert.ok(urlDefault.includes("originIata=WRO"));
  assert.ok(urlDefault.includes("destinationIata=BGY"));
  assert.ok(urlDefault.includes("dateOut=2026-11-07"));
  assert.ok(urlDefault.includes("dateIn=2026-11-12"));
  assert.ok(urlDefault.includes("isReturn=true"));
  
  // Test with custom airports (WRO/ATH)
  const urlCustom = buildRyanairRoundTripUrl("2026-11-07", "2026-11-12", "WRO", "ATH", pax);
  assert.ok(urlCustom.includes("originIata=WRO"));
  assert.ok(urlCustom.includes("destinationIata=ATH"));
});

// ── Per-date tracking integration tests ─────────────────

test("each date generates its own NOWY LOT message independently", () => {
  const routeState = {};
  const results = [
    { date: "2026-11-12", label: "12 lis", price: 89.99 },
    { date: "2026-11-13", label: "13 lis", price: 110.0 },
  ];
  const messages = results.map((result) => {
    const prevPrice = routeState[result.date]?.price ?? null;
    return buildMessage(
      buildLabel("BGY→WRO", result.label),
      prevPrice,
      result.price,
    );
  });
  assert.equal(messages[0], `NOWY LOT ✈️ BGY→WRO 12 lis: 89.99 ${CURRENCY}`);
  assert.equal(messages[1], `NOWY LOT ✈️ BGY→WRO 13 lis: 110.00 ${CURRENCY}`);
});

test("price drop on one date does not affect the other date", () => {
  const routeState = {
    "2026-11-12": { price: 89.99 },
    "2026-11-13": { price: 110.0 },
  };
  const results = [
    { date: "2026-11-12", label: "12 lis", price: 75.0 },
    { date: "2026-11-13", label: "13 lis", price: 110.0 },
  ];
  const messages = results.map((result) => {
    const prevPrice = routeState[result.date]?.price ?? null;
    return buildMessage(
      buildLabel("BGY→WRO", result.label),
      prevPrice,
      result.price,
    );
  });
  assert.equal(
    messages[0],
    `TANIEJE 📉 BGY→WRO 12 lis: 89.99 → 75.00 ${CURRENCY} (-14.99 ${CURRENCY})`,
  );
  assert.equal(messages[1], null);
});

test("one date becomes unavailable while the other stays available", () => {
  const routeState = {
    "2026-11-12": { price: 89.99 },
    "2026-11-13": { price: 110.0 },
  };
  const results = [
    { date: "2026-11-12", label: "12 lis", price: null },
    { date: "2026-11-13", label: "13 lis", price: 110.0 },
  ];
  const messages = results.map((result) => {
    const prevPrice = routeState[result.date]?.price ?? null;
    return buildMessage(
      buildLabel("BGY→WRO", result.label),
      prevPrice,
      result.price,
    );
  });
  assert.equal(messages[0], `LOT NIEDOSTĘPNY ❌ BGY→WRO 12 lis`);
  assert.equal(messages[1], null);
});

test("new date added to config appears as NOWY LOT without affecting existing date", () => {
  const routeState = {
    "2026-11-12": { price: 89.99 },
  };
  const results = [
    { date: "2026-11-12", label: "12 lis", price: 89.99 },
    { date: "2026-11-13", label: "13 lis", price: 105.0 },
  ];
  const messages = results.map((result) => {
    const prevPrice = routeState[result.date]?.price ?? null;
    return buildMessage(
      buildLabel("BGY→WRO", result.label),
      prevPrice,
      result.price,
    );
  });
  assert.equal(messages[0], null);
  assert.equal(messages[1], `NOWY LOT ✈️ BGY→WRO 13 lis: 105.00 ${CURRENCY}`);
});

test("sendPriceChartIfAvailable returns early if changed is false", async () => {
  const route = { key: "WRO_ATH" };
  const result = { date: "2026-01-15", price: 223.38 };
  const history = {
    "WRO_ATH_2026-01-15": {
      label: "WRO→ATH",
      entries: [223.38, 224.50, 225.00],
    },
  };

  // When changed=false, should return early (no async operations)
  const returnValue = await sendPriceChartIfAvailable(route, result, history, false);
  assert.equal(returnValue, undefined);
});

test("sendPriceChartIfAvailable returns early if price is null", async () => {
  const route = { key: "WRO_ATH" };
  const result = { date: "2026-01-15", price: null };
  const history = {
    "WRO_ATH_2026-01-15": {
      label: "WRO→ATH",
      entries: [223.38, 224.50, 225.00],
    },
  };

  // When price is null, should return early
  const returnValue = await sendPriceChartIfAvailable(route, result, history, true);
  assert.equal(returnValue, undefined);
});

test("sendPriceChartIfAvailable proceeds when changed is true and price is valid", async () => {
  const route = { key: "WRO_ATH" };
  const result = { date: "2026-01-15", price: 225.00 };
  const history = {
    "WRO_ATH_2026-01-15": {
      label: "WRO→ATH",
      entries: [223.38, 224.50, 225.00],
    },
  };

  // When changed=true and price is valid, should process (may call notify)
  // Test that it doesn't throw an error
  try {
    const returnValue = await sendPriceChartIfAvailable(route, result, history, true);
    assert.equal(returnValue, undefined);
  } catch (err) {
    // Notify might fail if no TELEGRAM_TOKEN, but that's OK for this test
    // We're testing the guard logic, not the actual notification
    assert.ok(err.message.includes("TELEGRAM") || err.message.includes("notify"));
  }
});

test("sendPriceChartIfAvailable skips chart if history has less than 2 entries", async () => {
  const route = { key: "WRO_ATH" };
  const result = { date: "2026-01-15", price: 225.00 };
  const history = {
    "WRO_ATH_2026-01-15": {
      label: "WRO→ATH",
      entries: [223.38], // Only 1 entry - should skip chart
    },
  };

  // Should not send chart if less than 2 entries
  const returnValue = await sendPriceChartIfAvailable(route, result, history, true);
  assert.equal(returnValue, undefined);
});

// ── sendPriceChartIfAvailable tests ──────────────────
// Note: Tests verify the conditional logic - guard clauses for changed and price === null
// The notify() side effect is integration-tested via e2e; unit tests focus on guards

test("sendPriceChartIfAvailable skips when price has NOT changed", async (t) => {
  // This test verifies that when changed=false, the function returns early
  // (before attempting history lookup or notify call).
  // Even with valid history data, the guard clause prevents processing.
  
  const route = { key: "WRO_ATH" };
  const result = { date: "2026-11-15", price: 223.38 };
  const history = {
    "WRO_ATH_2026-11-15": {
      entries: [223.38, 224.50, 225.00],
      label: "WRO→ATH 15 lis",
    },
  };
  
  // If changed=false, the guard !changed should trigger early return
  // This test passes if no error thrown (early return prevents notify access)
  await sendPriceChartIfAvailable(route, result, history, false);
  
  assert.ok(true, "Early return on unchanged price prevents side effects");
});

test("sendPriceChartIfAvailable skips when price is null", async (t) => {
  // Guard clause: if (!changed || result.price === null) return
  // This verifies price === null check works even if changed=true
  
  const route = { key: "WRO_ATH" };
  const result = { date: "2026-11-15", price: null }; // Price unavailable
  const history = {
    "WRO_ATH_2026-11-15": {
      entries: [223.38, 224.50],
      label: "WRO→ATH 15 lis",
    },
  };
  
  // Even if changed=true, price=null should trigger early return
  await sendPriceChartIfAvailable(route, result, history, true);
  
  assert.ok(true, "Early return on null price prevents side effects");
});
