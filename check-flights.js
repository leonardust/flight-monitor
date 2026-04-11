#!/usr/bin/env node
"use strict";

const https = require("https");

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const GIST_ID = process.env.GIST_ID;
const GH_PAT = process.env.GH_PAT;

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

function httpsRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function fetchFare(route) {
  const params = new URLSearchParams({
    departureAirportIataCode: route.from,
    arrivalAirportIataCode: route.to,
    outboundDepartureDateFrom: route.date,
    outboundDepartureDateTo: route.date,
    currency: "PLN",
  });

  const options = {
    hostname: "www.ryanair.com",
    path: `/api/farfnd/v4/oneWayFares?${params}`,
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "application/json",
    },
  };

  const res = await httpsRequest(options);
  if (res.status !== 200) throw new Error(`Ryanair API status ${res.status}`);

  const fares = res.body.fares;
  if (!fares || fares.length === 0) return null;
  return fares[0].outbound.price.value;
}

async function readGist() {
  const options = {
    hostname: "api.github.com",
    path: `/gists/${GIST_ID}`,
    method: "GET",
    headers: {
      Authorization: `token ${GH_PAT}`,
      "User-Agent": "flight-monitor",
      Accept: "application/vnd.github.v3+json",
    },
  };

  const res = await httpsRequest(options);
  if (res.status !== 200) throw new Error(`Gist read status ${res.status}`);

  const content = res.body.files["state.json"].content;
  return JSON.parse(content);
}

async function writeGist(state) {
  const body = JSON.stringify({
    files: {
      "state.json": {
        content: JSON.stringify(state, null, 2),
      },
    },
  });

  const options = {
    hostname: "api.github.com",
    path: `/gists/${GIST_ID}`,
    method: "PATCH",
    headers: {
      Authorization: `token ${GH_PAT}`,
      "User-Agent": "flight-monitor",
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
    },
  };

  const res = await httpsRequest(options, body);
  if (res.status !== 200) throw new Error(`Gist write status ${res.status}`);
}

async function sendTelegram(message) {
  const body = JSON.stringify({
    chat_id: TELEGRAM_CHAT_ID,
    text: message,
  });

  const options = {
    hostname: "api.telegram.org",
    path: `/bot${TELEGRAM_TOKEN}/sendMessage`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
    },
  };

  const res = await httpsRequest(options, body);
  if (res.status !== 200)
    throw new Error(
      `Telegram status ${res.status}: ${JSON.stringify(res.body)}`,
    );
}

function buildMessage(route, oldPrice, newPrice) {
  if (oldPrice === null && newPrice !== null) {
    return `NOWY LOT ✈️ ${route.label}: ${newPrice} PLN`;
  }
  if (oldPrice !== null && newPrice === null) {
    return `LOT NIEDOSTĘPNY ❌ ${route.label}`;
  }
  if (newPrice < oldPrice) {
    const diff = (oldPrice - newPrice).toFixed(2);
    return `TANIEJE 📉 ${route.label}: ${oldPrice} → ${newPrice} PLN (-${diff} PLN)`;
  }
  if (newPrice > oldPrice) {
    const diff = (newPrice - oldPrice).toFixed(2);
    return `DROŻEJE 📈 ${route.label}: ${oldPrice} → ${newPrice} PLN (+${diff} PLN)`;
  }
  return null;
}

async function main() {
  const state = await readGist();
  let changed = false;

  for (const route of ROUTES) {
    let currentPrice;
    try {
      currentPrice = await fetchFare(route);
    } catch (err) {
      console.error(`[${route.key}] fetch error:`, err.message);
      continue;
    }

    const previousPrice = state[route.key]?.price ?? null;
    console.log(
      `[${route.key}] previous=${previousPrice} current=${currentPrice}`,
    );

    const message = buildMessage(route, previousPrice, currentPrice);
    if (message) {
      console.log(`[${route.key}] Sending: ${message}`);
      await sendTelegram(message);
      state[route.key] = { price: currentPrice };
      changed = true;
    }
  }

  if (changed) {
    await writeGist(state);
    console.log("State updated in Gist.");
  } else {
    console.log("No changes detected.");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
