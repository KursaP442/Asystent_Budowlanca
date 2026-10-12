# DECISIONS — Architecture Decision Records

Format: krótki wpis per decyzja — kontekst, decyzja, konsekwencje. Dodawaj nowe wpisy na końcu pliku, nie modyfikuj
wcześniejszych (jeśli decyzja się zmienia, dodaj nowy wpis odwołujący się do poprzedniego).

## ADR-001: Menedżer pakietów — pnpm workspaces + Turborepo

**Kontekst:** Specyfikacja (`docs/MASTER_SPEC.md` sekcja 3) wymaga monorepo z jedną bazą kodu dla `apps/web` i
`apps/mobile` oraz współdzielonych pakietów.

**Decyzja:** Używamy pnpm workspaces (`pnpm-workspace.yaml`) + Turborepo (`turbo.json`) do orkiestracji zadań
(`build`, `dev`, `lint`, `typecheck`, `test`).

**Konsekwencje:** pnpm nie było domyślnie dostępne w środowisku — zainstalowane globalnie (`npm install -g pnpm`).
Wymaga to, aby każde nowe środowisko deweloperskie miało wykonany ten krok (brak `corepack` w użytej wersji Node).

## ADR-002: Praca wyłącznie lokalna do czasu akceptacji hostingu

**Kontekst:** Użytkownik wprost zastrzegł: „na razie cała aplikacja musi być budowana lokalnie, gdy będzie gotowa to
wtedy zostanie wrzucona na host”.

**Decyzja:** Nie konfigurujemy ani nie uruchamiamy żadnych płatnych usług chmurowych (hosting, Supabase Cloud,
domeny, CI w chmurze) bez wyraźnej zgody użytkownika. Repozytorium Git pozostaje lokalne (bez `git remote`) do
czasu takiej decyzji.

**Konsekwencje:** ETAP 0 „podstawowy CI” z checklisty w `MASTER_SPEC.md` (pipeline w chmurze, ochrona gałęzi na
GitHub) jest odłożony — lokalnie wystarczą skrypty `pnpm lint/typecheck/test/build` uruchamiane ręcznie lub przez
lokalny git hook, jeśli zajdzie potrzeba.

## ADR-003: Brak lokalnego Supabase (Docker) na start

**Kontekst:** Lokalny Supabase (`supabase start`) wymaga Docker Desktop. Docker nie był zainstalowany w środowisku
na początku prac.

**Decyzja:** Nie instalujemy Dockera automatycznie — to duża, inwazyjna zmiana systemowa (Hyper-V/WSL2, usługi
systemowe). Czekamy na potwierdzenie użytkownika. Do tego czasu backend (Auth/DB/Storage/Edge Functions) jest
projektowany (schemas, migracje SQL, kontrakty API w `packages/schemas` i `packages/api-client`), ale nie uruchamiany
end-to-end.

**Konsekwencje:** Testy integracyjne wymagające bazy danych będą raportowane jako BLOCKED w `docs/TEST_REPORT.md`,
dopóki Docker + Supabase CLI nie zostaną zainstalowane.

## ADR-004: Wbudowany Node test runner zamiast Vitest

**Kontekst:** W środowisku Windows polityka Application Control blokowała natywny plik Rollupa wymagany przez
Vitest (`ERR_DLOPEN_FAILED`). Próba uruchomienia testów kończyła się przed wykonaniem testów.

**Decyzja:** Dla testów jednostkowych czystych pakietów używamy wbudowanego `node:test`. Pakiety kompilują TypeScript
przez `tsc`, a testy JavaScript uruchamiają się bez bundlera i bez nowej zależności testowej.

**Konsekwencje:** Nie zmieniono systemowych polityk bezpieczeństwa. W razie potrzeby DOM/UI tests można dodać osobno
po wyborze runnera kompatybilnego z ograniczeniami środowiska.

## ADR-005: Lokalny Docker Desktop i Supabase

**Kontekst:** ADR-003 odkładał instalację Dockera do czasu wyraźnej zgody użytkownika. Użytkownik poprosił o
zainstalowanie Dockera i Supabase.

**Decyzja:** Zainstalowano Docker Desktop i WSL 2 oraz dodano Supabase CLI jako lokalną zależność projektu.
Uruchamiamy Supabase wyłącznie lokalnie przez skrypty `pnpm db:*`; nie łączymy go z Supabase Cloud ani hostingiem.
Ta decyzja zastępuje ADR-003.

**Konsekwencje:** Lokalne usługi Auth, API, Studio i PostgreSQL są dostępne. Vector restartuje się z powodu
problemu łączności z endpointem Docker IPv6, a imgproxy i pooler pozostają zatrzymane; te usługi pomocnicze
wymagają diagnozy. Integracyjne Auth/RLS nie są jeszcze wdrożone ani zweryfikowane.

## ADR-006: Członkostwa wyłącznie przez bezpieczny przepływ zaproszeń

**Kontekst:** Etap 2 wymaga organizacji z rolami, a aplikacja musi obsłużyć wielu użytkowników w jednej
organizacji. Bezpośrednie przyznawanie członkostw z klienta pozwalałoby przypisać dowolne konto i rolę bez
potwierdzenia zaproszenia.

**Decyzja:** Na tym etapie klient może tworzyć organizację, a trigger przypisuje twórcy rolę `owner`. Tabele
członkostw są tylko do odczytu dla członków; nadawanie i zmiana ról pozostają zamknięte do wdrożenia
zweryfikowanego przepływu zaproszeń.

**Konsekwencje:** Tworzenie organizacji i izolacja danych są testowane na lokalnym Supabase. Do czasu następnej
migracji nie można dołączać kolejnych użytkowników ani przydzielać ról `admin`/`member`.

## ADR-007: Typ konta jako krok lokalnego onboardingu

**Kontekst:** Po pierwszym logowaniu użytkownik ma wybrać jeden z trzech głównych sposobów korzystania z aplikacji:
Zleceniodawca, Wykonawca albo Sklep. Nie może to zastępować ról członkostwa, bo użytkownik może należeć do wielu
organizacji i mieć różne role w każdej z nich.

**Decyzja:** Zapisujemy preferowany typ w `profiles.account_type`, mapowany na istniejący enum
`organization_kind`. Użytkownik wybiera typ na trzech kafelkach; aplikacja zapisuje go przez RLS i przechodzi do
formularza tworzenia organizacji tego typu. Typ organizacji pozostaje w `organizations.kind`, a role pozostają
przy członkostwach. Użytkownik może zmienić wybór przed utworzeniem pierwszej organizacji.

**Konsekwencje:** Wymagana jest wersjonowana migracja i test izolacji zapisu profilu. Onboarding jest lokalny i
nie uzależnia dalszego hostingu ani usługi chmurowej.

## ADR-008: Panele bez organizacji w interfejsie i zarządzane konta pracowników

**Kontekst:** Użytkownik zmienił przepływ 12 października: klient opisuje pierwszą budowę, firma/sklep zapisują dane
działalności; później właściciel sam tworzy konta pracowników z hasłem do przekazania. Nie ma kroku „organizacja”.

**Decyzja:** Klient zapisuje `construction_jobs` bez tworzenia organizacji. Po pierwszym zleceniu wraca do panelu.
Firma/sklep zapisuje `business_profiles` atomowym RPC razem z technicznym kontekstem RLS i członkostwem właściciela.
Nie usuwamy starszych organizacji ani członkostw. `account_type` wybiera panel, nie nadaje uprawnień właściciela.

Konto pracownika tworzy serwer Web po weryfikacji tokena Auth i uprawnień właściciela; losowe hasło jest zwracane
jednorazowo, nie jest zapisywane w tabelach aplikacji ani logach. Istniejący e-mail nie może zostać przejęty ani
mieć zresetowanego hasła. Serwer atomowo przypina nowe konto jako `member`; błąd przypięcia powoduje usunięcie
wyłącznie nowo utworzonego konta, a błąd wycofania jest jawnie raportowany.

Przed dostępem do danych pracownik zmienia hasło tymczasowe na własne. Wymóg jest egzekwowany w bazie, nie tylko
w UI. Klucz serwisowy jest wyłącznie w ignorowanym środowisku serwera, nigdy w zmiennej `NEXT_PUBLIC_*`.
To zastępuje ADR-006 dla kont tworzonych przez właściciela; zaproszenia istniejących kont to odrębny, niewdrożony
przepływ. ADR-007 nadal obowiązuje dla wyboru panelu, ale nie dla kroku utworzenia organizacji.

**Konsekwencje:** Dodano lokalne pgTAP i Playwright E2E wszystkich trzech przepływów. Pełne CAD, marketplace,
ofertowanie i mobile pozostają osobnymi etapami; nie są deklarowane jako ukończone.
