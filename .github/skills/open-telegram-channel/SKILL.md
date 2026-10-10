---
name: open-telegram-channel
description: Otwiera kanał Telegram Flight Monitor (web.telegram.org/a/#8603030887) w przeglądarce przez Playwright MCP i raportuje ostatnie wiadomości. Użyj gdy użytkownik prosi o otwarcie kanału lub sprawdzenie ostatnich cen.
---

# Skill: Otwórz kanał Flight Monitor w Telegram (Playwright MCP)

## Opis

Otwiera kanał Telegram Web w przeglądarce kontrolowanej przez Playwright MCP
i odczytuje z niego ostatnie wiadomości.

## Rekomendowany model i effort

- Model: `claude-haiku-5.5`
- Reasoning effort: `low`

Uzasadnienie: skill składa się z kilku mechanicznych kroków (navigate → snapshot → odczyt),
bez złożonego rozumowania. Szybki, tani model w zupełności wystarcza.

## Stałe

- URL kanału: `https://web.telegram.org/a/#8603030887`
- Narzędzia MCP: `playwright-browser_navigate`, `playwright-browser_snapshot`

## Workflow

1. **Załaduj narzędzia Playwright** — przez `tool_search_tool` (narzędzia są odroczone).
2. **Otwórz kanał** — `playwright-browser_navigate` z URL z sekcji Stałe.
3. **Zrób snapshot** — `playwright-browser_snapshot`.
4. **Sprawdź stan logowania**:
   - Tytuł `Telegram` i nagłówek „Log in to Telegram by QR Code” → użytkownik niezalogowany.
     Poinformuj o konieczności zeskanowania kodu QR (Ustawienia > Urządzenia > Dodaj urządzenie)
     i zakończ. Nie próbuj się logować za użytkownika.
   - Tytuł `Flight Monitor` → zalogowany, przejdź do kroku 5.
5. **Odczytaj ostatnie wiadomości** — z snapshotu wyciągnij treść ostatnich wpisów kanału
   i podsumuj je (trasa, data, ceny). Jeśli snapshot jest za duży, zapisz go do pliku
   (parametr `filename`) i przeszukaj go narzędziem `grep`.

## Zasady

- Nie wpisuj i nie zapisuj danych logowania ani kodów QR.
- Nie wysyłaj żadnych wiadomości na kanał bez wyraźnej prośby użytkownika.
- Nie zapisuj treści prywatnych czatów poza odpowiedzią dla użytkownika.

## Troubleshooting

- **Brak okna przeglądarki** — sprawdź, czy w `~/.copilot/mcp-config.json` nie ma flagi `--headless`.
- **Narzędzia `playwright-*` niedostępne** — serwer MCP nie został załadowany; zrestartuj Copilot CLI.
