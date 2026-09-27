# Copilot Instructions — flight-monitor

⚠️ **WAŻNE**: Wszystkie zasady programowania są udokumentowane w **[DEVELOPMENT-GUIDELINES.md](./DEVELOPMENT-GUIDELINES.md)** — obowiązkowe dla WSZYSTKICH agentów, skillów i kodu. Brak wyjątków!

## Stack

### check-flights.js (Node.js)
- Runtime: Node.js (CommonJS, `"use strict"`)
- HTTP client: plain `https` module, no external HTTP clients
- Tests: Node.js built-in `node:test` + `assert`

### worker/src/index.js (Cloudflare Worker)
- Runtime: ESM (ECMAScript modules)
- HTTP client: platform `fetch` API
- Environment: Cloudflare Workers runtime (not Node.js)

## Core Principles

Zasady dotyczą obydwu runtimeów (`check-flights.js` i `worker/src/index.js`), ale implementacja różni się:

### SOLID

- **Single Responsibility**: każda funkcja robi jedną rzecz. Osobne funkcje do: ładowania konfiguracji, budowania URL, parsowania odpowiedzi, wysyłania notyfikacji.
- **Open/Closed**: nowe trasy/waluty przez konfigurację (`config.json`), nie przez zmianę kodu.
- **Dependency Inversion**: zależności (tokeny, ID) przez zmienne środowiskowe lub config — nigdy hardcoded.

### DRY

- Nie powtarzaj logiki. Jeśli ten sam kod pojawia się dwa razy — wydziel funkcję.
- Wspólne stałe (`CURRENCY`, `ROUTES`, `PASSENGERS`) ładowane raz z config.

### KISS

- Prostota przed elegancją. Brak klas gdy wystarczą funkcje. Brak abstrakcji gdy jest tylko jeden przypadek użycia.
- Preferuj `async/await` zamiast zagnieżdżonych Promise/callback.

### YAGNI

- Nie dodawaj funkcji "na przyszłość". Implementuj tylko to co jest aktualnie wymagane.

## Clean Code

- **Nazewnictwo**: `camelCase` dla zmiennych/funkcji, `UPPER_SNAKE_CASE` dla stałych konfiguracyjnych, opisowe nazwy (`buildFlightUrl` zamiast `getUrl`).
- **Funkcje**: krótkie (≤ 30 linii), jeden poziom abstrakcji, brak efektów ubocznych gdzie to możliwe.
- **Komentarze**: tylko gdy kod nie tłumaczy się sam. Preferuj czytelny kod nad komentarzem.
- **Błędy**: rzucaj błędy z opisowym komunikatem, nie połykaj wyjątków (`catch (e) {}`).

## Bezpieczeństwo (OWASP)

- Sekrety **wyłącznie** przez zmienne środowiskowe (`process.env`), nigdy w kodzie ani w `config.json`.
- Waliduj dane wejściowe z zewnętrznych API przed użyciem.
- Nie loguj tokenów, haseł ani danych osobowych.
- Nie ufaj danym z zewnętrznych API — sprawdzaj typy i wartości.

## Architektura projektu

```
check-flights.js     # Node.js: logika główna (fetch → parse → notify → persist)
config.json          # konfiguracja tras, waluty, pasażerów (publiczna)
config.local.json    # lokalne nadpisanie config.json (gitignored)
worker/src/index.js  # Cloudflare Worker: osobny runtime (ESM, fetch API)
```

**Ważne:** `check-flights.js` (Node.js CommonJS) i `worker/` (ESM) to oddzielne runtime-y:
- `check-flights.js` używa `https` module (Node.js)
- `worker/src/index.js` używa `fetch` API (Cloudflare platform)
- Zmienia w `check-flights.js` nie wpływają automatycznie na `worker/` i odwrotnie
- Każdy ma swoją konfigurację i zależności

## Testowanie

- Testy w `check-flights.test.js` używają `node:test` i `node:assert`.
- Testuj jednostkowo czystą logikę (parsowanie, budowanie URL, walidację).
- Mockuj sieć i system plików — testy nie mogą robić prawdziwych requestów HTTP.

## Konwencje

- `async/await` zamiast callbacków.
- Zmienne środowiskowe z fallbackiem: `process.env.VAR ?? ""`.
- Parsuj liczby z `parseInt`/`parseFloat` i sprawdzaj `isFinite` przed użyciem.
- Pliki konfiguracyjne ładuj przez dedykowaną funkcję (`loadConfig`), nigdy inline.
