# Flight Monitor

Automatyczny monitor cen lotów Ryanair. Sprawdza ceny co 2 godziny przez GitHub Actions i wysyła powiadomienia na Telegram gdy cena się zmieni. Na żądanie wysyła raport z aktualnymi cenami przez komendę `/sprawdz` w Telegramie. Obsługuje wiele tras i dat konfigurowanych przez `config.json`.

https://github.com/leonardust/flight-monitor

## Jak to działa

### Automatyczne monitorowanie (co 2 godziny)

```
GitHub Actions (monitor.yml)
  └─ node check-flights.js
       ├─ pobiera ceny z Ryanair API dla każdej trasy i daty
       ├─ porównuje z poprzednim stanem (GitHub Gist)
       ├─ jeśli cena się zmieniła → wysyła powiadomienie Telegram
       └─ zapisuje nowy stan do Gista
```

Powiadomienia:

- `NOWY LOT ✈️` — lot pojawił się po raz pierwszy
- `TANIEJE 📉` — cena spadła (opcjonalnie: tylko poniżej progu)
- `DROŻEJE 📈` — cena wzrosła
- `LOT NIEDOSTĘPNY ❌` — lot zniknął z oferty

Każda data śledzona jest **niezależnie** — zmiana ceny na jednej dacie nie wpływa na inne.

### Raport na żądanie (`/sprawdz`)

```
Telegram /sprawdz
  └─ Cloudflare Worker
       ├─ weryfikuje chat_id
       ├─ odpowiada „Sprawdzam ceny…"
       └─ triggeruje GitHub Actions (report.yml)
            └─ node check-flights.js --report
                 └─ pobiera aktualne ceny i wysyła zbiorczy raport na Telegram
```

Raport nie zmienia stanu — pokazuje tylko aktualne ceny wszystkich tras i dat.

### Stan (GitHub Gist)

```json
{
  "BGY_WRO": {
    "2026-11-12": { "price": 89.99 },
    "2026-11-13": { "price": 110.0 }
  },
  "WRO_BGY": {
    "2026-11-07": { "price": null }
  }
}
```

`null` oznacza lot niedostępny.

## Konfiguracja

### `config.json`

```json
{
  "currency": "PLN",
  "routes": [
    {
      "from": "WRO",
      "to": "BGY",
      "label": "WRO→BGY",
      "priceThreshold": 150,
      "dates": [{ "date": "2026-11-07", "label": "7 lis" }]
    },
    {
      "from": "BGY",
      "to": "WRO",
      "label": "BGY→WRO",
      "dates": [
        { "date": "2026-11-12", "label": "12 lis" },
        { "date": "2026-11-13", "label": "13 lis" }
      ]
    }
  ]
}
```

Opcjonalnie można utworzyć `config.local.json` (ignorowany przez git) z lokalnymi nadpisaniami.

### Sekrety GitHub Actions

Wymagane w repo → Settings → Secrets and variables → Actions:

| Sekret             | Opis                                  |
| ------------------ | ------------------------------------- |
| `TELEGRAM_TOKEN`   | Token bota Telegram                   |
| `TELEGRAM_CHAT_ID` | ID czatu do powiadomień               |
| `GIST_ID`          | ID Gista do przechowywania stanu      |
| `GH_PAT`           | Personal Access Token (scope: `gist`) |

### Cloudflare Worker (komenda `/sprawdz`)

Worker odbiera komendy `/sprawdz` i `/check` z Telegrama przez webhook i triggeruje workflow `report.yml`.

#### Pierwsze wdrożenie

```bash
cd worker
npm install

# Ustaw sekrety
npx wrangler secret put TELEGRAM_TOKEN
npx wrangler secret put TELEGRAM_CHAT_ID
npx wrangler secret put GH_PAT

# Wdróż
npx wrangler deploy

# Zarejestruj webhook Telegram
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://flight-monitor-bot.flight-monitor.workers.dev"
```

#### Zmienne w `worker/wrangler.toml`

| Zmienna   | Opis                                           |
| --------- | ---------------------------------------------- |
| `GH_REPO` | Repozytorium (`owner/repo`)                    |
| `GH_REF`  | Branch do workflow_dispatch (domyślnie `main`) |

#### Aktualizacja workera

```bash
cd worker
npx wrangler deploy
```
