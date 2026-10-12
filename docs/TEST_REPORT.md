# TEST_REPORT — rzeczywiste wyniki komend

Zasada: zapisujemy **dokładne komendy**, **datę**, **środowisko** i **rzeczywisty wynik** (PASS/FAIL/BLOCKED/NOT RUN).
Nigdy nie wpisujemy ogólnego „działa” bez dowodu z uruchomienia.

## Sesja 23 — 12 października 2026

| Komenda / kontrola | Kontekst | Wynik | Uwagi |
|---|---|---|---|---|
| `pnpm --filter @asystent/geometry build`, `pnpm --filter @asystent/schemas build`, `pnpm --filter @asystent/domain build`, `node --test packages\schemas\test\construction-documentation.test.mjs packages\schemas\test\cad-import.test.mjs packages\geometry\test\calibration.test.mjs packages\domain\test\cad-review.test.mjs` | nowe kontrakty i logika CAD | PASS | 19 nowych testów przed integracją UI |
| `pnpm exec supabase migration up --local` | dwie migracje szkiców dokumentacji | PASS | bez resetu lub usuwania danych |
| `Get-Content supabase\migrations\20261012130100_documentation_draft_validation.sql -Raw \| docker exec -i supabase_db_Aplikacja_Budowa psql -U postgres -d postgres -v ON_ERROR_STOP=1` | końcowa wersja niezacommitowanej walidacji | PASS | ponowiono idempotentną definicję funkcji i triggera; numeric version i string step |
| `pnpm build`, `pnpm --filter web build` | pakiety i produkcyjny Web | PASS | Next.js i TypeScript |
| `pnpm typecheck` | wszystkie workspace | PASS | 12 zadań Turbo |
| `pnpm lint` | istniejące linters | PASS | 6 zadań Turbo |
| `pnpm test` | wszystkie workspace | PASS | 51 testów Node; schemas 32, domain 7, geometria 7, kalkulatory 3, tokeny 2 |
| `pnpm db:test` | pierwsze uruchomienie | FAIL | fixture nowego testu nie zawierał wymaganych pól raportu; uzupełniono fixture |
| `pnpm exec supabase test db supabase\tests\documentation_drafts.test.sql --local` | testy nowego RPC/RLS | PASS | 9 asercji przed dodaniem testu typu wersji |
| `pnpm db:test` | końcowy schemat lokalny | PASS | 93 asercje w 4 plikach, w tym 10 nowych |
| `pnpm exec supabase db lint --local --schema public --fail-on error` | funkcje i schemat | PASS | brak błędów |
| `pnpm test:e2e`, `pnpm --filter web exec playwright test --grep work-specific` | pierwsze iteracje nowego scenariusza | FAIL | poprawiono etykiety select/textarea i selektor alertu, który obejmował również komunikator Next.js |
| `pnpm test:e2e` | końcowy produkcyjny build, Microsoft Edge | PASS | 6/6; nowe kroki, zapis/powrót, refresh, awaria RPC/retry, dach bez rzutów domu |
| `git diff --check` | końcowe zmiany | PASS | ostrzeżenia Git tylko o LF/CRLF |
| `GET http://127.0.0.1:3010/` | podgląd po restarcie z aktualnym buildem | PASS | HTTP 200 |
| Pełny edytor/import, rozpoznawanie OpenAI, MCP i dokładność przedmiaru | pełne nowe żądanie | NOT RUN | niezaimplementowane; istniejące testy nie są ich substytutem |

## Środowisko (11 października 2026)

- System: Windows, PowerShell.
- Node.js: v26.7.0
- npm: 11.19.0
- pnpm: 12.11.2 (zainstalowany globalnie w tej sesji)
- Git: 2.55.0.windows.5 (zainstalowany w tej sesji przez winget)
- Docker Desktop: 4.94.0; Docker Engine 29.8.2 (zainstalowany w sesji 4)
- WSL: 3.0.1.0; CLI Supabase: 2.120.0 (lokalna zależność projektu)
- Python: niedostępny (nie jest wymagany przez stack projektu)

## Sesja 9 — 12 października 2026

| Komenda / kontrola | Kontekst | Wynik | Uwagi |
|---|---|---|---|
| `pnpm install --frozen-lockfile` | root monorepo | PASS | lockfile uwzględnia współdzielone schemas i lokalny Playwright |
| `pnpm build` | root monorepo | PASS | Web, eksport Android JS i pakiety |
| `pnpm typecheck` | root monorepo | PASS | wszystkie workspace |
| `pnpm lint` | root monorepo | PASS | Web, API, testy E2E i Mobile |
| `pnpm test` | root monorepo | PASS | 19 testów jednostkowych; schemas 8, pozostałe pakiety 11 |
| `pnpm exec supabase migration up --local` | 3 migracje ról/onboardingu/pracowników | PASS | bez resetu i bez usuwania istniejących danych |
| `$env:PATH='C:\Program Files\Docker\Docker\resources\bin;'+$env:PATH; pnpm db:test` | lokalny Supabase | PASS | 64 asercje w 2 plikach pgTAP |
| `pnpm exec supabase db lint --local --schema public --fail-on error` | schemat aplikacji | PASS | brak błędów |
| `pnpm test:e2e` | lokalny produkcyjny build Web na 3011, Microsoft Edge | PASS | 3 pełne scenariusze, opis poniżej |
| `pnpm --filter @asystent/schemas test` | końcowa walidacja i polskie komunikaty NIP | PASS | 8/8 testów schemas |
| `pnpm --filter web build` oraz `pnpm --filter web lint` | końcowe zmiany UI | PASS | TypeScript, produkcyjny CSS i lint |
| Porównanie klucza serwerowego z assetami `.next/static` | klient Web | PASS | brak klucza service-role w przeglądarkowym bundle |
| `git check-ignore apps\web\.env.local` | lokalne sekrety | PASS | plik ignorowany |
| `git diff --check` | zmienione pliki | PASS | brak błędów whitespace |
| `GET http://127.0.0.1:3010/` | końcowy lokalny Web | PASS | HTTP 200; produkcyjny build uruchomiony lokalnie |

Scenariusze E2E:

- **PASS:** pierwszy klient → trzy klikalne kafelki obok siebie (1440/390/320 px) → formularz budowy bez organizacji
  → zapis → edycja → publikacja statusu → wylogowanie/logowanie do panelu → kolejne zlecenie.
- **PASS:** firma → dane z branżą/obszarem → trwały panel → tworzenie pracownika → hasło jednorazowe → odmowa
  przejęcia istniejącego e-maila → logowanie pracownika → obowiązkowa zmiana hasła → panel pracownika i ponowne logowanie.
- **PASS:** sklep → analogiczny profil i przepływ pracownika.
- **PASS:** odmowa endpointu dla niezalogowanego (401), obcego użytkownika i pracownika (403). RLS blokuje
  zmianę danych innego klienta, eskalację ról i dostęp przed zmianą hasła tymczasowego.

Pobrany Chromium nie uruchomił się z powodu polityki Windows (`spawn UNKNOWN`) — **BLOCKED** dla tego binarium.
Zainstalowany Microsoft Edge uruchamia testy — **PASS**. Nie wyłączano ochrony Windows.

Kontrola screenshotów formularza klienta i profili firmy/sklepu — **PASS**. Po naprawie CSS checkbox piwnicy
ma 18 × 18 px; E2E sprawdza obie krawędzie ≤ 20 px i brak przepełnienia mobilnego — **PASS**.
Pełny rynek ofert, katalog/RFQ,
CAD/import, AI i scenariusze Mobile — **NOT RUN**; pozostają następnymi etapami, nie częścią deklarowanego MVP.

## Sesja 10 — 12 października 2026

| Komenda / kontrola | Kontekst | Wynik | Uwagi |
|---|---|---|---|
| `pnpm exec supabase migration up --local` | migracje szczegółów wniosku i rynku | PASS | zastosowano migracje: `...114000` (raport+market) oraz `...115000` (bezpieczna walidacja aktualizacji statusu) |
| `pnpm db:test` | lokalny Supabase | PASS | 82 asercje, w tym mapa/raport/market/legacy-status |
| `pnpm exec supabase db lint --local --schema public --fail-on error` | schemat aplikacji | PASS | brak błędów |
| `pnpm --filter @asystent/schemas test` | walidacja nowego formularza budowy | PASS | 10/10 testów schemas |
| `pnpm --filter web build` | produkcyjny build Web | PASS | nowe pola i raport bez błędów TS |
| `pnpm --filter web lint` | lint Web + E2E | PASS | selektory i a11y po zmianach mapy/formularza |
| `pnpm test:e2e` | lokalny build Web na 3011, Microsoft Edge | PASS | 4 scenariusze |
| `pnpm typecheck` | wszystkie workspace | PASS | 11 zadań turbo |
| `GET http://127.0.0.1:3010/` | lokalny podgląd | PASS | HTTP 200 |

Scenariusze E2E sesji 10:

- **PASS:** formularz budowy ma osadzoną mapę i domyślnie pokazuje Warszawę; po wpisaniu kodu/miejscowości/adresu
  aktualizuje źródło iframe.
- **PASS:** kod pocztowy i planowany termin są wymagane; dach nie występuje; rozbudowa nie wymaga ani nie pokazuje
  pola powierzchni istniejącego budynku.
- **PASS:** zdjęcia mają limity typ/rozmiar/ilość; awaria uploadu nie duplikuje zlecenia, a ponowienie kończy zapis.
- **PASS:** raport zlecenia zapisuje się i opublikowane zlecenie jest widoczne w panelu Wykonawcy i Sklepu
  (owner oraz aktywowany employee).

## Sesja 11 — 12 października 2026

| Komenda / kontrola | Kontekst | Wynik | Uwagi |
|---|---|---|---|
| `pnpm test:e2e` | lokalny build Web na 3011, Microsoft Edge | PASS | 4 scenariusze; test mapy dodatkowo wyklucza pola współrzędnych i przycisk „Pokaż na mapie” oraz sprawdza wymagane pola |
| Kontrola formularza po pełnym przeładowaniu | `http://127.0.0.1:3010/`, istniejąca sesja przeglądarki | PASS | iframe ma adres Warszawy; brak pól szerokości/długości i starego przycisku |
| Zrzut obrazu mapy | wbudowane narzędzie przeglądarkowe | BLOCKED | narzędzie zwróciło pusty obraz, więc nie zaliczono go jako wizualnego potwierdzenia renderu kafelków |
| `git diff --check` | zmienione pliki | PASS | brak błędów whitespace |

Wskazówka dla starej karty przeglądarki: wymusić przeładowanie przez `Ctrl+F5`. Nie zmieniano konfiguracji
hostingu ani usług chmurowych.

## Sesja 12 — 12 października 2026

| Komenda / kontrola | Kontekst | Wynik | Uwagi |
|---|---|---|---|
| `pnpm exec supabase migration up --local` | rozszerzenie limitu pola materiałów | PASS | zastosowano migrację `20261012122000_construction_technology_catalog.sql` |
| `pnpm db:test` | lokalny Supabase | PASS | 83 asercje; nowy test potwierdza zapis treści o długości 3000 znaków |
| `pnpm exec supabase db lint --local --schema public --fail-on error` | schemat aplikacji | PASS | brak błędów |
| `pnpm --filter @asystent/schemas test` | wymagane wybory technologiczne i walidacja zlecenia | PASS | 10/10 testów |
| `pnpm test` | wszystkie workspace | PASS | wszystkie jednostkowe scenariusze test runnera Node |
| `pnpm build` | wszystkie workspace | PASS | 8 zadań Turbo; produkcyjny build Web przeszedł po końcowych zmianach |
| `pnpm typecheck` | wszystkie workspace | PASS | 11 zadań Turbo |
| `pnpm lint` | wszystkie workspace | PASS | 5 zadań Turbo |
| `pnpm test:e2e` | lokalny build Web na 3011, Microsoft Edge | PASS | 4 scenariusze; wybory technologiczne wyszukują się, zapisują i wczytują przy edycji |
| `GET http://127.0.0.1:3010/` | lokalny podgląd | PASS | HTTP 200; widoczne osobne zakładki formularza |
| `git diff --check` | końcowe pliki i dokumentacja | PASS | brak błędów whitespace |

## Sesja 13 — 12 października 2026

| Komenda / kontrola | Kontekst | Wynik | Uwagi |
|---|---|---|---|
| `pnpm build` | wszystkie workspace | PASS | 8 zadań Turbo; build Next.js po zmianie ankiety |
| `pnpm typecheck` | wszystkie workspace | PASS | 11 zadań Turbo |
| `pnpm lint` | wszystkie workspace | PASS | 5 zadań Turbo |
| `pnpm test` | wszystkie workspace | PASS | 15/15 testów schemas, pozostałe pakiety bez regresji |
| `pnpm test:e2e` | lokalny build Web, Microsoft Edge | PASS | 4 scenariusze; nowy przebieg wyszukiwania, wielu posadowień, szalowania, etapów dachu/remontu i zapisu raportu |
| Kontrola wizualna menu wyboru | lokalny Web, Microsoft Edge | PASS | wyszukiwarka znajduje się wewnątrz rozwijanego menu, które nakłada się na formularz |
| `GET http://127.0.0.1:3010/` | lokalny podgląd produkcyjnego builda | PASS | HTTP 200 |
| `git diff --check` | końcowe pliki kodu i dokumentacji | PASS | brak błędów whitespace |

## Sesja 14 — 12 października 2026

| Komenda / kontrola | Kontekst | Wynik | Uwagi |
|---|---|---|---|
| `pnpm --filter @asystent/schemas test` | profile blachy, kominy, obróbki i odwodnienie | PASS | 15/15 testów schemas |
| `pnpm build` | wszystkie workspace | PASS | 8 zadań Turbo; produkcyjny build Web |
| `pnpm typecheck` | wszystkie workspace | PASS | 11 zadań Turbo |
| `pnpm lint` | wszystkie workspace | PASS | 5 zadań Turbo |
| `pnpm test` | wszystkie workspace | PASS | testy wszystkich workspace, schemas 15/15 |
| `pnpm test:e2e` | lokalny build Web, Microsoft Edge | PASS | 4 scenariusze; profile blachy, warunkowa obróbka kominów, system rynnowy/spustowy i raport/edycja |
| `git diff --check` | końcowe pliki kodu i dokumentacji | PASS | brak błędów whitespace |
| `GET http://127.0.0.1:3010/` | lokalny podgląd produkcyjnego builda | PASS | HTTP 200 po końcowym buildzie |

## Sesja 15 — 12 października 2026

| Komenda / kontrola | Kontekst | Wynik | Uwagi |
|---|---|---|---|
| `pnpm --filter @asystent/schemas test` | wielokrotne wykończenia, schody, kanalizacja, kuchnia/łazienka i łączone prace terenowe | PASS | 15/15 testów schemas |
| `pnpm build` | wszystkie workspace | PASS | 8 zadań Turbo; produkcyjny build Web |
| `pnpm typecheck` | wszystkie workspace | PASS | 11 zadań Turbo |
| `pnpm lint` | wszystkie workspace | PASS | 5 zadań Turbo |
| `pnpm test` | wszystkie workspace | PASS | testy wszystkich workspace, schemas 15/15 |
| `pnpm test:e2e` | lokalny build Web, Microsoft Edge | PASS | 4 scenariusze; multi-select, raport, wybory kuchni/łazienki, kanalizacja i kostka/odwodnienie |
| `git diff --check` | końcowe pliki kodu i dokumentacji | PASS | brak błędów whitespace |
| `GET http://127.0.0.1:3010/` | lokalny podgląd produkcyjnego builda | PASS | HTTP 200 po końcowym buildzie |

## Sesja 16 — 12 października 2026

| Komenda / kontrola | Kontekst | Wynik | Uwagi |
|---|---|---|---|
| `pnpm --filter @asystent/schemas test` | wymagany opis i konkretna kategoria dla „Innych prac” | PASS | 15/15 testów |
| `pnpm test` | wszystkie workspace | PASS | 26 testów jednostkowych |
| `pnpm typecheck` | wszystkie workspace | PASS | 11 zadań Turbo |
| `pnpm lint` | wszystkie workspace | PASS | 5 zadań Turbo |
| `pnpm build` | wszystkie workspace | PASS | 8 zadań Turbo |
| `pnpm test:e2e` | lokalny Web, Microsoft Edge | PASS | 4 scenariusze; brak „zgodnie z projektem”, obowiązkowy opis i raport prac |
| `git diff --check` | końcowe pliki kodu i dokumentacji | PASS | ostrzeżenie Git o konwersji LF/CRLF w istniejącym pliku schemas; bez błędów whitespace |
| `GET http://127.0.0.1:3010/` | lokalny podgląd | PASS | HTTP 200 |

## Sesja 17 — 12 października 2026

| Komenda / kontrola | Kontekst | Wynik | Uwagi |
|---|---|---|---|
| `pnpm --filter @asystent/schemas test` | walidacja auth oraz danych przed przejściem do technologii | PASS | 17/17 testów |
| `pnpm typecheck` | wszystkie workspace | PASS | 11 zadań Turbo |
| `pnpm --filter web lint` | aplikacja Web | PASS | ESLint |
| `pnpm build` | wszystkie workspace | PASS | 8 zadań Turbo |
| `pnpm test` | wszystkie workspace | PASS | 11 zadań Turbo |
| `pnpm test:e2e` | lokalny Supabase + Microsoft Edge | PASS | 6 scenariuszy, w tym rejestracja UI i skrót admina |
| `git diff --check` | końcowe zmiany | PASS | ostrzeżenie Git o LF/CRLF w istniejącym pliku schemas |
| `GET http://127.0.0.1:3010/` | lokalny Web | PASS | HTTP 200; zrzut „This page couldn’t load” nieodtworzony |

## Sesja 18 — 12 października 2026

| Komenda / kontrola | Kontekst | Wynik | Uwagi |
|---|---|---|---|
| `pnpm install --frozen-lockfile` | workspace i zależność Leaflet | PASS | lockfile aktualny |
| `pnpm exec supabase migration up --local` | lokalna baza | PASS | brak nowych migracji do zastosowania |
| `pnpm --filter @asystent/schemas test` | standardy domu/rozbudowy oraz technologie pozostałych prac | PASS | 17/17 testów; wod-kan wymagany dla każdego standardu |
| `pnpm typecheck` | wszystkie workspace | PASS | 11 zadań Turbo |
| `pnpm lint` | wszystkie workspace | PASS | 5 zadań Turbo |
| `pnpm test` | wszystkie workspace | PASS | 11 zadań Turbo |
| `pnpm db:test` | lokalny Supabase / pgTAP | PASS | 83 testy w 3 plikach |
| `pnpm exec supabase db lint --local --schema public --fail-on error` | schemat aplikacji | PASS | brak błędów |
| `pnpm build` | wszystkie workspace | PASS | 8 zadań Turbo; lokalna mapa Leaflet/OSM i dynamiczny endpoint geokodowania |
| `pnpm test:e2e` | lokalny Supabase, Microsoft Edge | PASS | 6 scenariuszy; widoczne kafelki i marker, geokodowanie/przybliżenie, brak dostępu anonimowego, raport |
| `curl` do Nominatim i serwera kafelków OSM | zewnętrzne usługi mapowe | PASS | Nominatim zwrócił wynik dla kodu/miejscowości; kafelek HTTP 200 |
| `GET /api/geocode?query=Warszawa` bez tokenu | lokalny Web | PASS | endpoint zwraca HTTP 401 |
| `GET http://127.0.0.1:3010/` | lokalny Web po restarcie finalnego buildu | PASS | HTTP 200 |
| Widok mapy po pełnym przeładowaniu | lokalna przeglądarka | PASS | domyślna Warszawa, 6 załadowanych kafelków OSM i 1 marker |
| `git diff --check` | wszystkie zmienione pliki | PASS | bez błędów whitespace; Git ostrzega o normalizacji LF/CRLF |
| `pnpm --filter @asystent/schemas test` | warunkowe etapy elewacji i punkt mapy | PASS | 19/19 testów; kolor/powłoka tylko dla tynku lub malowania |
| `pnpm test:e2e` | pierwsze uruchomienie po zmianie warunków ankiety | FAIL | uruchomiono istniejący build Next.js; zawierał poprzedni zestaw etapów |
| `pnpm --filter web build` | odświeżenie produkcyjnego builda Web | PASS | świeży build zawiera aktualny współdzielony schemat |
| `pnpm test:e2e` | świeży build Web, lokalny Supabase, Microsoft Edge | PASS | 6/6 scenariuszy; fasadowe pytania warunkowe oraz zapis/odtworzenie punktu mapy |

## Sesja 19 — 12 października 2026

| Komenda / kontrola | Kontekst | Wynik | Uwagi |
|---|---|---|---|
| `pnpm --filter @asystent/schemas test` | ogólne kategorie „Inne prace” i etapy szczegółowe | PASS | 19/19 testów |
| `pnpm --filter web build` | pola adresu, nawigacja zakładek i ścisły geokoder | PASS | kompilacja Next.js i TypeScript |
| `pnpm test:e2e` | pierwsze uruchomienie po zmianie mapy | FAIL | test odczytał zapis przed zakończeniem drugiego mockowanego wyszukiwania; dodano oczekiwanie na numer żądania |
| `pnpm test:e2e` | świeży build Web, lokalny Supabase, Microsoft Edge | PASS | 6/6 scenariuszy; pusta lokalizacja wskazuje Warszawę, niedopasowany numer nie uruchamia fallbacku/markera, ręczny pin i trwałość zapisu |
| `pnpm typecheck` | wszystkie workspace | PASS | 11 zadań Turbo |
| `pnpm lint` | wszystkie workspace | PASS | 5 zadań Turbo |
| `pnpm test` | wszystkie workspace | PASS | 11 zadań Turbo; schemas 19/19 |
| `pnpm build` | wszystkie workspace | PASS | 8 zadań Turbo |
| `git diff --check` | końcowe zmiany kodu i dokumentacji | PASS | brak błędów whitespace; ostrzeżenia Git wyłącznie o LF/CRLF |
| `GET http://127.0.0.1:3010/` | lokalny Web po restarcie aktualnego builda | PASS | HTTP 200 |

## Sesja 20 — 12 października 2026

| Komenda / kontrola | Kontekst | Wynik | Uwagi |
|---|---|---|---|
| `pnpm --filter @asystent/schemas test` | katalog technologii „Inne prace” | PASS | 19/19 testów |
| `pnpm typecheck` | wszystkie workspace | PASS | 11 zadań Turbo |
| `pnpm build` | wszystkie workspace | PASS | 8 zadań Turbo |
| `pnpm lint` | wszystkie workspace, ponownie po zmianie E2E | PASS | 5 zadań Turbo |
| `pnpm test` | wszystkie workspace | PASS | 11 zadań Turbo |
| `pnpm test:e2e` | zapis i ponowne otwarcie zlecenia „Inne prace” | PASS | 6/6 scenariuszy; nowe asercje potwierdzają odtworzenie wielu kategorii i szczegółowych wyborów po `page.reload()` |
| `git diff --check` | końcowe zmiany testu i dokumentacji | PASS | brak błędów whitespace; ostrzeżenia Git wyłącznie o LF/CRLF |
| `GET http://127.0.0.1:3010/` | lokalny podgląd | PASS | HTTP 200 |
| Testy bazy danych | zakres bez zmian schematu/migracji | NOT RUN | nie były wymagane |

## Sesja 22 — 12 października 2026

| Komenda / kontrola | Kontekst | Wynik | Uwagi |
|---|---|---|---|
| `pnpm --filter web remove leaflet @types/leaflet` | usunięcie zależności starej mapy | PASS | manifest i lockfile aktualizowane przez pnpm |
| `pnpm install --frozen-lockfile` | aktualny lockfile | PASS | brak rozbieżności |
| `pnpm typecheck` | wszystkie workspace | PASS | 11 zadań Turbo |
| `pnpm lint` | wszystkie workspace | PASS | 5 zadań Turbo |
| `pnpm test` | wszystkie workspace | PASS | 11 zadań Turbo; schemas 19/19 |
| `pnpm --filter web build` | produkcyjny Web, iframe Google Maps | PASS | zniknął endpoint `/api/geocode` |
| `pnpm build` | wszystkie workspace | PASS | 8 zadań Turbo |
| `pnpm test:e2e` | lokalny Supabase i Microsoft Edge | PASS | 6/6; test kontroluje zapytanie Google Maps dla `Grabie 156a, Łapanów, 32-740, Polska` |
| Kontrola osadzonej strony Google Maps | iframe z wyszukiwaniem adresu | PASS | Google przekierował URL wyszukiwania do `/maps/embed`; potwierdzono region mapy w drzewie dostępności |
| Dokładne wskazanie budynku `Grabie 156a` | zewnętrzne dane Google Maps | NOT VERIFIED | E2E mockuje iframe; nie potwierdzono, czy Google ma pin pod dokładnym numerem |
| `git diff --check` | końcowe zmiany i dokumentacja | PASS | ostrzeżenie Git wyłącznie o normalizacji LF/CRLF |
| `GET http://127.0.0.1:3010/` | lokalny Web po restarcie buildu | PASS | HTTP 200 |
| Testy bazy danych | zakres bez zmian schematu/migracji | NOT RUN | nie były wymagane |

## Sesja 7 — 11 października 2026

| Komenda / kontrola | Kontekst | Wynik | Uwagi |
|---|---|---|---|
| `pnpm install --frozen-lockfile` | root monorepo | PASS | lockfile aktualny |
| `pnpm build` | root monorepo | PASS | Next.js, Android JS bundle i pakiety |
| `pnpm typecheck` | root monorepo | PASS | wszystkie workspace |
| `pnpm lint` | root monorepo | PASS | Web i Mobile |
| `pnpm test` | root monorepo | PASS | testy jednostkowe wszystkich workspace |
| `pnpm exec supabase migration up --local` | migracja `20261011210000_profile_account_type.sql` | PASS | dodano typ konta profilu |
| `$env:PATH = 'C:\Program Files\Docker\Docker\resources\bin;' + $env:PATH; pnpm db:test` | lokalny Supabase | PASS | 20/20 asercji pgTAP; dodano ścieżkę Docker CLI dla procesu narzędziowego |
| `pnpm exec supabase db lint --local --schema public --fail-on error` | lokalny schemat aplikacji | PASS | brak błędów schematu |
| Web `GET http://127.0.0.1:3010/` | lokalny smoke test | PASS | HTTP 200 |
| Podgląd strony w przeglądarce | konto zalogowane w istniejącej sesji | PASS | trzy kafelki widoczne; zapis wyboru na koncie — NOT RUN |
| Playwright E2E onboardingu | rejestracja → wybór → ponowne logowanie | NOT RUN | runner E2E nie jest skonfigurowany |
| `git diff --check` | zmienione pliki | PASS | brak błędów whitespace |

## Sesja 8 — 11 października 2026

| Komenda / kontrola | Kontekst | Wynik | Uwagi |
|---|---|---|---|
| `pnpm build` | root monorepo | PASS | build Web i pozostałych workspace |
| `pnpm typecheck` | root monorepo | PASS | wszystkie workspace |
| `pnpm lint` | root monorepo | PASS | Web i Mobile |
| `pnpm test` | root monorepo | PASS | testy jednostkowe workspace |
| Podgląd Web w przeglądarce przy szerokości desktop | zalogowany stan onboardingu | PASS | trzy klikalne karty wyświetlane w jednym rzędzie |
| Kontrola struktury DOM | kafelki wyboru | PASS | każdy kafelek jest jednym elementem `button` |
| Kontrola widoku mobilnego | szerokość 390 px | PASS | trzy kolumny po 114 px, zero poziomego przepełnienia |
| Przywrócenie stanu lokalnego konta | po weryfikacji kafelka | PASS | typ konta przywrócony do poprzedniej wartości `client` |
| `git diff --check` | zmienione pliki | PASS | brak błędów whitespace |

## Sesja 1 — 11 października 2026

| Komenda | Kontekst | Wynik | Uwagi |
|---|---|---|---|
| `npm install -g pnpm` | przygotowanie środowiska | PASS | zainstalowano pnpm 12.11.2 |
| `winget install --id Git.Git` | przygotowanie środowiska | PASS | zainstalowano Git 2.55.0.5 |
| `git init` | `C:\Users\Patryk\Desktop\Aplikacja_Budowa` | PASS | repo lokalne, bez remote |
| `npx create-next-app@latest web ...` | scaffolding `apps/web` | PASS | Next.js + TS + Tailwind + ESLint + App Router |
| `npx create-expo-app@latest mobile --template blank-typescript` | scaffolding `apps/mobile` | PASS | Expo SDK ~57, RN 0.86.3 |
| `pnpm install` (root) | instalacja zależności monorepo | NOT RUN | do wykonania na początku kolejnej sesji |
| `pnpm build` | build wszystkich aplikacji | NOT RUN | zależne od powyższego |
| `pnpm typecheck` | typecheck wszystkich pakietów | NOT RUN | zależne od powyższego |
| `pnpm lint` | lint wszystkich pakietów | NOT RUN | zależne od powyższego |
| `pnpm test` | testy jednostkowe | NOT RUN | brak jeszcze testów do uruchomienia |
| `supabase start` | lokalny Supabase | BLOCKED | brak Docker Desktop w środowisku |
| `pnpm install` (root, po poprawkach `pnpm-workspace.yaml`: `onlyBuiltDependencies`/`allowBuilds`) | instalacja zależności monorepo | PASS | 762 pakiety, build scripts (esbuild, unrs-resolver) zatwierdzone przez `pnpm-workspace.yaml` |
| `pnpm --filter web build` / `pnpm build` (turbo) | build `apps/web` (Next.js) i `apps/mobile` (placeholder) | PASS | Next.js build generuje `.next/types` wymagane do typecheck |
| `pnpm typecheck` (turbo, 8 pakietów) | typecheck wszystkich `apps/*` i `packages/*` | PASS | naprawiono brak `LayoutProps` przez wcześniejszy `next build` |
| `pnpm lint` (turbo) | lint `apps/web` (eslint) i `apps/mobile` (placeholder) | PASS | mobile nie ma jeszcze konfiguracji ESLint — placeholder `exit 0` |
| `pnpm test` (turbo, pakiety z vitest) | testy jednostkowe `packages/*` | **BLOCKED** | patrz niżej — polityka Application Control blokuje natywny Rollup |

### Historia: blokada Vitest/Rollup — rozwiązana przez zmianę runnera

Komenda `vitest run` w `packages/api-client` i `packages/geometry` kończy się błędem:

```
Error: Cannot find module @rollup/rollup-win32-x64-msvc. ...
[cause]: Error: An Application Control policy has blocked this file.
\\?\...\node_modules\.pnpm\@rollup+rollup-win32-x64-msvc@4.64.5\node_modules\@rollup\rollup-win32-x64-msvc\rollup.win32-x64-msvc.node
code: 'ERR_DLOPEN_FAILED'
```

To **blokada na poziomie systemu operacyjnego** (Windows Defender Application Control lub podobna polityka), a nie
błąd w kodzie repo — plik `.node` (natywny binarny moduł Rollupa używany wewnętrznie przez Vitest) jest odrzucany
przez politykę zanim JavaScript zdąży go załadować. Próba `ROLLUP_SKIP_NODEJS_NATIVE=1` nie pomogła (Vitest/Vite
i tak ładuje natywny moduł Rollupa niezależnie od tej zmiennej w tej wersji).

**Rozwiązanie:** usunięto Vitest z pakietów i przestawiono ich testy na wbudowany w Node.js `node:test`. Testy TypeScript
kompilują się przez `tsc`, a następnie są uruchamiane bez bundlera. Nie zmieniano ustawień bezpieczeństwa Windows.

**Wniosek sesji 1:** ETAP 0 (audyt środowiska) ukończony z udokumentowanymi brakami uzupełnionymi (pnpm, Git) i jednym
pozostającym (Docker — BLOCKED dla Supabase local). `pnpm test` było BLOCKED przez reguły systemowe dla pliku Rollupa;
status ten rozwiązano w sesji 2 przez zmianę runnera na `node:test`.

## Sesja 2 — 11 października 2026

| Komenda | Kontekst | Wynik | Uwagi |
|---|---|---|---|
| `pnpm install --frozen-lockfile` | root monorepo | PASS | lockfile aktualny po usunięciu Vitest i dodaniu Expo ESLint |
| `pnpm build` | root monorepo | PASS | 8 zadań; Next.js production build, Expo Android JS bundle export, kompilacja 6 pakietów |
| `pnpm typecheck` | root monorepo | PASS | 8 zadań: web, mobile i 6 pakietów |
| `pnpm lint` | root monorepo | PASS | ESLint dla web, Expo lint dla mobile |
| `pnpm test` | root monorepo | PASS | 8 asercji w sesji 2: geometry 3, calculators 3, ui-tokens 2; później dodano 2 testy UI |
| `pnpm --filter mobile exec expo export --platform android` | lokalny bundle Android | PASS | 580 modułów zbundlowano; nie jest to natywne APK/AAB |
| `pnpm --filter web exec next dev --hostname 127.0.0.1 --port 3010` + GET `/` | lokalny Web smoke test | PASS | serwer gotowy, HTTP 200; proces zatrzymany po sprawdzeniu |
| `pnpm --filter mobile exec expo start --localhost --port 8081` + GET `/status` | lokalny Expo smoke test | PASS | HTTP 200, `packager-status:running`; proces zatrzymany po sprawdzeniu |
| `supabase start` | lokalny backend | BLOCKED | Docker Desktop nie jest dostępny; nie instalowano go bez zgody użytkownika |

Testy obejmują: długość odcinka, pole wielokąta w obu kierunkach, walidację geometrii, narzut odpadu, konwersję
objętości mm³ → m³, walidację kalkulatorów, kolory UI oraz skalę odstępów.

**Wniosek sesji 2:** bramka jakości kodu (install/build/typecheck/lint/test) — **PASS**. ETAP 1 pozostaje częściowo
**BLOCKED** wyłącznie przez niedostępny Docker wymagany do uruchomienia lokalnego Supabase. Nie uruchamiano usług
chmurowych ani wdrożenia. Web został zbudowany produkcyjnie, a Mobile wyeksportowało lokalny bundle JavaScript dla
Androida; nie budowano APK/AAB ani nie uruchamiano emulatora.

## Sesja 3 — 11 października 2026

| Komenda / kontrola | Kontekst | Wynik | Uwagi |
|---|---|---|---|
| `pnpm install --frozen-lockfile` | root monorepo | PASS | workspace dependencies web/mobile rozwiązane |
| `pnpm build` | root monorepo | PASS | Next.js produkcyjny build, Expo Android bundle (581 modułów), 6 pakietów |
| `pnpm typecheck` | root monorepo | PASS | 8 workspaces |
| `pnpm lint` | root monorepo | PASS | ESLint Web + Expo lint Mobile |
| `pnpm test` | root monorepo | PASS | 10 asercji: geometry 3, calculators 3, ui-tokens 2 testy (4 asercje); pozostałe workspaces nie miały jeszcze testów |
| Web w przeglądarce (`http://127.0.0.1:3010`) | dostępność i treść widoku | PASS | strona odpowiada, tytuł „Asystent Budowlańca”, polski lokalny pulpit; proces zatrzymany po kontroli |
| Expo `GET http://localhost:8081/status` | status Metro | PASS | HTTP 200, `packager-status:running`; proces zatrzymany po kontroli |

**Wniosek sesji 3:** lokalny UI Web/Mobile używa współdzielonych tokenów designu; wszystkie bramki kodu i smoke testy
— **PASS**. Lokalny Supabase nadal **BLOCKED** przez niedostępny Docker Desktop. Nie uruchamiano usług chmurowych ani
wdrożenia.

## Sesja 4 — 11 października 2026

| Komenda / kontrola | Kontekst | Wynik | Uwagi |
|---|---|---|---|
| `pnpm install --frozen-lockfile` | root monorepo | PASS | lockfile aktualny, pnpm 12.11.2 |
| `pnpm build` | root monorepo | PASS | 8 zadań; Next.js build, Android JS bundle (581 modułów), pakiety |
| `pnpm typecheck` | root monorepo | PASS | 8 zadań |
| `pnpm lint` | root monorepo | PASS | Web i Mobile |
| `pnpm test` | root monorepo | PASS | 15 przypadków testowych PASS: geometry 3, calculators 3, ui-tokens 2, schemas 4, domain 3; pozostałe workspaces 0 testów |
| `pnpm db:start` | lokalny Supabase na Docker Desktop | PASS | kontenery utworzone; ostrzeżenie braku `supabase/seed.sql` nie przerwało startu |
| `pnpm db:status` i `docker ps` | stan usług lokalnych | PASS | PostgreSQL healthy; API, Auth, Studio, Mailpit i Storage dostępne; `vector` restartuje się, `imgproxy` i `pooler` są zatrzymane |
| `GET http://127.0.0.1:54321/auth/v1/health` | Supabase Auth health | PASS | HTTP 200 |
| `GET http://127.0.0.1:54323` | Supabase Studio | PASS | HTTP 200 |
| `GET http://127.0.0.1:54324` | Mailpit | PASS | HTTP 200 |
| `docker exec supabase_db_Aplikacja_Budowa pg_isready -U postgres` | gotowość PostgreSQL | PASS | `/run/postgresql:5432 - accepting connections` |

**Ograniczenia infrastruktury:** logi `supabase_vector` zgłaszają błąd połączenia z endpointem Docker IPv6
`2375`; kontener zamyka się i restartuje. `supabase status` wymienia także zatrzymane `imgproxy` i `pooler`.
Główne ścieżki Auth, Studio, Mailpit i PostgreSQL odpowiadają, lecz nie wykonano jeszcze migracji aplikacyjnych,
testu danych przez PostgREST ani testów integracyjnych uprawnień/RLS. Etap 2 pozostaje **NOT RUN**.

Nie wykonano `pnpm test:e2e` — skrypt nie jest skonfigurowany. Nie wykonano natywnego APK/AAB ani emulatora.

## Sesja 5 — 11 października 2026

| Komenda / kontrola | Kontekst | Wynik | Uwagi |
|---|---|---|---|
| `pnpm install --frozen-lockfile` | root monorepo | PASS | lockfile aktualny |
| `pnpm build` | root monorepo | PASS | 8 zadań; Web, Android JS bundle i pakiety |
| `pnpm typecheck` | root monorepo | PASS | 8 workspace |
| `pnpm lint` | root monorepo | PASS | Web i Mobile |
| `pnpm test` | root monorepo | PASS | 15 testów jednostkowych: geometry 3, calculators 3, ui-tokens 2, schemas 4, domain 3 |
| `pnpm exec supabase migration up --local` | wdrożenie migracji identity/organizations | PASS | bez resetu lokalnej bazy |
| `pnpm exec supabase test db --local` | pgTAP: `supabase/tests/organization_rls.test.sql` | PASS | 16/16 testów |
| `pnpm db:test` | skrót do lokalnych testów pgTAP | PASS | ten sam zestaw testów |
| `pnpm exec supabase db lint --local --schema public --fail-on error` | lint schematu aplikacji | PASS | brak błędów |
| `pnpm exec supabase db lint --local` | lint wszystkich schematów, w tym `extensions` | FAIL | diagnostyka dotyczy dołączonego pgTAP i starszych obiektów katalogowych w `extensions`; lint aplikacyjnego `public` przechodzi |

Zakres pgTAP: profil tworzony z metadanych użytkownika Auth, tworzenie organizacji, automatyczny właściciel,
izolacja organizacji/profili/członkostw pomiędzy użytkownikami, odmowa podszywania się i bezpośredniego
przyznawania ról, walidacja NIP oraz odmowa odczytu przez `anon`.

**Status ETAPU 2:** migracja i polityki bazowe **PASS**; pełny etap **NOT RUN** — brak jeszcze UI i E2E logowania,
przepływu zaproszeń/akceptacji członkostwa oraz testów właściciel/członek po dołączeniu przez zaproszenie.

## Sesja 6 — 11 października 2026

| Komenda / kontrola | Kontekst | Wynik | Uwagi |
|---|---|---|---|
| `pnpm install --frozen-lockfile` | wszystkie workspace | PASS | klient Supabase i wspólny pakiet API rozwiązane |
| `pnpm build` | root monorepo | PASS | Web, Android JS bundle, 6 pakietów |
| `pnpm typecheck` | root monorepo | PASS | 8 workspace, w tym typowany klient Supabase |
| `pnpm lint` | root monorepo | PASS | Web i Mobile |
| `pnpm test` | root monorepo | PASS | 15 testów jednostkowych |
| `pnpm db:test` | lokalna baza | PASS | 16/16 testów pgTAP |
| `pnpm exec supabase db lint --local --schema public --fail-on error` | lokalna baza, schemat aplikacji | PASS | brak błędów |
| `GET http://127.0.0.1:3010/` | lokalny Web | PASS | HTTP 200, tytuł aplikacji |
| Rejestracja, tworzenie organizacji i lista członkostw w przeglądarce | lokalny Supabase Auth + RLS | PASS | tymczasowe konto i organizację usunięto po sprawdzeniu |
| Rejestracja → wylogowanie → ponowne logowanie | lokalny Supabase Auth + Web | PASS z uwagą | UI wylogowuje i pozwala ponownie się zalogować; narzędzie przeglądarki notuje `ERR_ABORTED` dla requestu logout, warto potwierdzić w automatycznym E2E |
| Widok przy szerokości 390 px | przeglądarka lokalna | PASS | formularz logowania widoczny, brak poziomego przepełnienia |

Nie uruchomiono Playwright/E2E; brak runnera. Etap 2 pozostaje w toku do wdrożenia zaproszeń i automatycznych
scenariuszy AUTH-01/AUTH-02.
