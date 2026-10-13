# PROGRESS — dziennik postępu prac

Ten plik jest aktualizowany po każdej sesji pracy. Zawiera stan: co zostało zrobione, co jest zablokowane,
i od czego zacząć kolejną sesję. **To jest pierwszy plik, który agent powinien przeczytać po wznowieniu pracy.**

## Stan ogólny

- **Aktualny etap:** ETAP 2 — podstawowy Auth, trzy ścieżki onboardingu, konta pracowników i izolacja RLS
  zweryfikowane lokalnie; pgTAP i Playwright **PASS**. ETAP 3 — bazowy wniosek budowy z walidacją, ankietą
  materiałów/technologii, raportem i panelem klienta zweryfikowano lokalnie. Rozbudowany rynek, składanie ofert,
  RFQ/katalog oraz dalsze etapy specyfikacji pozostają do wykonania. Nie ma kroku tworzenia organizacji w UI.
  Ograniczenia usług pomocniczych Supabase opisano w `docs/TEST_REPORT.md`.
- **Rozszerzenie w toku:** adaptacyjny edytor CAD po „Przejdź dalej”, autosave rysunków, PDF/zdjęcia,
  ręczna kalibracja i adapter OpenAI/BYOK są zaimplementowane lokalnie. Scenariusz płótna/importu z mockiem AI
  ma **PASS**. Analiza rzeczywistym OpenAI — **BLOCKED** do konfiguracji klucza i szyfrowania.
  Dodano profile narzędzi etapu, warstwy materiałowe, węzły ścian, zoom/linijki, krokowy status rysunków,
  kopiowanie rzutów, rozwinięcia ścian i kreator rzutów zbrojenia. Nie oznacza to pełnego CAD 1:1.
  Etapy mają podpunkty, narożniki ciągły podgląd, a fundamenty zależne ławy/płyty i izolacje.
  Graficzny kreator przekroju belki zapisuje położenie na podparciu; po zmianie długości wymaga sprawdzenia.
  Przyciąganie łączy narożniki i węzły T; canvas zajmuje pełną szerokość, z panelami pod płótnem i kolorami ról.
  Parametry fundamentów są trwałe i automatyczne; dodano X, przyczepione podpory, oznaczenia, pola m²,
  płytę denną między ławami, opisy prowadzące, bezkolizyjne etykiety oraz osobną skalę arkusza.
  MCP, 3D, korekcja perspektywy i pełny zweryfikowany przedmiar pozostają niezakończone.
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

## Sesja 10 — 12 października 2026

### Zrobione

1. Przebudowano formularz „Dane ogólne budowy”:
   - mapa Google jest teraz osadzona bezpośrednio w kafelku i aktualizuje się automatycznie po zmianie
     kodu pocztowego, miejscowości i adresu/numeru działki;
   - gdy pola lokalizacji są puste, podgląd domyślnie pokazuje Warszawę;
   - usunięto ręczne pole współrzędnych i przycisk „Pokaż na mapie”.
2. Wymagalność pól:
   - kod pocztowy (`00-000`) jest obowiązkowy;
   - planowany termin jest obowiązkowy;
   - dach nie jest zbierany w danych ogólnych;
   - usunięto pole powierzchni istniejącego budynku dla rozbudowy.
3. Dodano etap „Plan realizacji i etapy wniosku” zależny od rodzaju prac (dom/rozbudowa/remont/inne) z:
   - wymaganiami szczegółowymi,
   - kryteriami odbioru,
   - wskazówkami kroków adekwatnymi do typu prac.
4. Przy zapisie zlecenia generowany jest pełny raport tekstowy (`report_summary`) i zapisywany w bazie.
5. Opublikowane zlecenia klientów są widoczne w panelu Wykonawcy i Sklepu (w tym dla pracownika po aktywacji hasła),
   razem z terminem i raportem.
6. Dodano migracje i testy:
   - nowe kolumny raportu i wymagań;
   - aktualizacje walidacji/triggerów (w tym bezpieczne aktualizacje statusu starszych rekordów);
   - politykę odczytu rynku zleceń dla kont contractor/store;
   - testy pgTAP oraz E2E dla mapy, wymaganych pól, zdjęć, raportu i widoczności rynku.

### Weryfikacja

- `pnpm exec supabase migration up --local` — **PASS**
- `pnpm db:test` — **PASS** (82 asercje)
- `pnpm exec supabase db lint --local --schema public --fail-on error` — **PASS**
- `pnpm --filter @asystent/schemas test` — **PASS** (10/10)
- `pnpm --filter web build`, `pnpm --filter web lint` — **PASS**
- `pnpm test:e2e` — **PASS** (4 scenariusze, w tym nowy przebieg mapa+raport+market)
- `pnpm typecheck` — **PASS**
- `GET http://127.0.0.1:3010/` — **PASS** (HTTP 200)

### Kontynuacja — następne kroki

1. Rozbudować „wniosek” do pełnej wieloetapowej struktury domenowej (nie tylko plan realizacji, ale też podsekcje
   technologiczne i formalne per rodzaj prac) oraz wersjonowanie raportu.
2. Dodać filtrowanie i ranking zleceń w panelu Wykonawcy/Sklepu (obszar, termin, budżet, specjalizacja).
3. ETAP 4+: oferty, negocjacje, terminy zamknięcia i audyt zmian ofert.
4. ETAP 5+: katalog sklepu, RFQ i zamówienia.

Wznowienie: uruchom Docker, `pnpm db:status`, potem `pnpm --filter web build` i `pnpm --filter web exec next start --hostname 127.0.0.1 --port 3010`.

## Sesja 11 — 12 października 2026

### Zrobione

1. Sprawdzono zgłoszenie o polach szerokości/długości zamiast mapy. Po pełnym przeładowaniu lokalnej strony
   `http://127.0.0.1:3010/` aktualny formularz nie zawiera tych pól ani przycisku „Pokaż na mapie”; mapa jest
   osadzona bezpośrednio w sekcji lokalizacji.
2. Potwierdzono, że pusty formularz kieruje iframe na podgląd Warszawy, a kod pocztowy i termin są wymagane.
3. Rozszerzono E2E o jawne kontrole braku starych pól i przycisku mapy oraz wymagalności kodu pocztowego i terminu.

### Weryfikacja

- `pnpm test:e2e` — **PASS** (4 scenariusze).
- Kontrola formularza po przeładowaniu w przeglądarce — **PASS** (brak pól współrzędnych/przycisku, iframe
  z lokalizacją domyślną Warszawa).
- `git diff --check` — **PASS**.
- Zrzut ekranu mapy w narzędziu przeglądarkowym nie dostarczył wiarygodnego obrazu — **BLOCKED** jako kontrola
  wizualna. Potwierdzono obecność i adres iframe, nie poświadczono wyglądu kafelków mapy na zrzucie.

### Kontynuacja

Jeśli w otwartej karcie nadal widać starą wersję, wykonać twarde odświeżenie `Ctrl+F5` pod
`http://127.0.0.1:3010/`. Dalsza praca pozostaje lokalna; pełny kreator, filtrowanie rynku i ofertowanie są nadal
do wykonania zgodnie z sesją 10.

## Sesja 12 — 12 października 2026

### Zrobione

1. Zastąpiono sekcję z ręcznymi polami „Wymagania szczegółowe” i „Kryteria odbioru” automatycznymi warunkami
   zgodności z projektem, przepisami i zasadami wiedzy technicznej.
2. Dodano w formularzu osobne zakładki „Dane budowy” oraz „Materiały i technologia”. Ankieta dostosowuje etapy do
   budowy domu, rozbudowy, remontu albo innych prac; każda lista ma własną wyszukiwarkę i wymagany wybór.
3. Dodano katalog wyborów dla fundamentów, szalunków fundamentowych i stropowych, ścian i ich ocieplenia, stropów,
   dachu/pokrycia, instalacji, wykończenia remontu oraz pozostałych prac. Obejmuje m.in. bloczki szalunkowe 25/30 cm,
   szalunki tradycyjne i systemowe, stropy monolityczne/prefabrykowane/gęstożebrowe, blachę płaską na rąbek i
   rozwiązania membranowe.
4. Technologie zapisują się w dotychczasowym polu materiałów, są odtwarzane przy edycji i trafiają do raportu
   wyświetlanego przy zleceniu. Zachowano stare notatki tekstowe; limit tekstowy bazy rozszerzono migracją
   `20261012122000_construction_technology_catalog.sql`.
5. Przejrzano źródła ITB oraz poradniki branżowe dotyczące fundamentów, ścian, stropów, pokryć dachowych,
   ocieplenia, wentylacji, ogrzewania i systemów podłogowych. Odnośniki do źródeł są dostępne w ankiecie.
6. Udokumentowano ograniczenie katalogu: zawiera typowe rozwiązania i wybór „zgodnie z projektem/inne”, ale nie
   jest zamkniętą listą wszystkich systemów i produktów producentów. Wybór inwestora pozostaje preferencją, a nie
   projektem konstrukcyjnym.

### Weryfikacja

- `pnpm exec supabase migration up --local` — **PASS**
- `pnpm db:test` — **PASS** (83 asercje; sprawdzono również zapis materiałów ponad dotychczasowy limit 2000 znaków)
- `pnpm exec supabase db lint --local --schema public --fail-on error` — **PASS**
- `pnpm --filter @asystent/schemas test` — **PASS** (10/10)
- `pnpm test` — **PASS**
- `pnpm build` — **PASS** (8 zadań workspace, w tym produkcyjny build Web)
- `pnpm typecheck` — **PASS**
- `pnpm lint` — **PASS**
- `pnpm test:e2e` — **PASS** (4 scenariusze; filtrowanie wyszukiwarki, warunkowe szalowanie stropu, zapis i odtworzenie wyborów)
- `GET http://127.0.0.1:3010/` — **PASS** (HTTP 200); w aktywnej sesji klienta widać nową nawigację zakładek
- `git diff --check` — **PASS**

### Kontynuacja

Katalog technologii jest wersją bazową z odnośnikami, nie gwarantuje kompletności każdej technologii/produktu.
Kolejne prace: weryfikacja list z fachowcami i rozbudowa etapów pod dokładny zakres projektu, następnie filtrowanie
rynku oraz ofertowanie. Pełna aplikacja nadal nie jest ukończona; hosting i usługi chmurowe pozostają wyłączone.

## Sesja 13 — 12 października 2026

### Zrobione

1. Wymieniono osobne pole wyszukiwania i natywną listę na rozwijane menu z wyszukiwarką umieszczoną wewnątrz
   menu. Każda lista ma filtrowanie, wybór klawiaturą przez pola i czytelny stan wybranych wartości.
2. Sposób posadowienia obsługuje zaznaczenie więcej niż jednej technologii i zapisuje listę wartości; istniejące
   zapisane posadowienie w formacie pojedynczego tekstu jest automatycznie odczytywane jako lista jednoelementowa.
3. Wybór ściany monolitycznej ujawnia szalowanie fundamentów; ściany z bloczków betonowych lub szalunkowych nie
   wymagają oddzielnego pola szalowania.
4. Dodano osobne pytania o folię kubełkową (bąbelkową) i ocieplenie fundamentów (m.in. XPS, EPS fundamentowy,
   PIR, szkło piankowe), niezależne od hydroizolacji.
5. Dach rozbito na płytę skośną, poszycie/deskowanie, warstwę wstępnego krycia, pokrycie końcowe i ocieplenie.
   Etapy warstw nie wyświetlają się, jeśli użytkownik oznaczy, że zakres nie obejmuje prac przy dachu.
6. Dla budowy domu i rozbudowy dodano standard realizacji: stan surowy otwarty, zamknięty, deweloperski albo pod
   klucz. Izolacja ścian/dachu, stolarka, instalacje i wykończenia ujawniają się zgodnie z poziomem realizacji oraz
   wybranym układem ściany; dodano ankietę okien, montażu, drzwi, podłóg, ścian, sufitów oraz schodów.
7. Dla remontu wprowadzono wybór zakresu od odświeżenia po remont generalny i termomodernizację. Kolejne etapy
   (instalacje, stolarka, izolacje i dach) zależą od wybranego zakresu.
8. Dla „Innych prac” dodano etapy zależne od kategorii: ogrodzenie (przygotowanie, fundament, konstrukcja,
   wykończenie), podjazd (podbudowa i odwodnienie), drenaż (system i odbiornik), mur oporowy oraz elewacja.
9. Każda aktywnie wybrana pozycja „Inne” pokazuje wymagane pole opisu; walidacja wymaga jego treści, a raport
   zawiera nazwę wybranej technologii i opis. Formularz nadal zapisuje wybory w dotychczasowej kolumnie `materials`.
10. Rozszerzono testy schematu i E2E o menu wyszukiwane w środku, multi-select, szalowanie warunkowe, etapy domu,
    remontu i pozostałych prac, warstwy dachu, opis „Inne” i raport po zapisie. Uaktualniono specyfikację i ADR-010.

### Weryfikacja

- `pnpm build` — **PASS** (8 zadań workspace; produkcyjny build Web)
- `pnpm typecheck` — **PASS** (11 zadań Turbo)
- `pnpm lint` — **PASS** (5 zadań Turbo)
- `pnpm test` — **PASS** (15 testów schematów oraz wszystkie pozostałe testy workspace)
- `pnpm test:e2e` — **PASS** (4 scenariusze w Microsoft Edge; przetestowany zapis wielu posadowień i raportu)
- Kontrola wizualna nowego menu i wyszukiwarki wewnątrz niego — **PASS** (lokalny Web; menu nakłada się na formularz)
- `GET http://127.0.0.1:3010/` — **PASS** (HTTP 200)
- `git diff --check` — **PASS**

### Kontynuacja

Nowy model etapów i wyszukiwania działa lokalnie i zachowuje zgodność zapisu w JSON z dotychczasowym polem.
Następny zakres to ekspercka weryfikacja doboru list technologii oraz dalszy rozwój pełnego kreatora i rynku
ofert. Aplikacja pozostaje nieukończona i wyłącznie lokalna; nie zmieniono hostingu ani usług chmurowych.

## Sesja 14 — 12 października 2026

### Zrobione

1. Rozszerzono ankietę dachu o profile blachodachówki (m.in. fala, panel płaski, modułowa i cięta na wymiar),
   systemy rąbka dla blachy płaskiej oraz profile blachy trapezowej.
2. Dodano wybór systemu kominowego, warunkowy sposób obróbki i jej materiał; przy braku komina lub poza zakresem
   pola obróbki nie są wymagane.
3. Dodano niezależne wybory systemu rynnowego oraz rur spustowych i sposobu odprowadzenia wody.
4. Wszystkie nowe wybory korzystają z dotychczasowej walidacji, zapisu JSON w `materials` i generowania raportu;
   nie dodano migracji ani zmian usług zewnętrznych.
5. Uzupełniono testy schematu, scenariusze E2E, specyfikację i ADR-011.

### Weryfikacja

- `pnpm --filter @asystent/schemas test` — **PASS** (15/15)
- `pnpm build` — **PASS** (8 zadań workspace)
- `pnpm typecheck` — **PASS** (11 zadań Turbo)
- `pnpm lint` — **PASS** (5 zadań Turbo)
- `pnpm test` — **PASS** (wszystkie testy workspace; schemas 15/15)
- `pnpm test:e2e` — **PASS** (4 scenariusze w Microsoft Edge; profil blachy, system kominowy, obróbka, rynny i rury spustowe w raporcie i edycji)
- `git diff --check` — **PASS**
- `GET http://127.0.0.1:3010/` — **PASS** (HTTP 200)

### Kontynuacja

Katalog dachowy nadal jest zestawem typowych rozwiązań, a nie zamkniętą listą wszystkich produktów. Wybory wymagają
potwierdzenia z projektem i instrukcjami producentów. Aplikacja pozostaje lokalna i nieukończona.

## Sesja 15 — 12 października 2026

### Zrobione

1. Rozszerzono wybory wielokrotne na podłogi, wykończenie ścian i sufitów, wykończenia schodów/balustrad,
   elewację, wybrane wykończenia remontowe i elementy montowane w kuchni/łazience.
2. Konstrukcja schodów jest osobną odpowiedzią (m.in. żelbet wylewany na miejscu, prefabrykat, stal, drewno,
   istniejące schody lub brak schodów); wykończenie i balustrady wybiera się oddzielnie.
3. Instalacja wodno-kanalizacyjna, w tym kanalizacja, jest wymagana już w ankiecie stanu surowego.
4. Kategoria „Inne prace” pozwala łączyć zakresy. Dodano szczegóły nawierzchni/obrzeży i odwodnienia podjazdu,
   ścieżek, tarasu oraz kostki/opaski wokół domu.
5. Odczyt JSON normalizuje wcześniej zapisane pojedyncze wartości wielokrotnych do list; raport zachowuje wszystkie
   aktywne wybory. Uzupełniono specyfikację, ADR-012, testy schematu i E2E.

### Weryfikacja

- `pnpm --filter @asystent/schemas test` — **PASS** (15/15)
- `pnpm build` — **PASS** (8 zadań workspace)
- `pnpm typecheck` — **PASS** (11 zadań Turbo)
- `pnpm lint` — **PASS** (5 zadań Turbo)
- `pnpm test` — **PASS** (wszystkie testy workspace; schemas 15/15)
- `pnpm test:e2e` — **PASS** (4 scenariusze w Microsoft Edge; multi-select, raport, kuchnia/łazienka, instalacja wod-kan i łączone prace terenowe)
- `git diff --check` — **PASS**
- `GET http://127.0.0.1:3010/` — **PASS** (HTTP 200)

### Kontynuacja

Uruchomić pozostałe bramki po przebudowie aktualnego worktree. Aplikacja nadal pozostaje lokalna i nieukończona.

## Sesja 16 — 12 października 2026

### Zrobione

1. Usunięto „zgodnie z projektem” z wyboru kategorii „Inne prace”; schemat odrzuca tę odpowiedź jako zakres
   pozostałych prac.
2. Dla typu „Inne” pole opisu jest wyraźnie nazwane „Opis prac do wykonania”; ankieta informuje, że opis i co
   najmniej jedna konkretna kategoria są wymagane.
3. Zmieniono nazwę pozycji „Inne prace specjalistyczne” tak, aby wymagała doprecyzowania; jej opis zapisuje się
   w raporcie. Zaktualizowano test schematu, E2E, specyfikację i ADR-013.

### Weryfikacja

- `pnpm --filter @asystent/schemas test` — **PASS** (15/15)
- `pnpm test` — **PASS** (26 testów jednostkowych)
- `pnpm typecheck` — **PASS** (11 zadań Turbo)
- `pnpm lint` — **PASS** (5 zadań Turbo)
- `pnpm build` — **PASS** (8 zadań Turbo)
- `pnpm test:e2e` — **PASS** (4 scenariusze w Microsoft Edge)
- `git diff --check` — **PASS**
- `GET http://127.0.0.1:3010/` — **PASS** (HTTP 200)

### Kontynuacja

Praca nadal lokalna, bez wdrożenia i commita. Kategorie i etapy „Inne” wymagają konkretnych wyborów i opisu;
sprawdź tę regułę ponownie przy kolejnych rozszerzeniach katalogu.

## Sesja 17 — 12 października 2026

### Zrobione

1. Ujednolicono walidację rejestracji i logowania we wspólnych schematach Zod:
   normalizacja e-maila, poprawny format, wymagane hasło oraz limit długości; rejestracja wymaga też nazwy.
   Formularz Auth pokazuje błędy walidacji bez wysyłania niepoprawnego żądania.
2. Naprawiono inicjalizację Auth: jeżeli zdarzenie `onAuthStateChange` nadejdzie przed zakończeniem
   `getSession()`, spóźniony odczyt sesji nie nadpisuje już nowszego stanu. Widok logowania czeka jawnie
   na inicjalizację, a odczyt sesji ujawnia błędy zamiast pozostawiać niejednoznaczny ekran.
3. Skrót nawigacji w formularzu budowy widzi tylko administrator z serwerowo zarządzanym
   `app_metadata.role === "admin"`. Zwykłe konto przechodzi walidację danych przed wejściem do zakładki
   technologii; administrator może pominąć wyłącznie tę walidację nawigacji. Zapis nadal wymaga całej walidacji
   schematu. Rola `admin` organizacji nie jest traktowana jako globalny administrator.
4. Dodano E2E dla rzeczywistej rejestracji w UI, błędnego e-maila/hasła, dalszej ścieżki do formularza klienta
   i zakładki technologii, a także obecności/nieobecności skrótu i walidacji zapisu admina.
5. Zrzut „This page couldn’t load” nie odtworzył się w działającym środowisku: lokalny podgląd zwraca HTTP 200.
   Oprócz smoke testu przepływ uwierzytelniania i onboardingu przetestowano w E2E na lokalnym Supabase.

### Weryfikacja

- `pnpm --filter @asystent/schemas test` — **PASS** (17/17).
- `pnpm typecheck` — **PASS** (11 zadań Turbo).
- `pnpm --filter web lint` — **PASS**.
- `pnpm build` — **PASS** (8 zadań Turbo).
- `pnpm test` — **PASS** (11 zadań Turbo).
- `pnpm test:e2e` — **PASS** (6 scenariuszy w Microsoft Edge).
- `git diff --check` — **PASS** (ostrzeżenie Git tylko o normalizacji LF/CRLF).
- `GET http://127.0.0.1:3010/` — **PASS** (HTTP 200).

### Kontynuacja

Przepływ od rejestracji do danych budowy i technologii jest gotowy do dalszego sprawdzenia przez użytkownika.
Praca pozostaje lokalna, bez wdrożenia i commita. Skrót administratora wymaga nadania `app_metadata.role`
przez zaufany proces serwerowy; zwykłe konta i każdy zapis nadal podlegają walidacji.

## Sesja 18 — 12 października 2026

### Zrobione

1. Potwierdzono błąd mapy Google w lokalnej przeglądarce: iframe kończył się `ERR_ABORTED` i pozostawał pusty mimo
   HTTP 200 dostawcy. Zastąpiono go interaktywnym Leaflet/OpenStreetMap z widocznymi kafelkami i markerem.
2. Dodano uwierzytelniony endpoint wyszukiwania lokalizacji przez Nominatim. Zmiany zapytania są opóźniane podczas
   wpisywania; przy nieznalezieniu numeru/adresu mapa pokazuje jawne przybliżenie według kodu i miejscowości.
   Przy pustych polach pozostaje Warszawa; dane lokalizacji są ujawnione jako wysyłane do OpenStreetMap, a link
   do Google Maps nadal jest dostępny.
3. Uzupełniono wymagane wod-kan dla czterech standardów domu/rozbudowy oraz walidację braku tego wyboru w każdym
   standardzie. Dodano wymagany wybór systemu nawierzchni żywiczno-żwirowej, pełne warstwy pytań dla elewacji
   oraz prace: taras, przyłącza zewnętrzne, zieleń i rozbiórki.
4. E2E sprawdza renderowanie kafelków i markera, przybliżenie geokodera, ochronę endpointu przed anonimowym
   użyciem, wszystkie standardy wod-kan, wybór żywicznej nawierzchni/fasady oraz raport zapisany w Supabase.
5. Rozszerzono katalog „Inne prace” o szczegółowe, zależne od zakresu etapy dla fundamentów, żelbetu, murowania,
   dachu, fasady, instalacji, stolarki oraz robót zewnętrznych. Pytania o powłokę i kolor fasady są pokazywane
   wyłącznie po wyborze tynku lub malowania; okładziny nie wymagają tych odpowiedzi.
6. Geokoder preferuje wynik z pasującym numerem domu. Mapa pozwala wskazać dokładny budynek kliknięciem, zapisuje
   współrzędne w istniejącym polu JSON `materials.locationPin` i odtwarza je przy ponownej edycji; zmiana adresu
   kasuje przypięty wcześniej punkt. Dokładny wynik z Nominatim dla Grabie 156a nie został osobno zweryfikowany.
7. Pozostawiono pracę lokalną. Nie konfigurowano hostingu, nie kasowano danych użytkowników i nie tworzono commita.

### Weryfikacja

- `pnpm exec supabase migration up --local` — **PASS** (brak nowych, niezaaplikowanych migracji).
- `pnpm --filter @asystent/schemas test` — **PASS** (17/17 testów).
- `pnpm typecheck` — **PASS** (11 zadań Turbo).
- `pnpm lint` — **PASS** (5 zadań Turbo).
- `pnpm test` — **PASS** (11 zadań Turbo).
- `pnpm db:test` — **PASS** (83 testy pgTAP).
- `pnpm exec supabase db lint --local --schema public --fail-on error` — **PASS**.
- `pnpm test:e2e` — **PASS** (6 scenariuszy w Microsoft Edge; mapa, geokodowanie, formularz i raport).
- `pnpm build` — **PASS** (8 zadań Turbo; dynamiczna trasa geokodowania używa `connection()`).
- `git diff --check` — **PASS** (bez błędów whitespace; Git ostrzega o normalizacji LF/CRLF).
- Dodatkowa regresja warunkowych pytań fasady: `pnpm --filter @asystent/schemas test` — **PASS** (19/19),
  `pnpm --filter web build` — **PASS**, `pnpm test:e2e` po świeżym buildzie — **PASS** (6/6 scenariuszy).
- Lokalny podgląd `http://127.0.0.1:3010/` — **PASS** po uruchomieniu końcowego buildu; HTTP 200, na mapie
  Warszawy widocznych 6 kafelków i 1 marker.

### Kontynuacja

Następnym krokiem jest sprawdzenie przez użytkownika przejścia od logowania przez formularz budowy do raportu
oraz ręczne wskazanie budynku Grabie 156a na mapie, jeśli Nominatim nadal zwraca tylko przybliżenie.
Wszystkie pozostałe etapy aplikacji nadal są w toku; nie wdrażać aplikacji na hosting.

## Sesja 21 — 12 października 2026

### Zrobione

1. Zweryfikowano istniejący katalog „Inne prace” bez nadpisywania zmian w worktree: kategorie ogólne prowadzą do
   zależnych etapów dla fundamentów i zbrojenia, żelbetu, murowania, konstrukcji/pokrycia dachu, fasady, instalacji,
   stolarki, ogrodzeń, nawierzchni, odwodnienia, tarasów, przyłączy, zieleni i rozbiórek.
2. Dodano regresję E2E, która po zapisaniu zlecenia z wieloma zakresami „Innych prac” odświeża stronę i sprawdza,
   że kategorie, zbrojenie fundamentu, pokrycie dachu, kolor elewacji i wielokrotny wybór nawierzchni są odtworzone.
3. Potwierdzono, że raport obejmuje zapisane opisy i wybory technologiczne. Aplikacja pozostała lokalna; bez migracji,
   wdrożenia i commita.

### Weryfikacja

- `pnpm --filter @asystent/schemas test` — **PASS** (19/19).
- `pnpm typecheck` — **PASS** (11 zadań Turbo).
- `pnpm build` — **PASS** (8 zadań Turbo).
- `pnpm lint` — **PASS** (5 zadań Turbo, ponownie po zmianie E2E).
- `pnpm test` — **PASS** (11 zadań Turbo).
- `pnpm test:e2e` — **PASS** (6/6; w tym trwałość szczegółów „Innych prac” po pełnym odświeżeniu).
- `git diff --check` — **PASS** (bez błędów whitespace; ostrzeżenia Git dotyczą normalizacji LF/CRLF).
- `GET http://127.0.0.1:3010/` — **PASS** (HTTP 200).
- Testy bazy — **NOT RUN** (brak zmian schematu bazy lub migracji).

### Kontynuacja

Poprosić użytkownika o sprawdzenie ankiety „Inne prace” w lokalnym podglądzie i zebrać brakujące kategorie lub etapy.
Nie wdrażać aplikacji ani nie wykonywać commita bez prośby użytkownika.

## Sesja 19 — 12 października 2026

### Zrobione

1. Uogólniono kategorie „Inne prace”: lista główna zawiera teraz m.in. „Ogrodzenie”, „Podjazd, ścieżki i
   nawierzchnie” oraz „Fasada / elewacja”. Materiały i wykonanie wybiera się dopiero w zależnych etapach ankiety.
   Starsze zapisane kategorie (np. ogrodzenie drewniane, nawierzchnia żywiczna) są mapowane do nowej kategorii,
   bez utraty zapisanych odpowiedzi technologicznych.
2. Umożliwiono swobodne przejście z „Dane budowy” do „Materiałów i technologii”. Walidacja kompletnego wniosku
   (obu zakładek) pozostaje przy przycisku „Zapisz budowę i przejdź do panelu”.
3. Rozdzielono pole ulicy/nazwy miejsca od numeru budynku/działki; przed zapisem są składane do dotychczasowego
   pola adresowego. Jeśli podano numer, endpoint przyjmuje tylko wynik geokodera z dokładnie takim numerem
   `house_number`, nie wykonuje fallbacku do centrum miejscowości i nie zapisuje przybliżonego punktu. Gdy
   dokładnego dopasowania brak, marker jest usuwany, a użytkownik może wskazać lokalizację ręcznie.
4. Zapisany ręcznie punkt nadal jest przechowywany w `materials.locationPin`. Nie dodano migracji bazy ani
   nowych zależności; zachowano istniejące niezacommitowane zmiany repozytorium.

### Weryfikacja

- `pnpm --filter @asystent/schemas test` — **PASS** (19/19).
- `pnpm --filter web build` — **PASS**.
- `pnpm typecheck` — **PASS** (11 zadań Turbo).
- `pnpm lint` — **PASS** (5 zadań Turbo).
- `pnpm test` — **PASS** (11 zadań Turbo).
- `pnpm build` — **PASS** (8 zadań Turbo).
- `pnpm test:e2e` — **PASS** (6 scenariuszy; ogólne kategorie, swobodne przejście zakładek, walidacja przy zapisie,
  brak fallbacku/markera dla niedopasowanego numeru oraz ręczne wskazanie i trwałość punktu).
- `git diff --check` — **PASS** (brak błędów whitespace; ostrzeżenia wyłącznie o normalizacji LF/CRLF).
- `GET http://127.0.0.1:3010/` — **PASS** (HTTP 200); po przebudowaniu zrestartowano lokalny podgląd, aby
  serwował aktualny build.

### Kontynuacja

Sprawdzić w lokalnym podglądzie wpisanie `Grabie` i `156a` w oddzielnych polach. Jeśli OpenStreetMap nie ma
dokładnego numeru domu, mapa celowo nie wskaże centrum Grabia; należy wskazać dokładny punkt kliknięciem.

## Sesja 22 — 12 października 2026

### Zrobione

1. Zastąpiono wyszukiwanie przez Nominatim osadzoną mapą Google, która otrzymuje pełne zapytanie z ulicą/nazwą
   miejsca, numerem budynku, miejscowością i kodem pocztowym. Wpisy są opóźniane o 700 ms, żeby nie przeładowywać
   mapy przy każdym znaku.
2. Link obok mapy otwiera Google Maps w nowej karcie. Zapisany wcześniej `locationPin` nadal wyszukuje w mapie
   współrzędne; edycja adresu czyści poprzedni punkt.
3. Usunięto endpoint Nominatim, zależności Leaflet i arkusz CSS Leaflet. Osadzona mapa Google nie udostępnia
   klikniętych współrzędnych aplikacji; tworzenie nowych punktów wymaga osobnej integracji Maps Platform.
4. E2E sprawdza zapytanie mapy dla adresu `Grabie 156a, Łapanów, 32-740, Polska` oraz jego aktualizację po zmianie
   adresu. Nie wysyła w teście adresu do Google, ponieważ żądania mapy są mockowane.

### Weryfikacja

- `pnpm typecheck` — **PASS** (11 zadań Turbo).
- `pnpm lint` — **PASS** (5 zadań Turbo).
- `pnpm test` — **PASS** (11 zadań Turbo; schemas 19/19).
- `pnpm install --frozen-lockfile` — **PASS**.
- `pnpm --filter web build` — **PASS**.
- `pnpm build` — **PASS** (8 zadań Turbo).
- `pnpm test:e2e` — **PASS** (6/6 scenariuszy).
- `git diff --check` — **PASS**.
- `GET http://127.0.0.1:3010/` — **PASS** (HTTP 200; lokalny podgląd po przebudowie).
- Dokładność wskazania domu przez Google Maps — **NOT VERIFIED**; E2E weryfikuje przekazane zapytanie, nie dane
  geograficzne ani właściwy marker Google.
- Testy bazy — **NOT RUN** (bez zmian schematu bazy lub migracji).

### Kontynuacja

Sprawdzić mapę w lokalnym podglądzie dla Grabie 156a i potwierdzić, czy wynik Google Maps wskazuje właściwy budynek.
Jeśli aplikacja ma zapisywać nowe współrzędne po kliknięciu Google Maps, wymaga to osobnej decyzji o Google Maps
Platform API i jej konfiguracji rozliczeń.

## Sesja 23 — 12 października 2026

### Zrobione

1. Wykonano pełny commit poprzednich zmian ankiety i map Google: `658666d`.
2. Zastąpiono przycisk kończący formularz przez „Przejdź dalej”. Po walidacji danych ogólnych i technologii
   zapisuje szkic budowy i zdjęcia, następnie otwiera dokumentację, zamiast przechodzić od razu do panelu.
3. Wspólny katalog dokumentacji pokrywa 28 obecnych kategorii innych prac. Dla domu i rozbudowy dobiera
   fundamenty, piwnicę, osobne kondygnacje, dach i branże. Same roboty pokryciowe pokazują wyłącznie dach.
4. Kolejne kroki pokazują wymagane rysunki i pozwalają zapisać robocze opisy pomiarów oraz źródła danych.
   Nawigacja, powrót do danych budowy i zapis szkicu zachowują odpowiedzi. Po przeładowaniu można otworzyć
   „Edytuj”, kliknąć „Przejdź dalej” i wznowić zapisany etap.
5. Dodano osobną tabelę szkiców dokumentacji, RLS i RPC z optymistyczną kontrolą rewizji. Nie zapisujemy
   dokumentacji w ograniczonym polu `materials`. Migracje zastosowano lokalnie, bez resetu bazy.
6. Dodano ścisłe kontrakty geometrii w mm, pochodzenia danych, kalibracji i propozycji AI; funkcje przeliczenia
   współrzędnych, kontroli obrysów i zatwierdzania. Propozycja AI nie może sama zatwierdzić obiektów lub zbrojenia.
7. Użytkownik wybrał OpenAI API z własnym kluczem i wymaga MCP. Nie pobierano klucza, nie przesyłano projektów
   do modelu i nie wykonano płatnych operacji.

### Weryfikacja

- `pnpm build`, `pnpm --filter web build`, `pnpm typecheck`, `pnpm lint`, `pnpm test` — **PASS**.
- Testy jednostkowe — **PASS**: 51 przypadków; geometria 7, schemas 32, domain 7, kalkulatory 3, tokeny 2.
- `pnpm db:test` — **PASS**: 93 asercje, w tym zapis, izolacja danych, odrzucenie błędnej treści i konflikt wersji.
- `pnpm exec supabase db lint --local --schema public --fail-on error` — **PASS**.
- `pnpm test:e2e` — **PASS**: 6 scenariuszy, w tym kontynuacja ankiety, awaria zapisu i ponowienie,
  odtworzenie odpowiedzi/bieżącego etapu po przeładowaniu oraz dach bez dokumentacji całego domu.
- `git diff --check` — **PASS**.

### Niezakończone

- **NOT RUN:** pełna akceptacja nowego zadania. Katalog i pola tekstowe nie są pełną, ilościową ankietą CAD.
- **NOT RUN:** edytor geometrii, import PDF/obrazów, korekcja perspektywy, nakładka źródła i kalibracja w UI.
- **NOT RUN:** konfiguracja szyfrowanego BYOK, rozpoznawanie OpenAI, serwer MCP, audyt i trwałe zatwierdzenia.
- **NOT RUN:** automatyczny przedmiar i przekazanie zweryfikowanej dokumentacji wykonawcom.

### Kontynuacja

Nie oznaczać zadania jako zakończonego. Następny etap to rysowanie/import z prywatnym zapisem dokumentów,
kalibracją i ręczną weryfikacją, następnie OpenAI/BYOK oraz uwierzytelnione MCP na wspólnych przypadkach użycia.
Obecne pola pomiarów są opisami roboczymi, nie danymi nadającymi się automatycznie do kalkulacji.
Istniejąca publikacja zlecenia nadal publikuje bazowy raport, nie zatwierdzony projekt CAD.

## Sesja 24 — 12 października 2026

### Zrobione

1. Po korekcie użytkownika zastąpiono widok opisów przez pełnoszerokościowy edytor projektu z płótnem,
   zakładkami etapów/rysunków, paskiem narzędzi, listą elementów i panelem właściwości. Opisy są dodatkiem
   w zwijanej sekcji pod płótnem.
2. Dodano rysowanie ław, ścian, płyt/obrysów, połaci, prętów, wymiarów i opisów, przesuwanie elementów,
   edycję współrzędnych/parametrów, warstwy, pan/zoom/dopasowanie, undo/redo i eksport SVG.
3. Każdy rysunek ma osobny szkic w `cad_drawings`. Automatyczny zapis z rewizją przeżywa odświeżenie.
   Awaria zachowuje lokalne zmiany i blokuje przejście do czasu ponowienia. Konflikt innej karty nie nadpisuje danych.
4. Dodano „Skanuj lub importuj projekt”: zdjęcie lub wybrana strona PDF, lokalny raster PDF.js, prywatny
   oryginał oraz PNG strony, zgoda na transfer i koszty, konfiguracja/usuwanie szyfrowanego klucza per użytkownik.
5. Adapter OpenAI Responses API analizuje wybrany etap, a domena waliduje rozpoznane odcinki, obrysy i opisy.
   Propozycja trafia na to samo płótno jako edytowalna, niezatwierdzona geometria z pochodzeniem i confidence.
   Nie wymyślamy przekrojów/stali ani ilości na podstawie samego obrysu.
6. Ustawienie skali dwoma punktami reskaluje podkład i obiekty razem. Bez kalibracji UI ostrzega, że mm są
   tymczasowe. Rozpoznane obrysy nie mogą stać się podstawą zatwierdzonego przedmiaru bez klasyfikacji i parametrów.
7. Dodano trzy nieusuwające danych migracje, RLS, serwerowe RPC zapisu i atomowy limit 10 prób analizy/godzinę.
8. Test prostego rysunku wykrył spłaszczenie widoku przy odczycie pojedynczego odcinka przed montażem SVG.
   Poprawiono dopasowanie proporcji także przy zmianie rozmiaru płótna; test rysuje i sprawdza cztery różne narożniki.

### Weryfikacja

- `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm install --frozen-lockfile` — **PASS**.
- `pnpm test` — **PASS**: 57 testów; schemas 32, domain 11, geometria 9, kalkulatory 3, tokeny 2.
- `pnpm db:test` — **PASS**: 108 asercji w 5 plikach.
- SQL lint — **PASS**; kontrola edytora VS Code — **PASS**.
- `pnpm test:e2e` — **PASS**: 7 scenariuszy. Nowy test obejmuje odcinek, edycję, undo/redo, awarię/retry autosave,
  odświeżenie, osobne rysunki zbrojenia, obrys, eksport SVG, uprawnienia API, szyfrowany zapis klucza,
  propozycję AI z mocka, kalibrację z błędem ekranowym <0,01 mm, import PDF i brak overflow mobile.
- Kontrola screenshotów desktop/mobile — **PASS**. Wynik na płótnie pochodzi z testowego mocka AI.

### Ograniczenia / kontynuacja

- Rzeczywiste rozpoznawanie OpenAI — **BLOCKED**: brak skonfigurowanego klucza użytkownika i szyfrowania serwera.
  Nie wykonano płatnego wywołania ani transferu prywatnego projektu.
- Dokładność AI na zestawie projektów referencyjnych — **NOT RUN**. Testy geometrii i mocka nie są tym dowodem.
- Korekcja perspektywy, pełny asortyment narzędzi zbrojeniowych/3D, trwała historia wersji, MCP, audyt
  i limit wydatków w PLN — **NOT RUN**; obecny limit dotyczy liczby prób, nie kwoty.
- Ręcznie dodawane obiekty mają jawnie robocze parametry do uzupełnienia z projektu. Wszystkie rysunki są szkicami.
- Podłączyć niesensytywny projekt referencyjny po konfiguracji BYOK i zgodzie na rozliczenia; sprawdzić
  rzeczywistą jakość przed rozszerzaniem automatycznego przedmiaru lub przekazaniem projektu wykonawcom.

## Sesja 25 — 12 października 2026

### Zrobione

1. Dane budowy, technologie i projekt korzystają z tej samej szerokiej przestrzeni i nawigacji.
   Dodano numerowane, klikalne kroki rysunków: zielony to zapisany niepusty szkic, czerwony pusty dokument.
   „Przejdź dalej” przechodzi kolejno po rysunkach, nie pomija przekrojów ani zbrojenia etapu.
2. Usunięto sekcję „Dane szczegółowe etapu i źródła pomiarów” z UI bez usuwania starszych wpisów.
3. Zoom kółkiem zachowuje punkt pod kursorem; przyciski skalują wokół środka. Dodano osie, linijki
   i odczyt X/Y w mm. Przyciąganie jest regulowane, również 0 mm. Fit centruje również wąskie rzuty.
4. Wspólny katalog narzędzi rozróżnia ławy, stopy, ściany fundamentowe, słupy, belki, nadproża, wieńce,
   płyty, połacie, krokwie, otwory, warstwy/obszary wykończenia, nawierzchnie, obrzeża, ogrodzenia i trasy.
   Profile zależą od rodzaju i funkcji rysunku; API również odrzuca np. dach rysowany w fundamentach.
5. Ściany mają automatyczne linie wymiarowe i przerywane pomocnicze. Połączone końce mają uchwyty;
   ruch narożnika/elementu aktualizuje połączenia oraz związane otwory. Osie nie są węzłami konstrukcyjnymi.
6. Warstwy materiałowe mają funkcję, materiał, stronę i grubość mm; izolacja ma widoczne oznaczenie.
   Materiały ankiety są podpowiedzią, a nie domyślną grubością. Dla obrysów pas warstwy nie zastępuje przekroju.
7. Kopiowanie zapisanych rzutów zachowuje otwory i źródłową rewizję. Kopie są podkładami, nie dodatkowymi
   ilościami. Dodano automatyczne rozwinięcia ścian z jawnych wysokości i otworów, bez generowania konstrukcji.
8. Kreator belki/siatki rysuje edytowalne układy, opisy i wymiary z danych użytkownika.
   Strzemiona w rzucie są oznaczone jako projekcja i nie mogą udawać długości prętów do przedmiaru.
9. Skalibrowane obrysy AI można przypisać do typowanego elementu aktualnego etapu.
   Pochodzenie i confidence pozostają zachowane; parametry trzeba uzupełnić z dokumentacji.

### Weryfikacja

- Testy geometry/schemas/domain — **PASS**: 10 + 32 + 18 = 60 testów w zmienianych pakietach.
- Web build, `pnpm typecheck`, `pnpm lint`, `git diff --check` — **PASS**.
- Pełny Playwright — **PASS**: 8/8; w tym zoom, połączenia, ocieplenie, statusy, reuse, rozwinięcia,
  zbrojenie, refresh, klasyfikacja AI oraz edytory nawierzchni/elewacji/dachu i odrzucenie niewłaściwego typu przez API.
- Pierwsze iteracje — **FAIL**: naprawiono typowanie pustych punktów fabryki oraz jednoznaczne etykiety select;
  testy myszy przewijają teraz płótno do viewportu przed gestem. Końcowe kontrole — **PASS**.
- Baza pgTAP — **NOT RUN** w tej sesji: brak zmian SQL; izolacja dostępu nadal pokryta E2E API.

### Niedokończone wymagania użytkownika

- Pełne przeniesienie dowolnego projektu branżowego 1:1 — **NOT RUN**. Brakuje m.in. łuków/haków i
  pełnych rozwinięć gięcia, przekrojów konstrukcyjnych z poziomami, rozbudowanych detali i parametrycznych zestawień.
- Obecne rozwinięcie ścian nie jest automatycznym przekrojem budynku/stropu/fundamentu.
- Rzuty zbrojenia nie zastępują fizycznych kształtów prętów i zestawienia mas.
- Kopie nie synchronizują zmian źródła; otwory powierzchniowe nie mają jeszcze kompletnej topologii i odejmowania.
- Dokładny, zweryfikowany przedmiar, odbiór konstrukcyjny, przekazanie wykonawcy, MCP — **NOT RUN**.
- Rzeczywiste AI — **BLOCKED** do konfiguracji BYOK/szyfrowania i zgody na płatny test.
- Następny krok: model poziomów i przekrojów, powiązania otworów powierzchniowych, rozwinięcia prętów
  i obliczenia na potwierdzonych parametrach; test odwzorowania na niesensytywnym projekcie referencyjnym.

## Sesja 26 — 12 października 2026

### Zrobione

1. Uproszczono nawigację: jeden numerowany etap z podpunktami rysunków. Usunięto „Etap dokumentacji”
   oraz powtórzony pasek etapów. Czerwony etap ma brakujące rysunki; zielony wymaga zapisania wszystkich.
2. Ruch narożnika i elementu ma podgląd podczas gestu, bez snapu do siatki i początkowego skoku do uchwytu.
   Zwolnienie myszy dodaje jedną operację undo; anulowanie usuwa podgląd. Nawigacja jest blokowana podczas
   gestu i niezakończonego zapisu; podgląd nie trafia do autosave.
3. Zewnętrzny obrys rdzenia ściany/ławy ma wymiary długości i szerokości. Dodano gabaryty rzutu fundamentów.
   Stopy i słupy rysuje się narożnik–narożnik; długość/szerokość zmienia rzeczywiste wierzchołki prostokąta.
   Dostępność płyty odpowiada zapisanej technologii także w API.
4. Dla ściany fundamentowej wybiera się podparcie spośród technologii budowy i przepisuje parametry z projektu.
   Ława jest tworzona automatycznie i aktualizuje się razem ze ścianą. Płyta powstaje po zamknięciu obwodu,
   z projektową grubością i wysunięciem poza zewnętrzne lico. Rozgałęzienia i sprzeczne parametry są odrzucane.
5. Ocieplenie i hydroizolację z ankiety przypisuje się ścianie po podaniu projektowej grubości i strony.
   Canvas pokazuje oznaczenie warstwy, grubość i legendę zamiast powielania długich nazw na każdej ścianie.
6. Przejrzano MASTER_SPEC i aneks importu. Fundamenty mają czwarty podpunkt detali izolacji, odwodnienia
   i przejść oraz zapisywane referencje: rzut, przekroje/rzędne, zbrojenie, izolacje, geotechnika, materiały,
   instalacje. Nie są to automatycznie zatwierdzone ani wygenerowane dokumenty projektanta.
7. Kreator zbrojenia jest osobnym, responsywnym dialogiem: graficzny przekrój z uchwytem i wymiarami,
   pręty górne/dolne, strzemiona, otulina, stal i miejsce ułożenia. Zapisuje rzut i detal na głównym canvas.
   Układ może należeć do ściany/ławy/belki bieżącego rysunku lub skopiowanego podkładu.
   Ruch/obrót podparcia przenosi układ; zmiana długości ustawia ostrzeżenie, bez rozciągania prętów.
8. API odrzuca podparcie niezgodne z ankietą lub geometrią ściany. Kopie przepisują ID zależnych podpór,
   podparć zbrojenia i grup. Izolacja użytkowników, autosave/retry, skan i kalibracja pozostają pokryte regresją.
9. Zrestartowano lokalny podgląd na porcie 3010 z końcowego builda, bez przeładowywania formularza użytkownika.

### Weryfikacja

- Geometry/schemas/domain — **PASS**: 13 + 32 + 23 = 68 testów w zmienianych pakietach.
- Produkcyjny Web build, `pnpm typecheck`, `pnpm lint`, `git diff --check` — **PASS**.
- Pełny Playwright Edge — **PASS**: 10/10; ruch widoczny przed mouseup co 1 px (bez skoku 100 mm),
  pojedyncze undo/redo, zewnętrzne 5240/240 mm, zmiana stopy do 1800×1200 mm, trwałość po reload.
  Nowy scenariusz obejmuje zależną ławę, automatyczną płytę, izolacje, odrzucenie rozjechanej ławy przez API,
  graficzny kreator, przypisanie do podkładu, zapis przekroju i ostrzeżenie po zmianie długości podparcia.
- Dialog desktop/mobile i screenshoty — **PASS**; przy 390 px dialog nie ma poziomego overflow.
  Po końcowej kontroli proporcji SVG ponowiono build/lint i scenariusz fundamentów — **PASS** (1/1);
  przesunięcie uchwytu przekroju o 5 px daje dokładnie oczekiwaną zmianę mm w obu kierunkach.
- Podgląd aplikacji i PDF worker — **PASS**: HTTP 200.
- Pierwsze iteracje — **FAIL**: poprawiono typ grubości rdzenia, położenie eksportu helpera i narrowing listy
  podpór; poprawiono lint handlera oraz nieaktualne etykiety/selektory nowego testu.
  Test współrzędnych odsuniętej płyty stosuje tolerancję 0,000001 mm, nie ścisłą równość float.
- pgTAP — **NOT RUN**: brak zmian SQL; nowe relacje sprawdzają testy domain i API/E2E.
- Rzeczywiste OpenAI — **BLOCKED**; brak płatnego wywołania.

### Kontynuacja i ograniczenia

- Pełny CAD projektu 1:1, fizyczne kształty gięcia z hakami/łukami i zweryfikowany przedmiar — **NOT RUN**.
- Ławy/płyta są szkicem odtworzonym z jawnych parametrów, nie doborem nośności.
  Dla stóp, pali i nietypowego/istniejącego posadowienia układ podpór przenosi się ręcznie z projektu.
- Brakuje pełnych przekrojów z poziomami, warstwami w pionie i automatycznej kontroli kolizji/zestawień.
- Wymiary rdzenia i gabaryty nie zastępują wszystkich łańcuchów wymiarowych dowolnego projektu.
  Połączone pasy nie są jeszcze ujednoliconą bryłą do obliczenia objętości bez podwójnych przecięć.
- Źródłowe podkłady nadal nie synchronizują się z wcześniejszym dokumentem; związany układ śledzi tylko
  podparcie w bieżącym rysunku. Zmiana długości wymaga odtworzenia układu z projektu.

## Sesja 27 — 12 października 2026

### Zrobione

1. Przyciąganie końców działa podczas rysowania i przeciągania narożnika: 12 px niezależnie od zoomu,
   priorytet końca przed odcinkiem ściany. Zielony znacznik wskazuje połączenie. Można je wyłączyć,
   niezależnie od przyciągania siatki; płynny ruch i undo/redo zachowano.
2. Wspólne końce są trwałym połączeniem: narożnik przesuwa wszystkie dochodzące odcinki. Można złapać
   narożnik także blisko końca niezaznaczonego elementu. Połączenie T dzieli ścianę i przepisuje właściciela
   otworów. Połączenie wewnątrz otworu lub podział hosta zbrojenia daje jawny błąd.
3. Zależne ławy/płyty pozostają zsynchronizowane po podziale ściany. Testy sprawdzają T na obwodzie płyty,
   ścianę wewnętrzną oraz trzy ławy pod dochodzącymi odcinkami.
4. Canvas zajmuje pełną szerokość (przy 1440 px ponad 1250 px, wysokość co najmniej 640 px).
   Panel z obrazka i inspektor przeniesiono pod płótno; powiększono teksty i zgrupowano parametry
   fundamentów: ściana, podparcie, izolacje. Referencja dokumentacji jest opcjonalną sekcją rozwijaną.
5. Technologia podpowiada materiał; bloczki 24/25/30 cm ustawiają grubość 240/250/300 mm z możliwością
   ręcznej zmiany. Dodano bloczek szalunkowy 24 cm. Nie zgadujemy grubości wariantów bez podanego wymiaru.
6. Ściany są niebieskie, ławy bursztynowe, stopy fioletowe, słupy różowe, płyty turkusowe, wykopy ochrowe.
   Legenda opisuje kolory; zaznaczenie zmienia obrys, nie usuwa koloru roli. Dodano zwymiarowany obszar
   wykopu i pole „Głębokość wykopu (mm)”, bez automatycznego doboru czy przedmiaru ziemnego.

### Weryfikacja

- `pnpm --filter @asystent/schemas test`, `pnpm --filter @asystent/domain test` — **PASS**: 32 + 27 testów.
- Web build, `pnpm typecheck`, `pnpm lint`, `git diff --check` — **PASS**.
- Pełny Playwright Edge — **PASS**: 11/11. Nowy scenariusz sprawdza połączenie w odległości 7 px,
  wspólny ruch obu ścian przed puszczeniem myszy, undo, zamknięty obrys, węzeł T, kolory trzech ról,
  automatyczne 240 mm z technologii, pełne wymiary canvas i położenie panelu pod nim oraz reload.
- Desktop/mobile — **PASS**; 390 px bez poziomego overflow, panel nadal pod canvas.
- Pierwsze iteracje nowego testu — **FAIL**: ścisłą równość float zastąpiono tolerancją 0,001 mm;
  po undo/fit gest startował poza canvas, poprawiono współrzędne scenariusza do aktualnego widoku.
- Geometry tests — **NOT RUN**: brak zmian w pakiecie geometrii; dotychczasowe 13/13 pozostaje historycznym wynikiem.
- Baza pgTAP — **NOT RUN**: brak SQL; regresja uprawnień/zapisu objęta E2E.
- Rzeczywiste OpenAI — **BLOCKED**: bez klucza i płatnego wywołania.

### Kontynuacja

Pełny CAD 1:1, objętości po usunięciu nakładających się pasów, pionowe przekroje/poziomy, gięcie prętów
i zatwierdzony przedmiar pozostają **NOT RUN**. Przy podziale ściany z przypisanym zbrojeniem trzeba
usunąć układ i odtworzyć go na nowym podparciu; aplikacja nie zgaduje zmiany rozwiązania konstrukcyjnego.

## Sesja 28 — 12 października 2026

### Zrobione

1. Parametry ściany/podparcia zapisują się przy wpisywaniu, także bez geometrii i przy niekompletnych polach.
   Usunięto „Zastosuj do nowych ścian”. Nowe ściany używają poprawnych bieżących parametrów, istniejące
   zmienia się jawnie. Kolejny rysunek dziedziczy zapisane ustawienia fundamentów; refresh ich nie resetuje.
2. Strony wewnętrzna/zewnętrzna/obie dotyczą hydroizolacji. Ocieplenie jest niezależnie zewnętrzne,
   z rombowym symbolem, rzeczywistą grubością i ciągłością na licach narożników. Przy otwartym obrysie
   albo ścianach wewnętrznych aplikacja wymaga zamknięcia lub ręcznego wyboru strony.
3. Wymiary mają globalne rozmieszczenie etykiet, białe maski i ekranowe minimum 13 px. Usunięto
   redundantne powtórzenia jednakowych szerokości; gabaryty i pozycje podpór pozostają zwymiarowane.
4. Węzły X dzielą obie ściany na cztery połączone końce. T i X zachowują otwory, podpory i ich referencje.
   Stopa/słup dotykający ściany podąża za ruchem i obrotem. Wymiary rzeczywiste nie zmieniają się przez
   obrót; prostokąt można także zmieniać liczbowo w jego lokalnych osiach.
5. Oznaczenia W/SF/L/ST/S/P/B/WF/N są trwałe i edytowalne; walidacja nie dopuszcza duplikatów.
   Starsze elementy otrzymują oznaczenia przy wczytaniu. Słupy/stopy mają rozmiar X × X wewnątrz symbolu,
   wymiary względem hosta i X/Y względem gabarytu także dla podpór wolnostojących.
6. Usunięcie ściany odczepia słup/stopę/opis bez kasowania symbolu. Undo odtwarza relacje.
   Wykop rysuje się teraz pasem jak ścianę, z szerokością, głębokością i kolorem; stare obszary zachowano.
7. Zamknięte pola pokazują m² w świetle ścian, także po podziale i ze ślepo zakończonymi ścianami.
   Nowa opcja „Płyta denna między ławami” jest niezależna od płyty fundamentowej. Parametry wpisuje się
   pod canvas; kliknięcie pola ław wstawia powiązaną płytę, która podąża za obwodem.
8. Opis powstaje przez przeciągnięcie od elementu do wolnego miejsca. Tekst i czcionkę zmienia się
   bezpośrednio przy canvas. Legenda w prawym dolnym rogu obejmuje technologie, parametry i referencje;
   ma rezerwowany pas przy dopasowaniu widoku i przycisk ukrywania. Wyróżniono przyciski historii/widoku.
9. Skala arkusza 1:10–1:1000 jest trwała i niezależna od zoomu/kalibracji. Eksport SVG otrzymuje fizyczne
   wymiary według skali i tekst wymiarowy 2,5 mm na arkuszu.
10. API odrzuca płytę denną bez wyboru technologii oraz niespójne położenie podpór/płyty.
    Poprawiono race statusu autosave: zapis poprzedniej rewizji nie pokazuje sukcesu dla nowszych zmian.

### Weryfikacja

- Schemas / geometry / domain — **PASS**: 32/32 + 13/13 + 35/35.
- Produkcyjny Web build, workspace typecheck i lint — **PASS**.
- Pełny Playwright Edge — **PASS**: 12/12. Nowy scenariusz mierzy faktyczne ramki renderowanego tekstu
  i ich brak kolizji, weryfikuje czytelność, pusty rysunek z zapisanymi ustawieniami po refresh, dziedziczenie,
  symbole izolacji, słup podążający za ścianą, usunięcie hosta i undo, płytę kliknięciem, opis i skalę SVG,
  niezmieniony zoom przy zmianie skali, ruch czterech końców X i mobile 390 px bez overflow.
- API w E2E — **PASS**: HTTP 400 dla zmienionej geometrii płyty i starej ramy przyczepienia.
- Iteracje — **FAIL**: nowy wymagany etap zakłócał stare ankiety; zachowano nieokreślony, opcjonalny wybór
  i usunięto „zgodnie z projektem” z pytania tak/nie. Poprawiono kolejność kompilacji zależności, deklarację
  rozmiaru tekstu i stare asercje symboli. Test belki wykrył przedwczesny status autosave — poprawiono przyczynę.
- pgTAP — **NOT RUN**: bez zmian SQL; brak resetu danych.
- Rzeczywiste AI — **BLOCKED**: bez klucza i płatnego wywołania.

### Kontynuacja / granice

Powierzchnie pól nie odliczają stóp, słupów ani otworów w podłodze. Zmiana podziału pola istniejącej płyty
wymaga jej usunięcia i ponownego wskazania. Host z przypisanym zbrojeniem nadal wymaga usunięcia układu
przed podziałem. Identyfikatory S1/ST1 przygotowują przyszłe projektowanie zbrojenia podpór, nie dobierają
belki ani rozwiązania konstrukcyjnego. Pełny CAD 1:1, fizyczne gięcie, ujednolicone bryły i zatwierdzony
przedmiar pozostają **NOT RUN**.

## Sesja 29 — 12 października 2026

### Zrobione

1. Dwuklik na opisie otwiera edycję tekstu wewnątrz SVG, także w trybie płyty. Enter/blur zapisuje,
   Escape anuluje. Przechwycenie myszy dla opisu zaczyna się dopiero przy przeciąganiu, nie blokując dwukliku.
2. Przycisk „Wyczyść canvas” jest obok historii/eksportu. Potwierdzenie czyści elementy, podkład i kalibrację
   bieżącego arkusza; ustawienia pozostają. Cofnij odtwarza dokument. Nie usuwamy plików z Storage.
3. Prawy przycisk myszy z przeciąganiem przesuwa widok w każdym narzędziu; bez geometrii i menu kontekstowego.
4. Symbol ocieplenia powiększony 10× wzdłuż ściany, bez zmiany projektowej grubości warstwy.
5. Wymiary podzielonych T/X odcinków nie doliczają zakończeń rdzenia na wspólnych węzłach.
   Stopy i słupy mają położenie wzdłuż i prostopadle do lic hosta/najbliższej ściany, nie gabarytu rysunku.
   Projekcja poza końcem ściany pozostaje prostopadła; nie powstaje mylący wymiar ukośny.
6. Oba warianty płyty w fundamentach są wybierane kliknięciem zamkniętego pola ław. Nowe narzędzie
   „Pomieszczenie z piwnicą” jest warunkowane `basement=true`, także na API, i aktualizuje pole z ławami.
   Płyta i piwnica mogą być w tym samym polu, niezależnie. JSON pozostaje kompatybilny, bez migracji.
7. Blokada edytora podczas zmiany rysunku zapobiega kliknięciu/przeciąganiu poprzedniego arkusza.

### Weryfikacja

- Schemas **PASS** 32/32; domain **PASS** 38/38, w tym łańcuch X, najbliższa ściana i pole piwnicy.
- Web build, workspace typecheck/lint **PASS**. Pełna regresja Playwright **PASS** 13/13;
  dodatkowa kontrola czyszczenia podkładu importu i cofania jest raportowana w TEST_REPORT.
- E2E obejmuje dwuklik/Enter/Escape, wszystkie dostępne tryby prawego przeciągania, symbol 10×,
  piwnicę i płytę po reload, API 400 bez piwnicy oraz wybór płyty fundamentowej bez płyty dennej.
- Iteracje **FAIL**: stare testy zakładały ręczny wielokąt płyty; używają teraz narzędzia otworu
  do regresji wielokątów. Naprawiono przechwytywanie dwukliku i aktywność starego arkusza podczas nawigacji.
- pgTAP **NOT RUN** (bez SQL); rzeczywiste OpenAI **BLOCKED** (bez klucza/płatnego wywołania).

### Granice

Piwnica to oznaczenie wybranych pomieszczeń, nie wygenerowany projekt konstrukcyjny. Podział już
zaznaczonego pola wymaga usunięcia oznaczenia i ponownego wyboru. Pełny CAD i zatwierdzony
przedmiar pozostają **NOT RUN**.

## Sesja 30 — 12 października 2026

### Zrobione

1. Wspólna paleta rysunku i wymiarów: niebieskie ściany, pomarańczowe ławy, zielone wykopy;
   stopy/słupy zachowują własne kolory. Generowane ławy mają także wymiary długości.
2. Wymiary obu nierównych lic każdego odcinka wynikają z przecięć rzeczywistych krawędzi.
   T/X, narożniki i połączenia ukośne uwzględniają szerokość sąsiedniego elementu, nie kończą się na osi.
3. Liczbowa zmiana elementu przesuwa jego wspólne węzły, tak jak przeciąganie. Wymiary wynikają
   z pełnej aktualnej topologii, także gdy część warstw jest ukryta. Ręczny wymiar geometryczny
   podąża za węzłem; jawna wartość referencyjna nie jest nadpisywana.
4. Położenia podpór mają krótkie etykiety `ST1 → SF3 : 4500 mm`, 12 px i odnośnik do symbolu.
   Układ sprawdza rzeczywiste obrysy ścian/podpór zamiast dużych prostokątów ukośnych elementów.
   Pola pomieszczeń/płyt nie wypychają opisów na zewnątrz całego budynku.
5. SVG przelicza etykiety i maski dla fizycznego fontu 2,5 mm na arkuszu. Ekranowy układ
   i font podpór wracają natychmiast po eksporcie, bez zmiany widoku.

### Weryfikacja

- Geometry **PASS** 13/13; domain **PASS** 43/43, w tym pięć nowych scenariuszy.
- Pełna regresja Edge **PASS** 14/14. Po końcowej zmianie eksportu dodatkowy E2E **PASS** 2/2:
  dokładne wartości obu lic, kolory, żywy ruch węzła, liczbowe przesunięcie, undo/redo/reload,
  cztery oddalenia/siedem przybliżeń, brak kolizji etykiet oraz papierowy font i przywrócenie widoku.
- Web build/lint, workspace typecheck/lint **PASS**. Diagnostyka zmienionych plików **PASS**.
- Podgląd na porcie 3010 zrestartowany po końcowym build; aplikacja i worker PDF **PASS** HTTP 200.
- Pierwsze iteracje **FAIL**: stare oczekiwania osiowych długości i opisów; zbyt mały font
  przy stałej wielkości modelowej; odczyt dokumentu po reload przed zakończeniem ładowania.
  Poprawiono oczekiwania na rzeczywiste lica, zachowano minimum zwykłych wymiarów i dodano oczekiwanie.
- pgTAP **NOT RUN** (bez SQL); OpenAI rzeczywiste **BLOCKED** (bez płatnego wywołania).

### Granice i dalej

Pełny CAD dowolnego projektu i zatwierdzony przedmiar pozostają **NOT RUN**. Rozbudowane rzuty
mogą wymagać rozdzielenia arkuszy; nie deklarujemy pełnej czytelności dowolnej liczby wymiarów.
Dalszy etap to weryfikacja przeniesienia rzeczywistych projektów i reguł obliczeń, nie automatyczne
zatwierdzanie konstrukcji.

## Sesja 31 — 12 października 2026

### Publikacja repozytorium

- Na prośbę użytkownika przygotowano pierwsze wysłanie projektu wraz z historią gałęzi `master`
  do `https://github.com/KursaP442/Asystent_Budowlanca`.
- Ostatni commit funkcjonalny: `1384cd2` — poprawki wymiarowania CAD.
- Kontrola dostępu i pustej historii zdalnej przez `git ls-remote`: **PASS**.
- Kontrola śledzonych plików konfiguracyjnych i wzorców kluczy w historii: **PASS**;
  śledzony jest tylko przykładowy plik środowiska z placeholderami. Lokalne sekrety i buildy
  pozostają poza repozytorium. Kontrola wzorców nie jest pełnym audytem bezpieczeństwa.
- Testy kodu: **NOT RUN** w tej sesji (bez zmian kodu; wyniki sesji 30 pozostają aktualne).
- Publikacja źródeł nie uruchamia hostingu, płatnych usług ani migracji bazy.
- `origin` skonfigurowany; `git push -u origin master`: **BLOCKED** — brak uwierzytelnienia GitHub,
  Git nie może zapytać o poświadczenia w nieinteraktywnej sesji. Użytkownik wybrał logowanie
  przez VS Code; po jego potwierdzeniu ponowić push i porównać zdalny hash z lokalnym HEAD.
- Ponowna próba po logowaniu VS Code: **BLOCKED** — Git wymagał osobnych poświadczeń.
  Za zgodą użytkownika wykonano logowanie przeglądarkowe Git Credential Manager.
- `git push -u origin master`: **PASS** — projekt z historią wysłany; gałąź śledzi `origin/master`.
  `git ls-remote origin refs/heads/master`: **PASS** — zdalny hash zgodny z lokalnym HEAD
  `123d704defe2ef9ff14949320a8e7d9aa00e45b0` podczas kontroli pierwszej publikacji.

## Sesja 32 — 12 października 2026

### Zrobione

1. Użytkownik wskazał GitHub jako bieżące repozytorium: po zweryfikowanych zmianach commit i push
   do `origin/master`, bez force push. Przed pracą wykonano fetch i sprawdzono zgodność gałęzi.
2. Domyślnie jeden wymiar długości na odcinek ściany, po zewnętrznym rzeczywistym licu.
   Generowane ławy nie dublują widocznych ścian; przy ukryciu ścian ich wymiary są dostępne.
   Usunięto z domyślnego widoku dodatkowe grubości i gabaryty, nie geometrię ani parametry.
3. „Wymiary szczegółowe” odsłania oba nierówne lica, ławy, grubości i gabaryty.
   Przełączenie nie zapisuje/wczytuje dokumentu i nie gubi niezapisanych edycji. Reload wraca do uproszczenia.
4. Podpora ma jeden opis obu współrzędnych „wzdłuż / prostopadle” oraz lokalny odnośnik.
   Nie rysujemy przez cały budynek linii położenia podpór. Etykiety szukają miejsca z czterech stron symbolu.
   Linie długości omijają konstrukcję, a pomocnicze kreski mają ograniczoną długość.
5. SVG eksportuje wybrany wariant wymiarowania. Obejrzano screenshot ukośnego obrysu z odgałęzieniem T:
   sześć ścian = sześć wymiarów długości, dwie podpory = dwa zwarte opisy.

### Weryfikacja

- Domain **PASS** 46/46; trzy nowe scenariusze: liczba wymiarów i kierunki ścian, ukośny obrys/T
  z nieprzecinaniem konstrukcji oraz zerowa stacja podpory.
- Web build/lint i workspace typecheck **PASS**; diagnostyka zmienionych TS/TSX **PASS**.
- Podgląd na porcie 3010 zrestartowany; aplikacja i worker PDF **PASS** HTTP 200/200.
- Pełna regresja Edge **PASS** 15/15; nowy E2E mierzy 8 etykiet zamiast ponad 16 w szczegółach,
  długość kresek pomocniczych, brak kolizji ramek, eksport, przełączenie i zachowanie encji.
- Iteracje **FAIL**: test ukrywał złą warstwę; zmienny callback fit wyzwalał ponowne wczytanie
  dokumentu przy przełączeniu — ustabilizowano callback. Próby pionowego rozmieszczania podpór
  nadal odsuwały opisy; dodano boczne miejsca. Po trzech próbach potwierdzono z użytkownikiem
  pozostawienie trybu szczegółowego. Test bliskości mierzy odległość od symbolu, nie tylko jego środka.
- Równoległy lint/E2E **FAIL**: Playwright usuwał katalog wyników podczas skanowania ESLint;
  końcowy lint uruchomiony po E2E **PASS**, bez zmiany konfiguracji.
- SQL **NOT RUN** (bez migracji); OpenAI rzeczywiste **BLOCKED** (bez płatnych wywołań).

### Granice / dalej

Pełny CAD dowolnego projektu i zatwierdzony przedmiar **NOT RUN**. Tryb szczegółowy świadomie pokazuje
więcej danych i nadal może wymagać osobnych arkuszy. Nie kasowano danych użytkownika ani nie
odświeżano jego formularza.

## Sesja 33 — 13 października 2026

### Podgląd w GitHub Codespaces

- Dodano `pnpm dev:web`, który buduje zależności workspace Web i uruchamia Next.js na `0.0.0.0:3000`.
- Do README dodano instrukcję przekierowania portu `3000` i otwierania prywatnego linku Codespaces.
- Serwer działa pod portem 3000; zmiany źródeł są obsługiwane przez standardowy hot reload Next.js.
- Supabase nie uruchomił się w tym Codespace: Realtime nie uzyskał połączenia z PostgreSQL podczas migracji.
   Strona renderuje ekran wymaganej konfiguracji; logowanie i zapis są **BLOCKED** do czasu uruchomienia backendu.
- `pnpm db:status` potwierdziło brak kontenera bazy. Próba `supabase start --exclude realtime` również nie ominęła
   błędu migratora Realtime. Nie zmieniono konfiguracji projektu ani nie resetowano danych.
- Smoke test HTTP **PASS** (200), tytuł strony **PASS**. Pierwszy start zwrócił 500 z powodu niebudowanych pakietów
   workspace; komendę startową poprawiono i ponowiono z wynikiem PASS.
- Web lint i workspace typecheck **PASS** (13 zadań).
- Nie zmieniano istniejącego `package-lock.json` ani danych backendu.

## Sesja 34 — 13 października 2026

### Testowanie bez logowania

- Dodano wejście developerskie do trybu demo, widoczne tylko przy `next dev` i braku konfiguracji Supabase.
- Demo nie tworzy fikcyjnej sesji ani nie wywołuje API. Udostępnia istniejący pełny formularz klienta, walidację
   technologii, dokumentację i ręczny CAD; ankieta startuje z walidowanym przykładem domu. Szkice są zapisywane
   w localStorage przeglądarki.
- Test schematów ankiety **PASS** (32/32), Web typecheck/lint **PASS**.
- Po zgłoszeniu użytkownika poprawiono przedwczesne `getSupabaseClient()` w zapisie zlecenia; demo przechodzi dalej
   bez inicjalizowania Supabase.
- Zdjęcia, skan/import AI oraz pełne panele wykonawcy i sklepu nie są obsługiwane w trybie demo.
- Web typecheck i lint **PASS**; lokalny URL zwraca **HTTP 200**, a ekran konfiguracji zawiera wejście demo.
- Test kliknięć Playwright **BLOCKED**: Chromium wymaga brakującej systemowej biblioteki `libatk-1.0.so.0`.
- Logowanie do Supabase i zapis serwerowy nadal **BLOCKED** przez nieudany start lokalnego backendu opisanego powyżej.

## Sesja 35 — 13 października 2026

### Pełny ekran edytora CAD

- Dodano przełącznik widoku pełnoekranowego w nagłówku edytora, z przyciskiem powrotu do dokumentacji.
- W szerokim układzie narzędzia i właściwości są po bokach płótna; na małych ekranach układają się pod nim.
- Geometria, wybór narzędzi i autosave nie zmieniają się przy przełączaniu widoku.
- Web typecheck/lint **PASS**, serwer dev **PASS** HTTP 200.
- Playwright/browser **BLOCKED** z powodu brakującej biblioteki systemowej Chromium `libatk-1.0.so.0`.

## Sesja 36 — 13 października 2026

### Mobilna nawigacja canvasu

- Na mobile w głównym widoku widoczne jest samo płótno; dotknięcie go otwiera pełnoekranowy edytor.
- Pełny ekran nie przewija strony: ma pionowy pasek narzędzi po lewej, akcję „Zapisz i wyjdź z canvasu” oraz nakładane ustawienia.
- Wyjście czeka na zapis zmian; przy błędzie pozostaje w canvasie. Desktop zachowuje dotychczasowy układ inline.
- Web typecheck/lint **PASS**, lokalny serwer **PASS** HTTP 200.
- Test wizualny mobile Playwright **BLOCKED** przez brak systemowej biblioteki Chromium `libatk-1.0.so.0`.

## Sesja 37 — 13 października 2026

### Sterowanie mobile i prowadnice

- Dodano pinch-zoom i przesuwanie widoku dwoma palcami; pojedynczy dotyk zachowuje rysowanie/zaznaczanie.
- Długie przytrzymanie przycisku narzędzia pokazuje opis do zwolnienia; puszczenie wybiera narzędzie.
- Desktop pokazuje prowadnice poziomą/pionową, wyrównanie do narożników istniejących ścian i ΔX/ΔY/długość.
- Full screen canvasu działa tak samo na desktop/mobile po kliknięciu samego płótna; pełny widok nie przewija dokumentu.
- Web typecheck/lint **PASS**, dev server **PASS** HTTP 200.
- Test dotykowy Playwright **BLOCKED** przez brak `libatk-1.0.so.0` w Codespaces.

## Sesja 38 — 13 października 2026

### Fundamenty demo i edycja wymiarów

- Snap ścian wyrównuje współrzędne X/Y do najbliższych narożników innych ścian w promieniu ekranowym 10 px;
   dokładny snap narożnika/segmentu w promieniu 12 px zachowuje pierwszeństwo.
- Rzut startowy demo ma obrys 9,6 × 7,6 m podzielony na dwa pola; piwnica i płyta denna 250 mm C25/30 są tylko
   w lewej połowie. Dodano 3 pary stóp/słupów i 4 odcinki wykopu z szerokością 1600 mm oraz głębokością 1200 mm.
   Pusty starszy szkic migruje do przykładu; celowo wyczyszczony rysunek z zachowanymi ustawieniami pozostaje pusty.
- Kliknięcie wymiaru elementu wybiera ścianę i otwiera właściwości. Zmiana długości używa aktualizacji wspólnych
   węzłów, więc sąsiednie połączone ściany podążają za narożnikiem.
- Usunięto zbędne zgłaszanie `cadPending=true` przy samym ładowaniu CAD; stan rodzica blokuje przejście tylko
   podczas rzeczywistej, niezapisanej edycji, co usuwa pętlę renderowania zgłoszoną w demo.
- Test domeny **PASS** 46/46, Web lint/typecheck **PASS**, seed runtime **PASS** (17 wymiarów uproszczonych / 51
   szczegółowych), HTTP **PASS** 200.
- Test wizualny UI **BLOCKED**: Chromium wymaga brakującej systemowej biblioteki `libatk-1.0.so.0`.

## Sesja 39 — 13 października 2026

### Ukrywanie wymiarów CAD

- Dodano niezależny przełącznik „Ukryj/Pokaż wymiary” w ustawieniach canvasu.
- Ukrycie obejmuje wymiary geometryczne i etykiety pól m²; geometria, siatka i prowadnice pozostają bez zmian.
- Web lint/typecheck **PASS**, dev server **PASS** HTTP 200.
