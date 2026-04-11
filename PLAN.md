# Plan: Ryanair Flight Monitor (WRO↔BGY)

## TL;DR

Publiczne repozytorium GitHub + skrypt Node.js (bez zależności npm) + GitHub Actions cron co 15 min.
Stan (ostatnia cena) przechowywany w prywatnym GitHub Gist. Powiadomienia: wyłącznie Telegram Bot.

---

## Architektura

```
GitHub Actions (cron co 15 min)
        ↓
  check-flights.js
   ├── Ryanair API (WRO→BGY, 8 lis)
   ├── Ryanair API (BGY→WRO, 11 lis)
   ├── GitHub Gist (odczyt/zapis stanu)
   └── Telegram Bot API (powiadomienia)
```

### Pliki

- `check-flights.js` — główna logika
- `.github/workflows/monitor.yml` — harmonogram cron

### GitHub Secrets (4 wartości)

| Secret             | Opis                                     |
| ------------------ | ---------------------------------------- |
| `TELEGRAM_TOKEN`   | Token bota z @BotFather                  |
| `TELEGRAM_CHAT_ID` | Twoje chat ID (z getUpdates)             |
| `GIST_ID`          | ID prywatnego Gista ze stanem            |
| `GH_PAT`           | Personal Access Token (Gists read/write) |

---

## Trasy do monitorowania

| Trasa                        | Data              |
| ---------------------------- | ----------------- |
| WRO → BGY (Mediolan Bergamo) | 8 listopada 2026  |
| BGY → WRO                    | 11 listopada 2026 |

---

## Ryanair API

Nieoficjalny endpoint (wewnętrzny, ten sam co strona www):

```
GET https://www.ryanair.com/api/farfnd/v4/oneWayFares
  ?departureAirportIataCode=WRO
  &arrivalAirportIataCode=BGY
  &outboundDepartureDateFrom=2026-11-08
  &outboundDepartureDateTo=2026-11-08
  &currency=PLN
```

Kluczowe pola odpowiedzi:

- `fares[].outbound.price.value` — cena lotu
- `fares.length > 0` — lot dostępny
- `fares.length === 0` — brak lotu w tym dniu

---

## Logika powiadomień

| Zdarzenie                       | Komunikat Telegram                            |
| ------------------------------- | --------------------------------------------- |
| Lot pojawia się po raz pierwszy | `NOWY LOT ✈️ WRO→BGY 8 lis: 149 PLN`          |
| Cena spada                      | `TANIEJE 📉 WRO→BGY: 199 → 149 PLN (-50 PLN)` |
| Cena rośnie                     | `DROŻEJE 📈 WRO→BGY: 149 → 199 PLN (+50 PLN)` |
| Lot znika                       | `LOT NIEDOSTĘPNY ❌ WRO→BGY 8 lis`            |

---

## Stan (GitHub Gist)

Plik `state.json` w prywatnym Gist:

```json
{
  "WRO_BGY": { "price": null },
  "BGY_WRO": { "price": null }
}
```

- `null` = lot jeszcze nie był widziany
- Liczba = ostatnia znana cena w PLN

---

## Kroki konfiguracji (jednorazowe)

1. ✅ Stwórz **publiczne** repo GitHub (np. `flight-monitor`)
2. ✅ Stwórz **prywatny GitHub Gist** z plikiem `state.json` (treść powyżej)
3. ✅ Skopiuj **GIST_ID** z URL: `gist.github.com/nick/GIST_ID`
4. ✅ Stwórz **GitHub PAT** (classic, scope: `gist`)
5. ✅ Skonfiguruj **Telegram Bot** przez @BotFather → `/newbot`
6. ✅ Pobierz **chat_id**: wyślij wiadomość do bota, odwiedź `https://api.telegram.org/bot{TOKEN}/getUpdates`
7. ✅ Dodaj 4 wartości jako **GitHub Secrets** w repozytorium
8. ✅ Wgraj pliki `check-flights.js` i `.github/workflows/monitor.yml`
9. Uruchom workflow ręcznie i sprawdź logi

---

## Bezpieczeństwo

- Wszystkie klucze wyłącznie w **GitHub Secrets** — nigdy w kodzie
- Publiczne repo zawiera tylko kod, zero danych osobowych
- Gist jako "baza danych" przechowuje tylko ceny (nic wrażliwego)
- **Uwaga:** Ryanair API to nieoficjalne, wewnętrzne API. Użytek osobisty i niekomercyjny jest powszechną praktyką, ale nie jest oficjalnie udostępnione.
