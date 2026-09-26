---
name: review-code
description: "Przegląda kod źródłowy projektu pod kątem zgodności z zasadami SOLID, DRY, KISS, YAGNI, Clean Code i bezpieczeństwa (OWASP). Użyj gdy chcesz sprawdzić jakość kodu, znaleźć naruszenia zasad, dostać listę konkretnych poprawek do wprowadzenia."
argument-hint: "opcjonalnie: ścieżka do pliku (np. check-flights.js)"
---

# Code Review — zasady programowania

## Kiedy używać

- Chcesz sprawdzić czy kod jest zgodny z `copilot-instructions.md`
- Przed commitem lub PR
- Po dodaniu nowej funkcjonalności
- Gdy podejrzewasz naruszenie zasad DRY, SOLID lub bezpieczeństwa

## Procedura

1. **Wczytaj plik(i) do przeglądu** — jeśli nie podano argumentu, przejrzyj wszystkie pliki `.js` w projekcie (z wyjątkiem `node_modules/`)

2. **Sprawdź każdą zasadę**:

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
