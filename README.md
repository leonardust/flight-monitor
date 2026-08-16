# Flight Monitor

Automatyczny monitor cen lotów Ryanair. Sprawdza ceny co 2 godziny przez GitHub Actions i wysyła powiadomienia na Telegram gdy cena się zmieni. Obsługuje wiele tras, dat i pasażerów konfigurowanych przez `config.json`. Przechowuje historię cen i udostępnia komendy Telegram do podglądu trendów i najniższych cen.

https://github.com/leonardust/flight-monitor

## Jak to działa

### Architektura

```
┌─────────────────────────────────────────────┐
│                  Ryanair API                 │
└────────────┬────────────────────────────────┘
             │
    ┌────────┴──────────────┬──────────────┐
    │                       │              │
    ▼                       ▼              ▼
GitHub Actions (co 2h)  Telegram Bot     User (CI/CD)
    │                   (Webhook)
    │                    ▲  │
    └────────────┬────────┘  │
                 │           │
         ▼       ▼           ▼
    check-flights.js
         │
    ┌────┼────┐
    │    │    │
    ▼    ▼    ▼
  Gist Config.json Telegram
  (history) (routes)  (notify)
```

### Komponenty

- **GitHub Actions** — monitoruje trasy co 2 godziny (`monitor.yml`) + raporty na żądanie (`report.yml`)
- **check-flights.js** — fetch cen, detekcja zmian, powiadomienia (Node.js)
- **Cloudflare Worker** — webhook Telegrama, interaktywne menu, dodawanie tras
- **GitHub Gist** — przechowuje historię cen i bieżący stan
- **config.json** — konfiguracja tras (może być aktualizowany przez Worker)

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

### Raport na żądanie (`/check`)

```
Telegram /check
  └─ Cloudflare Worker
       ├─ weryfikuje chat_id
       ├─ pokazuje inline buttons do wyboru trasy
       ├─ użytkownik wybiera trasę → datę wylotu → datę powrotu (jeśli ma) → liczbę pasażerów
       └─ triggeruje GitHub Actions (report.yml) z wybranymi parametrami
            └─ node check-flights.js --report
                 └─ pobiera aktualne ceny dla wybranej trasy/dat i wysyła raport na Telegram
```

Raport nie zmienia stanu — pokazuje tylko aktualne ceny dla wybranej trasy i daty.

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
            {
              "dateOut": "2026-11-07",
              "dateIn": "2026-11-12",
              "label": "12 lis"
            },
            {
              "dateOut": "2026-11-07",
              "dateIn": "2026-11-13",
              "label": "13 lis"
            }
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

| Pole                | Opis                                                     |
| ------------------- | -------------------------------------------------------- |
| `currency`          | Waluta wyświetlana w powiadomieniach                     |
| `passengers`        | Liczba pasażerów każdego typu (cena mnożona przez sumę)  |
| `routes[].key`      | Unikalny identyfikator trasy (używany w Gist)            |
| `routes[].from/to`  | Kody lotnisk IATA                                        |
| `routes[].label`    | Etykieta trasy w powiadomieniach                         |
| `priceThreshold`    | Opcjonalny próg — `TANIEJE` tylko gdy cena spada poniżej |
| `dates[].roundTrip` | Opcjonalna lista powrotów dla danej daty wylotu          |

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

| Komenda        | Opis                                                                    |
| -------------- | ----------------------------------------------------------------------- |
| `/check`       | Wybierz trasę i daty → triggeruje raport aktualnych cen                 |
| `/addroute`    | Dodaj nową trasę do monitorowania bez edytowania `config.json`          |
| `/help`        | Pokaż dostępne komendy                                                  |
| `/trend`       | Wykres ASCII historii cen dla każdej trasy i daty                      |
| `/lowest_price`| Najniższa odnotowana cena dla każdej trasy i daty                      |

#### Komenda `/check` (interaktywnie)

Krok po kroku:
1. Wyślij `/check`
2. Worker wyświetla **inline buttons** ze wszystkimi trasami z `config.json`
3. Wybierz trasę
4. Wybierz datę wylotu
5. Jeśli jest wiele powrotów — wybierz datę powrotu
6. Wybierz liczbę każdego typu pasażera (adults → teens → children → infants)
7. Worker triggeruje GitHub Actions z wybranymi parametrami
8. Otrzymujesz raport cen dla wybranej kombinacji

#### Komenda `/addroute` (dynamiczne dodawanie tras)

Bez potrzeby edytowania `config.json` ani pusowania zmian:

```
/addroute
  ↓
Bot odpowiada instrukcją

Ty odpowiadasz:
  WRO ATH 2027-01-20 2027-01-27

Bot:
  ✅ Trasę dodano!
  WRO→ATH (20 sty, 27 sty)
```

Nowa trasa jest natychmiast dostępna w `/check` i monitorowana w pętli GitHub Actions.

**Format:**
- `KOD_Z KOD_DO DATA_WYLOTU DATA_POWROTU` (lot z powrotem)
- `KOD_Z KOD_DO DATA_WYLOTU` (tylko lot w jedną stronę)

**Przykłady:**
- `WRO ATH 2027-01-20 2027-01-27` — Warszawa → Ateny, 20 sty, powrót 27 sty
- `WRO BGY 2027-02-10` — Warszawa → Bergamo, 10 lut (bez powrotu)

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

| Sekret             | Opis                                          |
| ------------------ | --------------------------------------------- |
| `TELEGRAM_TOKEN`   | Token bota Telegram                           |
| `TELEGRAM_CHAT_ID` | ID czatu do powiadomień                       |
| `GH_PAT`           | Personal Access Token (scope: `gist`, `repo`) |
| `GIST_ID`          | ID Gista (do odczytu history.json)            |
| `TELEGRAM_SECRET`  | Opcjonalnie — token do weryfikacji webhhooka   |

#### Zmienne w `worker/wrangler.toml`

| Zmienna   | Opis                                           |
| --------- | ---------------------------------------------- |
| `GH_REPO` | Repozytorium (`owner/repo`)                    |
| `GH_REF`  | Branch do workflow_dispatch (domyślnie `main`) |

#### Parametry workflow dla `/check`

Gdy użytkownik wyśle `/check` i wybierze trasę/daty/pasażerów, Worker triggeruje `report.yml` z parametrami:

```yaml
inputs:
  route: WRO_ATH           # Key trasy z config.json
  dateOut: 2027-01-20      # Data wylotu (YYYY-MM-DD)
  dateIn: 2027-01-27       # Data powrotu (YYYY-MM-DD)
  adults: 2               # Liczba dorosłych
  teens: 0                # Liczba nastolatków
  children: 1             # Liczba dzieci
  infants: 0              # Liczba niemowląt
```

`check-flights.js` filtruje trasy i daty na podstawie tych zmiennych:

```javascript
// check-flights.js
// Jeśli FILTER_ROUTE ustawiony → przechodź tylko tę trasę
// Jeśli FILTER_DATE_OUT ustawiony → przechodź tylko tę datę wylotu
// Jeśli FILTER_DATE_IN ustawiony → przechodź tylko tę datę powrotu
const FILTER_ROUTE = process.env.FILTER_ROUTE;      // np. "WRO_ATH"
const FILTER_DATE_OUT = process.env.FILTER_DATE_OUT; // np. "2027-01-20"
const FILTER_DATE_IN = process.env.FILTER_DATE_IN;   // np. "2027-01-27"
```

Dzięki temu raport zawiera **tylko** wybrane loty, bez zbędnych tras.

#### Aktualizacja workera

```bash
cd worker
npx wrangler deploy
```

## Testowanie

Uruchom testy jednostkowe:

```bash
node check-flights.test.js
```

Sprawdź komendy Telegrama:

```bash
/help              # Pokaż dostępne komendy
/check             # Zacznij proces wyboru
/addroute          # Dodaj nową trasę
/trend             # Wykresy cen
/lowest_price      # Najniższe ceny
```
