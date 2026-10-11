# DESIGN_SYSTEM — tokeny i zasady UI/UX

Szkic do uzupełniania wraz z implementacją `packages/ui-tokens` i pierwszych ekranów.

## Kierunek wizualny (z `docs/MASTER_SPEC.md` sekcja 12)

- Jasne panele, granatowa nawigacja, pomarańczowy przycisk główny (call-to-action).
- Czytelna siatka, duże pola dotykowe (mobile-friendly nawet na webie).
- Desktop: pasek boczny (nawigacja) + treść główna + inspektor właściwości (dla CAD).
- Mobile: dolna nawigacja (tab bar) + uproszczony zestaw narzędzi.

## Tokeny w `packages/ui-tokens`

- `UI_TOKENS.color` udostępnia kolory nawigacji, akcji głównej, powierzchni, tekstu, obramowań i statusów.
- `UI_TOKENS.spacing` udostępnia bazową skalę odstępów opartą na 4 px.
- Typografia, promienie, cienie, breakpointy i kolory pewności CAD będą dodawane wraz z ekranami, które ich użyją.

## Dostępność (A11Y)

- Nawigacja klawiaturą, widoczny focus, kontrast WCAG AA, etykiety pól formularzy, czytelne komunikaty błędów.
- Scenariusz akceptacyjny A11Y-01 w `docs/MASTER_SPEC.md` sekcja 11.

## Status

Podstawowe tokeny są zaimplementowane i testowane w `packages/ui-tokens`. Pierwsze ekrany `apps/web` i `apps/mobile`
korzystają ze współdzielonych kolorów i odstępów.
