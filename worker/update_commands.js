import * as fs from "fs";

const env = JSON.parse(fs.readFileSync(".wrangler/env.json", "utf8"));
const telegramToken = env.env_1.vars.TELEGRAM_TOKEN || process.env.TELEGRAM_TOKEN;

if (!telegramToken) {
  console.error("TELEGRAM_TOKEN not found");
  process.exit(1);
}

const commands = [
  { command: "sprawdz", description: "Sprawdź cenę dla wybranej trasy" },
  { command: "check", description: "Check price for selected route" },
  { command: "dodaj_trasę", description: "Dodaj nową trasę do monitorowania" },
  { command: "help", description: "Pokaż dostępne komendy" },
  { command: "trend", description: "Wykresy trendów cen" },
  { command: "lowest_price", description: "Najniższe ceny w historii" },
];

const url = `https://api.telegram.org/bot${telegramToken}/setMyCommands`;
const body = JSON.stringify({ commands });

fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body,
})
  .then((r) => r.json())
  .then((data) => {
    if (data.ok) {
      console.log("✅ Komendy zaaktualizowane!");
    } else {
      console.error("❌ Błąd:", data.description);
    }
  })
  .catch((err) => console.error("Błąd:", err.message));
