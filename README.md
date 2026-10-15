# Asystent Budowlańca + Lokalny Rynek

Monorepo aplikacji „Asystent Budowlańca + Lokalny Rynek” (web + mobile + backend Supabase).

> **Status:** wczesny etap budowy, praca wyłącznie lokalna. Zobacz [docs/PROGRESS.md](docs/PROGRESS.md) po aktualny
> stan prac i [docs/MASTER_SPEC.md](docs/MASTER_SPEC.md) po pełną specyfikację produktu.

## Start

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm lint
pnpm test
```

## Podgląd aplikacji w GitHub Codespaces

Uruchom samą aplikację webową:

```bash
pnpm dev:web
```

Serwer startuje też **automatycznie przy każdym otwarciu projektu** w VS Code (również w Codespaces) — robi to
zadanie `Start aplikacji web (autostart)` z [.vscode/tasks.json](.vscode/tasks.json), które uruchamia
[scripts/dev-web.sh](scripts/dev-web.sh). Skrypt sam instaluje zależności, gdy brakuje `node_modules`, i pomija
start, jeśli port `3000` jest już zajęty przez działający serwer. Autostart wyłączysz, usuwając z zadania sekcję
`runOptions.runOn`; ręcznie uruchomisz go przez **Terminal → Run Task…**.

Po chwili Codespaces wykryje port `3000`. W panelu **Ports** wybierz **Open in Browser**, aby otworzyć aplikację
pod prywatnym linkiem Codespaces. Pozostaw terminal z serwerem uruchomiony; zmiany w kodzie będą widoczne po
automatycznym odświeżeniu strony. Jeśli port nie pojawi się sam, dodaj `3000` ręcznie w panelu **Ports**.

Bez skonfigurowanego Supabase wybierz na ekranie **Otwórz tryb testowy bez logowania**. Jest dostępny tylko przy
`pnpm dev:web`; otworzy pełny formularz klienta: dane budowy, materiały i technologię, dokumentację oraz ręczny
edytor CAD. Formularz ma walidowany przykład domu. Rzut fundamentów zawiera piwnicę i płytę denną tylko po lewej
stronie, trzy pary stóp/słupów oraz wykop z wymiarami; możesz zmieniać wszystkie dane przykładu. Szkice ankiety,
dokumentacji i rysunków są zapisywane wyłącznie w localStorage tej przeglądarki. Na komputerze i telefonie kliknij
lub dotknij samego płótna w kroku 3, aby otworzyć pełny ekran z pionowym paskiem narzędzi po lewej.
**Zapisz i wyjdź z canvasu** zapisuje rysunek i wraca do dokumentacji; ustawienia otworzysz z nagłówka.
Jeden palec rysuje lub zaznacza, dwa palce przesuwają i powiększają widok. Przytrzymaj ikonę narzędzia,
aby zobaczyć opis do chwili puszczenia; puszczenie wybiera narzędzie. Podczas rysowania zobaczysz prowadnice
X/Y, wyrównanie do istniejących ścian i bieżące ΔX, ΔY oraz długość.
Kliknięcie wymiaru ściany zaznacza ją i otwiera pole długości; zmiana zachowuje połączone narożniki.
Tryb demo nie tworzy sesji ani nie łączy się z API. Zdjęcia, skan/import AI oraz pełne panele wykonawcy i sklepu
wymagają backendu. Instrukcja lokalnego Supabase znajduje się poniżej.

## Lokalny backend Supabase

Po zainstalowaniu i uruchomieniu Docker Desktop:

```bash
pnpm db:start
pnpm db:status
pnpm db:test
pnpm db:stop
```

Konfiguracja lokalnego projektu znajduje się w `supabase/config.toml`. Nie są wymagane żadne dane produkcyjne ani
zdalny projekt Supabase. Migracje i testy pgTAP są w `supabase/migrations` i `supabase/tests`.

Aby uruchomić Web z lokalnym logowaniem, ustaw w `apps/web/.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY z lokalnego pnpm db:status>
SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY z lokalnego pnpm db:status — tylko serwer>
```

`ANON_KEY` jest kluczem publicznym do klienta przeglądarkowego. `SUPABASE_SERVICE_ROLE_KEY` jest wymagany tylko
przez serwer tworzący konta pracowników; nigdy nie dodawaj go do zmiennych `NEXT_PUBLIC_*`, kodu ani Git.
Lokalne wiadomości potwierdzające e-mail możesz podejrzeć w Mailpit pod adresem
`http://127.0.0.1:54324`.

Po pierwszym zalogowaniu aplikacja prosi o wybór typu konta: Zleceniodawca, Wykonawca lub Sklep. Wybór jest
zapisywany w profilu w lokalnej bazie:

- Zleceniodawca trafia do formularza pierwszej budowy; po jej zapisaniu kolejne logowania otwierają panel Klienta.
  Panel obsługuje kolejne zlecenia, edycję i zapis statusu publikacji.
  W formularzu budowy mapa Google jest osadzona bezpośrednio w kafelku i aktualizuje się na podstawie kodu
  pocztowego, miejscowości i adresu/numeru działki (domyślnie Warszawa, gdy pola są puste).
  Kod pocztowy i planowany termin są obowiązkowe.
  Formularz ma etap „Plan realizacji” zależny od rodzaju prac i generuje raport zapisywany przy zleceniu.
- Wykonawca i Sklep zapisują dane działalności, branżę i obszar działania, a potem trafiają do swojego panelu.
  W panelu widzą listę opublikowanych zleceń klientów wraz z raportem wygenerowanym ze zlecenia.
- Właściciel dodaje pracownika przez e-mail i imię/nazwisko. Hasło tymczasowe pokazuje się jednorazowo do
  przekazania pracownikowi. Pracownik ustawia własne hasło przed dostępem do danych; nie zarządza innymi kontami.
- Nie ma formularza tworzenia „organizacji”. Techniczne członkostwa nadal zapewniają izolację firmy/sklepu.

Po dodaniu migracji zastosuj je bez resetowania danych:

```bash
pnpm exec supabase migration up --local
pnpm build
pnpm --filter web exec next start --hostname 127.0.0.1 --port 3010
```

## Lokalne testy E2E

`pnpm test:e2e` uruchamia Playwright w zainstalowanym Microsoft Edge i lokalny build Web na porcie 3011. Najpierw
uruchom Docker/Supabase, skonfiguruj `apps/web/.env.local` i wykonaj `pnpm build`. Runner odmawia pracy z Supabase
w chmurze. Testy tworzą tylko własne tymczasowe konta/dane i usuwają je po sprawdzeniu.

```bash
pnpm db:test
pnpm test:e2e
```

## Struktura

Patrz [AGENTS.md](AGENTS.md) — pełny opis struktury repo i zasad pracy dla agenta/programisty.

## Dokumentacja

- [docs/MASTER_SPEC.md](docs/MASTER_SPEC.md) — specyfikacja produktu (skrót).
- [docs/raw/MASTER_SPEC_RAW.txt](docs/raw/MASTER_SPEC_RAW.txt) — pełny, dosłowny tekst z PDF.
- [docs/PROGRESS.md](docs/PROGRESS.md) — dziennik postępu, stan prac, następne kroki.
- [docs/DECISIONS.md](docs/DECISIONS.md) — Architecture Decision Records.
- [docs/TEST_REPORT.md](docs/TEST_REPORT.md) — rzeczywiste wyniki komend jakości.
- [docs/SECURITY.md](docs/SECURITY.md) — model zagrożeń i zasady bezpieczeństwa.
- [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) — tokeny i zasady UI/UX.
