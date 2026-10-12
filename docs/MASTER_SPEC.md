# MASTER_SPEC — Asystent Budowlańca + Lokalny Rynek

Źródło: `Asystent_Budowlanca_MASTER_PROMPT_MULTI_AI_BYOK_MCP.pdf` (wersja 1.0, 11 października 2026).
Tekst wyodrębniony automatycznie z PDF (patrz `docs/raw/MASTER_SPEC_RAW.txt` dla pełnej, nieformatowanej wersji).
Ten plik jest kopią roboczą specyfikacji produktu, aby agent mógł z niej korzystać bez dostępu do oryginalnego PDF.

## 1. Cel dokumentu

Jeden dokument specyfikacyjny dla agenta programistycznego (GitHub Copilot Agent), z architekturą, planem prac,
wymaganiami jakości, zasadami testowania, gotowymi promptami etapowymi i kryteriami odbioru. Agent nie deklaruje
zakończenia etapu bez dowodów z testów (PASS/FAIL/BLOCKED/NOT RUN).

## 2. Definicja produktu i role

| Panel | Kluczowe funkcje |
|---|---|
| Klient / inwestor | Logowanie, projekty, zlecenia, dokumentacja, CAD, materiały, RFQ, oferty, zamówienia, wiadomości |
| Firma / wykonawca | Profil i weryfikacja, wyszukiwanie zleceń, oferty, licytacje, harmonogram, ekipy, realizacje |
| Skład / sklep | Oddziały, katalog SKU, ceny, stany, oferty RFQ, zamówienia, dostawy |
| Administrator | Moderacja, spory, raporty, kategorie, uprawnienia, audyt |

Użytkownik może należeć do wielu organizacji i pełnić wiele ról (rola = kontekst członkostwa w organizacji).
MVP: rynek polski, PLN, polskie adresy, jednostki SI.

### Doprecyzowanie użytkownika — 12 października 2026

W interfejsie nie ma pojęcia „organizacji” ani osobnego kroku jej tworzenia.

- Zleceniodawca po wyborze konta i przed zapisaniem pierwszej budowy trafia bezpośrednio do formularza budowy.
  Po zapisaniu pierwszego zlecenia kolejne logowania prowadzą do panelu Klienta, z możliwością dodania następnych.
- Wykonawca uzupełnia dane firmy (NIP, adres, kontakt, branża, specjalizacja i obszar działania).
- Sklep uzupełnia analogiczne dane sklepu i obszar obsługi/dostawy.
- Dopiero po zapisaniu danych właściciel firmy/sklepu dodaje pracowników w swoim panelu: e-mail, imię i nazwisko,
  wygenerowane hasło tymczasowe. Właściciel przekazuje dane pracownikowi, który loguje się nimi i ustawia własne
  hasło przed wejściem do panelu pracownika. Pracownik nie otrzymuje uprawnień właściciela.
- Historyczne tabele `organizations`/`memberships` pozostają wyłącznie technicznym mechanizmem izolacji firmy
  i uprawnień. Nie wymagamy ich od klienta i nie usuwamy istniejących danych.

To doprecyzowanie zastępuje opis widocznego w UI tworzenia organizacji w pierwotnej specyfikacji.

## 3. Architektura docelowa

| Warstwa | Rekomendacja | Zasada |
|---|---|---|
| Web | Next.js + TypeScript + Tailwind + shadcn/ui | Pełny CAD i administracja |
| Mobile | Expo + React Native + TypeScript | Zdjęcia, zlecenia, uproszczona edycja |
| Monorepo | pnpm workspaces + Turborepo | Jedna baza kodu, osobne aplikacje |
| Backend | Supabase (Auth, PostgreSQL, Storage, Edge Functions) | RLS, serwerowe sekrety |
| Geografia | PostGIS | Zapytania odległościowe |
| AI | API modeli przez serwer | Koszty, audyt, limity, prywatność |
| Testy | Vitest, Testing Library, Playwright; Expo/Jest | Automatyczna bramka jakości |

Struktura katalogów: `apps/web`, `apps/mobile`, `packages/domain`, `packages/schemas`, `packages/geometry`,
`packages/calculators`, `packages/api-client`, `packages/ui-tokens`, `supabase/migrations`, `supabase/functions`,
`docs/`, `AGENTS.md`.

Preferuj kompozycję i interfejsy zamiast dziedziczenia; dziedziczenie tylko dla relacji „jest rodzajem”.

## 4. Niewzruszalne zasady kodowania

- SOLID (jedna odpowiedzialność, rozszerzalność, podstawienia, małe interfejsy, zależność od abstrakcji).
- DRY — wspólna logika obliczeń/walidacji/uprawnień/geometrii w `packages/`, bez duplikacji algorytmów.
- KISS i YAGNI — abstrakcje dopiero po co najmniej dwóch realnych przypadkach użycia.
- Funkcje czyste dla obliczeń; adaptery dla API/storage/usług zewnętrznych; TypeScript strict + walidacja Zod.
- Małe komponenty: osobno prezentacja, stan, walidacja, repozytorium, serwis domenowy, infrastruktura.
- Zakaz `any` bez uzasadnienia; unikać cyklicznych importów i ukrytego stanu globalnego.
- Migracje bazy wersjonowane, odwracalne tam gdzie możliwe; nigdy ręczna edycja produkcji.
- Nowe biblioteki tylko po sprawdzeniu licencji, utrzymania, rozmiaru, wpływu na bezpieczeństwo.

## 5. Zasady ciągłego testowania (obowiązkowe)

Każda jednostka pracy kończy się udokumentowaną bramką jakości:

```
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

| Po zmianie | Wymagany dowód |
|---|---|
| Typy / walidacje / kalkulatory | typecheck + testy jednostkowe, przypadki brzegowe, błędne dane |
| Komponenty Web | test komponentu + kontrola widoku |
| Funkcje API / baza | test integracyjny + polityki RLS + nieautoryzowany dostęp |
| Proces użytkownika | Playwright E2E |
| Mobile | testy logiki + uruchomienie Expo (+ test widoku jeśli emulator dostępny) |
| CAD / import | testy geometrii, snapshoty, tolerancje, kontrola błędu skali |

Gdy test nie przechodzi: (1) zapisz błąd, (2) znajdź przyczynę, (3) minimalna poprawka, (4) ponów test + regresję,
(5) wpisz wynik. Po 3 nieudanych próbach z tą samą przyczyną — zatrzymaj, opisz blokadę, poproś o decyzję.
Statusy: **PASS** / **FAIL** / **BLOCKED** (brak emulatora/sekretu/usługi) / **NOT RUN**. Nigdy „działa” bez dowodu.

## 6. Ekrany i przepływy (skrót)

**Klient:** rejestracja (e-mail/hasło, Google, Facebook), dashboard, kreator zlecenia (dane ogólne → fundamenty/piwnica
→ parter → piętra → poddasze → dach → materiały → podsumowanie), autosave, wersjonowanie, publikacja i zaproszenie
wykonawców.

**Firma wykonawcza:** rejestracja organizacji (NIP, specjalizacje, obszar działania), feed zleceń z filtrami, oferty
(cena netto/brutto, VAT, zakres, harmonogram, ważność), licytacja z audytem, realizacja zleceń.

**Skład/sklep:** oddziały/magazyny, katalog SKU, RFQ → mapowanie na SKU → oferta (cena, ilość, rabat, transport,
ważność) → zamówienia (statusy, rezerwacja, częściowa realizacja, dokumenty, zwroty).

## 7. CAD — zasady ogólne

- Jednostka wewnętrzna: milimetr (mm); piksele ekranu nie są jednostką modelu.
- Transformacje: `imagePixels → rectifiedPixels → worldMillimeters → viewportPixels`, odwracalne i testowane.
- Geometria: zamykanie obrysów, przecięcia, długości, powierzchnie, offsety, topologia.
- Zapis: wersje, autosave, blokady konfliktów, eksport SVG/PDF (DXF dopiero po walidacji formatu).

## 8. Import zdjęcia / PDF / skanu

Pipeline: upload → kontrola jakości → korekcja perspektywy → detekcja linii/tekstu → propozycje elementów →
kalibracja (2 punkty o znanym wymiarze) → edycja ręczna → kontrola błędów → zapis wersji. Każdy importowany element
ma `confidence` i status zatwierdzenia. Brak gwarancji odwzorowania 1:1 bez ręcznej kalibracji i walidacji.

Przedmiary wynikają wyłącznie z zatwierdzonej geometrii + jawnych parametrów (wzór, jednostki, straty, założenia).
Zbrojenie/deskowanie/podpory wymagają danych producenta i weryfikacji uprawnionego projektanta — aplikacja **nie**
zatwierdza samodzielnie projektów konstrukcyjnych.

## 9. Licytacje i RFQ — reguły domenowe

- Zlecenie: termin składania ofert, status (draft/open/closed/awarded/cancelled), wersjonowany zakres.
- Oferta: złożenie/zmiana przed terminem, wycofanie; serwer egzekwuje termin.
- Ocena oferty uwzględnia zakres, termin, doświadczenie, VAT, wyłączenia — nie tylko cenę.
- RFQ materiałowe z zatwierdzonego przedmiaru, pozycje zachowują jednostki/parametry/tolerancje zamienników.
- Porównanie dostawców: całkowity koszt dostawy, dostępność, transport, częściowe realizacje, ważność oferty.
- Ceny i historia niemodyfikowalne po rozstrzygnięciu; wymagany audyt.

## 10. Plan implementacji — bramki etapów

| Etap | Zakres | Warunek ukończenia |
|---|---|---|
| 0 | Audyt środowiska, dokumenty, repo, CI | Skrypty jakości działają na czystym repo |
| 1 | Monorepo, UI tokens, Supabase local | Web i Expo startują; build/typecheck PASS |
| 2 | Auth, organizacje, role, RLS | E2E logowania + izolacja danych PASS |
| 3 | Panel klienta i CRUD zleceń | Tworzenie/edycja/publikacja w E2E PASS |
| 4 | Panel firmy, ofertowanie | Cykl oferty i termin zamknięcia PASS |
| 5 | Panel składu, katalog, RFQ | Porównanie ofert i zamówienie PASS |
| 6 | Projekty i przedmiary podstawowe | Testy jednostek i wyliczeń PASS |
| 7 | CAD 2D ręczny | Geometria, undo/redo, wymiary, eksport PASS |
| 8 | Import skanów i PDF | Kalibracja + walidacja na zestawie referencyjnym |
| 9 | AI, asystent, dokumenty | Limity, testy bezpieczeństwa, audyt PASS |
| 10 | Mobile, optymalizacja, beta | Scenariusze Web/Mobile, monitoring, backup |

Etapy 7–10 to złożone programy prac — rozbijać na funkcje wdrażalne/testowalne w 1–3 dni. Po ukończeniu etapu: tag
wersji + raport ryzyk.

## 11. Scenariusze testów akceptacyjnych

AUTH-01, AUTH-02, JOB-01, BID-01, RFQ-01, ORDER-01, CAD-01, CAD-02, IMPORT-01, SEC-01, A11Y-01
(pełne opisy w `docs/raw/MASTER_SPEC_RAW.txt`, sekcja 11).

## 12. Kierunek UI/UX

Jasne panele, granatowa nawigacja, pomarańczowy przycisk główny, czytelna siatka, duże pola dotykowe. Desktop: pasek
boczny + treść + inspektor właściwości CAD. Mobile: dolna nawigacja + uproszczony zestaw narzędzi.

## 13. Aneks — Import projektu do CAD (szczegóły techniczne)

Pełny model geometrii (`Point2D`, `Segment2D`, `Polyline2D`, `Arc2D`, `Polygon2D`, `Opening2D`, `Dimension2D`),
warstwy (podkład/osie/ściany/fundamenty/otwory/stropy/dach/instalacje/zbrojenie/wymiary/adnotacje), moduły pipeline
(`UploadService`, `DocumentParser`, `ImagePreprocessor`, `RecognitionProvider`, `GeometryAssembler`,
`CalibrationService`, `ReviewWorkflow`, `CadDocumentRepository`) — pełny opis w `docs/raw/MASTER_SPEC_RAW.txt`.

## 14. Aneks — MCP / ChatGPT + automatyczny CAD ze zdjęcia

Narzędzia MCP: `list_projects`, `get_project_context`, `upload_plan_reference`, `begin_import`,
`set_scale_reference`, `preview_entities`, `validate_import`, `commit_import`, `create_entity`, `update_entity`,
`undo_last_change`. Zakaz dowolnych poleceń SQL i uruchamiania kodu przez model. Pełny opis w pliku RAW.

## 15. Realistyczne granice automatyzacji

Agent koduje i testuje w ramach dostępnych narzędzi, ale nie gwarantuje nieprzerwanej pracy wielodniowej bez
mechanizmu uruchamiania zadań. Zadania wymagające zatwierdzenia użytkownika: produkcyjne migracje, zakup usług,
publikacja w sklepach, regulaminy/płatności, automatyczne decyzje konstrukcyjne, uruchomienie sprzedaży.

## 16. Checklista przed pierwszym uruchomieniem

- VS Code + GitHub Copilot Agent skonfigurowane, dostęp do terminala i repo.
- Node LTS, pnpm, Git, (Docker jeśli lokalny Supabase) dostępne.
- Repozytorium Git utworzone (lokalnie, docelowo GitHub); ochrona gałęzi + CI do skonfigurowania.
- Supabase/Google/Facebook skonfigurowane w bezpiecznych zmiennych środowiskowych.
- Przeglądarka do E2E; opcjonalnie Android Emulator / iOS Simulator do Mobile.
- Agent zaczyna od ETAPU 0, nie od CAD i całego marketplace naraz.

---

Pełny, nieprzycięty tekst wyekstrahowany z oryginalnego PDF znajduje się w `docs/raw/MASTER_SPEC_RAW.txt` — użyj go,
gdy potrzebny jest dokładny, dosłowny fragment specyfikacji (np. pełne definicje tabel bazy danych, promptów
etapowych CAD-00..CAD-08, czy pełnej treści sekcji 7 "Baza danych i API" aneksu).
