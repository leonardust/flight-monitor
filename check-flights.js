#!/usr/bin/env node
"use strict";

const https = require("https");

// ── Config ──────────────────────────────────────────────

const REQUIRED_ENV = [
  "TELEGRAM_TOKEN",
  "TELEGRAM_CHAT_ID",
  "GIST_ID",
  "GH_PAT",
];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(`Missing env variables: ${missing.join(", ")}`);
  process.exit(1);
}

const { TELEGRAM_TOKEN, TELEGRAM_CHAT_ID, GIST_ID, GH_PAT } = process.env;
const HTTP_TIMEOUT = 15_000;
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1_000;
const CURRENCY = "PLN";

const ROUTES = [
  {
    key: "WRO_BGY",
    from: "WRO",
    to: "BGY",
    date: "2026-11-08",
    label: "WRO→BGY 8 lis",
  },
  {
    key: "BGY_WRO",
    from: "BGY",
    to: "WRO",
    date: "2026-11-11",
    label: "BGY→WRO 11 lis",
  },
];

// ── HTTP helper ─────────────────────────────────────────

function request(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.setTimeout(HTTP_TIMEOUT, () =>
      req.destroy(new Error(`Timeout after ${HTTP_TIMEOUT}ms`)),
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function requestWithRetry(
  options,
  body = null,
  attempts = RETRY_ATTEMPTS,
) {
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await request(options, body);
      if (res.status < 500) return res;
      throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      if (i === attempts) throw err;
      const delay = RETRY_DELAY_MS * 2 ** (i - 1);
      console.warn(
        `Request failed (attempt ${i}/${attempts}): ${err.message}. Retrying in ${delay}ms...`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

function jsonPost(hostname, path, payload) {
  const body = JSON.stringify(payload);
  return requestWithRetry(
    {
      hostname,
      path,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    },
    body,
  );
}

// ── Ryanair API ─────────────────────────────────────────

async function fetchPrice(route) {
  const params = new URLSearchParams({
    departureAirportIataCode: route.from,
    arrivalAirportIataCode: route.to,
    outboundDepartureDateFrom: route.date,
    outboundDepartureDateTo: route.date,
    currency: CURRENCY,
  });

  const res = await requestWithRetry({
    hostname: "www.ryanair.com",
    path: `/api/farfnd/v4/oneWayFares?${params}`,
    method: "GET",
    headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
  });

  if (res.status !== 200) throw new Error(`Ryanair API ${res.status}`);

  const fares = res.data.fares;
  return fares?.length ? fares[0].outbound.price.value : null;
}

// ── GitHub Gist state ───────────────────────────────────

const gistHeaders = {
  Authorization: `token ${GH_PAT}`,
  "User-Agent": "flight-monitor",
  Accept: "application/vnd.github.v3+json",
};

async function loadState() {
  const res = await requestWithRetry({
    hostname: "api.github.com",
    path: `/gists/${GIST_ID}`,
    method: "GET",
    headers: gistHeaders,
  });
  if (res.status !== 200) throw new Error(`Gist read ${res.status}`);
  return JSON.parse(res.data.files["state.json"].content);
}

async function saveState(state) {
  const body = JSON.stringify({
    files: { "state.json": { content: JSON.stringify(state, null, 2) } },
  });
  const res = await requestWithRetry(
    {
      hostname: "api.github.com",
      path: `/gists/${GIST_ID}`,
      method: "PATCH",
      headers: {
        ...gistHeaders,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    },
    body,
  );
  if (res.status !== 200) throw new Error(`Gist write ${res.status}`);
}

// ── Telegram ────────────────────────────────────────────

async function notify(text) {
  const res = await jsonPost(
    "api.telegram.org",
    `/bot${TELEGRAM_TOKEN}/sendMessage`,
    { chat_id: TELEGRAM_CHAT_ID, text },
  );
  if (res.status !== 200)
    throw new Error(`Telegram ${res.status}: ${JSON.stringify(res.data)}`);
}

// ── Message builder ─────────────────────────────────────

function fmt(price) {
  return price.toFixed(2);
}

function buildMessage(label, oldPrice, newPrice) {
  if (oldPrice === null && newPrice !== null)
    return `NOWY LOT ✈️ ${label}: ${fmt(newPrice)} ${CURRENCY}`;

  if (oldPrice !== null && newPrice === null)
    return `LOT NIEDOSTĘPNY ❌ ${label}`;

  if (newPrice < oldPrice)
    return `TANIEJE 📉 ${label}: ${fmt(oldPrice)} → ${fmt(newPrice)} ${CURRENCY} (-${fmt(oldPrice - newPrice)} ${CURRENCY})`;

  if (newPrice > oldPrice)
    return `DROŻEJE 📈 ${label}: ${fmt(oldPrice)} → ${fmt(newPrice)} ${CURRENCY} (+${fmt(newPrice - oldPrice)} ${CURRENCY})`;

  return null;
}

// ── Main ────────────────────────────────────────────────

async function main() {
  const state = await loadState();
  let changed = false;

  for (const route of ROUTES) {
    let price;
    try {
      price = await fetchPrice(route);
    } catch (err) {
      console.error(`[${route.key}] fetch error: ${err.message}`);
      continue;
    }

    if (!state[route.key]) state[route.key] = { price: null };
    const prev = state[route.key].price ?? null;

    console.log(`[${route.key}] prev=${prev} curr=${price}`);

    const msg = buildMessage(route.label, prev, price);
    if (!msg) {
      console.log(`[${route.key}] No change.`);
      continue;
    }

    console.log(`[${route.key}] → ${msg}`);
    state[route.key] = { price };
    changed = true;

    try {
      await notify(msg);
    } catch (err) {
      console.error(`[${route.key}] Telegram error: ${err.message}`);
    }
  }

  if (changed) {
    await saveState(state);
    console.log("State saved.");
  } else {
    console.log("No changes.");
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
