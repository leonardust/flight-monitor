#!/usr/bin/env node
"use strict";

const fs = require("fs");
const https = require("https");
const path = require("path");

// ── Config ──────────────────────────────────────────────

function loadConfig() {
  const localPath = path.join(__dirname, "config.local.json");
  const defaultPath = path.join(__dirname, "config.json");
  const filePath = fs.existsSync(localPath) ? localPath : defaultPath;
  if (!fs.existsSync(filePath))
    throw new Error("No config file found (config.json or config.local.json)");
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

const config = loadConfig();
const CURRENCY = config.currency;
const ROUTES = config.routes;

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN ?? "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? "";
const GIST_ID = process.env.GIST_ID ?? "";
const GH_PAT = process.env.GH_PAT ?? "";
const _rawThreshold = process.env.PRICE_THRESHOLD;
const PRICE_THRESHOLD = _rawThreshold
  ? (() => {
      const v = parseFloat(_rawThreshold);
      return isFinite(v) ? v : null;
    })()
  : null;
const HTTP_TIMEOUT = 15_000;
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1_000;

const REQUIRED_ENV = [
  "TELEGRAM_TOKEN",
  "TELEGRAM_CHAT_ID",
  "GIST_ID",
  "GH_PAT",
];
if (require.main === module) {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(`Missing env variables: ${missing.join(", ")}`);
    process.exit(1);
  }
  if (_rawThreshold && PRICE_THRESHOLD === null) {
    console.error(
      `Invalid PRICE_THRESHOLD: "${_rawThreshold}" is not a valid number.`,
    );
    process.exit(1);
  }
}

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

function buildLabel(routeLabel, dateLabel) {
  return dateLabel ? `${routeLabel} ${dateLabel}` : routeLabel;
}

function findCheapest(dateResults) {
  const available = dateResults.filter((r) => r.price !== null);
  if (!available.length) return null;
  return available.reduce((min, r) => (r.price < min.price ? r : min));
}

function buildMessage(label, oldPrice, newPrice, threshold = null) {
  if (oldPrice === null && newPrice !== null)
    return `NOWY LOT ✈️ ${label}: ${fmt(newPrice)} ${CURRENCY}`;

  if (oldPrice !== null && newPrice === null)
    return `LOT NIEDOSTĘPNY ❌ ${label}`;

  if (newPrice < oldPrice) {
    if (threshold !== null && newPrice >= threshold) return null;
    return `TANIEJE 📉 ${label}: ${fmt(oldPrice)} → ${fmt(newPrice)} ${CURRENCY} (-${fmt(oldPrice - newPrice)} ${CURRENCY})`;
  }

  if (newPrice > oldPrice)
    return `DROŻEJE 📈 ${label}: ${fmt(oldPrice)} → ${fmt(newPrice)} ${CURRENCY} (+${fmt(newPrice - oldPrice)} ${CURRENCY})`;

  return null;
}

// ── Main ────────────────────────────────────────────────

async function main() {
  const state = await loadState();
  let changed = false;

  for (const route of ROUTES) {
    const dateResults = [];
    let fetchErrors = 0;
    for (const dateEntry of route.dates) {
      try {
        const price = await fetchPrice({ ...route, date: dateEntry.date });
        dateResults.push({
          date: dateEntry.date,
          label: dateEntry.label,
          price,
        });
      } catch (err) {
        fetchErrors += 1;
        console.error(
          `[${route.key}] fetch error for ${dateEntry.date}: ${err.message}`,
        );
      }
    }

    if (dateResults.length === 0) {
      console.error(
        `[${route.key}] all date fetches failed (${fetchErrors}/${route.dates.length}); skipping.`,
      );
      continue;
    }

    const cheapest = findCheapest(dateResults);

    if (!state[route.key])
      state[route.key] = { price: null, date: null, dateLabel: null };
    const prev = {
      price: state[route.key].price ?? null,
      date: state[route.key].date ?? null,
      dateLabel: state[route.key].dateLabel ?? null,
    };

    const newPrice = cheapest?.price ?? null;
    const newDate = cheapest?.date ?? null;
    const newDateLabel = cheapest?.label ?? null;

    const msgLabel = buildLabel(route.label, newDateLabel ?? prev.dateLabel);

    console.log(
      `[${route.key}] prev=${prev.price} (${prev.dateLabel}) curr=${newPrice} (${newDateLabel})`,
    );

    const msg = buildMessage(msgLabel, prev.price, newPrice, PRICE_THRESHOLD);
    const stateChanged =
      prev.price !== newPrice ||
      prev.date !== newDate ||
      prev.dateLabel !== newDateLabel;

    if (msg) {
      console.log(`[${route.key}] → ${msg}`);
      try {
        await notify(msg);
      } catch (err) {
        console.error(`[${route.key}] Telegram error: ${err.message}`);
      }
    } else {
      console.log(`[${route.key}] No change.`);
    }

    if (stateChanged) {
      state[route.key] = {
        price: newPrice,
        date: newDate,
        dateLabel: newDateLabel,
      };
      changed = true;
    }
  }

  if (changed) {
    await saveState(state);
    console.log("State saved.");
  } else {
    console.log("No changes.");
  }
}

module.exports = {
  buildLabel,
  buildMessage,
  CURRENCY,
  findCheapest,
  fmt,
  PRICE_THRESHOLD,
};

if (require.main === module) {
  main().catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
}
