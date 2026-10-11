# SECURITY — model zagrożeń i zasady bezpieczeństwa

Szkic do uzupełniania wraz z implementacją ETAP 2 (Auth/RLS) i dalszych.

## Zasady ogólne (z `docs/MASTER_SPEC.md`)

- Row Level Security (RLS) na wszystkich tabelach z danymi użytkowników/organizacji.
- Sekrety (klucze API, Supabase service role) wyłącznie po stronie serwera — nigdy w kodzie klienckim ani w repo.
- Brak realnych kluczy produkcyjnych w promptach, kodzie czy dokumentacji.
- Prywatny storage + podpisane URL dla wgrywanych plików (skany, zdjęcia, PDF).
- Rate limiting i limity kosztów dla wywołań modeli AI / OCR.
- Model MCP: zakaz dowolnych poleceń SQL i uruchamiania kodu przez model; każda operacja modyfikująca wymaga
  autoryzacji do konkretnego projektu i idempotency key.

## Checklisty uprawnień (do uzupełnienia w ETAP 2)

- [ ] Klient widzi i edytuje wyłącznie własne projekty/zlecenia.
- [ ] Firma widzi oferty i zlecenia zgodnie z regułami widoczności przetargu.
- [ ] Skład widzi wyłącznie RFQ skierowane do jego organizacji.
- [ ] Administrator ma dostęp moderacyjny z pełnym audytem działań.
- [ ] Test SEC-01: próba odczytu cudzego pliku / zmiany cudzej oferty kończy się odmową.

## Status

Brak jeszcze zaimplementowanego Auth/RLS — ten dokument będzie rozwijany równolegle z ETAP 2.
