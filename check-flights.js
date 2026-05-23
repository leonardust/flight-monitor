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
const _configPassengers = config.passengers ?? {
  adults: 1,
  teens: 0,
  children: 0,
  infants: 0,
};
const PASSENGERS = (() => {
  const e = {
    adults: parseInt(process.env.ADULTS ?? "", 10),
    teens: parseInt(process.env.TEENS ?? "", 10),
    children: parseInt(process.env.CHILDREN ?? "", 10),
    infants: parseInt(process.env.INFANTS ?? "", 10),
  };
  return {
    adults: isFinite(e.adults) ? e.adults : _configPassengers.adults,
    teens: isFinite(e.teens) ? e.teens : _configPassengers.teens,
    children: isFinite(e.children) ? e.children : _configPassengers.children,
    infants: isFinite(e.infants) ? e.infants : _configPassengers.infants,
  };
})();

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
  const _isReport = process.argv.includes("--report");
  const _requiredEnv = _isReport
    ? ["TELEGRAM_TOKEN", "TELEGRAM_CHAT_ID"]
    : REQUIRED_ENV;
  const missing = _requiredEnv.filter((k) => !process.env[k]);
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
async function loadHistory() {
  const res = await requestWithRetry({
    hostname: "api.github.com",
    path: `/gists/${GIST_ID}`,
    method: "GET",
    headers: gistHeaders,
  });
  if (res.status !== 200) throw new Error(`Gist read ${res.status}`);
  const file = res.data.files["history.json"];
  if (!file) return {};
  try {
    return JSON.parse(file.content);
  } catch {
    return {};
  }
}

async function saveHistory(history) {
  const body = JSON.stringify({
    files: { "history.json": { content: JSON.stringify(history, null, 2) } },
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

function buildRyanairUrl(from, to, date, passengers = PASSENGERS) {
  const params = new URLSearchParams({
    adults: String(passengers.adults ?? 1),
    teens: String(passengers.teens ?? 0),
    children: String(passengers.children ?? 0),
    infants: String(passengers.infants ?? 0),
    dateOut: date,
    originIata: from,
    destinationIata: to,
    isConnectedFlight: "false",
    isReturn: "false",
    discount: "0",
  });
  return `https://www.ryanair.com/pl/pl/trip/flights/select?${params}`;
}

function buildRyanairRoundTripUrl(dateOut, dateIn, passengers = PASSENGERS) {
  const params = new URLSearchParams({
    adults: String(passengers.adults ?? 1),
    teens: String(passengers.teens ?? 0),
    children: String(passengers.children ?? 0),
    infants: String(passengers.infants ?? 0),
    dateOut,
    dateIn,
    originIata: "WRO",
    destinationIata: "BGY",
    isConnectedFlight: "false",
    isReturn: "true",
    discount: "0",
  });
  return `https://www.ryanair.com/pl/pl/trip/flights/select?${params}`;
}

async function notify(text, buttons = [], parseMode = null) {
  const payload = { chat_id: TELEGRAM_CHAT_ID, text };
  if (parseMode) payload.parse_mode = parseMode;
  if (buttons.length > 0) {
    payload.reply_markup = {
      inline_keyboard: buttons.map((btn) => [btn]),
    };
  }
  const res = await jsonPost(
    "api.telegram.org",
    `/bot${TELEGRAM_TOKEN}/sendMessage`,
    payload,
  );
  if (res.status !== 200)
    throw new Error(`Telegram ${res.status}: ${JSON.stringify(res.data)}`);
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ── Message builder ─────────────────────────────────────

function fmt(price) {
  return price.toFixed(2);
}

function buildLabel(routeLabel, dateLabel) {
  return dateLabel ? `${routeLabel} ${dateLabel}` : routeLabel;
}

function buildMessage(
  label,
  oldPrice,
  newPrice,
  threshold = null,
  multiplier = 1,
) {
  if (oldPrice === null && newPrice !== null)
    return `NOWY LOT ✈️ ${label}: ${fmt(newPrice * multiplier)} ${CURRENCY}`;

  if (oldPrice !== null && newPrice === null)
    return `LOT NIEDOSTĘPNY ❌ ${label}`;

  if (newPrice < oldPrice) {
    if (threshold !== null && newPrice >= threshold) return null;
    return `TANIEJE 📉 ${label}: ${fmt(oldPrice * multiplier)} → ${fmt(newPrice * multiplier)} ${CURRENCY} (-${fmt((oldPrice - newPrice) * multiplier)} ${CURRENCY})`;
  }

  if (newPrice > oldPrice)
    return `DROŻEJE 📈 ${label}: ${fmt(oldPrice * multiplier)} → ${fmt(newPrice * multiplier)} ${CURRENCY} (+${fmt((newPrice - oldPrice) * multiplier)} ${CURRENCY})`;

  return null;
}

function buildEventHeader(label, oldPrice, newPrice) {
  if (oldPrice === null && newPrice !== null)
    return `NOWY LOT \u2708\ufe0f ${label}`;
  if (oldPrice !== null && newPrice === null)
    return `LOT NIEDOST\u0118PNY \u274c ${label}`;
  if (newPrice !== null && oldPrice !== null && newPrice < oldPrice)
    return `TANIEJE \ud83d\udcc9 ${label}`;
  if (newPrice !== null && oldPrice !== null && newPrice > oldPrice)
    return `DRO\u017bEJE \ud83d\udcc8 ${label}`;
  return label;
}

async function buildPriceNotification(
  label,
  oldPrice,
  newPrice,
  result,
  route,
) {
  const totalPax =
    PASSENGERS.adults +
    PASSENGERS.teens +
    PASSENGERS.children +
    PASSENGERS.infants;
  const lines = [buildEventHeader(label, oldPrice, newPrice)];

  if (newPrice !== null) {
    const oneWayUrl = buildRyanairUrl(route.from, route.to, result.date);
    const newTotal = fmt(newPrice * totalPax);
    if (oldPrice !== null && oldPrice !== newPrice) {
      const oldTotal = fmt(oldPrice * totalPax);
      const diffTotal = fmt(Math.abs(newPrice - oldPrice) * totalPax);
      const sign = newPrice < oldPrice ? "-" : "+";
      lines.push(
        `\u2192 ${oldTotal} \u2192 <a href="${oneWayUrl}">${newTotal} ${CURRENCY}</a> (${sign}${diffTotal} ${CURRENCY})`,
      );
    } else {
      lines.push(`\u2192 <a href="${oneWayUrl}">${newTotal} ${CURRENCY}</a>`);
    }

    for (const rt of result.roundTrip) {
      const rtUrl = buildRyanairRoundTripUrl(rt.dateOut, rt.dateIn);
      try {
        const inboundPrice = await fetchPrice({
          from: route.to,
          to: route.from,
          date: rt.dateIn,
        });
        if (inboundPrice !== null) {
          const rtTotal = fmt((newPrice + inboundPrice) * totalPax);
          lines.push(
            `\u2194 ${result.label}\u2192${rt.label}: <a href="${rtUrl}">${rtTotal} ${CURRENCY}</a>`,
          );
        } else {
          lines.push(
            `\u2194 ${result.label}\u2192${rt.label}: <a href="${rtUrl}">sprawd\u017a</a>`,
          );
        }
      } catch {
        lines.push(
          `\u2194 ${result.label}\u2192${rt.label}: <a href="${rtUrl}">sprawd\u017a</a>`,
        );
      }
    }
  }

  return lines.join("\n");
}

function buildAsciiChart(label, entries, n = 10) {
  const slice = entries.slice(-n);
  if (slice.length < 2) return null;

  const prices = slice.map((e) => e.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const header = `${label} - ostatnie ${slice.length} cen (${CURRENCY}):`;

  if (min === max) {
    return `${header}\n${String(Math.round(max))} | ${"* ".repeat(slice.length).trimEnd()}`;
  }

  const ROWS = 5;
  const step = (max - min) / (ROWS - 1);
  const levels = Array.from({ length: ROWS }, (_, i) =>
    Math.round(max - step * i),
  );
  const labelWidth = Math.max(...levels.map((l) => String(l).length));

  const lines = [header];
  for (const level of levels) {
    const cols = slice.map((e) => {
      const closest = levels.reduce((prev, curr) =>
        Math.abs(curr - e.price) < Math.abs(prev - e.price) ? curr : prev,
      );
      return closest === level ? "*" : " ";
    });
    lines.push(`${String(level).padStart(labelWidth)} | ${cols.join("  ")}`);
  }
  return lines.join("\n");
}

// ── Main ────────────────────────────────────────────────

async function main() {
  const state = await loadState();
  const history = await loadHistory();
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
          roundTrip: dateEntry.roundTrip ?? [],
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

    if (!state[route.key]) state[route.key] = {};

    for (const result of dateResults) {
      const prevPrice = state[route.key][result.date]?.price ?? null;
      const newPrice = result.price;
      const msgLabel = buildLabel(route.label, result.label);

      console.log(
        `[${route.key}][${result.date}] prev=${prevPrice} curr=${newPrice}`,
      );

      const msg = buildMessage(
        msgLabel,
        prevPrice,
        newPrice,
        PRICE_THRESHOLD,
        PASSENGERS.adults +
          PASSENGERS.teens +
          PASSENGERS.children +
          PASSENGERS.infants,
      );

      if (prevPrice !== newPrice) {
        state[route.key][result.date] = { price: newPrice };
        changed = true;
        if (newPrice !== null) {
          const histKey = `${route.key}_${result.date}`;
          if (!history[histKey]) {
            history[histKey] = {
              label: buildLabel(route.label, result.label),
              entries: [],
            };
          }
          history[histKey].entries.push({
            price: newPrice,
            ts: new Date().toISOString(),
          });
        }
      }

      if (msg) {
        console.log(`[${route.key}][${result.date}] \u2192 ${msg}`);
        try {
          const htmlMsg = await buildPriceNotification(
            msgLabel,
            prevPrice,
            newPrice,
            result,
            route,
          );
          await notify(htmlMsg, [], "HTML");
        } catch (err) {
          console.error(`[${route.key}] Telegram error: ${err.message}`);
        }
        if (newPrice !== null) {
          const histKey = `${route.key}_${result.date}`;
          const routeHistory = history[histKey];
          if (routeHistory && routeHistory.entries.length >= 2) {
            const chart = buildAsciiChart(
              routeHistory.label,
              routeHistory.entries,
            );
            if (chart) {
              try {
                await notify(`<pre>${escapeHtml(chart)}</pre>`, [], "HTML");
              } catch (err) {
                console.error(`[${route.key}] Chart error: ${err.message}`);
              }
            }
          }
        }
      } else {
        console.log(`[${route.key}][${result.date}] No change.`);
      }
    }
  }

  if (changed) {
    await saveState(state);
    await saveHistory(history);
    console.log("State saved.");
  } else {
    console.log("No changes.");
  }
}

// ── Report mode ─────────────────────────────────────────

async function report() {
  const totalPax =
    PASSENGERS.adults +
    PASSENGERS.teens +
    PASSENGERS.children +
    PASSENGERS.infants;
  const sections = [];

  for (const route of ROUTES) {
    for (const dateEntry of route.dates) {
      const label = buildLabel(route.label, dateEntry.label);
      try {
        const price = await fetchPrice({ ...route, date: dateEntry.date });
        if (price !== null) {
          const oneWayUrl = buildRyanairUrl(
            route.from,
            route.to,
            dateEntry.date,
          );
          const lines = [
            `\u2708\ufe0f ${label}`,
            `\u2192 <a href="${oneWayUrl}">${fmt(price * totalPax)} ${CURRENCY}</a>`,
          ];
          for (const rt of dateEntry.roundTrip ?? []) {
            const rtUrl = buildRyanairRoundTripUrl(rt.dateOut, rt.dateIn);
            try {
              const inboundPrice = await fetchPrice({
                from: route.to,
                to: route.from,
                date: rt.dateIn,
              });
              if (inboundPrice !== null) {
                const rtTotal = fmt((price + inboundPrice) * totalPax);
                lines.push(
                  `\u2194 ${dateEntry.label}\u2192${rt.label}: <a href="${rtUrl}">${rtTotal} ${CURRENCY}</a>`,
                );
              } else {
                lines.push(
                  `\u2194 ${dateEntry.label}\u2192${rt.label}: <a href="${rtUrl}">sprawd\u017a</a>`,
                );
              }
            } catch {
              lines.push(
                `\u2194 ${dateEntry.label}\u2192${rt.label}: <a href="${rtUrl}">sprawd\u017a</a>`,
              );
            }
          }
          sections.push(lines.join("\n"));
        } else {
          sections.push(`\u2708\ufe0f ${label}: niedost\u0119pny`);
        }
      } catch (err) {
        console.error(
          `[${route.key}] fetch error for ${dateEntry.date}: ${err.message}`,
        );
        sections.push(`\u2708\ufe0f ${label}: b\u0142\u0105d pobierania`);
      }
    }
  }

  if (sections.length > 0) await notify(sections.join("\n\n"), [], "HTML");
}
module.exports = {
  buildAsciiChart,
  buildLabel,
  buildMessage,
  buildRyanairUrl,
  buildRyanairRoundTripUrl,
  CURRENCY,
  fmt,
  PRICE_THRESHOLD,
  report,
};

if (require.main === module) {
  const isReport = process.argv.includes("--report");
  (isReport ? report : main)().catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
}
