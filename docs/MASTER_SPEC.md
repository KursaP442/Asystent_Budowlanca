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

**Klient:** rejestracja (e-mail/hasło, Google, Facebook), dashboard, kreator zlecenia z osobnymi zakładkami „Dane
budowy” oraz „Materiały i technologia”. Ankieta technologiczna grupuje wyszukiwalne opcje według etapów oraz rodzaju
prac. Każda lista otwiera rozwijane menu z wyszukiwarką; posadowienie dopuszcza zaznaczenie wielu rozwiązań.
Dalsze etapy zależą od zakresu: budowa/rozbudowa pyta o stan surowy otwarty/zamknięty, deweloperski lub pod klucz,
remont o odświeżenie/remont pomieszczeń/generalny/termomodernizację, a pozostałe prace mają oddzielny katalog.
Ankieta domu rozróżnia fundamenty i izolacje, konstrukcję, strop i wymagane podparcie, płytę skośną, deskowanie,
warstwę wstępnego krycia i finalne pokrycie dachu, stolarkę, instalacje i wykończenia. Remont termomodernizacyjny
odsłania dodatkowo adekwatne etapy budynku. Pozostałe prace (np. ogrodzenie, podjazd, odwodnienie, mur oporowy,
elewacja) mają własne pytania o przygotowanie i charakterystyczne technologie. Szalowanie ścian fundamentowych
jest wymagane tylko dla ściany
monolitycznej; ściany z bloczków szalunkowych mają formę traconego elementu. Folia kubełkowa i ocieplenie
fundamentów są osobnymi wyborami. Każda wybrana pozycja „Inne” wymaga opisu, a wartości i opis trafiają do raportu.
Wybór jest preferencją inwestora, nie projektem technicznym; nieznane rozwiązanie można oznaczyć jako zgodne z
dokumentacją. Formularz narzuca wspólne wymagania zgodności z projektem, przepisami i zasadami wiedzy technicznej
oraz generuje raport. Detale dachu obejmują profile blachodachówki, system rąbka i profile blachy trapezowej,
system kominowy z warunkową obróbką (sposób i materiał), a także osobne systemy rynien i rur spustowych.
Autosave, wersjonowanie i zaproszenia wykonawców pozostają wymaganiami docelowymi.
Wykończenia podłóg, ścian, sufitów, schodów/balustrad i elewacji mogą obejmować kilka wariantów dla różnych
pomieszczeń lub części budynku. Konstrukcja schodów (w tym żelbet monolityczny wylewany na budowie albo elementy
prefabrykowane) jest pytana osobno od ich wykończenia. Przy stanie surowym ankieta obejmuje już instalację
wodno-kanalizacyjną, w tym kanalizację wewnętrzną. Remont wybranych pomieszczeń może zbierać wiele elementów
montażowych kuchni i łazienki. Kategoria „Inne prace” pozwala łączyć zakresy i doprecyzować ich technologie,
np. materiały nawierzchni i obrzeży dla podjazdu, ścieżek, tarasu i opaski/kostki wokół domu oraz odwodnienie.
Wymaga konkretnego opisu zakresu prac i jednej lub kilku konkretnych kategorii; opcja „zgodnie z projektem” nie
jest dostępna w kategoriach ani etapach ankiety „Inne”.
Prace dodatkowe obejmują m.in. fundamenty i zbrojenie, żelbet, murowanie, dach, fasadę, stolarkę, instalacje,
ogrodzenie, podjazdy i nawierzchnie, odwodnienie, mur oporowy, taras, przyłącza zewnętrzne, zieleń i rozbiórki.
Główna kategoria opisuje wyłącznie rodzaj robót (np. „Ogrodzenie”), a materiał i wykonanie wybiera się w dalszych,
zależnych etapach (np. metal, drewno, panel lub mur). Szczegóły nie mogą być wymagane przy przejściu między
zakładkami „Dane budowy” i „Materiały i technologia”; kompletność całego wniosku jest walidowana dopiero przy
zapisie do panelu. Nawierzchnia żywiczno-żwirowa wymaga wskazania systemu; pytania o powłokę i kolor fasady
pojawiają się tylko dla tynku lub malowania, nie dla okładzin. Wybory te są częścią raportu.
Podgląd lokalizacji osadza mapę Google i przekazuje jej pełny adres z osobnych pól ulicy/nazwy miejsca, numeru
budynku/działki, miejscowości oraz kodu pocztowego. Wyszukiwanie wymaga Internetu; wpisany adres jest wysyłany
do Google Maps. Przy pustym formularzu mapa pokazuje Warszawę, a obok znajduje się link do pełnej wersji Google
Maps. Aplikacja nie odczytuje współrzędnych kliknięć z osadzonej mapy. Zapisane wcześniej współrzędne
`materials.locationPin` mogą być pokazane jako punkt w Google Maps, ale dodanie nowego punktu przez Maps JavaScript
API wymaga osobnej konfiguracji klucza i rozliczeń.

### Rozszerzenie kreatora — 12 października 2026 (w implementacji)

Zamiast kończyć po technologii, „Przejdź dalej” ma prowadzić do dokumentacji i danych geometrycznych
dobranych do zakresu. Dom i rozbudowa obejmują fundamenty, opcjonalną piwnicę, osobny rzut każdej kondygnacji,
przekroje, stropy, detale konstrukcyjne i dach oraz branże aktywne w ankiecie. „Inne prace” obejmują wyłącznie
wybrane zakresy (np. pokrycie dachu bez fundamentów i rzutów całego domu). Wielokrotne zakresy łączą wymagania,
bez dublowania wspólnych etapów.

Rozpoznawanie projektu ma używać OpenAI API skonfigurowanego osobno przez użytkownika; jest płatną usługą API,
nie automatyzacją konta ChatGPT. MCP i API mają wywoływać te same przypadki użycia: propozycja, kalibracja,
walidacja, jawne zatwierdzenie i wersjonowany zapis. Przedmiaru nie wolno liczyć z niezweryfikowanych propozycji.
Lista wymaganych rysunków jest dopiero pierwszą warstwą wymagań, nie gotowym modułem skanowania lub CAD.

Doprecyzowanie widoku: dalsza ankieta to pełnoszerokościowy edytor projektu wzorowany na ekranie użytkownika:
zakładki etapów i rysunków, płótno wektorowe z siatką, narzędzia, panel właściwości, warstwy i cofanie zmian.
Sekcja opisowych pomiarów została usunięta z UI na życzenie użytkownika; istniejące wpisy pozostają w danych.
„Skanuj lub importuj projekt”
przyjmuje zdjęcie albo wybraną stronę PDF; propozycja OpenAI staje się edytowalną geometrią na tym samym płótnie.
Nie pokazujemy pozornych, niewdrożonych funkcji 3D. Skala skanu wymaga dwóch punktów o znanej odległości.

Doprecyzowanie edytora: dane budowy, technologie i dokumentacja mają wspólną przestrzeń roboczą.
Numerowane kroki oznaczają etapy, np. „1 Fundamenty”; rysunki są ich podpunktami.
Zielony etap wymaga zapisanej niepustej geometrii wszystkich podpunktów, czerwony oznacza brakujące rysunki;
nie jest to zatwierdzenie konstrukcyjne ani potwierdzenie kompletności przedmiaru.
Płótno ma zoom kółkiem wokół kursora, osie, linijki, odczyt X/Y w mm i regulowane przyciąganie.
Narzędzia zależą od rodzaju i funkcji rysunku: fundamenty rozróżniają ławy, stopy, ściany i słupy;
strop, dach, zbrojenie, elewacje, nawierzchnie, wykończenia oraz ogrodzenia mają odrębne profile.
Narożniki mają ciągły podgląd ruchu bez kwantyzacji siatki; jeden gest to jedna operacja cofania.
Przyciąganie połączeń (osobne od siatki, wyłączalne) działa w promieniu 12 pikseli, priorytetowo do
narożnika, następnie do odcinka ściany. Zielony znacznik wskazuje docelowe połączenie.
Węzeł T dzieli ścianę na połączone odcinki; ruch wspólnego narożnika zmienia wszystkie dochodzące końce.
Otwory zachowują właściciela po podziale; połączenie w środku otworu jest odrzucane.
Canvas zajmuje pełną szerokość przestrzeni projektu, a czytelny panel ustawień i właściwości leży pod nim.
Ściany, ławy, stopy, płyty i wykopy mają różne kolory i legendę. Wykop jest zwymiarowanym obszarem
z głębokością wpisywaną z projektu, nie automatycznym obliczeniem robót ziemnych.
Materiał ściany jest podpowiadany z technologii. Konkretny wymiar wybranego bloczka (24/25/30 cm)
ustawia edytowalną grubość; brak wymiaru w technologii nie może być podstawą do jego zgadywania.
Wymiary odnoszą się do zewnętrznych krawędzi rdzenia, a grubości izolacji są wymiarowane oddzielnie.
Stopy i słupy są prostokątami rysowanymi przeciągnięciem, z edytowalną długością i szerokością.
Ściany mają połączone narożniki i wymiarowanie z liniami pomocniczymi. Materiały i grubości warstw
przypisuje się do elementów; preferencje ankiety nie mogą zastąpić danych projektu.
Rzuty mogą być wykorzystane jako wersjonowane podkłady kolejnych rysunków z zachowaniem otworów.
Automatyczne rozwinięcia ścian bazują na jawnych wysokościach, parapetach i otworach; nie generują
domyślnie projektu konstrukcyjnego przekroju.

Ściana fundamentowa otrzymuje podparcie wybrane z technologii budowy. Przy mieszanym posadowieniu
użytkownik wybiera je przed rysowaniem ściany. Automatyczna ława zachowuje relację ze ścianą; szerokość,
wysokość, materiał i odniesienie do projektu wpisuje użytkownik. Płyta powstaje po zamknięciu nierozgałęzionego
obwodu ścian, z jawnym wysunięciem poza lico; ściany wewnętrzne nie wyznaczają obwodu.
Automatyczne podparcie aktualizuje się przy edycji ścian. Stopy, pale, posadowienie istniejące i nietypowe
wymagają ręcznego przeniesienia rozwiązania konstrukcyjnego — nie zgadujemy ich rozstawu ani nośności.
Ustawienia ściany i podparcia zapisują się automatycznie także przed rysowaniem, bez przycisku zastosowania.
Nowy rysunek dziedziczy zapisane ustawienia z rysunku fundamentów tego projektu, jeżeli nie ma własnych.
Strony „od wewnątrz / od zewnątrz / obie strony” dotyczą hydroizolacji; ocieplenie jest osobną warstwą
zewnętrzną z projektową grubością i rombowym symbolem. Obrys wyznacza stronę niezależnie od kierunku
rysowania. Pas ocieplenia łączy się na licach narożników, a nie kończy na osiach. Przy otwartym obrysie
lub ścianie wewnętrznej trzeba go zamknąć albo wskazać stronę ręcznie we właściwościach.
Rzut ma wymiary elementów i gabarytów oraz legendę materiałów. Fundamenty obejmują także osobny rysunek
detali izolacji, odwodnienia i przejść. Lista referencji obejmuje rzut, przekroje/rzędne, zbrojenie, izolacje,
geotechnikę, opis materiałów i przejścia branżowe; numer referencji nie oznacza weryfikacji jej treści.

Wymiary mają układ łańcuchowy zgodny z rysunkiem technicznym: równoległe linie po zewnętrznych stronach
rzutu, cienkie linie pomocnicze, ukośne kreski końcowe i osobny wymiar całkowity. Etykiety nie mogą
wchodzić w geometrię. Zwykłe wymiary mają stałe 8 px na ekranie, a zwarte opisy położenia podpór 7 px;
zoom nie zmienia ich rozmiaru ekranowego. Eksport zachowuje tekst 2,5 mm na arkuszu. Kolor linii, kresek i etykiet wymiarowych
odpowiada kolorowi wymiarowanego elementu. Współliniowe ściany, wykopy i ławy tworzą łańcuchy na
zewnątrz rzutu: kreski obejmują krawędzie pasów, a kolejne opisy pokazują naprzemiennie ich grubości
i odległości między nimi (np. `240 | odległość | 240 | odległość | 240`). Osobna, dalsza linia pokazuje
wymiar całkowity tego samego układu. Wspólny łańcuch podpór biegnie między końcami ściany, ma kreski
poprzeczne na narożnikach i osiach podpór oraz opisuje odległości między kolejnymi kreskami.
Wartości wymiarów na canvasie są wyświetlane i edytowane w centymetrach z dokładnością 1 mm;
geometria, pomiary i zapis pozostają w milimetrach. Etykiety są zapisywane wzdłuż własnej linii
wymiarowej — tekst jest obracany zgodnie z jej kierunkiem i pozostaje czytelny od dołu lub od prawej
(kąt w zakresie od −90° do poniżej 90°). Żaden opis nie biegnie w poprzek linii znaczników, dlatego
pionowe łańcuchy zajmują wąski pas zamiast rozpychać sąsiednie rodziny. Tło, obszar klikalny i pole
edycji etykiety są obracane razem z tekstem, a kolizje liczy się na obrysie obróconej ramki.
Rozmieszczenie etykiet wszystkich rodzin wymiarów
usuwa kolizje wewnątrz danego łańcucha, ale nie przesuwa etykiet innej rodziny. Pasy liczone od wspólnego
zewnętrznego obrysu mają stałą kolejność: ściany, ławy fundamentowe, wykopy, podpory i pozostałe opisy,
a na końcu gabaryty. Kolejność encji w dokumencie nie może zmieniać tej hierarchii.
Elementy ukośne i nieujęte w łańcuchu zachowują indywidualne wymiary lic. Generowane ławy nie dublują
wymiarów ścian hosta, ale mają własne łańcuchy wymiarowe — również w widoku uproszczonym. Płyty nie
dublują wymiarów widocznego hosta. Samodzielna ława/wykop albo ława z ukrytą ścianą zachowuje swój wymiar.
Grubości pasów w łańcuchu są edytowalne czteroklikiem etykiety; zapis aktualizuje źródłowy element
oraz zależne podparcie. Przycisk „Wymiary szczegółowe” odsłania też wymiary obu nierównych lic,
poszczególnych generowanych ław i gabaryty. Dane nie są usuwane; tryb to ustawienie widoku, nie zmiana geometrii.
Po odświeżeniu rozpoczynamy od uproszczonego rzutu. Eksport używa wybranego trybu.
Ściany i samodzielne ławy dzielą się również przy przecięciu X; ruch węzła zmienia wszystkie cztery końce.
Stopy i słupy dotykające ściany otrzymują relację położenia; podążają za jej przesunięciem i obrotem,
zachowując rzeczywiste wymiary przekroju. Rozmiar X × X i oznaczenie (np. S1, ST1) są wewnątrz symbolu.
Pozycję opisują dwa wymiary od lic ściany, z którą symbol jest związany, albo najbliższej ściany:
wzdłuż jej kierunku i prostopadle do niej. Dotyczy to również podpór poza końcem ściany.
Współliniowe podpory są wymiarowane jednym łańcuchem równoległym do ich osi, od jednego skrajnego lica
ściany do przeciwległego; kolejne odcinki kończą się na osiach podpór. Współpołożony słup i stopa są jednym
stanowiskiem wymiarowym. Pozostałe podpory są wymiarowane względem najbliższej ściany, a gabaryt X/Y
jest odniesieniem tylko gdy rysunek nie ma ścian ani ław. Etykiety szukają miejsca bez kolizji z innymi
wymiarami i geometrią; kreski pomocnicze są krótkie, do 1,5 wysokości fontu.
Wymiary przy T/X i narożnikach kończą się na przecięciach rzeczywistych lic, z grubością sąsiedniego
elementu, także przy połączeniach ukośnych. Ukrywanie warstw nie usuwa topologii ani odniesień.
Ruch całego elementu, narożnika/węzła i liczbowy resize aktualizują połączoną geometrię oraz wymiary
na bieżąco. Ręczne wymiary geometryczne aktualizują wartość; jawna wartość referencyjna pozostaje.
Usunięcie ściany odczepia symbol, zamiast go usuwać.
Ściany, ławy, stopy, słupy, płyty i belki mają trwałe, unikalne, edytowalne oznaczenia.
Wykop rysuje się pasem jak ścianę, z własną szerokością, głębokością i kolorem; starsze obszary zachowano.

Zamknięte pola mają opis m² w świetle ścian, uwzględniający ściany dzielące i ślepo zakończone.
Nie odlicza on stóp, słupów ani otworów podłogowych i nie jest zatwierdzonym przedmiarem.
„Płyta denna między ławami” jest oddzielnym wyborem ankiety, niezależnym od płyty fundamentowej jako
posadowienia. Po wpisaniu grubości i betonu narzędzie płyty wstawia ją kliknięciem zamkniętego pola ław.
Dotyczy to zarówno płyty fundamentowej, jak i dennej; to narzędzie nie rysuje swobodnego wielokąta.
„Pomieszczenie z piwnicą” zaznacza podobne pole wyłącznie gdy budynek ma piwnicę. Oznaczenie
jest niezależne od płyty, zapisuje się i podąża za ławami; nie generuje automatycznie konstrukcji piwnicy.
Wewnętrzny obrys aktualizuje się przy ruchu podparć. Podział istniejącego pola wymaga usunięcia
i ponownego wskazania płyty, bez zgadywania zmiany rozwiązania konstrukcyjnego.

Opis tworzy się przeciągnięciem od opisywanego miejsca do tekstu. Treść i rozmiar czcionki można edytować
przy canvas. Dwuklik na istniejącym opisie otwiera pole tekstowe wewnątrz canvas, także przy innym narzędziu.
Enter lub opuszczenie pola zapisuje, Escape anuluje. Prawy przycisk myszy z przeciąganiem przesuwa
widok w każdym trybie bez tworzenia geometrii. „Wyczyść canvas” wymaga potwierdzenia, czyści tylko
bieżący rysunek i podkład, zachowuje ustawienia i prywatne pliki źródłowe oraz umożliwia cofnięcie.
Rombowy symbol ocieplenia jest 10 razy dłuższy wzdłuż ściany, bez zmiany grubości modelu.
Na czas przełączania rysunków edytor jest nieaktywny, aby gest nie zmienił poprzedniego arkusza.
Legenda w prawym dolnym rogu zawiera technologie, parametry i referencje dokumentów,
z możliwością ukrycia; dopasowanie widoku rezerwuje jej prawy pas. Przyciski historii i widoku są wyróżnione.
Skala arkusza (np. 1:50, 1:100) zapisuje się osobno od zoomu i kalibracji. Eksport SVG ma fizyczne wymiary
w mm według tej skali i tekst wymiarowy 2,5 mm na arkuszu. Eksport przelicza również ramki/rozmieszczenie
etykiet dla tego fontu, bez zmiany zoomu i ekranowych opisów. Płótno pozostaje modelem w mm.

Graficzny kreator zbrojenia w osobnym oknie rozróżnia geometrię, parametry prętów/strzemion i położenie.
Przekrój można zmieniać uchwytem lub liczbowo; podgląd pokazuje otulinę, strzemiona i pręty górne/dolne.
Zapisuje również detal przekroju na canvas. Układ można przypisać do ściany, ławy lub belki bieżącego rysunku
albo wersjonowanego podkładu. Podąża za przesunięciem/obrotem podparcia; zmiana długości wymaga ponownego
sprawdzenia, bez automatycznego rozciągania prętów. Kreator wymaga danych z projektu.
Rzut strzemion nie jest długością prętów do przedmiaru. Pełne odwzorowanie dowolnej dokumentacji 1:1,
przekroje konstrukcyjne i rozwinięcia gięcia są wymaganiami docelowymi, nie ukończoną funkcją.

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
