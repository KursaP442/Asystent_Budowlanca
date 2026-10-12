# PROGRESS — dziennik postępu prac

Ten plik jest aktualizowany po każdej sesji pracy. Zawiera stan: co zostało zrobione, co jest zablokowane,
i od czego zacząć kolejną sesję. **To jest pierwszy plik, który agent powinien przeczytać po wznowieniu pracy.**

## Stan ogólny

- **Aktualny etap:** ETAP 2 — podstawowy Auth, trzy ścieżki onboardingu, konta pracowników i izolacja RLS
  zweryfikowane lokalnie; pgTAP i Playwright **PASS**. ETAP 3 — podstawowe zlecenia i panel klienta wdrożone,
  pełny kreator i rynek ofert pozostają do wykonania. Nie ma kroku tworzenia organizacji w UI.
  Ograniczenia usług pomocniczych Supabase opisano w `docs/TEST_REPORT.md`.
- **Tryb pracy:** wyłącznie lokalny (bez hostingu/wdrożenia). Repozytorium Git istnieje tylko lokalnie
  (`C:\Users\Patryk\Desktop\Aplikacja_Budowa`), bez zdalnego remote na GitHub.
- **Źródło specyfikacji:** `C:\Users\Patryk\Downloads\Asystent_Budowlanca_MASTER_PROMPT_MULTI_AI_BYOK_MCP.pdf`,
  tekst wyekstrahowany do `docs/raw/MASTER_SPEC_RAW.txt` i skondensowany do `docs/MASTER_SPEC.md`.

## Sesja 1 — 11 października 2026

### Zrobione

1. Zlokalizowano i wyodrębniono tekst specyfikacji z PDF (`docs/raw/MASTER_SPEC_RAW.txt`, 20 stron) — Node.js +
   `pdfjs-dist`, ponieważ w środowisku nie było Pythona (pdfplumber/pdf-parse nie zadziałały).
2. Utworzono skondensowaną wersję specyfikacji: `docs/MASTER_SPEC.md`.
3. Audyt środowiska (ETAP 0):
   - Node.js v26.7.0, npm 11.19.0 — dostępne.
   - pnpm — **brakowało**, zainstalowano globalnie (`npm install -g pnpm`, v12.11.2).
   - Git — **brakował**, zainstalowano przez `winget install --id Git.Git` (v2.55.0.5).
   - Docker — **niedostępny** (BLOCKED dla lokalnego Supabase, patrz niżej).
   - Zainicjalizowano lokalne repozytorium Git w `C:\Users\Patryk\Desktop\Aplikacja_Budowa` (brak zdalnego).
4. Scaffolding monorepo (ETAP 1):
   - `package.json` (root, pnpm workspaces), `pnpm-workspace.yaml`, `turbo.json`.
   - `apps/web` — Next.js (TypeScript + Tailwind + ESLint + App Router + src dir), utworzony przez
     `create-next-app@latest --use-pnpm --skip-install`.
   - `apps/mobile` — Expo (blank-typescript), utworzony przez `create-expo-app@latest`; usunięto
     `node_modules`/`package-lock.json`, aby zależności instalowało pnpm z poziomu root.
   - `packages/domain`, `packages/schemas`, `packages/geometry`, `packages/calculators`, `packages/api-client`,
     `packages/ui-tokens` — szkielety pakietów (package.json, tsconfig.json, src/index.ts) zgodnie z architekturą
     z `MASTER_SPEC.md` sekcja 3.
   - `supabase/migrations`, `supabase/functions` — puste katalogi przygotowane pod dalsze prace (ETAP 2+).
   - `AGENTS.md` (root) — instrukcje dla agenta: kolejność czytania dokumentów, zasady pracy etapowej, zasady kodu.
   - `docs/DECISIONS.md`, `docs/TEST_REPORT.md`, `docs/SECURITY.md`, `docs/DESIGN_SYSTEM.md` — szkielety.

### Zablokowane (BLOCKED)

- **Lokalny Supabase**: wymaga Docker Desktop, który nie jest zainstalowany w tym środowisku. Nie instalowano
  automatycznie (duży, wymaga restartu/Hyper-V/WSL2, decyzja użytkownika). Do czasu instalacji Dockera backend
  Supabase nie może być uruchomiony lokalnie — prace nad Auth/RLS/bazą (ETAP 2+) będą częściowo teoretyczne
  (migracje SQL można pisać i review'ować, ale nie uruchomić) dopóki Docker nie zostanie zainstalowany.
- **`pnpm test` (Vitest) w `packages/*`**: polityka Application Control (WDAC) systemu Windows blokuje natywny plik
  `.node` Rollupa (`ERR_DLOPEN_FAILED`, „An Application Control policy has blocked this file”). To ograniczenie
  systemowe, nie błąd kodu. Pełny opis i rekomendowane opcje naprawy — patrz `docs/TEST_REPORT.md` sekcja „BLOCKED:
  Vitest/Rollup”.
- Brak kont/kluczy Google/Facebook OAuth, brak kluczy API modeli AI — wymagane dopiero w ETAP 2 i ETAP 9.

### Zrobione (cd.) — weryfikacja jakości ETAP 1

- `pnpm install` (root) — **PASS** po poprawce `pnpm-workspace.yaml` (dodano `onlyBuiltDependencies` i `allowBuilds`
  dla `esbuild`/`unrs-resolver`/`sharp`, bo pnpm domyślnie blokuje build scripts nieznanych zależności). Usunięto
  też zduplikowany/konfliktowy `apps/web/pnpm-workspace.yaml` wygenerowany przez `create-next-app`.
- Dodano skrypty `typecheck`/`test` do `apps/web/package.json` i `build`/`typecheck`/`lint`/`test` (placeholdery
  tam, gdzie jeszcze nic nie ma do zrobienia) do `apps/mobile/package.json`.
- `pnpm build` (turbo, `apps/web` + `apps/mobile`) — **PASS**.
- `pnpm typecheck` (turbo, 8 pakietów: `apps/web`, `apps/mobile`, 6× `packages/*`) — **PASS** (po wcześniejszym
  `next build`, który generuje `.next/types` wymagane przez typowane layouty Next.js 16 — `LayoutProps<"/">`).
- `pnpm lint` (turbo) — **PASS**.
- `pnpm test` (turbo) — **BLOCKED** (patrz wyżej).

### Następne kroki (od tego trzeba zacząć kolejną sesję)

1. Uruchomić lokalny Supabase po zapewnieniu Docker Desktop; do tego czasu nie rozpoczynać integracyjnego Auth/RLS
   ani nie używać Supabase Cloud. Instalacja Docker Desktop wymaga osobnej decyzji ze względu na uprawnienia i
   komponenty systemowe (WSL2/Hyper-V).
2. Gdy Supabase lokalny jest dostępny, wykonać ETAP 2 zgodnie z `MASTER_SPEC.md`: Auth e-mail/hasło, organizacje,
   role i polityki RLS z testami izolacji danych.
3. Rozszerzać testy `domain`, `schemas`, `api-client` i aplikacji, które obecnie mają runner, ale nie mają jeszcze
   własnych przypadków testowych.
4. Pozostawić pracę lokalnie; utworzenie remote, hosting i wdrożenie odkładać do czasu wyraźnej decyzji użytkownika.

## Sesja 2 — 11 października 2026

### Zrobione

1. Rozwiązano blokadę WDAC dla testów bez zmiany polityk Windows: Vitest zastąpiono w pakietach przez wbudowany
   `node:test`, a TypeScript kompiluje się do `dist/` przez `tsc`.
2. Dodano funkcje bazowe w `packages/geometry`: odległość punktów i pole wielokąta w mm² z walidacją skończonych
   współrzędnych i liczby wierzchołków.
3. Dodano funkcje bazowe w `packages/calculators`: powierzchnia z jawnym narzutem odpadu i objętość z mm³ na m³,
   z walidacją danych oraz wyniku.
4. Zdefiniowano podstawowe tokeny kolorów i odstępów w `packages/ui-tokens`.
5. Dodano 8 testów jednostkowych geometrii, kalkulatorów i tokenów UI.
6. Uzupełniono rzeczywisty lint Expo przez `eslint-config-expo`; skrypt `mobile:lint` nie jest już placeholderem.
7. Ustawiono lokalny build aplikacji mobilnej jako `expo export --platform android` (eksport JS bundle, nie APK/AAB).
8. Uruchomiono bramki: `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test` —
   wszystkie **PASS**. Szczegóły: `docs/TEST_REPORT.md`.
9. Wykonano smoke testy lokalnego startu: Next.js odpowiadał HTTP 200, a Expo `/status` zwrócił
   `packager-status:running` — oba procesy zatrzymano po sprawdzeniu.

### Zablokowane (BLOCKED)

- Supabase local nadal wymaga Docker Desktop; Docker nie jest dostępny. Nie instalowano go automatycznie, ponieważ
  wymaga zmian systemowych. ETAP 1 nie jest formalnie domknięty bez działającego Supabase local.

### Kontynuacja

Pierwszym zadaniem jest uruchomienie Supabase lokalnie po zapewnieniu Docker Desktop, a następnie przejście do ETAPU 2
(Auth, organizacje, role i RLS). Nie twórz hostingu ani zdalnego Git remote.

## Sesja 3 — 11 października 2026

### Zrobione

1. Podłączono `@asystent/ui-tokens` przez workspace dependencies do `apps/web` i `apps/mobile`; naprawiono kodowanie
   BOM w manifestach pakietów tak, aby Next.js i Metro mogły je parsować.
2. Zastąpiono domyślny ekran Next.js polskim, responsywnym lokalnym pulpitem z obszarami projektów, zleceń i
   materiałów oraz jasnym komunikatem, że serwer/baza nie są jeszcze podłączone.
3. Zastąpiono domyślny ekran Expo lokalnym ekranem startowym używającym tych samych tokenów.
4. Ustawiono polski tytuł i `lang="pl"` dla dokumentu Web.
5. Zbudowano Web i eksport JS dla Androida, uruchomiono typecheck/lint/testy; wszystkie wyniki **PASS**.
   Smoke test Web potwierdził polski tytuł i widok; Expo `/status` zwrócił `packager-status:running`.

### Kontynuacja

Projekt pozostaje lokalny. Nie rozpoczynać Auth/RLS, dopóki lokalny Supabase nie może zostać uruchomiony. Następne
działanie infrastrukturalne: zapewnić Docker Desktop i zweryfikować Supabase local; później ETAP 2.

## Jak wznowić pracę w nowej sesji

1. Przeczytaj ten plik (`docs/PROGRESS.md`) od sekcji „Następne kroki”.
2. Sprawdź `docs/TEST_REPORT.md`, aby zobaczyć ostatnie wyniki testów/budowy.
3. Sprawdź `git log` / `git status` w katalogu repo — jeśli brak commitów, zrób pierwszy commit z aktualnym stanem
   przed dalszą pracą.
4. Kontynuuj od sekcji „Kontynuacja” ostatniej sesji, nie od historycznych blokad Dockera z sesji 1–3.

## Sesja 4 — 11 października 2026

### Zrobione

1. Na wyraźną prośbę użytkownika zainstalowano Docker Desktop 4.94.0, WSL 2 i lokalną zależność Supabase CLI
   2.120.0. Docker Engine 29.8.2 odpowiada; konfiguracja Supabase jest w `supabase/config.toml`.
2. Uruchomiono lokalny stos `pnpm db:start`. PostgreSQL jest gotowy na porcie 54322; Supabase Auth, API i Studio
   odpowiadają lokalnie. Mailpit odpowiada na porcie 54324. Nie skonfigurowano zdalnego projektu ani hostingu.
3. Dodano skrypty `pnpm db:start`, `pnpm db:status`, `pnpm db:stop` oraz instrukcję do README.
4. Dodano schematy organizacji/członkostwa z walidacją polskiego NIP-u i logikę wyboru aktywnego członkostwa;
   7 nowych testów dla schematów i domeny.
5. `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm typecheck`, `pnpm lint` i `pnpm test` — **PASS**.
   Testy raportują 15 przypadków PASS; szczegóły w `docs/TEST_REPORT.md`.

### Ograniczenia i następne kroki

- Kontener `supabase_vector` restartuje się z powodu niedostępnego endpointu Docker IPv6; `imgproxy` i `pooler`
  pozostają zatrzymane. Główne usługi API/DB/Auth/Studio przeszły smoke testy, ale te komponenty pomocnicze
  wymagają osobnej diagnozy.
- Ostrzeżenie startu o braku `supabase/seed.sql` nie przerwało inicjalizacji.
- Następny krok: ETAP 2 — zaprojektować i dodać migracje Auth/organizacji/ról/RLS oraz testy izolacji danych na
  lokalnym Supabase. Nie oznaczać Auth/RLS jako ukończonych przed testami integracyjnymi.
- Docker Desktop/WSL może wymagać restartu systemu po instalacji; po restarcie sprawdź `pnpm db:status`.
- Kontener Supabase pozostawiono uruchomiony lokalnie. Zatrzymanie: `pnpm db:stop`; wznowienie: `pnpm db:start`.

### Wznowienie

1. Przeczytaj tę sesję oraz `docs/TEST_REPORT.md` i `docs/DECISIONS.md`.
2. Sprawdź `git status` i lokalny stos (`pnpm db:status`); nie konfiguruj hostingu ani usług chmurowych.
3. Zacznij ETAP 2 od migracji i testów Auth/organizacji/RLS zgodnie z `docs/MASTER_SPEC.md`.

## Sesja 5 — 11 października 2026

### Zrobione

1. Dodano migrację `20261011204000_identity_organizations_rls.sql`: typy organizacji i ról, profile tworzone
   po utworzeniu użytkownika Supabase Auth, organizacje z walidacją formatu/sumy kontrolnej NIP oraz członkostwo
   właściciela tworzone transakcyjnie przy utworzeniu organizacji.
2. Włączono RLS dla profili, organizacji i członkostw. Użytkownik widzi wyłącznie swój profil i organizacje,
   których jest członkiem; właściciel/admin może aktualizować dane organizacji. Bezpiecznie zamknięto bezpośredni
   zapis członkostw do czasu dodania przepływu zaproszeń. Uprawnienia funkcji pomocniczych ograniczono, a funkcje
   SECURITY DEFINER mają ustalony `search_path`.
3. Dodano 16 pgTAP testów dla tworzenia profili, organizacji i właściciela, izolacji między użytkownikami,
   ochrony przed podszywaniem się, braku bezpośredniego nadawania ról oraz odmowy dostępu anonimowego.
4. Migrację zastosowano do istniejącej lokalnej bazy bez resetu: `pnpm exec supabase migration up --local` — **PASS**.
   `pnpm exec supabase test db --local` — **PASS** (16/16).
5. Dodano `pnpm db:test` i opis testów/migracji w README.
6. Lint schematu aplikacji: `pnpm exec supabase db lint --local --schema public --fail-on error` — **PASS**.

### Pozostało (ETAP 2 — w toku)

- Logowanie/rejestracja z UI i E2E przepływu Auth — **NOT RUN**.
- Zaproszenia i bezpieczne dołączanie drugiego członka organizacji — **NOT IMPLEMENTED**; bezpośredni zapis
  członkostw pozostaje celowo niedostępny.
- Pełna kontrola uprawnień owner/admin/member dla operacji na członkostwach — **NOT RUN**.
- Testy helpera auth w pakiecie `api-client` i smoke test publicznego Auth REST — **NOT RUN**.
- Testy E2E wg AUTH-01/AUTH-02 oraz pełne kryterium izolacji etapu — **NOT RUN**.
- Pełny `pnpm exec supabase db lint --local` — **FAIL** z błędami w dołączonym schemacie `extensions` (pgTAP
  i starsze obiekty katalogowe); ograniczony lint schematu `public` przechodzi. Baza aplikacji nie ma w lint
  błędów.

### Kontynuacja

Następnie dodać przepływ zaproszenia/akceptacji członkostwa oparty o zweryfikowany adres e-mail oraz ograniczony
RPC/Edge Function, potem połączyć rejestrację/logowanie z Web i dodać lokalny E2E. Nie otwierać bezpośredniego
INSERT/UPDATE tabeli `memberships` dla klienta i nie łączyć projektu z Supabase Cloud.

## Sesja 6 — 11 października 2026

### Zrobione

1. Dodano responsywny interfejs Web logowania/rejestracji w języku polskim, obsługę stanu ładowania i czytelnych
   błędów oraz widok lokalnego miejsca pracy.
2. Podłączono Web do lokalnego Supabase Auth przez `@supabase/supabase-js`. Ekran po zalogowaniu korzysta z
   RLS-chronionych członkostw i organizacji; formularz pozwala utworzyć inwestora, wykonawcę lub skład. Walidację
   NIP-u i uprawnienia egzekwuje baza; użytkownik-twórca dostaje rolę właściciela.
3. Zdefiniowano wspólne typy tabel i funkcji Supabase w `packages/api-client`, używane przez Web.
4. Lokalny przepływ sprawdzono w przeglądarce: formularz rejestracji → konto Auth/profil → utworzenie organizacji
   → wyświetlenie roli właściciela. Tymczasowe konto i organizację testową usunięto z lokalnej bazy.
5. Dodano `apps/web/.env.example` i instrukcję konfiguracji kluczem anon (bez kluczy serwisowych) oraz Mailpit do
   README. Rzeczywista konfiguracja developerska znajduje się w ignorowanym przez Git `apps/web/.env.local`.
6. Sprawdzono przeglądarkowo pełny podstawowy przepływ: rejestracja → wylogowanie → ponowne logowanie. Przeglądarka
   zgłosiła `ERR_ABORTED` dla żądania logout przy zmianie widoku, ale UI wylogował użytkownika, można było zalogować
   się ponownie i przejść do pulpitu. Tymczasowe konto usunięto po teście.

### Weryfikacja

- `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test` — **PASS**.
- Web smoke test — **PASS** (HTTP 200); kontrola przeglądarkowa rejestracji, utworzenia konta i organizacji — **PASS**.
- `pnpm db:test` — **PASS** (16/16); lint schematu `public` — **PASS**.
- Wylogowanie przełącza interfejs do logowania, a ponowne logowanie działa. Diagnostyka narzędzia przeglądarki
  nadal odnotowuje przerwany request logout; warto potwierdzić zachowanie automatycznym E2E.

### Pozostało (ETAP 2 — w toku)

- Pełny Playwright E2E dla AUTH-01/AUTH-02 i izolacji tenantów — **NOT RUN**; repo nie ma skonfigurowanego
  runnera E2E.
- Zaproszenie drugiej osoby, potwierdzenie adresu i bezpieczne dołączenie do organizacji — **NOT IMPLEMENTED**.
- Mobile nie ma jeszcze ekranu Auth ani podłączenia do Supabase.
- Rzeczywiste `.env.local` jest lokalne/ignorowane. Na nowym środowisku skopiuj wartości z `pnpm db:status` zgodnie
  z README; nigdy nie wklejaj `SECRET_KEY` ani `SERVICE_ROLE_KEY` do klienta.

### Kontynuacja

Następnie wprowadzić lokalny E2E dla rejestracji/logowania/organizacji. Potem
zaprojektować zaproszenia z potwierdzeniem adresu e-mail i bezpiecznym RPC/Edge Function, bez przyznawania ról
bezpośrednio z przeglądarki. Nie łączyć Supabase Cloud ani nie konfigurować hostingu.

## Sesja 7 — 11 października 2026

### Zrobione

1. Dodano trzy responsywne kafelki pierwszego wyboru typu konta: Zleceniodawca, Wykonawca i Sklep, z własnymi
   ilustracjami SVG i krótkim opisem.
2. Po wyborze aplikacja zapisuje `profiles.account_type` pod RLS i przechodzi do kroku utworzenia organizacji z
   przypisanym typem. Kolejne logowania odczytują zapisany typ; przed utworzeniem pierwszej organizacji można go
   zmienić.
3. Zastosowano lokalnie migrację `20261011210000_profile_account_type.sql`; typ konta jest odrębny od ról
   członkostwa i od typów poszczególnych organizacji.
4. Rozszerzono pgTAP o zapis własnego typu, izolację aktualizacji profilu i ochronę przed zmianą typu innego
   użytkownika. Poprawiono asercję RLS, używając UPDATE filtrowanego przez politykę zamiast zapisu w CTE.
5. Zaktualizowano README, ADR-007 i ten dziennik.

### Weryfikacja

- `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test` — **PASS**.
- `pnpm exec supabase migration up --local` — **PASS**.
- `pnpm db:test` — **PASS** (20/20); lint schematu `public` — **PASS**.
- Lokalny Web smoke test — **PASS** (HTTP 200); podgląd w przeglądarce potwierdził wyświetlanie trzech kafelków.
  Kliknięcie wyboru na istniejącym koncie i weryfikacja po ponownym logowaniu — **NOT RUN**.
- Automatyczny Playwright E2E — **NOT RUN** (brak skonfigurowanego runnera).
- `git diff --check` — **PASS**.

### Kontynuacja

Następnie dodać automatyczny lokalny E2E nowego onboardingu oraz przepływ zaproszeń i bezpiecznego dołączania
członków. Zmiany zapisać wyłącznie lokalnie; nie konfigurować hostingu ani Supabase Cloud.

## Sesja 8 — 11 października 2026

### Zrobione

1. Przeprojektowano wybór typu konta, dopasowując typografię, paletę, obramowania i stany interakcji do ekranu
   logowania.
2. Trzy opcje są teraz pełnowymiarowymi przyciskami-kafelkami: cały kafelek można kliknąć, także klawiaturą;
   przyciski CTA są wyłącznie wizualnym elementem karty.
3. Na komputerze kafelki są prezentowane w jednym rzędzie. Na telefonie zachowano trzy kolumny, z mniejszymi
   ilustracjami i typografią dostosowanymi do szerokości ekranu.
4. Zrestartowano lokalny serwer Web, aby wymusić wczytanie nowego arkusza CSS zamiast poprzedniego builda.

### Weryfikacja

- `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test` — **PASS**.
- Podgląd lokalnej strony w przeglądarce desktop — trzy równe karty obok siebie, zgodne kolorystycznie z ekranem
  logowania — **PASS**.
- Semantyka dostępności — trzy elementy `button`, każdy zawiera całą kartę — **PASS**.
- Weryfikacja mobilna przy 390 px — trzy kolumny po 114 px, bez poziomego przewijania — **PASS**.
- W ramach kontroli użyto istniejącego lokalnego konta, przywracając jego typ do poprzedniej wartości
  `client` po sprawdzeniu kafelka — **PASS**.
- `git diff --check` — **PASS**.

### Kontynuacja

Kontynuować od automatycznych testów E2E onboardingu i przepływu zaproszeń. Nie zmieniać lokalnej konfiguracji
Supabase ani nie uruchamiać hostingu.

## Sesja 9 — 12 października 2026

### Zrobione

1. Wznowiono niezacommitowane prace graficzne z sesji 8. Zachowano trzy duże przyciski-kafle w jednym rzędzie
   i stylistykę logowania; poprawiono semantykę przycisków i sprawdzono desktop oraz szerokości 390/320 px.
2. Uwzględniono najnowszą zmianę wymagań: w UI nie ma „organizacji”. Pierwszy klient trafia bezpośrednio do
   formularza budowy; po zapisaniu zlecenia i kolejnym logowaniu otwiera się panel Klienta.
3. Dodano zapisywane w lokalnej bazie budowy: lokalizacja, zakres, rodzaj prac, powierzchnia, kondygnacje,
   piwnica, dach, materiały, opcjonalny termin i budżet. Panel umożliwia kolejne zlecenia, edycję oraz zmianę
   statusu szkic/opublikowane/anulowane. Publikacja na razie zapisuje status; feed ofertowania pozostaje do budowy.
4. Wykonawca/sklep uzupełnia NIP, adres, telefon, branżę, obszar i promień obsługi oraz opis. Atomowy RPC zapisuje
   profil oraz techniczne uprawnienia w jednej transakcji. Starsze dane i członkostwa nie zostały usunięte.
5. W panelu firmy/sklepu właściciel tworzy konto pracownika po podaniu e-maila i nazwy. Serwer generuje losowe
   hasło tymczasowe, przypina nowe konto jako `member` i zwraca hasło jednorazowo. Istniejące konta nie są przejmowane.
6. Pracownik loguje się przekazanymi danymi, musi ustawić własne hasło i dopiero wtedy widzi panel pracownika.
   Blokada danych przed zmianą hasła oraz uprawnienia owner/member są egzekwowane w RLS.
7. Dodano wspólne schematy walidacji i 4 testy jednostkowe, migracje biznesu/zleceń/pracowników oraz pgTAP.
8. Dodano trwały runner Playwright i 3 scenariusze E2E, obejmujące klienta oraz właściciela/pracownika firmy i sklepu.
   Pobrany Chromium był blokowany przez Windows (`spawn UNKNOWN`); runner korzysta ze zainstalowanego Microsoft Edge.
9. Skonfigurowano lokalny klucz serwerowy w ignorowanym `apps/web/.env.local`; nie umieszczono go w kodzie, Git
   ani zmiennych `NEXT_PUBLIC_*`. Sprawdzenie assetów klienta nie wykryło klucza serwisowego.
10. Testy tworzyły i usuwały wyłącznie własne tymczasowe konta/dane. Nie usuwano istniejących danych użytkownika.

### Weryfikacja

- `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test` — **PASS** (19 testów jednostkowych).
- `pnpm db:test` — **PASS** (64 asercje); lint schematu `public` — **PASS**.
- `pnpm test:e2e` — **PASS** (3 scenariusze: klient, wykonawca/pracownik, sklep/pracownik).
- Równe kafelki w jednym rzędzie przy 1440/390/320 px, bez poziomego przepełnienia — **PASS**.
- Podgląd screenshotów formularzy w desktop/mobile — **PASS**; poprawiono rozmiar checkboxa i ograniczono
  pomocniczy panel na telefonie, aby formularz pojawiał się szybciej.
- Klucz serwerowy w assetach przeglądarki — **PASS** (nieobecny); środowisko lokalne ignorowane w Git.
- Lokalny Web na `http://127.0.0.1:3010/` — **PASS** (HTTP 200). Ponowne uruchomienie po zamknięciu sesji:
  `pnpm --filter web exec next start --hostname 127.0.0.1 --port 3010` (po `pnpm --filter web build`).

### Kontynuacja — produkt nadal w budowie

1. Rozwinąć ETAP 3: wielokrokowy zakres budowy (fundamenty → kondygnacje → dach → materiały), autosave i wersjonowanie
   danych zlecenia, termin składania ofert i spójne zasady publikacji.
2. ETAP 4: feed zleceń dla wykonawcy, filtry obszaru/specjalizacji, oferty netto/brutto/VAT, terminy i audyt.
3. ETAP 5: katalog sklepu, oddziały, RFQ, zamówienia i dostawy.
4. Następnie ETAPY 6–10 zgodnie z MASTER_SPEC: przedmiary, CAD, import, AI/BYOK, mobile i beta. Te funkcje
   pozostają **NOT RUN** i nie są deklarowane jako gotowe.
5. Rozbudować zarządzanie personelem (dezaktywacja, reset hasła, zaproszenie istniejącego konta) i testy awarii
   infrastruktury. Aktualne tworzenie nowych kont i pierwsze logowanie są zweryfikowane.

Praca pozostaje lokalna. Wznowienie: uruchom Docker Desktop, sprawdź `pnpm db:status`, przeczytaj tę sekcję,
zbuduj Web i kontynuuj od pierwszego niewdrożonego punktu. Nie resetuj bazy i nie konfiguruj hostingu.
