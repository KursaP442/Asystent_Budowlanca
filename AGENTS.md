# AGENTS.md — Asystent Budowlańca + Lokalny Rynek

Instrukcje dla agenta programistycznego (GitHub Copilot Agent) pracującego w tym repozytorium.

## Zanim zaczniesz

1. Przeczytaj w całości [docs/MASTER_SPEC.md](docs/MASTER_SPEC.md) — to skrócona, operacyjna wersja specyfikacji
   produktu. Pełny, dosłowny tekst oryginalnego PDF jest w [docs/raw/MASTER_SPEC_RAW.txt](docs/raw/MASTER_SPEC_RAW.txt).
2. Przeczytaj [docs/PROGRESS.md](docs/PROGRESS.md), aby wiedzieć, na którym etapie i zadaniu skończyła się ostatnia
   sesja pracy.
3. Przeczytaj [docs/DECISIONS.md](docs/DECISIONS.md) (Architecture Decision Records) i [docs/TEST_REPORT.md](docs/TEST_REPORT.md).

## Zasady pracy

- Pracuj etapami zgodnie z sekcją 10 `MASTER_SPEC.md` (ETAP 0 → 10). Nie próbuj budować całego produktu naraz.
- Cykl pracy: plan → mała implementacja → testy → uruchomienie → poprawki → raport → commit.
- Po każdej sesji pracy aktualizuj `docs/PROGRESS.md` (co zrobiono, co NOT RUN/BLOCKED, co dalej).
- Nigdy nie usuwaj danych produkcyjnych ani nie wykonuj płatnych operacji bez wyraźnej zgody użytkownika.
- Status testów raportuj wyłącznie jako PASS / FAIL / BLOCKED / NOT RUN — nigdy ogólne „działa”.
- Na razie cała aplikacja jest budowana i testowana **lokalnie**. Hosting/wdrożenie produkcyjne nastąpi dopiero,
  gdy użytkownik uzna aplikację za gotową — nie konfiguruj ani nie uruchamiaj płatnych usług chmurowych bez zgody.

## Reguły kodu

SOLID, DRY, KISS, YAGNI — patrz sekcja 4 `MASTER_SPEC.md`. Wspólna logika geometrii/kalkulatorów/walidacji wyłącznie
w `packages/*`, nigdy duplikowana w `apps/web` i `apps/mobile`.

## Struktura repozytorium

```
apps/web          Next.js (TypeScript, Tailwind) — pełny CAD i panele
apps/mobile        Expo (React Native, TypeScript) — zdjęcia, zlecenia, uproszczona edycja
packages/domain        Encje domenowe i przypadki użycia
packages/schemas        Wspólne schematy Zod
packages/geometry       Model geometrii 2D w mm, niezależny od UI
packages/calculators     Przedmiary/kosztorysy — czyste funkcje
packages/api-client      Typowany klient API/Supabase
packages/ui-tokens       Tokeny designu współdzielone web/mobile
supabase/migrations      Migracje bazy (wersjonowane, odwracalne)
supabase/functions       Edge Functions
docs/                  Dokumentacja procesu i specyfikacja
```

## Komendy jakości (z katalogu głównego repo)

```
pnpm install
pnpm build
pnpm typecheck
pnpm lint
pnpm test
```

Patrz `docs/TEST_REPORT.md` po aktualne, faktycznie wykonane komendy i ich wyniki w tym środowisku.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
