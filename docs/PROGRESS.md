# PROGRESS — dziennik postępu prac

Ten plik jest aktualizowany po każdej sesji pracy. Zawiera stan: co zostało zrobione, co jest zablokowane,
i od czego zacząć kolejną sesję. **To jest pierwszy plik, który agent powinien przeczytać po wznowieniu pracy.**

## Stan ogólny

- **Aktualny etap:** ETAP 2 (Auth, organizacje, role, RLS) — fundament profili, organizacji, członkostw właściciela
  i izolacji RLS wdrożony lokalnie; pgTAP **PASS**. Pełny przepływ logowania/zaproszeń i E2E pozostają do wykonania.
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
4. Kontynuuj od pierwszego niewykonanego punktu w sekcji „Kontynuacja” sesji 3.

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
