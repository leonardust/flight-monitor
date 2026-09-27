---
applyTo: '**'
---

# Skill: Utwórz Pull Request z Gotowej Implementacji

## Opis

Automatyzuje proces tworzenia Pull Requestu dla gotowych implementacji:

1. Detektuje zmienione pliki
2. Sugeruje podziału na commity (dla dużych zmian)
3. Tworzy branch zgodnie z Git convention
4. Commituje zmiany z konwencja `<typ>:<treść>`
5. Pushe branch na zdalny
6. Pokazuje preview PR (branch, commity, title, description)
7. Po potwierdzeniu tworzy PR w statusie **open** (nie draft)

## Konwencje

### Branch Naming

Zależy od typu zmian:

- `feature/<opis>` — nowe funkcjonalności
- `fix/<opis>` — poprawki błędów
- `refactor/<opis>` — refaktoryzacja
- `docs/<opis>` — dokumentacja
- `chore/<opis>` — zmiany konfiguracji, deps, itp.

Przykłady:

- `feature/price-threshold-filter`
- `fix/send-charts-only-on-change`
- `refactor/extract-notification-logic`

### Commit Message Format

```sh
<typ>:<treść>

```

Zasady:

- `<typ>`: feature, fix, refactor, docs, chore (lowercase)
- `<treść>`: zwięzły opis (max 60 znaków bez typu)
- Czasami może być `<typ>(<scope>):<treść>`, np. `fix(notifications): send charts only on change`

Przykłady poprawne:

```yaml
fix: send charts only on price change
feature: add price threshold filter
refactor(notifications): extract chart logic
docs: update README with new routes
chore: upgrade dependencies

```

## Workflow

### 1. Detektowanie zmian

- Automatycznie wykrywa zmienione pliki od `origin/main`
- Dla **małych zmian** (1-3 pliki): 1 commit
- Dla **dużych zmian** (4+ pliki lub > 50 linek): sugeruj podział na 2-3 commity tematyczne

### 2. Sugerowanie commitów

Jeśli duże zmiany, zapytaj:

```yaml
Wykryłem zmiany w: check-flights.js, check-flights.test.js

Czy chcesz:
a) 1 commit: "fix: send charts only on price change"
b) 2 commity:
   - commit 1: "fix: send charts only on price change" (check-flights.js)
   - commit 2: "test: update chart notification tests" (check-flights.test.js)

```

**Obsługa odpowiedzi**:

- Jeśli `a)` → 1 commit ze wszystkimi plikami
- Jeśli `b)` lub `c)` → wiele commitów, każdy z wskazanymi plikami
- Jeśli user wpisze `N` → anuluj operację i wróć do głównego menu

### 2.5. Grupowanie Plików do Osobnych PR (NOWE!)

**Dla wieloaspektowych zmian** (mix aplikacji + infrastruktury + docs), zaproponuj podziału na osobne PR:

**Automatyczne Kategoryzowanie**:

```md
Kategoria | Foldery/Pliki | Typ PR
----------|---------------|-----------
Code      | check-flights.js, src/** | fix/feature/refactor
Tests     | *.test.js | test
Docs      | README.md, docs/** | docs
Infra     | .agent.md, .github/**, config | chore/feat

```

**Przykład**:

```ini
Wykryłem 4 pliki w 3 kategoriach:

Grupa 1 - CODE (aplikacja):
  ✓ check-flights.js (zmieniony)

Grupa 2 - INFRASTRUCTURE (nowe):
  ✓ .agent.md (nowy)
  ✓ .github/skills/create-pr/SKILL.md (nowy)

Czy chcesz:
a) 1 PR - wszystko razem
b) 2 PR - osobne PR dla każdej grupy (REKOMENDOWANE)
c) CUSTOM - sam wybierzesz które pliki do którego PR

```

**Jeśli c) - Custom Selection**:

```yaml
Wybierz pliki dla PR #1:
  [✓] check-flights.js
  [ ] .agent.md
  [ ] .github/skills/create-pr/SKILL.md

Wybierz pliki dla PR #2:
  [ ] check-flights.js
  [✓] .agent.md
  [✓] .github/skills/create-pr/SKILL.md

[OK] Dalej

```

**Rezultat**: Agent tworzy N osobnych PR, każdy z własnymi commitami i metadanymi.

### 3. Automatyczne określenie typu zmian

**Algorytm mapowania**:

1. Przeanalizuj pliki które się zmieniły:

   - `**/*.js` (główny kod) → domyślnie `fix` lub `refactor`
   - `**/*.test.js` (testy) → `test`
   - `**/README.md`, `**/docs/**` → `docs`
   - `package.json`, `config.json` → `chore`
   - Nowy plik w `src/` → `feature`

2. Określ typ na podstawie:

   - Czy pliki tworzone czy modyfikowane?
   - Czy zmiany to: nowa logika (feature), poprawka (fix), czyszczenie (refactor)?

3. Jeśli wieloaspektowy (mix feature + test + docs):

   - Weź dominujący typ (Feature > Fix > Refactor > Test > Docs > Chore)
   - Proponuj ogólniejszy opis

**Przykłady**:

```yaml
Zmieniony check-flights.js + test
→ Typ: fix
→ Branch: fix/send-charts-only-on-change

Nowy plik utils/helpers.js + README
→ Typ: feature
→ Branch: feature/add-price-threshold-filter

Refactor 3 pliki, brak testów
→ Typ: refactor
→ Branch: refactor/notification-system

```

### 4. Tytuł i opis PR

**Tytuł PR**:

- Automatycznie generuj z pierwszego commita lub uogólnij
- Format: `<typ>: <opis>`
- Max 60 znaków

**Opis PR**:

- Zaproponuj automatycznie na podstawie commit'ów
- Format: krótki tekst wyjaśniający DLACZEGO (bez listy commitów)
- Jeśli description jest zbyt prosty, zapytaj user: "Czy chcesz dodać więcej detali?"
- Jeśli user mówi "tak" → pozwól mu edytować opis w preview

Przykład:

```ini
**Tytuł**: fix: send price charts only on price change

**Opis**:
Wykresy z ostatnimi 10 cenami wysyłają się teraz tylko gdy cena się zmieni.
Wcześniej wysyłały się przy każdym sprawdzeniu, co generowało zbyt wiele notyfikacji.
Zmiana poprawia sygnał/szum - użytkownik otrzymuje tylko istotne notyfikacje.

```

### 5. Preview do zatwierdzenia

Pokaż użytkownikowi:

```ini
══════════════════════════════════════════════════════════
📋 PREVIEW PULL REQUEST
══════════════════════════════════════════════════════════

📌 Branch:
   fix/send-charts-only-on-change

📝 Commity:
   [1] fix: send charts only on price change
   [2] test: update chart notification tests

🎯 PR Tytuł:
   fix: send price charts only on price change

📄 PR Opis:
   Wykresy z ostatnimi 10 cenami wysyłają się teraz tylko
   gdy cena się zmieni. Wcześniej wysyłały się przy każdym
   sprawdzeniu, co generowało zbyt wiele notyfikacji.

   Zmiana poprawia sygnał/szum - użytkownik otrzymuje
   tylko istotne notyfikacji.

🔗 Docelowy branch: main
📊 Status: OPEN (nie draft)

══════════════════════════════════════════════════════════
Opcje:
  [Y] Wyślij PR
  [E] Edytuj tytuł/opis
  [N] Anuluj
  [?] Help

✓ Co robisz? [Y/E/N/?]

```

**Obsługa odpowiedzi**:

- `Y` → Przejdź do kroku 6
- `E` → Pozwól user edytować PR tytuł/opis, wróć do preview
- `N` → Anuluj operację, `Skill aborted`
- `?` → Pokaż help o opcjach

### 6. Git Operations (Multi-PR Workflow)

Po potwierdzeniu (Y):

1. **Przełącz na świeży main**:

```bash
git fetch origin
git checkout main
git pull origin main

```

2. **Utwórz branch od main**:

```bash
git checkout -b <branch>

```

3. Stage zmienione pliki

4. Commit(y) z konwencją

5. `git push origin <branch>`

6. GitHub API: Utwórz PR w statusie **open** (patrz: Krok 7)

## Konkrety implementacji

### Kroki Skill'u

1. **Wczytaj zmienione pliki** — `git diff --name-only origin/main HEAD`
2. **Analizuj typ zmian** — mapuj pliki do kategorii (src/, test/, docs/, config/)
3. **Zaproponuj commity** — jeśli duże, pytaj o split
4. **Utwórz branch** — `git checkout -b <branch>`
5. **Commituj** — wg konwencji, jednym/wieloma commitami
6. **Pokaż preview** — branch, commity, tytuł, opis
7. **Czekaj na `Y`** — jeśli `N`, anuluj
8. **Push + PR** — `git push origin <branch>`, utwórz PR API

### Zmienne

- `CHANGED_FILES`: lista zmienonych plików
- `COMMIT_TYPE`: feature|fix|refactor|docs|chore
- `BRANCH_NAME`: proponowana nazwa brancha
- `PR_TITLE`: proponowany tytuł PR
- `PR_DESCRIPTION`: proponowany opis
- `PR_COMMITS`: lista commitów

## Przykład Użycia

**Scenariusz**: Skończyłem implementować fix na notyfikacjach

```bash
copilot skill: create-pr

```

Skill:

1. Detektuje zmiany w `check-flights.js` i `check-flights.test.js`
2. Sugeruje: `fix: send charts only on price change`
3. Proponuje branch: `fix/send-charts-only-on-change`
4. Pokazuje preview
5. Po `Y`:
   - Tworzy branch
   - Commituje zmiany
   - Pushe na remote
   - Tworzy PR w statusie open

Gotowe! 🚀

## Powiązane Skill'i / Zadania

- **Review PR** — po utworzeniu PR, skill do przeglądu zmian
- **Merge PR** — automatyczne merge'owanie zmian (jeśli aproved)
- **Delete Branch** — cleanup branchów po merge'niu

## Troubleshooting

- **`git: command not found`** — upewnij się że Git jest zainstalowany i dostępny w PATH
- **Branch już istnieje** — skill zaproponuje nową nazwę z numerem (np. `fix/...-2`)
- **Merge conflict** — skill wykaże konflikt i poprosi o ręczne resolve
