---
name: review-code
description: "Przegląda kod źródłowy projektu pod kątem zgodności z zasadami SOLID, DRY, KISS, YAGNI, Clean Code i bezpieczeństwa (OWASP). Użyj gdy chcesz sprawdzić jakość kodu, znaleźć naruszenia zasad, dostać listę konkretnych poprawek do wprowadzenia."
argument-hint: "opcjonalnie: ścieżka do pliku (np. check-flights.js)"
---

# Code Review — zasady programowania

⚠️ **WAŻNE**: Ten skill implementuje zasady z **[DEVELOPMENT-GUIDELINES.md](../../DEVELOPMENT-GUIDELINES.md)** — obowiązkowe dla wszystkich agentów i kodu. Brak wyjątków!

## Kiedy używać

- Chcesz sprawdzić czy kod jest zgodny z `copilot-instructions.md`
- Przed commitem lub PR
- Po dodaniu nowej funkcjonalności
- Gdy podejrzewasz naruszenie zasad DRY, SOLID lub bezpieczeństwa

## Procedura

1. **Wczytaj plik(i) do przeglądu** — jeśli nie podano argumentu, przejrzyj wszystkie pliki `.js` w projekcie (z wyjątkiem `node_modules/`)

2. **Sprawdź każdą zasadę** (per [DEVELOPMENT-GUIDELINES](../../DEVELOPMENT-GUIDELINES.md)):

   ### SOLID
   - Czy funkcja robi tylko jedną rzecz? (SRP)
   - Czy nowe zachowanie dodawane jest przez config, nie przez zmianę kodu? (OCP)
   - Czy zależności przekazywane są przez parametry/env, nie hardcoded? (DIP)

   ### DRY
   - Czy ta sama logika pojawia się w więcej niż jednym miejscu?
   - Czy stałe konfiguracyjne są ładowane raz?

   ### KISS
   - Czy funkcja ma ≤ 30 linii?
   - Czy używany jest `async/await` zamiast zagnieżdżonych callbacków?
   - Czy nie ma zbędnych abstrakcji dla jednego przypadku użycia?

   ### YAGNI
   - Czy jest kod który nie jest aktualnie używany?
   - Czy nie ma funkcji dodanych "na przyszłość"?

   ### Clean Code
   - Czy nazwy są opisowe? (`buildFlightUrl` zamiast `getUrl`)
   - Czy błędy są rzucane z opisowym komunikatem?
   - Czy wyjątki nie są połykane (`catch (e) {}`)

   ### Bezpieczeństwo (OWASP)
   - Czy sekrety są wyłącznie przez `process.env`?
   - Czy dane z zewnętrznych API są walidowane przed użyciem?
   - Czy nie są logowane tokeny, hasła ani dane osobowe?

3. **Raport wyników** — dla każdego znalezionego naruszenia podaj:
   - Plik i numer linii
   - Naruszona zasada
   - Opis problemu
   - Konkretna propozycja poprawki

4. **Podsumowanie** — oceń ogólną jakość kodu (dobra / wymaga poprawek / krytyczne problemy) i wskaż 3 najważniejsze rzeczy do naprawienia.

---

## 🔒 Enforcement Checklist (Obowiązkowy Before Any Commit)

Skill `review-code` MUSI zawsze sprawdzić te punkty **PRZED finalnym committem**:

### Krok 1: Code Analysis

```bash
# ESLint/Prettier (jeśli dostępne)
npm run lint 2>/dev/null || echo "ESLint not configured"

# Tests
node --test check-flights.test.js 2>/dev/null || echo "Tests not configured"
```

### Krok 2: SOLID Checklist

- [ ] Single Responsibility: każda funkcja robi 1 rzecz?
- [ ] Open/Closed: konfiguracja nie hardcoded?
- [ ] Dependency Inversion: parametry/env, nie hardcoded?

### Krok 3: DRY Checklist

- [ ] Brak powtórzeń logiki (kod nie pojawia się 2+ razy)?
- [ ] Config ładowany raz?

### Krok 4: KISS Checklist

- [ ] Prostota: nie over-engineered?
- [ ] async/await zamiast Promise?
- [ ] Stałe nie magic numbers?

### Krok 5: YAGNI Checklist

- [ ] Tylko to co potrzebne?
- [ ] Brak przyszłościowych features?

### Krok 6: Clean Code Checklist

- [ ] Nazewnictwo: camelCase/UPPER_SNAKE_CASE OK?
- [ ] Funkcje: max 30 linii, 1 abstrakcja?
- [ ] Komentarze: tylko gdy niezbędne?
- [ ] Błędy: descriptive, nie silent?

### Krok 7: Security Checklist

- [ ] Sekrety w env tylko (NO hardcoded)?
- [ ] Input validation present?
- [ ] Nie logujesz sekrety?

**Rezultat** — Report:

```
✅ SOLID: Pass
✅ DRY: Pass
✅ KISS: Pass
✅ YAGNI: Pass
✅ Clean Code: Pass
✅ Security: Pass
✅ Tests: Pass (25/25)

→ READY TO COMMIT
```

---

## 🔗 Linki

- **[DEVELOPMENT-GUIDELINES.md](../../DEVELOPMENT-GUIDELINES.md)** — Core principles (enforcement source)
- **[review-rework/SKILL.md](../review-rework/SKILL.md)** — Feedback implementation
- **[create-pr/SKILL.md](../create-pr/SKILL.md)** — PR automation
- **[.agent.md](../../.agent.md)** — Agent triggers
