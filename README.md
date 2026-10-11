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
