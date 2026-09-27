---
# DEVELOPMENT-GUIDELINES.md
# Obowiązkowe zasady dla WSZYSTKICH agentów, skillów i kodu
# Źródło: copilot-instructions.md + coding-principles.instructions.md
---

# 🎯 Zasady Programowania — Obowiązkowe dla Wszystkich Agentów

## ✅ Obowiązkowe dla:

- ✓ Pisania nowego kodu (create-pr skill, feature implementation)
- ✓ Reworku na bazie review (review-rework skill)
- ✓ Refactoringu (review-code skill)
- ✓ Dokumentacji
- ✓ Testów
- ✓ Zmian w infrastrukturze (.agent.md, skills, config)

**WYJĄTKU BRAK!** Każdy agent MUSI przestrzegać tych zasad niezależnie od kontekstu.

---

## 📚 SOLID Principles

### Single Responsibility

- Każda funkcja robi **jedną rzecz**
- Każdy moduł ma **jedną przyczynę do zmiany**
- Osobne funkcje do: ładowania config, budowania URL, parsowania, walidacji, notyfikacji

**Przykład — OK:**

```javascript
function loadConfig() {
  /* ładowanie */
}
function buildFlightUrl(route) {
  /* URL */
}
function parseFlightResponse(json) {
  /* parsowanie */
}
function sendNotification(message) {
  /* notyfikacja */
}
```

**Przykład — ❌ ZŁYCH:**

```javascript
// ❌ Mieszanie concerns — ZABRONIONE
async function getAllAndNotify() {
  const config = loadConfig();
  const url = buildUrl(config);
  const response = await fetch(url);
  const data = parseResponse(response);
  await notify(data);
  await persistState(data);
}
```

---

### Open/Closed Principle

- Otwarty na **rozszerzenie** (new features), **zamknięty na modyfikację**
- Nowe trasy/waluty/konfiguracja → przez `config.json`, NIE przez zmianę kodu
- Nowy typ notyfikacji → nowy handler, NIE modyfikacja istniejącego

**Przykład — OK:**

```javascript
// config.json
{
  "routes": [
    { "key": "WRO_ATH", "from": "WRO", "to": "ATH" },
    { "key": "NEW_ROUTE", "from": "KRK", "to": "LHR" }  ← Nowa ruta bez zmian kodu
  ]
}
```

---

### Liskov Substitution Principle

- Podtypy MUSZĄ być wymienne z typem bazowym
- Nie naruszaj kontraktu interfejsu

---

### Interface Segregation

- Małe, wyspecjalizowane interfejsy zamiast jednego dużego
- Handler notyfikacji Telegram ≠ Handler Slack

---

### Dependency Inversion

- Zależności **ZAWSZE** przez parametry, konfigurację, zmienne środowiskowe
- **NIGDY** hardcoded (tokeny, ID, URL)
- Pattern: `loadConfig()` raz na startup, pass everywhere

**Przykład — OK:**

```javascript
const config = loadConfig();
async function sendNotification(message, token = config.telegramToken) {
  // token z env/config, nie hardcoded
}
```

**Przykład — ❌ ZABRONIONE:**

```javascript
// ❌ Hardcoded token
const TOKEN = "12345abcdef"; // SEKRETY W ENV TYLKO!
```

---

## 🔄 DRY (Don't Repeat Yourself)

- Nie powtarzaj logiki — **wydziel funkcję gdy kod pojawia się 2+ razy**
- Stałe konfiguracyjne — ładuj raz, używaj wszędzie
- Wspólne utility'i (date formatting, URL building) → funkcja, nie inline

**Przykład — OK:**

```javascript
function formatDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// Użytkownik wszędzie
const key = formatDateKey(new Date());
```

**Przykład — ❌ ZŁYCH:**

```javascript
// ❌ Powtórzenie — ZABRONIONE
const key1 = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const key2 = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
```

---

## 🎯 KISS (Keep It Simple, Stupid)

- **Prostota przed elegancją**
- Brak klas gdy wystarczą funkcje
- Brak abstrakcji gdy jest tylko jeden przypadek użycia
- Preferuj `async/await` zamiast zagnieżdżonych Promise/callback
- Brak magic numbers — użyj named constants

**Przykład — OK:**

```javascript
async function fetchPrice(route) {
  try {
    const response = await fetch(buildUrl(route));
    return parsePrice(response);
  } catch (err) {
    console.error(`[${route.key}] Error: ${err.message}`);
    throw err;
  }
}
```

**Przykład — ❌ ZŁYCH:**

```javascript
// ❌ Over-engineering dla 1 przypadku użycia
class PriceFetcher {
  constructor() {
    this.cache = new Map();
  }
  async fetch(route) {
    /* ... */
  }
  clear() {
    /* ... */
  }
}
```

---

## 🚫 YAGNI (You Aren't Gonna Need It)

- **Implementuj TYLKO to co jest aktualnie wymagane**
- Nie dodawaj funkcji "na przyszłość"
- Nie twórz pomocniczych abstrakcji dla jednorazowych operacji

**Przykład — ❌ ZABRONIONE:**

```javascript
// ❌ "Może się kiedyś przyda?" — ZAKAZANE
function buildAdvancedCachingSystem() {
  /* ... */
}
function createPluginArchitecture() {
  /* ... */
}
```

---

## 📝 Clean Code

### Nazewnictwo

- **`camelCase`** dla zmiennych/funkcji: `buildFlightUrl`, `processPriceChange`
- **`UPPER_SNAKE_CASE`** dla stałych konfiguracyjnych: `MAX_RETRIES`, `DEFAULT_TIMEOUT`
- **`PascalCase`** dla klas/typów: `PriceParser`, `NotificationHandler`
- **Opisowe** zamiast skrótów: `buildFlightUrl` ✅ zamiast `getUrl` ❌

### Funkcje

- **Krótkie** — max 30 linii kodu
- **Jeden poziom abstrakcji** — nie mieszaj wysokiego i niskiego poziomu
- **Bez efektów ubocznych** gdzie to możliwe
- **Parametry** — max 3-4, jeśli więcej → object destructuring

**Przykład — OK:**

```javascript
async function processPriceChange(route, result, state, history) {
  const prevPrice = state[route.key]?.[result.date]?.price;
  const newPrice = result.price;
  const changed = prevPrice !== newPrice;

  if (changed) {
    updatePriceState(route, result, state, newPrice);
    await sendNotification(route, result, newPrice);
  }

  return changed;
}
```

### Komentarze

- **TYLKO gdy kod nie tłumaczy się sam**
- Preferuj czytelny kod nad komentarzem
- **ZAKAZ docstringów/komentarzy do kodu którego nie zmieniasz**

**Przykład — OK:**

```javascript
// Calculate date key for history lookup (format: YYYY-MM-DD)
const dateKey = formatDateKey(result.date);
```

**Przykład — ❌ ZABRONIONE:**

```javascript
// ❌ Zbędny komentarz
const dateKey = formatDateKey(result.date); // format date
```

### Błędy

- **Rzucaj błędy z opisowym komunikatem**, nie "error"
- **NIGDY nie połykaj wyjątków** (`catch (e) {}`)
- `console.error()` z kontekstem

**Przykład — OK:**

```javascript
if (!config.telegramToken) {
  throw new Error(
    "[TELEGRAM] TELEGRAM_TOKEN not found in environment. Please set it.",
  );
}
```

**Przykład — ❌ ZABRONIONE:**

```javascript
// ❌ Połykanie wyjątków — ZAKAZANE
try {
  await fetch(url);
} catch (err) {
  // silent fail
}
```

---

## 🔒 Bezpieczeństwo (OWASP Top 10)

### Secrets & Credentials

- **ZAWSZE i WYŁĄCZNIE** przez zmienne środowiskowe (`process.env.VAR`)
- **NIGDY w kodzie** — no hardcoded tokens/passwords
- **NIGDY w plikach konfiguracyjnych** śledzone przez git
- `.env` i `config.local.json` → `.gitignore`

**Przykład — OK:**

```javascript
const telegramToken = process.env.TELEGRAM_TOKEN ?? process.env.TG_TOKEN;
if (!telegramToken) throw new Error("[TELEGRAM] Token not configured");
```

**Przykład — ❌ ZABRONIONE:**

```javascript
// ❌ NIGDY nie rob tego
const TOKEN = "123456abcdef";
const API_KEY = "sk-1234567890";
```

### Input Validation

- **Waliduj dane wejściowe** z zewnętrznych źródeł (API, formularze, pliki)
- Sprawdzaj typy i wartości PRZED użyciem
- Nie ufaj danym z zewnętrznych API

**Przykład — OK:**

```javascript
function parsePrice(response) {
  if (typeof response.price !== "number") {
    throw new Error(`Invalid price: ${response.price}`);
  }
  if (!isFinite(response.price) || response.price < 0) {
    throw new Error(`Price out of range: ${response.price}`);
  }
  return response.price;
}
```

### Logging

- **NIGDY nie loguj**:
  - Tokenów, hasła, API keys
  - Danych osobowych (email, phone, ID)
  - Pełnych response'ów z sekrety
- Loguj z **kontekstem** — która ruta, jaki endpoint, jaki błąd

**Przykład — OK:**

```javascript
console.log(`[${route.key}] Price changed: ${prevPrice} → ${newPrice}`);
```

**Przykład — ❌ ZABRONIONE:**

```javascript
// ❌ Logging sekrety — ZAKAZANE
console.log("Response:", response); // response zawiera token!
console.log("User email:", userData.email);
```

### Database & API Queries

- **Parametryzuj zapytania** — nigdy string concatenation
- **Nigdy nie trustuj danych z API** — zawsze waliduj

**Przykład — OK:**

```javascript
// Parametryzacja (jeśli byłaby baza)
const result = await db.query("SELECT * FROM users WHERE id = ?", [userId]);
```

---

## 🔍 Enforcement Checklist (Obowiązkowy Before Commit)

Każdy agent/skill MUSI sprawdzić **WSZYSTKIE** punkty:

- [ ] **SOLID**:
  - [ ] Single Responsibility — każda funkcja robi 1 rzecz?
  - [ ] Open/Closed — konfiguracja nie hardcoded?
  - [ ] Dependency Inversion — zmienne/parametry, nie hardcoded?

- [ ] **DRY**:
  - [ ] Brak powtórzeń — kod nie pojawia się 2+ razy?
  - [ ] Config ładowany raz?

- [ ] **KISS**:
  - [ ] Prostota — nie over-engineered?
  - [ ] async/await zamiast Promise?
  - [ ] Stałe nie magic numbers?

- [ ] **YAGNI**:
  - [ ] Tylko to co potrzebne?
  - [ ] Brak przyszłościowych features?

- [ ] **Clean Code**:
  - [ ] Nazewnictwo: camelCase/UPPER_SNAKE/PascalCase OK?
  - [ ] Funkcje: max 30 linii, 1 abstrakcja?
  - [ ] Komentarze: tylko gdy niezbędne?
  - [ ] Błędy: описowe, nie silent?

- [ ] **Security**:
  - [ ] Sekrety w env tylko?
  - [ ] Input validation present?
  - [ ] Nie logujesz sekrety?
  - [ ] API responses walidowane?

---

## 🤖 Dla Agentów — Automatyczne Enforcement

Skill `review-code` MUSI zawsze uruchamiać przed finalnym committem:

1. **Code Analysis**:

   ```bash
   # Parsuj kod vs guidelines
   npm run lint  # ESLint/Prettier
   node --test   # Testy
   ```

2. **Security Scan**:

   ```bash
   # Szukaj: hardcoded secrets, console.log(token), .env files
   grep -r "process.env" check-flights.js  # powinno używać
   grep -r "const TOKEN = " check-flights.js  # ZAKAZANE
   ```

3. **Verification Report**:

   ```
   ✅ SOLID: Pass
   ✅ DRY: Pass
   ✅ KISS: Pass
   ✅ YAGNI: Pass
   ✅ Clean Code: Pass
   ✅ Security: Pass

   → Ready to commit
   ```

---

## 📋 Stack-Specific Notes

### Node.js (check-flights.js)

- Runtime: CommonJS, `"use strict"`
- HTTP: plain `https` module
- Tests: `node:test` + `node:assert`
- Config: `config.json` + `config.local.json` (gitignored)

### Cloudflare Workers (worker/src/index.js)

- Runtime: ESM
- HTTP: platform `fetch` API
- **WAŻNE**: Osobny runtime od Node.js — zmiany w jednym nie wpływają na drugi

---

## 🔗 Linki

- **[copilot-instructions.md](../copilot-instructions.md)** — Project-specific setup
- **[coding-principles.instructions.md](../../AppData/Roaming/Code/User/prompts/coding-principles.instructions.md)** — Original principles
- **[Skill: review-code](../skills/review-code/SKILL.md)** — Automated code review
- **[Skill: review-rework](../skills/review-rework/SKILL.md)** — Fix implementation from review
- **[Skill: create-pr](../skills/create-pr/SKILL.md)** — Automated PR creation
- **[.agent.md](../.agent.md)** — Agent configuration

---

## 🚨 Summary

**TL;DR:**

1. ✅ SOLID + DRY + KISS + YAGNI — zawsze
2. ✅ Clean Code — nazewnictwo, funkcje krótkie, błędy descriptive
3. ✅ Security — sekrety w env, walidacja, no logging sekrety
4. ✅ Enforcement checklist — zawsze przed committem
5. ✅ Review code skill — automatyczne sprawdzenie

**BRAK WYJĄTKÓW.** Wszystkie agenty, wszystkie commity, wszystkie PR.

---

**Last Updated:** 2026-09-27
