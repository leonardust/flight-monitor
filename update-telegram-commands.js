#!/usr/bin/env node
"use strict";

// Get token from environment or prompt
const token = process.env.TELEGRAM_TOKEN;
if (!token) {
  console.error("❌ TELEGRAM_TOKEN not set in environment");
  console.error("Usage: TELEGRAM_TOKEN=your_token node update-telegram-commands.js");
  process.exit(1);
}

const https = require("https");

const commands = [
  { command: "check", description: "Check price for selected route" },
  { command: "addroute", description: "Add new route to monitor" },
  { command: "help", description: "Show available commands" },
  { command: "trend", description: "Price trend charts" },
  { command: "lowest_price", description: "Historical lowest prices" },
];

const body = JSON.stringify({ commands });

const options = {
  hostname: "api.telegram.org",
  path: `/bot${token}/setMyCommands`,
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Content-Length": body.length,
  },
};

const req = https.request(options, (res) => {
  let data = "";
  res.on("data", (chunk) => {
    data += chunk;
  });
  res.on("end", () => {
    const result = JSON.parse(data);
    if (result.ok) {
      console.log("✅ Komendy zaaktualizowane w Telegramie!");
      console.log("Dostępne komendy:");
      commands.forEach((cmd) => {
        console.log(`  /${cmd.command} - ${cmd.description}`);
      });
    } else {
      console.error("❌ Błąd:", result.description);
      process.exit(1);
    }
  });
});

req.on("error", (err) => {
  console.error("❌ Błąd połączenia:", err.message);
  process.exit(1);
});

req.write(body);
req.end();
