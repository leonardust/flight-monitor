# Flight Monitor

Automatyczny monitor cen lotów Ryanair. Sprawdza ceny co 2 godziny przez GitHub Actions i wysyła powiadomienia na Telegram gdy cena się zmieni. Obsługuje wiele tras, dat i pasażerów konfigurowanych przez `config.json`. Przechowuje historię cen i udostępnia komendy Telegram do podglądu trendów i najniższych cen.

https://github.com/leonardust/flight-monitor

## Jak to działa

### Automatyczne monitorowanie (co 2 godziny)

```
GitHub Actions (monitor.yml)
  └─ node check-flights.js
       ├─ pobiera ceny z Ryanair API dla każdej trasy i daty
       ├─ porównuje z poprzednim stanem (GitHub Gist → state.json)
       ├─ jeśli cena się zmieniła → wysyła powiadomienie Telegram
       ├─ zapisuje nowy stan do Gista (state.json)
       └─ dopisuje wpis do historii cen (history.json)
```

Powiadomienia:

- `NOWY LOT ✈️` — lot pojawił się po raz pierwszy
- `TANIEJE 📉` — cena spadła (opcjonalnie: tylko poniżej progu)
- `DROŻEJE 📈` — cena wzrosła
- `LOT NIEDOSTĘPNY ❌` — lot zniknął z oferty

Każda data śledzona jest **niezależnie** — zmiana ceny na jednej dacie nie wpływa na inne.

### Raport na żądanie (`/sprawdz`, `/check`)

```
Telegram /sprawdz
  └─ Cloudflare Worker
       ├─ weryfikuje chat_id
       ├─ odpowiada „Sprawdzam ceny…"
       └─ triggeruje GitHub Actions (report.yml)
            └─ node check-flights.js --report
                 └─ pobiera aktualne ceny i wysyła zbiorczy raport na Telegram
```

Raport nie zmienia stanu — pokazuje tylko aktualne ceny wszystkich tras i dat (w tym powroty).

### Trendy cen (`/trend`)

Worker pobiera `history.json` z Gista i wyświetla dla każdej trasy/daty wykres ASCII pokazujący ostatnie 10 zapisanych cen.

### Najniższe ceny (`/lowest_price`)

Worker pobiera `history.json` z Gista i wyświetla dla każdej trasy/daty najniższą odnotowaną cenę wraz z datą jej wystąpienia.

### Stan i historia (GitHub Gist)

**`state.json`** — bieżące ceny (używane do wykrywania zmian):

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

**`history.json`** — historia cen z timestampami:

```json
{
  "WRO_BGY_2026-11-07": {
    "label": "WRO→BGY 7 lis",
    "entries": [
      { "price": 462.0, "ts": 1747123200000 },
      { "price": 441.0, "ts": 1747130400000 }
    ]
  }
}
```

## Konfiguracja

### `config.json`

```json
{
  "currency": "PLN",
  "passengers": {
    "adults": 2,
    "teens": 0,
    "children": 1,
    "infants": 0
  },
  "routes": [
    {
      "key": "WRO_BGY",
      "from": "WRO",
      "to": "BGY",
      "label": "WRO→BGY",
      "priceThreshold": 150,
      "dates": [
        {
          "date": "2026-11-07",
          "label": "7 lis",
          "roundTrip": [
            { "dateOut": "2026-11-07", "dateIn": "2026-11-12", "label": "12 lis" },
            { "dateOut": "2026-11-07", "dateIn": "2026-11-13", "label": "13 lis" }
          ]
        }
      ]
    },
    {
      "key": "BGY_WRO",
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

| Pole               | Opis                                                        |
| ------------------ | ----------------------------------------------------------- |
| `currency`         | Waluta wyświetlana w powiadomieniach                        |
| `passengers`       | Liczba pasażerów każdego typu (cena mnożona przez sumę)     |
| `routes[].key`     | Unikalny identyfikator trasy (używany w Gist)               |
| `routes[].from/to` | Kody lotnisk IATA                                           |
| `routes[].label`   | Etykieta trasy w powiadomieniach                            |
| `priceThreshold`   | Opcjonalny próg — `TANIEJE` tylko gdy cena spada poniżej   |
| `dates[].roundTrip`| Opcjonalna lista powrotów dla danej daty wylotu             |

Opcjonalnie można utworzyć `config.local.json` (ignorowany przez git) z lokalnymi nadpisaniami.

### Sekrety GitHub Actions

Wymagane w repo → Settings → Secrets and variables → Actions:

| Sekret             | Opis                                          |
| ------------------ | --------------------------------------------- |
| `TELEGRAM_TOKEN`   | Token bota Telegram                           |
| `TELEGRAM_CHAT_ID` | ID czatu do powiadomień                       |
| `GIST_ID`          | ID Gista do przechowywania stanu i historii   |
| `GH_PAT`           | Personal Access Token (scope: `gist`, `repo`) |

### Cloudflare Worker (komendy Telegram)

Worker odbiera komendy z Telegrama przez webhook i obsługuje:

| Komenda         | Opis                                                  |
| --------------- | ----------------------------------------------------- |
| `/sprawdz`      | Triggeruje raport aktualnych cen (report.yml)         |
| `/check`        | Alias `/sprawdz`                                      |
| `/trend`        | Wykres ASCII historii cen dla każdej trasy i daty     |
| `/lowest_price` | Najniższa odnotowana cena dla każdej trasy i daty     |

#### Pierwsze wdrożenie

```bash
cd worker
npm install

# Ustaw sekrety
npx wrangler secret put TELEGRAM_TOKEN
npx wrangler secret put TELEGRAM_CHAT_ID
npx wrangler secret put GH_PAT
npx wrangler secret put GIST_ID

# Wdróż
npx wrangler deploy

# Zarejestruj webhook Telegram
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://flight-monitor-bot.flight-monitor.workers.dev"
```

#### Sekrety Cloudflare Worker

| Sekret             | Opis                                  |
| ------------------ | ------------------------------------- |
| `TELEGRAM_TOKEN`   | Token bota Telegram                   |
| `TELEGRAM_CHAT_ID` | ID czatu do powiadomień               |
| `GH_PAT`           | Personal Access Token (scope: `gist`, `repo`) |
| `GIST_ID`          | ID Gista (do odczytu history.json)    |

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
