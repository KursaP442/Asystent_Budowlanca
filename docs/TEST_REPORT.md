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

### BLOCKED: Vitest/Rollup — polityka Application Control (WDAC) systemu Windows

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

**Status:** BLOCKED — wymaga decyzji/działania poza zakresem repozytorium (np. wyjątek w polityce AppLocker/WDAC na
tej maszynie, inny komputer bez tej polityki, lub zmiana runnera testów na taki, który nie zależy od natywnego
Rollupa).

**Rekomendowane opcje na następną sesję (do wyboru z użytkownikiem):**
1. Sprawdzić u administratora/w ustawieniach Windows, czy można dodać wyjątek dla katalogu `node_modules\.pnpm` lub
   dla konkretnego pliku `.node` Rollupa.
2. Zastąpić Vitest przez `node:test` + `tsx`/`ts-node` dla testów jednostkowych czystych funkcji (`packages/geometry`,
   `packages/calculators` to głównie czyste funkcje — nie wymagają JSDOM/bundlera).
3. Sprawdzić, czy problem występuje też z `jest`/`esbuild`-owym runnerem (esbuild natywny plugin już działa — jego
   postinstall przeszedł wcześniej bez błędu), co sugeruje, że polityka blokuje konkretnie plik Rollupa, a nie
   wszystkie natywne binarki Node.

**Wniosek sesji 1:** ETAP 0 (audyt środowiska) ukończony z udokumentowanymi brakami uzupełnionymi (pnpm, Git) i jednym
pozostającym (Docker — BLOCKED dla Supabase local). ETAP 1 (scaffolding monorepo) w dużej mierze ukończony:
`pnpm install`, `pnpm build`, `pnpm typecheck`, `pnpm lint` — wszystkie **PASS**. `pnpm test` — **BLOCKED** z powodu
polityki systemowej (nie z powodu kodu). Patrz `docs/PROGRESS.md` sekcja „Następne kroki”.
