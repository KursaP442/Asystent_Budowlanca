# DESIGN_SYSTEM — tokeny i zasady UI/UX

Szkic do uzupełniania wraz z implementacją `packages/ui-tokens` i pierwszych ekranów.

## Kierunek wizualny (z `docs/MASTER_SPEC.md` sekcja 12)

- Jasne panele, granatowa nawigacja, pomarańczowy przycisk główny (call-to-action).
- Czytelna siatka, duże pola dotykowe (mobile-friendly nawet na webie).
- Desktop: pasek boczny (nawigacja) + treść główna + inspektor właściwości (dla CAD).
- Mobile: dolna nawigacja (tab bar) + uproszczony zestaw narzędzi.

## Tokeny (do zdefiniowania w `packages/ui-tokens`)

- Kolory: granat (nawigacja), pomarańcz (akcja główna), neutralne szarości (tło/tekst), kolory statusów
  (sukces/ostrzeżenie/błąd), kolory pewności rozpoznania CAD (wysoka/średnia/niska).
- Typografia: skala rozmiarów, wagi, line-height.
- Spacing: skala odstępów (4/8/12/16/24/32...).
- Promienie zaokrągleń, cienie, breakpointy.

## Dostępność (A11Y)

- Nawigacja klawiaturą, widoczny focus, kontrast WCAG AA, etykiety pól formularzy, czytelne komunikaty błędów.
- Scenariusz akceptacyjny A11Y-01 w `docs/MASTER_SPEC.md` sekcja 11.

## Status

Tokeny nie są jeszcze zaimplementowane — `packages/ui-tokens/src/index.ts` zawiera obecnie tylko placeholder.
