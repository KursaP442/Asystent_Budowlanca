# TEST_REPORT — rzeczywiste wyniki komend

Zasada: zapisujemy **dokładne komendy**, **datę**, **środowisko** i **rzeczywisty wynik** (PASS/FAIL/BLOCKED/NOT RUN).
Nigdy nie wpisujemy ogólnego „działa” bez dowodu z uruchomienia.

## Środowisko (11 października 2026)

- System: Windows, PowerShell.
- Node.js: v26.7.0
- npm: 11.19.0
- pnpm: 12.11.2 (zainstalowany globalnie w tej sesji)
- Git: 2.55.0.windows.5 (zainstalowany w tej sesji przez winget)
- Docker: niedostępny (BLOCKED dla Supabase local)
- Python: niedostępny (nie jest wymagany przez stack projektu)

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
| `pnpm test` | root monorepo | PASS | 8 asercji: geometry 3, calculators 3, ui-tokens 2; pozostałe pakiety i aplikacje mają 0 testów |
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
