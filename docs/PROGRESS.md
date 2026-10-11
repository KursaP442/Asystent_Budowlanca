# PROGRESS — dziennik postępu prac

Ten plik jest aktualizowany po każdej sesji pracy. Zawiera stan: co zostało zrobione, co jest zablokowane,
i od czego zacząć kolejną sesję. **To jest pierwszy plik, który agent powinien przeczytać po wznowieniu pracy.**

## Stan ogólny

- **Aktualny etap:** ETAP 1 (Monorepo, UI tokens, Supabase local) — kod i bramki jakości **PASS**; uruchomienie
  lokalnego Supabase pozostaje **BLOCKED** przez brak Docker Desktop.
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

## Jak wznowić pracę w nowej sesji

1. Przeczytaj ten plik (`docs/PROGRESS.md`) od sekcji „Następne kroki”.
2. Sprawdź `docs/TEST_REPORT.md`, aby zobaczyć ostatnie wyniki testów/budowy.
3. Sprawdź `git log` / `git status` w katalogu repo — jeśli brak commitów, zrób pierwszy commit z aktualnym stanem
   przed dalszą pracą.
4. Kontynuuj od pierwszego niewykonanego punktu w sekcji „Kontynuacja” sesji 2.
