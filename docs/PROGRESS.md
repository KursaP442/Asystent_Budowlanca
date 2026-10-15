# PROGRESS — dziennik postępu prac

## Sesja 94 — przenośny autostart Web na Windows i Codespaces

### Zrobione

- Autostart VS Code nie wywołuje już `bash`, więc działa także w lokalnym PowerShell bez WSL.
- Dodano przenośny skrypt Node `scripts/dev-web.mjs`, który sprawdza działający serwer, instaluje brakujące
  zależności i uruchamia `pnpm dev:web` z poprawną obsługą `pnpm.cmd` na Windows.
- Poprawiono filtr budowania `dev:web`, aby zależności workspace były budowane również na Windows.

### Walidacja

- Autostart na zajętym porcie — PASS; wykrywa HTTP 200 i nie uruchamia drugiego serwera.
- `pnpm typecheck` — NOT RUN po zmianie skryptów; wcześniejszy stan po instalacji zależności był PASS.
- `pnpm lint` — NOT RUN po zmianie skryptów; wcześniejszy stan po instalacji zależności był PASS.

Ten plik jest aktualizowany po każdej sesji pracy. Zawiera stan: co zostało zrobione, co jest zablokowane,
i od czego zacząć kolejną sesję. **To jest pierwszy plik, który agent powinien przeczytać po wznowieniu pracy.**

## Stan ogólny

- **Aktualny etap:** ETAP 2 — podstawowy Auth, trzy ścieżki onboardingu, konta pracowników i izolacja RLS
  zweryfikowane lokalnie; pgTAP i Playwright **PASS**. ETAP 3 — bazowy wniosek budowy z walidacją, ankietą
  materiałów/technologii, raportem i panelem klienta zweryfikowano lokalnie. Rozbudowany rynek, składanie ofert,
  RFQ/katalog oraz dalsze etapy specyfikacji pozostają do wykonania. Nie ma kroku tworzenia organizacji w UI.
  Ograniczenia usług pomocniczych Supabase opisano w `docs/TEST_REPORT.md`.
- **Rozszerzenie w toku:** adaptacyjny edytor CAD po „Przejdź dalej”, autosave rysunków, PDF/zdjęcia,
  ręczna kalibracja i adapter OpenAI/BYOK są zaimplementowane lokalnie. Scenariusz płótna/importu z mockiem AI
  ma **PASS**. Analiza rzeczywistym OpenAI — **BLOCKED** do konfiguracji klucza i szyfrowania.
  Dodano profile narzędzi etapu, warstwy materiałowe, węzły ścian, zoom/linijki, krokowy status rysunków,
  kopiowanie rzutów, rozwinięcia ścian i kreator rzutów zbrojenia. Nie oznacza to pełnego CAD 1:1.
  Etapy mają podpunkty, narożniki ciągły podgląd, a fundamenty zależne ławy/płyty i izolacje.
  Graficzny kreator przekroju belki zapisuje położenie na podparciu; po zmianie długości wymaga sprawdzenia.
  Przyciąganie łączy narożniki i węzły T; canvas zajmuje pełną szerokość, z panelami pod płótnem i kolorami ról.
  Parametry fundamentów są trwałe i automatyczne; dodano X, przyczepione podpory, oznaczenia, pola m²,
  płytę denną między ławami, opisy prowadzące, bezkolizyjne etykiety oraz osobną skalę arkusza.
  MCP, 3D, korekcja perspektywy i pełny zweryfikowany przedmiar pozostają niezakończone.
- **Tryb pracy:** aplikacja nadal jest rozwijana i testowana lokalnie (bez hostingu/wdrożenia produkcyjnego);
  repozytorium ma zdalny remote GitHub do synchronizacji kodu.
- **Źródło specyfikacji:** `C:\Users\Patryk\Downloads\Asystent_Budowlanca_MASTER_PROMPT_MULTI_AI_BYOK_MCP.pdf`,
  tekst wyekstrahowany do `docs/raw/MASTER_SPEC_RAW.txt` i skondensowany do `docs/MASTER_SPEC.md`.

## Sesja 93 — niezależne wyrównanie strzemion i diagnostyka ciągłości

### Zrobione

- Większe strzemiona można wyrównywać niezależnie w osi szerokości (środek/lewa/prawa krawędź) i wysokości
  (środek/góra/dół) do najmniejszego obrysu w belce. Przesunięcie pakietu pozostaje niezależne i dodaje się
  do wyrównania.
- Te same położenia są używane w przekroju, slotach drutów, standardowych drutach narożnych, rzutach i zapisie
  encji CAD.
- Dodano diagnostykę geometryczną: brak wolnego otworu strzemienia w przekroju oraz brak wspólnego pola
  przekroju dla ciągłego pręta pomiędzy sąsiednimi strefami. Błąd pokazuje się przy konstruktorze i blokuje
  zapis. Nie jest to ocena nośności, otuliny ani zgodności z normą.

### Walidacja

- `pnpm --filter @asystent/schemas build && pnpm --filter @asystent/domain build` — PASS.
- `pnpm --filter @asystent/domain test` — PASS, 88/88.
- `pnpm --filter web typecheck` i `pnpm --filter web lint` — PASS.
- Browser smoke konstruktora — PASS, 126/126, w tym wyrównanie krawędzi obu osi i ciągłość slotu między strefami.
- `pnpm test` — PASS, 13/13 zadań. `pnpm build` — PASS, 8/8 zadań.
- `git diff --check` — PASS.
- Weryfikacja konstrukcyjna zbrojenia — NOT RUN; wymaga uprawnionego projektanta.

### Dalej

- Kontynuować modelowanie podgięć drutów niestandardowych, zakładów i zakotwień; reguły konstrukcyjne pozostawić
  do weryfikacji projektanta.

## Sesja 92 — kształt strzemion w kafelkach drutów, kolory typów strzemion i wypust drutów

### Zrobione

- Kafelek drutu niestandardowego pokazuje oprócz kropek drutów rzeczywisty kształt strzemion swojej strefy (każde
  strzemię pakietu w kolorze swojego typu). Sub-okno slotów rysuje strzemię jego prawdziwym obrysem osiowym
  zamiast prostokąta przesuniętego o pół średnicy drutu.
- Typ strzemienia = kształt (szerokość × wysokość, Ø) + pozycja w pakiecie. Każdy typ ma własny kolor, wspólny dla
  rzutu frontowego, rzutu bocznego, kafelków i sub-okna slotów.
- Rzut 2D od frontu: strzemiona są rysowane na swoją rzeczywistą wysokość i położenie (wcześniej 80% wysokości
  betonu) i w kolorze typu; przed pierwszym strzemieniem każdej strefy jest wymiar wysokości „S{n}: X cm”.
- Rzut 2D od boku: każdy typ strzemienia jest rysowany raz, z etykietą „S{n} (strefy …)” i wymiarami szerokości
  i wysokości w kolorze typu.
- Drut niestandardowy ma wypust poza strzemiona: bez wypustu, z jednej strony (lewej lub prawej) albo z obu stron,
  długość w cm dla każdej strony (`extensionStartMm`, `extensionEndMm`). Wypust jest przycinany do długości belki
  i liczony w zajętości slotów, rzutach, 3D i zapisie CAD. Dla drutu „Cała belka” wypust jest wyłączony.

### Walidacja

- `pnpm --filter @asystent/domain test` — PASS, 86/86 (nowy test wypustu z jednej i obu stron).
- `pnpm --filter web typecheck`, `pnpm --filter web lint` — PASS.
- Browser smoke — PASS, 123/123.
- `pnpm test` — PASS, 13/13. `pnpm build` — PASS, 8/8. `git diff --check` — PASS.
- Weryfikacja konstrukcyjna zbrojenia (długości wypustów, zakłady, zakotwienia) — NOT RUN, wymaga uprawnionego
  projektanta.

### Dalej

- Punkt 4 ostatniego zgłoszenia użytkownika był pusty — czeka na doprecyzowanie.
- Podgięcia drutów niestandardowych i zakłady docinek.

## Sesja 91 — drut „przez całą belkę” musi mieć slot w każdym strzemieniu

### Zrobione

- Drut niestandardowy ma jawną flagę `fullBeam` (schemat `customMainBars`). Domena sprawdza regułę funkcją
  `beamCustomMainBarFullBeamCheck`: każda strefa strzemion belki musi mieć strzemię trzymające drut w tym samym
  punkcie przekroju, a slot nie może być zajęty w żadnej strefie (standardowe druty narożne ani inne druty).
- Drut „cała belka” nie jest już po cichu skracany do zgodnych stref. Gdy reguła przestaje być spełniona (np. po
  zmianie stref), kafelek drutu pokazuje komunikat z numerami stref, a zapis belki jest zablokowany
  (`beamCustomMainBarIssues`).
- Przycisk „Cała belka” jest wyłączony, gdy wybrany slot nie występuje we wszystkich strzemionach lub jest gdzieś
  zajęty — z podanym powodem. Wtedy drut jest docinką od wybranej strony (początek / koniec zakresu).
- Ręczna zmiana długości wyłącza tryb całej belki; ponowne kliknięcie „Cała belka” przywraca drut 0 – długość belki.
- Kolory slotów: zielony = wolny na całą belkę, bursztynowy = wolny tylko na docinkę, czerwony = zajęty.

### Walidacja

- `pnpm --filter @asystent/domain test` — PASS, 85/85 (nowy test całej belki 30/50/30).
- `pnpm --filter web typecheck`, `pnpm --filter web lint` — PASS.
- Browser smoke — PASS, 117/117.
- `pnpm test` — PASS, 13/13. `pnpm build` — PASS, 8/8. `git diff --check` — PASS.
- Weryfikacja konstrukcyjna zbrojenia — NOT RUN, wymaga uprawnionego projektanta.

### Dalej

- Zakłady i zakotwienia docinek oraz podgięcia drutów niestandardowych.
- Restart serwera deweloperskiego, aby wczytał nowe style sub-okna slotów.

## Sesja 90 — druty niestandardowe wstawiane w sloty strzemion

### Zrobione

- Kafelek `+` „Druty niestandardowe” w konstruktorze belek otwiera nowe, wyśrodkowane sub-okno slotów zamiast
  starego formularza pręta. Stary edytor pręta zostaje wyłącznie dla ścieżki „Użyj w edytorze pręta” z biblioteki.
- U góry sub-okna jest model 3D belki **zablokowany w widoku od frontu** — bez obrotu, przesuwania, zoomu i bez
  przycisków sterujących. Pod nim są kafelki wszystkich stref strzemion; kliknięcie kafelka podświetla w 3D
  wyłącznie strzemiona tej strefy (pozostałe strzemiona są przygaszone, druty zostają widoczne).
- Przekrój wybranej strefy pokazuje każde strzemię pakietu i małe kółka-sloty wzdłuż wewnętrznego lica drutu
  strzemienia: zawsze w każdym narożniku i na środku każdego boku, a pomiędzy nimi co ok. 2 cm. Slot zajęty przez
  istniejący drut (np. 4 standardowe druty narożne) jest czerwony, ma `aria-disabled` i nie da się go wybrać.
- Wybór wolnego slotu tworzy kafelek drutu z ustawieniami: długość w cm z przyciskiem „Cała belka”, grubość Ø,
  strona dodawania (od początku / od końca zakresu), opis rzeczywistego przebiegu i usuwanie. Kafelki są widoczne
  w sub-oknie i w siatce „2. Druty główne”.
- Domena (`packages/domain`) wyznacza zakres dozwolony drutu: ciągły ciąg sąsiednich stref, których strzemię ma
  slot w tym samym miejscu przekroju. Drut przez całą belkę zajmuje slot w każdym strzemieniu, przez które biegnie.
  Gdy strzemiona różnią się wysokością (np. 30 / 50 / 30 cm), drut w slocie niezgodnym z sąsiednimi strzemionami
  staje się **docinką** ograniczoną do swoich stref; użytkownik wybiera stronę, od której ją dodaje.
- Drut jest zapisany jako slot (strefa, strzemię pakietu, bok, położenie na boku), a nie jako bezwzględna pozycja,
  więc zmiana średnicy zachowuje styczność do strzemienia. Schemat `customMainBars` jest częścią definicji belki.
- Druty niestandardowe są rysowane na froncie 2D (w warstwie prętów, pod strzemionami), na rzucie bocznym, w 3D
  i liczone w podsumowaniach; zapis generuje proste pręty CAD dzielone na segmenty hosta.
- Poprawiono spójność strzemion wyższych od betonu: druty narożne, 3D i rzut boczny używają teraz tego samego
  przesunięcia środka strzemienia (`beamStirrupCenterVerticalMm`).

### Walidacja

- `pnpm --filter @asystent/domain test` — PASS, 84/84 (nowy test slotów, zajętości i docinek 30/50/30).
- `pnpm --filter web typecheck`, ESLint zmienionych komponentów — PASS.
- Browser smoke — PASS, 114/114 (sub-okno, zablokowany 3D, podświetlenie strefy, czerwone narożniki, tworzenie
  drutu, „Cała belka”, docinka od drugiej strony, rzuty, 3D i zapis).
- `pnpm test` — PASS, 13/13. `pnpm build` — PASS, 8/8. `git diff --check` — PASS.
- Wygląd sub-okna sprawdzony zrzutem ekranu z bieżącym arkuszem wstrzykniętym do strony — uruchomiony serwer
  deweloperski serwował nieaktualny `globals.css` (zmiany CSS nie trafiały do przeglądarki do restartu serwera).
- Weryfikacja konstrukcyjna zbrojenia — NOT RUN, wymaga uprawnionego projektanta.

### Dalej

- Po restarcie serwera deweloperskiego sprawdzić sub-okno slotów z aktualnym arkuszem CSS.
- Druty niestandardowe są na razie prostymi prętami w slotach; podgięcia i zakłady docinek do zdefiniowania.
- Reguła odsunięcia pierwszego i ostatniego strzemienia od czoła belki czeka na potwierdzenie.

## Sesja 89 — widoczna poświata strzemion i łączny wymiar pakietu

### Zrobione

- Naprawiono realną przyczynę tego, że drut nadal zasłaniał strzemiona na rzucie frontowym. Poświata strzemienia
  była opisana wyłącznie regułą CSS `.beam-constructor-stirrup-halo`, a ta reguła nie trafiała do arkusza
  serwowanego przez serwer deweloperski — element istniał w DOM, ale miał domyślne `stroke: none` i grubość 1 px,
  więc niczego nie przerywał. Dotychczasowa kontrola smoke sprawdzała tylko obecność elementu, dlatego problemu
  nie wykrywała.
- Poświata ma teraz kolor, grubość i `vector-effect` zapisane wprost w atrybutach SVG, więc jej działanie nie
  zależy od tego, czy reguła CSS dotarła do przeglądarki. Grubość jest liczona z grubości linii strzemienia
  i najgrubszego drutu (`3 + 2 × Ø/6 + 2` px), więc przerwa zawsze obejmuje cały drut, także po zmianie średnicy.
  Linia strzemienia również dostała jawne `stroke-width` i `vector-effect`.
- Rzut 2D od boku belki podaje **łączny wymiar pakietu** strzemion. Gdy strefa ustawia więcej niż jedno strzemię
  obok siebie, rysowany jest dodatkowy łańcuch wymiarowy obejmujący cały pakiet — od lica pierwszego strzemienia
  do lica ostatniego, czyli razem z przesunięciem. Dla dwóch strzemion 50 cm przesuniętych o 25 cm daje to 75 cm.
- Wymiar łączny pojawia się w tej osi, w której pakiet faktycznie się rozciąga: przy kierunku lewo/prawo jako
  szerokość, przy kierunku góra/dół jako wysokość. Nie dubluje więc wymiaru pojedynczego strzemienia.

### Walidacja

- `pnpm --filter web typecheck`, `pnpm --filter web lint` — PASS.
- Browser smoke — PASS, 100/100, w tym nowe kontrole poświaty (rzeczywisty kolor betonu, grubość większa od
  sumy strzemienia i dwóch drutów) oraz łącznego wymiaru pakietu w obu kierunkach.
- `pnpm test` — PASS, 13/13. `pnpm build` — PASS, 8/8. `git diff --check` — PASS.
- Weryfikacja konstrukcyjna zbrojenia — NOT RUN, wymaga uprawnionego projektanta.

### Dalej

- Druty niestandardowe nadal nie mają własnej obsługi pakietów — są rzutowane pojedynczo.
- Reguła odsunięcia pierwszego i ostatniego strzemienia od czoła belki czeka na potwierdzenie.

## Sesja 88 — komplet drutów w każdym strzemieniu pakietu i czytelna hierarchia rzutu frontowego

### Zrobione

- Standardowe druty narożne powstają w **każdym** strzemieniu pakietu, a nie tylko w jednym. Gdy najmniejsze
  strzemię jest ustawione jako „Strzemiona obok siebie: 2”, układ generuje 8 drutów — po cztery narożniki na
  każde strzemię pakietu. Nowa funkcja domenowa `beamStandardMainBarBundles` wyznacza rozróżnialne przesunięcia
  pakietu z rzeczywistych rozmieszczeń strzemion, więc obejmuje też lokalne zagęszczenia z własnym pakietem.
- `BeamMainBarCorner` ma teraz `id` unikalne w obrębie całego układu oraz pola `corner` i `bundleIndex`.
  Dzięki temu widoki mogą grupować druty według strzemienia, do którego należą.
- Miniatura kafelka rysuje osobny obrys strzemienia dla każdego pakietu i automatycznie rozszerza pole widzenia,
  gdy pakiet wychodzi poza obrys betonu. Licznik w kafelku pokazuje rzeczywistą liczbę drutów zamiast stałego „4 szt.”.
- Przekrój kotwi druty w obrysie pakietu, do którego należą. Kotwica `sectionMainBarAnchor` liczy teraz środek
  **bazowy** najmniejszego strzemienia, bez przesunięcia pakietu, bo przesunięcie jest już zawarte w narożniku.
  Zapobiega to podwójnemu dodaniu offsetu dla pakietu numer 0.
- Rzut frontowy pokazuje jedną linię na każdy rzeczywisty poziom drutu. Dla pakietu przesuwanego w pionie daje to
  cztery projekcje zamiast dwóch; dla pakietu przesuwanego w poziomie nadal dwie, bo poziomy się pokrywają.
- Strzemiona na rzucie frontowym są rysowane z poświatą w kolorze betonu pod właściwą linią strzemienia.
  Sam porządek warstw nie wystarczał, bo drut i strzemię mają zbliżoną grubość ekranową i wizualnie się zlewały.
  Poświata przerywa drut w miejscu strzemienia, więc od razu widać, że drut przechodzi **wewnątrz** strzemienia.

### Walidacja

- Domain build i test — **PASS**, 83/83; nowy test potwierdza 8 narożników dla pakietu dwóch najmniejszych
  strzemion oraz przesunięcia `+150 mm` dla pakietu numer 1.
- Web typecheck i lint — **PASS**.
- Browser smoke — **PASS**, 97/97; kontrole obejmują liczbę drutów na kafelku, w przekroju i w 3D, zawarcie
  każdego drutu w licu **własnego** strzemienia, cztery projekcje frontowe i obecność poświaty strzemion.
- `pnpm test` — **PASS**, 13/13 zadań.
- `pnpm build` — **PASS**, 8/8 zadań.
- `git diff --check` — **PASS**.
- Weryfikacja konstrukcyjna liczby i rozmieszczenia prętów — **NOT RUN**, wymaga uprawnionego projektanta.

### Dalej

- Druty niestandardowe nie mają jeszcze własnej obsługi pakietów; są rzutowane pojedynczo.
- Zasada odsunięcia pierwszego i ostatniego strzemienia od czoła belki pozostaje niepotwierdzona.

## Sesja 87 — strzemię opasuje drut, rzeczywiste grubości w mm

### Zrobione

- Naprawiono podwójne przesunięcie pionowe prętów głównych w modelu 3D. `Reinforcement3dView` wyliczał bazową
  wysokość z `layerId` i dodatkowo dodawał jawny `offset.z` narożnika, przez co druty lądowały daleko poza
  strzemionami. Jawny `offset.z` wyłącza teraz domyślną wysokość warstwy.
- Wyśrodkowano obrys strzemienia w podglądzie 3D konstruktora. Ścieżka kształtu zaczyna się w punkcie startowym
  i biegnie „w przód”, więc strzemię zajmowało `y ∈ [0, szerokość]` i `z ∈ [0, wysokość]`, podczas gdy druty są
  rozmieszczone symetrycznie wokół zera. Offsety strzemion pomniejszono o połowę ich obrysu.
- Strzemiona są rysowane **na** drutach — zarówno w 3D, jak i w przekroju oraz w miniaturze kafelka. Kolejność
  rysowania odpowiada rzeczywistości wykonawczej: pręt podłużny jest pod strzemieniem, które go opasuje.
- Strzemię w przekroju ma rzeczywistą grubość drutu w milimetrach zamiast stałych 4 jednostek. Usunięto z CSS
  `stroke-width` i `vector-effect: non-scaling-stroke`, które nadpisywały atrybut i powodowały, że grubość
  skalowała się inaczej niż promień okręgu pręta.
- Druty w przekroju są kotwione w faktycznie narysowanym obrysie najmniejszego strzemienia
  (`sectionMainBarAnchor`), a nie w geometrycznym środku betonu. Dzięki temu strzemię ponadwymiarowe,
  wyrównywane do dołu przekroju, nie rozjeżdża się z prętami.
- Miniatura kafelka rysuje pręt w rzeczywistej skali `Ø / 2` zamiast sztucznie powiększonego promienia.
- Znacznik drutu na rzucie frontowym 2D ma połowę średnicy pręta, bo w tej projekcji reprezentuje parę
  nakładających się prętów, a nie pojedynczy przekrój. Po dalszej weryfikacji na ekranie zmniejszono go
  jeszcze trzykrotnie, do `Ø / 6`, ponieważ gruba linia zasłaniała łańcuchy wymiarowe stref i rozstawu.
- Rzut frontowy 2D ma jawne warstwy rysunkowe `data-front-layer="bars"` i `data-front-layer="stirrups"`.
  Wszystkie pręty podłużne — standardowe i w przyszłości niestandardowe — trafiają do warstwy prętów, a
  strzemiona do warstwy rysowanej nad nią. Dzięki temu na froncie widać, że drut biegnie wewnątrz strzemienia.

### Walidacja

- Domain build i test — **PASS**, 82/82; dodano jawne sprawdzenie styczności: `|offset| + Ø drutu / 2` równa się
  wewnętrznemu licu strzemienia.
- Web typecheck i lint — **PASS**.
- Browser smoke — **PASS**, 95/95; nowe kontrole sprawdzają, że cztery druty mieszczą się wewnątrz lica
  najmniejszego strzemienia, że obrysy strzemion występują w DOM po prętach i że rzut frontowy ma warstwę
  prętów przed warstwą strzemion przy grubości znacznika `Ø / 6`.
- `pnpm test` — **PASS**, 13/13 zadań.
- `pnpm build` — **PASS**, 8/8 zadań.
- `git diff --check` — **PASS**.
- Weryfikacja konstrukcyjna zbrojenia — **NOT RUN**, wymaga uprawnionego projektanta.

### Dalej

- Niestandardowe druty nadal nie mają graficznego pozycjonowania w przekroju; wpisuje się offsety liczbowo.
- Zasada odsunięcia pierwszego i ostatniego strzemienia od czoła belki pozostaje niepotwierdzona przez
  użytkownika (obecnie połowa szerokości elementu).

## Sesja 86 — projekcja frontowa i dokładne osadzenie drutów w narożnikach

### Zrobione

- Rzut frontowy 2D pokazuje dwie widoczne linie drutów głównych: górną i dolną. Nie renderuje już czterech
  elementów nakładających się parami w tej samej projekcji.
- Cztery fizyczne druty pozostają widoczne w przekroju, kafelku i modelu 3D oraz nadal są zapisywane jako cztery
  encje na każdy segment hosta.
- Położenie drutów względem najmniejszego strzemienia uwzględnia średnicę strzemienia i średnicę drutu.
  Środek drutu jest przesunięty od osi narożnika do wnętrza o `(Ø strzemienia + Ø drutu) / 2`, dzięki czemu
  okrąg pręta jest styczny do obu wewnętrznych ramion strzemienia zamiast leżeć na jego osi.
- Miniatura standardowego układu rysuje niezależnie rzeczywisty obrys najmniejszego strzemienia, więc zmiana
  średnicy drutu przesuwa pręty do wewnątrz bez sztucznego zmniejszania samego strzemienia.

### Walidacja

- Domain build i test — **PASS**, 82/82; dla strzemienia Ø8, drutu Ø12 i obrysu 30 × 40 cm środki prętów
  znajdują się na offsetach ±14 × ±19 cm.
- Web typecheck i lint — **PASS**.
- Browser smoke — **PASS**, 93/93; front ma 2 projekcje, przekrój/kafelek/3D zachowują 4 druty.
- `pnpm test` — **PASS**, 13/13 zadań.
- `pnpm build` — **PASS**, 8/8 zadań.
- `git diff --check` — **PASS**.

### Dalej

- Rozbudować pozycjonowanie niestandardowych drutów w przekroju i wzdłuż belki.
- Potwierdzić z użytkownikiem docelową regułę odsunięcia pierwszego i ostatniego strzemienia.
- Weryfikacja średnic, otulenia, położenia i nośności prętów pozostaje **NOT RUN** — wymaga uprawnionego projektanta.

## Sesja 85 — wspólna sekcja standardowych i niestandardowych drutów

### Zrobione

- Sekcja „2. Druty główne” całkowicie zastąpiła dawny formularz „Pręty podłużne i indywidualne” wyświetlany
  pod Konstruktorem belek.
- Kafelek „Dodaj standardowe druty” przeniesiono do tej samej responsywnej siatki co kafelek `+` drutów
  niestandardowych. Oba sąsiadują ze sobą, a po utworzeniu układu kafelek dodawania standardowego znika
  i zostaje zastąpiony kafelkiem konfiguracji czterech prętów.
- Odblokowano kafelek `+` drutów niestandardowych. Otwiera wyśrodkowane sub-okno wykorzystujące istniejący
  edytor kształtu, średnicy, otuliny, orientacji, stali, odniesienia projektowego i segmentów gięcia.
- Wybór kształtu w bibliotece przechodzi do Konstruktora belek i otwiera to samo sub-okno z wczytaną geometrią.
  Udane dodanie pręta zamyka sub-okno i przełącza szczegóły elementu na model 3D.
- Zachowano dotychczasową logikę zapisu standardowych czterech prętów i ręcznie definiowanych prętów; zmiana
  porządkuje ich powierzchnię UI bez wprowadzania drugiego modelu danych.

### Walidacja

- Web typecheck i lint — **PASS**.
- Browser smoke — **PASS**, 93/93; obejmuje sąsiednie aktywne kafelki, znikanie kafelka standardowego, brak
  starego formularza inline, otwieranie/zamykanie sub-okna, wczytanie kształtu z biblioteki i zapis pręta.
- `pnpm test` — **PASS**, 13/13 zadań; schemas 44/44, domain 82/82.
- `pnpm build` — **PASS**, 8/8 zadań.
- `git diff --check` — **PASS**.

### Dalej

- Rozbudować pozycjonowanie niestandardowych drutów w przekroju i wzdłuż belki zamiast ograniczać ich położenie
  do istniejącego mechanizmu ręcznego pręta przypisanego do hosta.
- Potwierdzić z użytkownikiem docelową regułę odsunięcia pierwszego i ostatniego strzemienia.
- Weryfikacja średnic, otulenia, położenia i nośności prętów pozostaje **NOT RUN** — wymaga uprawnionego projektanta.

## Sesja 84 — standardowe druty w narożnikach najmniejszego strzemienia

### Zrobione

- Dodano w Konstruktorze belek osobną sekcję „2. Druty główne”. Przed utworzeniem układu pokazuje przycisk
  „Dodaj standardowe druty” oraz nieaktywny kafelek `+` zapowiadający późniejsze druty niestandardowe.
- Przycisk standardowy jest dostępny dopiero po dodaniu co najmniej jednego strzemienia. Po kliknięciu znika,
  a w jego miejscu pojawia się jeden usuwalny kafelek standardowego układu z polem średnicy drutu.
- Standardowy układ wyszukuje strzemię o najmniejszym polu obrysu i umieszcza cztery pręty podłużne w narożnikach
  jego rzeczywistej geometrii. Położenie aktualizuje się automatycznie po zmianie zestawu strzemion.
- Cztery druty są widoczne na rzucie frontowym, przekroju, miniaturze kafelka i w modelu 3D. Rzut frontowy
  zachowuje prawidłowe nakładanie się dwóch par w projekcji, a przekrój pokazuje cztery odrębne narożniki.
- Usunięcie kafelka usuwa cały czteroprętowy układ i przywraca przycisk „Dodaj standardowe druty”. Usunięcie
  ostatniej strefy strzemion również usuwa zależną konfigurację drutów.
- Zapis konfiguracji generuje cztery fizyczne encje prętów dla każdego segmentu logicznej belki, przypisane
  do wspólnej grupy konstrukcji i warstw górnej/dolnej. Ponowne otwarcie konstruktora zachowuje średnicę kafelka.
- Usunięto błędny szkic stałej palety Ø8–Ø32 z biblioteki kształtów i formularza ręcznych prętów. Standardowy
  układ jest jedną konfiguracją belki, a nie zbiorem przycisków tworzących pojedyncze, niezależne pręty.

### Walidacja

- Schemas — **PASS**, 44/44; konfiguracja standardowych drutów wymaga co najmniej jednej strefy strzemion.
- Domain — **PASS**, 82/82; z dwóch strzemion wybierany jest mniejszy obrys i zwracane są jego cztery narożniki.
- Web typecheck i lint — **PASS**.
- Browser smoke — **PASS**, 89/89; pełny cykl przycisk → kafelek → średnica → usunięcie → powrót przycisku
  → ponowne dodanie → zapis → cztery encje górne/dolne → ponowne otwarcie.
- `pnpm test` — **PASS**, 13/13 zadań.
- `pnpm build` — **PASS**, 8/8 zadań.
- `git diff --check` — **PASS**.

### Dalej

- Zaimplementować aktywny kafelek `+` dla niestandardowych przebiegów drutów; obecnie jest świadomie nieaktywną
  zapowiedzią zgodnie z zakresem tej sesji.
- Potwierdzić z użytkownikiem docelową regułę odsunięcia pierwszego i ostatniego strzemienia.
- Weryfikacja średnic, otulenia i położenia narożnych prętów pozostaje **NOT RUN** — wymaga uprawnionego projektanta.

## Sesja 83 — modal przekroczenia, kolorowe wymiary pakietów i pełna nawigacja

### Zrobione

- Potwierdzenie strzemienia wyższego od zalewanego etapu przeniesiono z komunikatu inline do wyśrodkowanego,
  modalnego sub-okna w stylistyce biblioteki. Okno zawiera podgląd kształtu, wysokość strzemienia, wysokość betonu,
  wielkość wystawania i jednoznaczne akcje „Wybierz inne” oraz „Potwierdź i oznacz do weryfikacji”.
- Każdy egzemplarz pakietu strzemion ma na rzucie bocznym stały, odrębny kolor. Dla każdego egzemplarza
  renderowane są osobne, odsunięte łańcuchy wymiarowe szerokości i wysokości opisane `S1`, `S2`, `S3` lub `S4`.
  Kadr automatycznie uwzględnia dodatkowe linie wymiarowe.
- Rzut frontowy i boczny mają spójne przyciski przybliżania, oddalania i dopasowania kadru, zoom kółkiem myszy
  oraz przesuwanie przeciąganiem.
- Model 3D otrzymał jawne przyciski zoomu, wskaźnik procentowy, osobne tryby „Obrót” i „Przesuwanie” oraz reset
  przywracający zoom, obrót i położenie. W trybie przesuwania można rozpocząć gest także bezpośrednio na pręcie.
- Obszar betonu na obu rzutach 2D i w modelu 3D ma etykietę „BETON” z linią prowadzącą poza zbrojeniem, dzięki
  czemu opis nie zasłania prętów ani strzemion.

### Walidacja

- Web typecheck i lint — **PASS**.
- Browser smoke — **PASS**, 83/83. Kontrole obejmują modal wyśrodkowany w viewportcie, osobne kolory i dwa
  wymiary każdego strzemienia pakietu, opisy betonu, zoom/pan/reset frontu i boku oraz zoom/pan/reset modelu 3D.
- `pnpm test` — **PASS**, 13/13 zadań; schemas 43/43, domain 81/81.
- `pnpm build` — **PASS**, 8/8 zadań.
- `git diff --check` — **PASS**.

### Dalej

- Potwierdzić z użytkownikiem docelową regułę odsunięcia pierwszego i ostatniego strzemienia; obecnie jest to
  połowa szerokości elementu.
- Rozbudować konstruktor o prowadzenie prętów podłużnych przez kilka segmentów i zestawienie całego ciągu.
- Weryfikacja konstrukcyjna rozstawów, otulenia i strzemion wystających ponad beton pozostaje **NOT RUN** —
  wymaga uprawnionego projektanta.

## Sesja 82 — rzeczywista skala strzemienia, kontrola wysokości i nawigacja rzutu

### Zrobione

- Naprawiono skalę strzemienia na rzucie bocznym. Wcześniej rysowany był umowny prostokąt o wymiarach 80%
  przekroju betonu, przez co strzemię 50 × 50 cm pokazywało się jako 40 cm. Teraz rzut używa rzeczywistego
  obrysu kształtu z biblioteki, w tej samej skali co beton.
- Dodano w `packages/domain` czystą funkcję `reinforcementShapeOutline`, która zwraca rzut kształtu na jego
  dominującą płaszczyznę wraz z rzeczywistą szerokością i wysokością. Podgląd 2D kształtu korzysta z tej samej
  funkcji, więc miniatury, biblioteka i rzut boczny mają jedno źródło rzutowania.
- Rzut boczny wymiaruje własną szerokość i wysokość strzemienia, niezależnie od wymiarów betonu.
- Dodano kontrolę wysokości. Strzemię wyższe od wysokości zalewanego etapu nie jest dodawane automatycznie.
  Konstruktor pokazuje ostrzeżenie z obiema wysokościami i wielkością wystawania oraz przyciski „Wybierz inne”
  i „Potwierdź”. Po potwierdzeniu strefa dostaje flagę `oversizeAccepted`, widoczne oznaczenie, a belka jest
  zapisywana ze statusem „do weryfikacji”.
- Rzut frontowy wymiaruje teraz również sam rozstaw. Kolejne odcinki o jednakowym rozstawie są łączone
  w jeden łańcuch opisany jako „liczba × rozstaw”, więc zagęszczenia są widoczne jako osobne łańcuchy.
- Rzut boczny ma przybliżanie i oddalanie kółkiem myszy oraz przyciskami, przesuwanie przeciąganiem
  i przycisk „Dopasuj widok” przywracający pełny kadr.

### Walidacja

- Schemas — **PASS**, 43/43. Domain — **PASS**, 81/81.
- Web typecheck i lint — **PASS**.
- Browser smoke — **PASS**, 75/75, w tym rzeczywista skala strzemienia, obie ścieżki ostrzeżenia
  o wystającym strzemieniu, wymiary rozstawu oraz zoom, pan i reset rzutu bocznego.
- `pnpm test` — **PASS**, 13/13. `pnpm build` — **PASS**, 8/8. `git diff --check` — **PASS**.

### Dalej

- Potwierdzić z użytkownikiem docelową regułę odsunięcia pierwszego i ostatniego strzemienia; obecnie jest to
  połowa szerokości elementu.
- Pręty podłużne w konstruktorze belek: prowadzenie przez kilka segmentów i zestawienie stali całego ciągu.
- Weryfikacja konstrukcyjna rozstawów, otulenia i strzemion wystających ponad beton pozostaje **NOT RUN** —
  wymaga uprawnionego projektanta.

## Sesja 81 — kierunkowe pakiety strzemion, centymetry i wymiary belki

### Zrobione

- Zmieniono semantykę „strzemion obok siebie”. Pakiet nie rozsuwa już strzemion wzdłuż osi belki. Wszystkie
  egzemplarze zachowują tę samą stację i ten sam rozstaw, natomiast kolejne dostają offset w przekroju.
- Dodano kierunki przesunięcia: w lewo, w prawo, do góry i w dół. Pierwsze strzemię pozostaje w położeniu
  bazowym, a każde następne jest przesunięte o wielokrotność zadanego odstępu osiowego.
- Kierunek i przesunięcie działają osobno dla podstawowej strefy oraz lokalnego zagęszczenia. Podgląd boczny i 3D
  pokazują rzeczywiste rozdzielenie pakietu; rzut frontowy zachowuje wspólne stacje.
- Wszystkie pola długości strefy, początku i długości zagęszczenia, rozstawu oraz przesunięcia pakietu pokazują
  centymetry. Model domenowy i dokument CAD nadal przechowują wartości w milimetrach.
- Dodano przycisk „Cała belka” przy długości strefy. Wypełnia on cały pozostały dopuszczalny zakres elementu;
  użycie na wcześniejszej strefie usuwa późniejsze strefy, aby nie tworzyć zerowych ani nakładających się zakresów.
- Rzut frontowy otrzymał linie wymiarowe pełnej długości, wysokości i każdej strefy. Rzut boczny wymiaruje
  szerokość i wysokość przekroju. Wszystkie etykiety rzutów konstruktora są w centymetrach.
- Wygenerowane encje planu uwzględniają przesunięcie lewo/prawo względem lokalnej osi hosta. Kierunek pionowy
  pozostaje widoczny w konfiguracji oraz podglądach bocznym i 3D.

### Nie zrobione / do weryfikacji

- Konstruktor nie oblicza automatycznie odstępu wymaganego do ustawienia osi kolejnego strzemienia dokładnie
  na licu lub osi boku pierwszego; użytkownik podaje przesunięcie osiowe w centymetrach.
- Dobór liczby strzemion w pakiecie, kierunku i odstępu wymaga sprawdzenia przez uprawnionego projektanta.
- Trwały zapis osobistej biblioteki w Supabase pozostaje **BLOCKED** przez brak `apps/web/.env.local`.

### Walidacja

- Schemas — **PASS**, 42/42.
- Domain — **PASS**, 80/80; wspólne stacje pakietu i offset pionowy.
- Web typecheck i lint — **PASS**.
- Browser smoke — **PASS**, 65/65; kierunek „do góry”, wspólne stacje, centymetry, „Cała belka” i wymiary 2D.
- `pnpm test` — **PASS**, 13/13 zadań monorepo.
- `pnpm build` — **PASS**, 8/8 zadań monorepo.
- `git diff --check` — **PASS**.

## Sesja 80 — czytelne podglądy i duża biblioteka strzemion

### Zrobione

- Przebudowano wizualnie trzy podglądy konstruktora belki. Rzuty frontowy i boczny mają teraz jawne jasnoniebieskie
  wypełnienie betonu, zielone strzemiona, jasne tło techniczne, większą wysokość i czytelne karty.
- Usunięto przyczynę czarnych albo błędnie kolorowanych modeli 3D. Każda instancja podglądu otrzymuje własny
  identyfikator gradientu SVG zamiast wspólnego `rebar-steel`, który kolidował przy kilku modelach na stronie.
- Sub-okno wyboru strzemienia jest teraz rzeczywiście wycentrowane względem ekranu i ma do 1380 px szerokości
  oraz 92% wysokości widoku. Nagłówek, pasek wyszukiwania i przewijana siatka są osobnymi, stabilnymi obszarami.
- Dodano wyszukiwanie po nazwie oraz średnicy zapisanej jako `Ø8` lub `fi8`, licznik wyników i osobny czytelny
  stan pustego wyniku.
- Na szerokim ekranie biblioteka ma pięć kolumn, czyli mieści około 10 propozycji w dwóch rzędach. Przy mniejszych
  szerokościach przechodzi do czterech i trzech kolumn, a na telefonie zajmuje pełny ekran i używa dwóch kolumn.
- Kafelki wyboru mają większy podgląd wymiarowanego strzemienia, nazwę, średnicę i liczbę części.

### Nie zrobione / do weryfikacji

- Siatka pokazuje wszystkie strzemiona istniejące w osobistej bibliotece; nie dodano automatycznie nowych
  domyślnych kształtów. Jeżeli konto ma mniej niż 10 zapisanych strzemion, pozostałe miejsca siatki są puste.
- Trwały zapis osobistej biblioteki w Supabase pozostaje **BLOCKED** przez brak `apps/web/.env.local`.

### Walidacja

- Web typecheck i lint — **PASS**.
- Browser smoke — **PASS**, 61/61; jasne kolory, unikalne gradienty, wycentrowanie, rozmiar, pięć kolumn,
  wyszukiwanie po nazwie/średnicy, pusty wynik i mobile bez overflow.
- `pnpm --filter web build` — **PASS**.
- `git diff --check` — **PASS**.

## Sesja 79 — konstruktor belek i stref strzemion

### Zrobione

- Drugi krok „Pręty i edycja” zmieniono z prostego formularza na „Konstruktor belek”. Konstruktor pobiera nazwę,
  długość, szerokość, wysokość i wszystkie identyfikatory segmentów bezpośrednio z wybranego logicznego elementu
  rzutu. Nie powstaje niezależna geometria belki.
- Dodano trzy zsynchronizowane podglądy: rzut 2D od frontu, rzut 2D od boku i interaktywny model 3D. Pierwsze
  i ostatnie dopuszczalne strzemię są widoczne i odsunięte o połowę szerokości elementu od jego końców.
- Dodano kafelkowe strefy strzemion. Kafelek „+” otwiera bibliotekę użytkownika, a po wyborze kształtu udostępnia
  długość strefy, rozstaw podstawowy, pakiet 1–4 strzemion, odstęp pakietu oraz dowolną liczbę lokalnych
  zagęszczeń z własnym położeniem, długością, rozstawem i pakietem.
- Kolejna strefa rozpoczyna się automatycznie na końcu poprzedniej. Zakres jest ograniczony długością elementu,
  a wspólna stacja sąsiadujących stref daje jedno fizyczne strzemię zamiast dwóch nałożonych.
- Dodano typowany, trwały model `reinforcementBeams` w dokumencie CAD. Zapis rozwija strefy do encji `rebar-line`,
  mapuje stacje całej logicznej belki na właściwe segmenty hostów i zastępuje tylko encje tej konfiguracji.
  Pręty podłużne i indywidualne pozostały dostępne poniżej konstruktora.
- Rozszerzono ścieżkę 3D pręta o płaszczyzny XY, XZ i YZ. Dzięki temu strzemiona podglądu są rysowane
  prostopadle do osi belki.
- Dodano responsywną szatę konstruktora. Przy szerokości 390 px podglądy, strefy i pola przechodzą do jednej
  kolumny bez poziomego przepełnienia.

### Nie zrobione / do weryfikacji

- Odsunięcie pierwszego i ostatniego strzemienia jest obecnie stałą regułą geometryczną równą połowie szerokości
  elementu. Ewentualna edycja tej wartości i reguły projektowe wymagają osobnego wymagania oraz weryfikacji
  uprawnionego projektanta.
- Konstruktor nie dobiera automatycznie średnic, rozstawu ani zagęszczeń i nie deklaruje nośności ani zgodności
  normowej.
- Dalsza rozbudowa dedykowanego układu prętów podłużnych w belce pozostaje następnym krokiem; dotychczasowy
  uniwersalny edytor prętów jest zachowany jako sekcja kompatybilna.
- Trwały zapis osobistej biblioteki kształtów w Supabase pozostaje **BLOCKED** przez brak `apps/web/.env.local`.

### Walidacja

- Schemas — **PASS**, 42/42; kolejne strefy, zagęszczenia i granice belki.
- Domain — **PASS**, 80/80; rozstaw, pakiety, zagęszczenia, deduplikacja styku, mapowanie wielosegmentowe
  i płaszczyzny XZ/YZ.
- Web typecheck i lint — **PASS**.
- Browser smoke — **PASS**, 55/55; dwa widoki 2D, 3D, dwie strefy, zagęszczenie, pakiet, zapis i mobile.
- `pnpm test` — **PASS**, 13/13 zadań monorepo.
- `pnpm build` — **PASS**, 8/8 zadań monorepo.
- `git diff --check` — **PASS**.

## Sesja 78 — średnica drutu i czytelność rysunku kształtu

### Zrobione

- Usunięto wszystkie kropki z osi pręta w podglądzie 2D i na miniaturach. Drut jest teraz rysowany równomiernie
  na całej długości z zaokrąglonymi zakończeniami, więc żaden koniec nie wygląda na ucięty ani nie zasłania
  wymiarów.
- Dodano definiowanie średnicy drutu w kreatorze podgięć i strzemion. Pole „Średnica drutu Ø (mm)” przyjmuje
  dowolną wartość i podpowiada typowy szereg od Ø4,5 do Ø32.
- Średnica jest zapisywana w kształcie (`diameterMm` w `ReinforcementShapeSchema`), więc trafia do biblioteki
  użytkownika bez migracji bazy — kolumna `shape` jest typu `jsonb`.
- Grubość rysowanego drutu w 2D i 3D wynika z wybranej średnicy, a promień gięcia nie jest już stałą 20 mm:
  wynika z minimalnej średnicy trzpienia gnącego (2Ø do Ø16, 3,5Ø powyżej) i nie schodzi poniżej 20 mm.
  Kreator podaje obliczony promień wprost w podpowiedzi.
- Średnica jest widoczna w podsumowaniu kafelka i w szczegółach kształtu, a po wybraniu „Użyj w edytorze pręta”
  przechodzi do pola Ø edytora pręta.
- Dodano odsuwanie kolidujących etykiet wymiarowych. Gdy etykieta nachodziłaby na wcześniej umieszczoną,
  jej łańcuch wymiarowy jest przesuwany o jeden krok na zewnątrz — rozwiązuje to nakładanie opisu krótkiego
  haka na opis długiego boku strzemienia.

### Nie zrobione / do weryfikacji

- Odsuwanie etykiet wykonuje jeden krok. Przy kształtach z kilkoma bardzo krótkimi odcinkami w jednym narożniku
  opisy mogą nadal być ciasne na miniaturze.
- Promień gięcia jest wspólny dla wszystkich części kształtu. Różne promienie na poszczególnych gięciach
  pozostają do wykonania.
- Trwały zapis biblioteki w Supabase pozostaje **BLOCKED** przez brak `apps/web/.env.local`.

### Walidacja

- Schemas — **PASS**, 40/40, w tym opcjonalna średnica i odrzucenie Ø0.
- Web typecheck i lint — **PASS**.
- Browser smoke — **PASS**, 50/50.
- `pnpm test` — **PASS**, 13/13 zadań monorepo.
- `pnpm build` — **PASS**, 8/8 zadań monorepo.
- Kontrola wizualna strzemienia Ø8 30×50 z hakami — **PASS**.

## Sesja 77 — wymiarowane miniatury kafelków biblioteki

### Zrobione

- Miniatury kształtów w kafelkach biblioteki podgięć i strzemion rysują teraz te same znaczniki wymiarowe co
  duży podgląd 2D: linie pomocnicze, kreski stacji, linię bazową, etykietę długości w centymetrach oraz łuk
  i etykietę kąta każdego gięcia. Wcześniej tryb `compact` jawnie pomijał wymiary i kąty.
- Wprowadzono skalowalne parametry rysunku (`font`, `offset`, `tick`, `labelGap`, `arc`) zamiast wartości
  wpisanych na sztywno. Dzięki temu oba rozmiary podglądu korzystają z jednej logiki rysowania, a miniatura
  ma własny, mniejszy zestaw proporcji.
- Zwiększono margines wewnętrzny miniatury, aby etykiety mieściły się w `viewBox`, oraz zmniejszono grubość
  pręta w trybie kompaktowym, żeby nie zasłaniał łańcuchów wymiarowych.
- Łańcuchy wymiarowe i opisy kątów rysowane są teraz nad prętem, a nie pod nim — etykieta krótkiego odcinka
  nie znika już pod grubą linią pręta w gęstych kształtach.
- Podniesiono wysokość miniatury i minimalną wysokość kafelka (również w widoku mobilnym), aby gęstszy rysunek
  nie był ściskany.

### Nie zrobione / do weryfikacji

- Przy bardzo gęstych kształtach wieloczęściowych sąsiednie etykiety mogą się częściowo nakładać. Dotyczy to
  w równym stopniu dużego podglądu i wynika z geometrii, a nie z trybu kompaktowego.
- Trwały zapis biblioteki w Supabase pozostaje **BLOCKED** przez brak `apps/web/.env.local`.

### Walidacja

- Web typecheck i lint — **PASS**.
- Browser smoke — **PASS**, 44/44, w tym trzy nowe kontrole miniatury kafelka.
- `pnpm test` — **PASS**, 13/13 zadań monorepo.
- `pnpm build` — **PASS**, 8/8 zadań monorepo.
- Kontrola wizualna siatki czterech kafelków (prosty, L, strzemię U, kształt wieloczęściowy) — **PASS**.

## Sesja 76 — wstawianie części i obrót całego kształtu

### Zrobione

- Dodano punkt wstawiania przed pierwszą częścią oraz pomiędzy każdą parą części podgięcia lub strzemienia.
  Użytkownik może dopisać zapomniany odcinek w dowolnym miejscu bez usuwania ani ponownego wpisywania dalszych
  wymiarów. Wstawiona część ma początkowo 50 cm i kąt 0°, więc zachowuje kierunek dalszej geometrii.
- Punkty wstawiania są widoczne jako pomarańczowe przyciski na przerywanej linii. Po wstawieniu wszystkie części
  są automatycznie numerowane ponownie, a podglądy 2D/3D i znaczniki wymiarowe aktualizują się natychmiast.
- Dodano zapisywaną orientację całego kształtu. Kreator ma przyciski obrotu w lewo o 90°, o 180°, w prawo o 90°,
  reset do 0° oraz pole dokładnego kąta w zakresie od −360° do 360°.
- `ReinforcementShapeSchema` ma opcjonalne `rotationDegrees`, dzięki czemu starsze kształty pozostają zgodne i
  są interpretowane jako 0°. Silnik `reinforcementPath3d` obraca zarówno odcinki płaskie, jak i azymuty odcinków
  przestrzennych.
- Obrót przechodzi przez bibliotekę, podglądy 2D/3D, sub-okno szczegółów i uniwersalny edytor pręta. Utworzony
  pręt zachowuje orientację; obrót nie zmienia długości rozwiniętej.

### Walidacja

- Schemas — **PASS**, 39/39, w tym akceptacja 90° i odrzucenie 361°.
- Domain — **PASS**, 79/79, w tym współrzędne ścieżki po obrocie 90° i niezmienna długość rozwinięta.
- Web typecheck i lint — **PASS**.
- Browser smoke — **PASS**, 41/41: wstawienie na początku zachowuje wcześniejsze części, obrót aktualizuje
  geometrię, orientacja zapisuje się w bibliotece i przechodzi do edytora pręta, mobile bez overflow.
- `pnpm test` — **PASS**, 13/13 zadań monorepo.
- `pnpm build` — **PASS**, 8/8 zadań monorepo.

## Sesja 75 — wymiarowany podgląd 2D kształtu i szata kreatora

### Zrobione

- Podgląd 2D kształtu w kreatorze rysuje pełne łańcuchy wymiarowe w konwencji canvasów rzutu: linie pomocnicze,
  prostopadłe kreski stacji, linię bazową i etykietę na białym tle, odsuniętą od osi pręta.
- Każda część ma wymiar długości w centymetrach, obrócony wzdłuż odcinka i odwracany tak, aby tekst nigdy nie
  był do góry nogami. Linia wymiarowa jest odsuwana na zewnątrz kształtu względem jego środka ciężkości.
- Każde gięcie o kącie różnym od 0° ma łuk opisujący rzeczywisty kąt między odcinkami, znacznik wierzchołka
  oraz etykietę na dwusiecznej. Podpowiedź `title` podaje kąt i promień gięcia.
- Rysunek dostał siatkę modułową, gradientowy pręt z poświatą, węzły początku i końca oraz legendę kolorów
  (oś pręta, długości części, kąty gięcia). Tryb `compact` kafelków biblioteki nie rysuje wymiarów.
- Identyfikatory `pattern` i `linearGradient` pochodzą z `useId`, dzięki czemu wiele podglądów na jednej stronie
  nie nadpisuje sobie definicji SVG.
- Sub-okna biblioteki i kreatora dostały nową szatę: przyklejony gradientowy nagłówek z chipem kategorii,
  przewijane ciało, przyklejoną stopkę z akcją główną, karty podglądów, numerowane pigułki części oraz
  wyróżnioną podpowiedź. Układ mobilny jest pełnoekranowy i jednokolumnowy.
- Sub-okno szczegółów pokazuje długość rozwiniętą liczoną z geometrii osi pręta (`developedLengthOfShape`),
  a nie sumę wymiarów nominalnych.

### Walidacja

- Web typecheck i lint — **PASS**.
- Browser smoke — **PASS**, 36/36, w tym dwie nowe kontrole: obecność linii, kresek i etykiet wymiarowych oraz
  łuku z poprawną wartością kąta 90°.
- `pnpm test` — **PASS**, 13/13 zadań monorepo.
- `pnpm build` — **PASS**, 8/8 zadań monorepo.
- `git diff --check` — **PASS**.
- Zapis kształtu po przejściu formularza na `display: contents` — **PASS** (scenariusz otwiera szczegóły
  zapisanego kształtu i potwierdza wpis w magazynie demo).

### Dalej

- Stały runner E2E w repozytorium zamiast scenariusza w przestrzeni sesji.
- Wymiarowanie podglądu w pełnym edytorze pręta i w rysunkach eksportu.

## Sesja 74 — osobista biblioteka podgięć i strzemion

### Zrobione

- Przebudowano zakładkę „Pręty i edycja” na trzy kroki: przygotowanie kształtów, dodawanie prętów oraz edycję
  zapisanych prętów.
- Dodano osobistą bibliotekę podgięć i strzemion z kafelkami, miniaturą 2D, nazwą, rodzajem i zestawem wymiarów.
  Ostatni kafelek zawsze otwiera formularz dodawania nowego kształtu.
- Dodano osobne sub-okna szczegółów i tworzenia kształtu. Oba pokazują wspólną geometrię w 2D i interaktywnym 3D.
- Kreator pozwala podać nazwę i dowolną liczbę odcinków długość–kąt. Długość minimalna wynosi 5 cm, kąt może
  wynosić 0°, a niezerowy kąt musi mieć co najmniej 1°. Kąt jest jawnie opisany jako gięcie po danym odcinku.
- Wybrany kształt można skopiować do istniejącego uniwersalnego edytora pręta i dalej uzupełnić o średnicę,
  otulinę, stal, promienie oraz płaszczyzny gięcia.
- Biblioteka jest zapisywana per konto w nowej tabeli `reinforcement_shape_templates`, zabezpieczonej RLS dla
  właściciela. Tryb demonstracyjny ma równoważny trwały zapis w osobnym kluczu `localStorage`.
- Dodano schemat współdzielony, typ API, endpoint GET/POST, migrację oraz testy granic długości, kąta i zgodności
  kategorii strzemienia.
- Interfejs mobilny używa pełnoekranowych sub-okien, pionowych kroków oraz formularza segmentów bez poziomego
  przewijania.
- Schematy 39/39, browser smoke 34/34, pełne testy 13/13, build 8/8, Web typecheck/lint i kontrola whitespace
  zakończyły się **PASS**.

### Ograniczenia i następne kroki

- Biblioteka obsługuje obecnie tworzenie i użycie kształtu; zmiana nazwy, edycja oraz usuwanie pozycji pozostają
  do wykonania.
- Formularz pierwszej wersji używa stałego promienia roboczego 20 mm i płaszczyzny XY. Dokładny promień oraz
  gięcia przestrzenne można nadal ustawić po przejściu do drugiego kroku edytora pręta.
- Domyślne kształty systemowe pozostają do przygotowania zgodnie z późniejszą decyzją użytkownika.
- Weryfikacja migracji i RLS na lokalnym Supabase pozostaje **BLOCKED** z powodu braku `apps/web/.env.local`.

## Sesja bieżąca — kompletny rdzeń edytora zbrojenia

### Zrobione

- Naprawiono strukturę domenowego modułu zbrojenia: funkcje `developedLengthOfShape`,
  `reinforcementPath3d` i `createBentRebarEntity` są publicznymi eksportami.
- Przebudowano pakiet schematów i odświeżono zależności domeny, dzięki czemu `shape` pręta jest
  poprawnie dostępny w typach `rebar-line`.
- Edytor UI pozwala dodawać pręty z segmentami, kątami, promieniami i płaszczyzną gięcia,
  zapisywać je jako encje przypisane do istniejącego elementu oraz oglądać je w interaktywnym
  podglądzie przestrzennym z obrotem, zoomem, wyborem i filtrowaniem warstw.
- Zestawienie uwzględnia długość rozwiniętą giętego kształtu i masę wynikającą z liczby sztuk.
- Dodano trwałe łączenie uporządkowanych odcinków w jeden host zbrojenia oraz jego rozdzielanie.
  Oryginalne encje rzutu pozostają bez zmian, a węzły T/X nie są scalane automatycznie.
- Fingerprint geometrii wykrywa zmianę hosta i oznacza ręcznie zaprojektowany układ jako wymagający
  ponownej weryfikacji, bez automatycznego rozciągania lub nadpisywania prętów.
- Dodano bibliotekę szablonów dokumentu i stosowanie układu na innym liniowym elemencie z transformacją
  do jego osi.
- Dodano walidację brakującego materiału, otuliny, kolizji 2D w tej samej warstwie, małego promienia
  gięcia i nieaktualnej geometrii hosta. Kontrole są ostrzeżeniami technicznymi, nie obliczeniami nośności.
- Dodano eksport zestawienia CSV, rysunku SVG/PNG oraz druk systemowy do PDF.
- Rysunek zbrojenia bez własnych encji automatycznie korzysta z istniejącego rzutu fundamentów.
- Test przeglądarkowy potwierdził pobranie rzutu, dynamiczne etapy, połączenie odcinków, pręt gięty,
  podgląd 3D, komunikaty walidacji oraz brak poziomego overflow na desktopie i ekranie 390 × 844 px.
- Nie zmieniono źródłowego rzutu; dane zbrojenia są zapisywane przez istniejący `commit`/autosave.
- Pełne `pnpm test`, `pnpm build`, Web lint/typecheck i `git diff --check` zakończyły się **PASS**.

### Ograniczenia i następne kroki

- Podgląd 3D jest interaktywną projekcją SVG z grubością wynikającą ze średnicy, ale nie jest rendererem
  WebGL/B-Rep i nie przechowuje jeszcze analitycznych łuków przestrzennych jako osobnych krzywych.
- Dedykowane semantyczne obiekty haków, zakładów, kotwień i wieloramiennych strzemion pozostają do wykonania.
- Siatki płyt i ścian nie mają jeszcze grupowej edycji, indywidualizacji prętów ani docinania do otworów
  i nieregularnych obrysów.
- Narzędzia połączeń L/T/X korzystają obecnie z uniwersalnych prętów i szablonów; brak dedykowanego kreatora.
- Pełne kolizje 3D, walidacja normowa, eksport XLSX oraz test na fizycznym telefonie pozostają **NOT RUN**.
- Referencyjny rzut jest pobierany automatycznie przy inicjalizacji pustego dokumentu zbrojenia; ciągła,
  dwukierunkowa synchronizacja każdej późniejszej zmiany rzutu pozostaje do wykonania.

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

## Sesja 3 — 11 października 2026

### Zrobione

1. Podłączono `@asystent/ui-tokens` przez workspace dependencies do `apps/web` i `apps/mobile`; naprawiono kodowanie
   BOM w manifestach pakietów tak, aby Next.js i Metro mogły je parsować.
2. Zastąpiono domyślny ekran Next.js polskim, responsywnym lokalnym pulpitem z obszarami projektów, zleceń i
   materiałów oraz jasnym komunikatem, że serwer/baza nie są jeszcze podłączone.
3. Zastąpiono domyślny ekran Expo lokalnym ekranem startowym używającym tych samych tokenów.
4. Ustawiono polski tytuł i `lang="pl"` dla dokumentu Web.
5. Zbudowano Web i eksport JS dla Androida, uruchomiono typecheck/lint/testy; wszystkie wyniki **PASS**.
   Smoke test Web potwierdził polski tytuł i widok; Expo `/status` zwrócił `packager-status:running`.

### Kontynuacja

Projekt pozostaje lokalny. Nie rozpoczynać Auth/RLS, dopóki lokalny Supabase nie może zostać uruchomiony. Następne
działanie infrastrukturalne: zapewnić Docker Desktop i zweryfikować Supabase local; później ETAP 2.

## Jak wznowić pracę w nowej sesji

1. Przeczytaj ten plik (`docs/PROGRESS.md`) od sekcji „Następne kroki”.
2. Sprawdź `docs/TEST_REPORT.md`, aby zobaczyć ostatnie wyniki testów/budowy.
3. Sprawdź `git log` / `git status` w katalogu repo — jeśli brak commitów, zrób pierwszy commit z aktualnym stanem
   przed dalszą pracą.
4. Kontynuuj od sekcji „Kontynuacja” ostatniej sesji, nie od historycznych blokad Dockera z sesji 1–3.

## Sesja 4 — 11 października 2026

### Zrobione

1. Na wyraźną prośbę użytkownika zainstalowano Docker Desktop 4.94.0, WSL 2 i lokalną zależność Supabase CLI
   2.120.0. Docker Engine 29.8.2 odpowiada; konfiguracja Supabase jest w `supabase/config.toml`.
2. Uruchomiono lokalny stos `pnpm db:start`. PostgreSQL jest gotowy na porcie 54322; Supabase Auth, API i Studio
   odpowiadają lokalnie. Mailpit odpowiada na porcie 54324. Nie skonfigurowano zdalnego projektu ani hostingu.
3. Dodano skrypty `pnpm db:start`, `pnpm db:status`, `pnpm db:stop` oraz instrukcję do README.
4. Dodano schematy organizacji/członkostwa z walidacją polskiego NIP-u i logikę wyboru aktywnego członkostwa;
   7 nowych testów dla schematów i domeny.
5. `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm typecheck`, `pnpm lint` i `pnpm test` — **PASS**.
   Testy raportują 15 przypadków PASS; szczegóły w `docs/TEST_REPORT.md`.

### Ograniczenia i następne kroki

- Kontener `supabase_vector` restartuje się z powodu niedostępnego endpointu Docker IPv6; `imgproxy` i `pooler`
  pozostają zatrzymane. Główne usługi API/DB/Auth/Studio przeszły smoke testy, ale te komponenty pomocnicze
  wymagają osobnej diagnozy.
- Ostrzeżenie startu o braku `supabase/seed.sql` nie przerwało inicjalizacji.
- Następny krok: ETAP 2 — zaprojektować i dodać migracje Auth/organizacji/ról/RLS oraz testy izolacji danych na
  lokalnym Supabase. Nie oznaczać Auth/RLS jako ukończonych przed testami integracyjnymi.
- Docker Desktop/WSL może wymagać restartu systemu po instalacji; po restarcie sprawdź `pnpm db:status`.
- Kontener Supabase pozostawiono uruchomiony lokalnie. Zatrzymanie: `pnpm db:stop`; wznowienie: `pnpm db:start`.

### Wznowienie

1. Przeczytaj tę sesję oraz `docs/TEST_REPORT.md` i `docs/DECISIONS.md`.
2. Sprawdź `git status` i lokalny stos (`pnpm db:status`); nie konfiguruj hostingu ani usług chmurowych.
3. Zacznij ETAP 2 od migracji i testów Auth/organizacji/RLS zgodnie z `docs/MASTER_SPEC.md`.

## Sesja 5 — 11 października 2026

### Zrobione

1. Dodano migrację `20261011204000_identity_organizations_rls.sql`: typy organizacji i ról, profile tworzone
   po utworzeniu użytkownika Supabase Auth, organizacje z walidacją formatu/sumy kontrolnej NIP oraz członkostwo
   właściciela tworzone transakcyjnie przy utworzeniu organizacji.
2. Włączono RLS dla profili, organizacji i członkostw. Użytkownik widzi wyłącznie swój profil i organizacje,
   których jest członkiem; właściciel/admin może aktualizować dane organizacji. Bezpiecznie zamknięto bezpośredni
   zapis członkostw do czasu dodania przepływu zaproszeń. Uprawnienia funkcji pomocniczych ograniczono, a funkcje
   SECURITY DEFINER mają ustalony `search_path`.
3. Dodano 16 pgTAP testów dla tworzenia profili, organizacji i właściciela, izolacji między użytkownikami,
   ochrony przed podszywaniem się, braku bezpośredniego nadawania ról oraz odmowy dostępu anonimowego.
4. Migrację zastosowano do istniejącej lokalnej bazy bez resetu: `pnpm exec supabase migration up --local` — **PASS**.
   `pnpm exec supabase test db --local` — **PASS** (16/16).
5. Dodano `pnpm db:test` i opis testów/migracji w README.
6. Lint schematu aplikacji: `pnpm exec supabase db lint --local --schema public --fail-on error` — **PASS**.

### Pozostało (ETAP 2 — w toku)

- Logowanie/rejestracja z UI i E2E przepływu Auth — **NOT RUN**.
- Zaproszenia i bezpieczne dołączanie drugiego członka organizacji — **NOT IMPLEMENTED**; bezpośredni zapis
  członkostw pozostaje celowo niedostępny.
- Pełna kontrola uprawnień owner/admin/member dla operacji na członkostwach — **NOT RUN**.
- Testy helpera auth w pakiecie `api-client` i smoke test publicznego Auth REST — **NOT RUN**.
- Testy E2E wg AUTH-01/AUTH-02 oraz pełne kryterium izolacji etapu — **NOT RUN**.
- Pełny `pnpm exec supabase db lint --local` — **FAIL** z błędami w dołączonym schemacie `extensions` (pgTAP
  i starsze obiekty katalogowe); ograniczony lint schematu `public` przechodzi. Baza aplikacji nie ma w lint
  błędów.

### Kontynuacja

Następnie dodać przepływ zaproszenia/akceptacji członkostwa oparty o zweryfikowany adres e-mail oraz ograniczony
RPC/Edge Function, potem połączyć rejestrację/logowanie z Web i dodać lokalny E2E. Nie otwierać bezpośredniego
INSERT/UPDATE tabeli `memberships` dla klienta i nie łączyć projektu z Supabase Cloud.

## Sesja 6 — 11 października 2026

### Zrobione

1. Dodano responsywny interfejs Web logowania/rejestracji w języku polskim, obsługę stanu ładowania i czytelnych
   błędów oraz widok lokalnego miejsca pracy.
2. Podłączono Web do lokalnego Supabase Auth przez `@supabase/supabase-js`. Ekran po zalogowaniu korzysta z
   RLS-chronionych członkostw i organizacji; formularz pozwala utworzyć inwestora, wykonawcę lub skład. Walidację
   NIP-u i uprawnienia egzekwuje baza; użytkownik-twórca dostaje rolę właściciela.
3. Zdefiniowano wspólne typy tabel i funkcji Supabase w `packages/api-client`, używane przez Web.
4. Lokalny przepływ sprawdzono w przeglądarce: formularz rejestracji → konto Auth/profil → utworzenie organizacji
   → wyświetlenie roli właściciela. Tymczasowe konto i organizację testową usunięto z lokalnej bazy.
5. Dodano `apps/web/.env.example` i instrukcję konfiguracji kluczem anon (bez kluczy serwisowych) oraz Mailpit do
   README. Rzeczywista konfiguracja developerska znajduje się w ignorowanym przez Git `apps/web/.env.local`.
6. Sprawdzono przeglądarkowo pełny podstawowy przepływ: rejestracja → wylogowanie → ponowne logowanie. Przeglądarka
   zgłosiła `ERR_ABORTED` dla żądania logout przy zmianie widoku, ale UI wylogował użytkownika, można było zalogować
   się ponownie i przejść do pulpitu. Tymczasowe konto usunięto po teście.

### Weryfikacja

- `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test` — **PASS**.
- Web smoke test — **PASS** (HTTP 200); kontrola przeglądarkowa rejestracji, utworzenia konta i organizacji — **PASS**.
- `pnpm db:test` — **PASS** (16/16); lint schematu `public` — **PASS**.
- Wylogowanie przełącza interfejs do logowania, a ponowne logowanie działa. Diagnostyka narzędzia przeglądarki
  nadal odnotowuje przerwany request logout; warto potwierdzić zachowanie automatycznym E2E.

### Pozostało (ETAP 2 — w toku)

- Pełny Playwright E2E dla AUTH-01/AUTH-02 i izolacji tenantów — **NOT RUN**; repo nie ma skonfigurowanego
  runnera E2E.
- Zaproszenie drugiej osoby, potwierdzenie adresu i bezpieczne dołączenie do organizacji — **NOT IMPLEMENTED**.
- Mobile nie ma jeszcze ekranu Auth ani podłączenia do Supabase.
- Rzeczywiste `.env.local` jest lokalne/ignorowane. Na nowym środowisku skopiuj wartości z `pnpm db:status` zgodnie
  z README; nigdy nie wklejaj `SECRET_KEY` ani `SERVICE_ROLE_KEY` do klienta.

### Kontynuacja

Następnie wprowadzić lokalny E2E dla rejestracji/logowania/organizacji. Potem
zaprojektować zaproszenia z potwierdzeniem adresu e-mail i bezpiecznym RPC/Edge Function, bez przyznawania ról
bezpośrednio z przeglądarki. Nie łączyć Supabase Cloud ani nie konfigurować hostingu.

## Sesja 7 — 11 października 2026

### Zrobione

1. Dodano trzy responsywne kafelki pierwszego wyboru typu konta: Zleceniodawca, Wykonawca i Sklep, z własnymi
   ilustracjami SVG i krótkim opisem.
2. Po wyborze aplikacja zapisuje `profiles.account_type` pod RLS i przechodzi do kroku utworzenia organizacji z
   przypisanym typem. Kolejne logowania odczytują zapisany typ; przed utworzeniem pierwszej organizacji można go
   zmienić.
3. Zastosowano lokalnie migrację `20261011210000_profile_account_type.sql`; typ konta jest odrębny od ról
   członkostwa i od typów poszczególnych organizacji.
4. Rozszerzono pgTAP o zapis własnego typu, izolację aktualizacji profilu i ochronę przed zmianą typu innego
   użytkownika. Poprawiono asercję RLS, używając UPDATE filtrowanego przez politykę zamiast zapisu w CTE.
5. Zaktualizowano README, ADR-007 i ten dziennik.

### Weryfikacja

- `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test` — **PASS**.
- `pnpm exec supabase migration up --local` — **PASS**.
- `pnpm db:test` — **PASS** (20/20); lint schematu `public` — **PASS**.
- Lokalny Web smoke test — **PASS** (HTTP 200); podgląd w przeglądarce potwierdził wyświetlanie trzech kafelków.
  Kliknięcie wyboru na istniejącym koncie i weryfikacja po ponownym logowaniu — **NOT RUN**.
- Automatyczny Playwright E2E — **NOT RUN** (brak skonfigurowanego runnera).
- `git diff --check` — **PASS**.

### Kontynuacja

Następnie dodać automatyczny lokalny E2E nowego onboardingu oraz przepływ zaproszeń i bezpiecznego dołączania
członków. Zmiany zapisać wyłącznie lokalnie; nie konfigurować hostingu ani Supabase Cloud.

## Sesja 8 — 11 października 2026

### Zrobione

1. Przeprojektowano wybór typu konta, dopasowując typografię, paletę, obramowania i stany interakcji do ekranu
   logowania.
2. Trzy opcje są teraz pełnowymiarowymi przyciskami-kafelkami: cały kafelek można kliknąć, także klawiaturą;
   przyciski CTA są wyłącznie wizualnym elementem karty.
3. Na komputerze kafelki są prezentowane w jednym rzędzie. Na telefonie zachowano trzy kolumny, z mniejszymi
   ilustracjami i typografią dostosowanymi do szerokości ekranu.
4. Zrestartowano lokalny serwer Web, aby wymusić wczytanie nowego arkusza CSS zamiast poprzedniego builda.

### Weryfikacja

- `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test` — **PASS**.
- Podgląd lokalnej strony w przeglądarce desktop — trzy równe karty obok siebie, zgodne kolorystycznie z ekranem
  logowania — **PASS**.
- Semantyka dostępności — trzy elementy `button`, każdy zawiera całą kartę — **PASS**.
- Weryfikacja mobilna przy 390 px — trzy kolumny po 114 px, bez poziomego przewijania — **PASS**.
- W ramach kontroli użyto istniejącego lokalnego konta, przywracając jego typ do poprzedniej wartości
  `client` po sprawdzeniu kafelka — **PASS**.
- `git diff --check` — **PASS**.

### Kontynuacja

Kontynuować od automatycznych testów E2E onboardingu i przepływu zaproszeń. Nie zmieniać lokalnej konfiguracji
Supabase ani nie uruchamiać hostingu.

## Sesja 9 — 12 października 2026

### Zrobione

1. Wznowiono niezacommitowane prace graficzne z sesji 8. Zachowano trzy duże przyciski-kafle w jednym rzędzie
   i stylistykę logowania; poprawiono semantykę przycisków i sprawdzono desktop oraz szerokości 390/320 px.
2. Uwzględniono najnowszą zmianę wymagań: w UI nie ma „organizacji”. Pierwszy klient trafia bezpośrednio do
   formularza budowy; po zapisaniu zlecenia i kolejnym logowaniu otwiera się panel Klienta.
3. Dodano zapisywane w lokalnej bazie budowy: lokalizacja, zakres, rodzaj prac, powierzchnia, kondygnacje,
   piwnica, dach, materiały, opcjonalny termin i budżet. Panel umożliwia kolejne zlecenia, edycję oraz zmianę
   statusu szkic/opublikowane/anulowane. Publikacja na razie zapisuje status; feed ofertowania pozostaje do budowy.
4. Wykonawca/sklep uzupełnia NIP, adres, telefon, branżę, obszar i promień obsługi oraz opis. Atomowy RPC zapisuje
   profil oraz techniczne uprawnienia w jednej transakcji. Starsze dane i członkostwa nie zostały usunięte.
5. W panelu firmy/sklepu właściciel tworzy konto pracownika po podaniu e-maila i nazwy. Serwer generuje losowe
   hasło tymczasowe, przypina nowe konto jako `member` i zwraca hasło jednorazowo. Istniejące konta nie są przejmowane.
6. Pracownik loguje się przekazanymi danymi, musi ustawić własne hasło i dopiero wtedy widzi panel pracownika.
   Blokada danych przed zmianą hasła oraz uprawnienia owner/member są egzekwowane w RLS.
7. Dodano wspólne schematy walidacji i 4 testy jednostkowe, migracje biznesu/zleceń/pracowników oraz pgTAP.
8. Dodano trwały runner Playwright i 3 scenariusze E2E, obejmujące klienta oraz właściciela/pracownika firmy i sklepu.
   Pobrany Chromium był blokowany przez Windows (`spawn UNKNOWN`); runner korzysta ze zainstalowanego Microsoft Edge.
9. Skonfigurowano lokalny klucz serwerowy w ignorowanym `apps/web/.env.local`; nie umieszczono go w kodzie, Git
   ani zmiennych `NEXT_PUBLIC_*`. Sprawdzenie assetów klienta nie wykryło klucza serwisowego.
10. Testy tworzyły i usuwały wyłącznie własne tymczasowe konta/dane. Nie usuwano istniejących danych użytkownika.

### Weryfikacja

- `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test` — **PASS** (19 testów jednostkowych).
- `pnpm db:test` — **PASS** (64 asercje); lint schematu `public` — **PASS**.
- `pnpm test:e2e` — **PASS** (3 scenariusze: klient, wykonawca/pracownik, sklep/pracownik).
- Równe kafelki w jednym rzędzie przy 1440/390/320 px, bez poziomego przepełnienia — **PASS**.
- Podgląd screenshotów formularzy w desktop/mobile — **PASS**; poprawiono rozmiar checkboxa i ograniczono
  pomocniczy panel na telefonie, aby formularz pojawiał się szybciej.
- Klucz serwerowy w assetach przeglądarki — **PASS** (nieobecny); środowisko lokalne ignorowane w Git.
- Lokalny Web na `http://127.0.0.1:3010/` — **PASS** (HTTP 200). Ponowne uruchomienie po zamknięciu sesji:
  `pnpm --filter web exec next start --hostname 127.0.0.1 --port 3010` (po `pnpm --filter web build`).

### Kontynuacja — produkt nadal w budowie

1. Rozwinąć ETAP 3: wielokrokowy zakres budowy (fundamenty → kondygnacje → dach → materiały), autosave i wersjonowanie
   danych zlecenia, termin składania ofert i spójne zasady publikacji.
2. ETAP 4: feed zleceń dla wykonawcy, filtry obszaru/specjalizacji, oferty netto/brutto/VAT, terminy i audyt.
3. ETAP 5: katalog sklepu, oddziały, RFQ, zamówienia i dostawy.
4. Następnie ETAPY 6–10 zgodnie z MASTER_SPEC: przedmiary, CAD, import, AI/BYOK, mobile i beta. Te funkcje
   pozostają **NOT RUN** i nie są deklarowane jako gotowe.
5. Rozbudować zarządzanie personelem (dezaktywacja, reset hasła, zaproszenie istniejącego konta) i testy awarii
   infrastruktury. Aktualne tworzenie nowych kont i pierwsze logowanie są zweryfikowane.

Praca pozostaje lokalna. Wznowienie: uruchom Docker Desktop, sprawdź `pnpm db:status`, przeczytaj tę sekcję,
zbuduj Web i kontynuuj od pierwszego niewdrożonego punktu. Nie resetuj bazy i nie konfiguruj hostingu.

## Sesja 10 — 12 października 2026

### Zrobione

1. Przebudowano formularz „Dane ogólne budowy”:
   - mapa Google jest teraz osadzona bezpośrednio w kafelku i aktualizuje się automatycznie po zmianie
     kodu pocztowego, miejscowości i adresu/numeru działki;
   - gdy pola lokalizacji są puste, podgląd domyślnie pokazuje Warszawę;
   - usunięto ręczne pole współrzędnych i przycisk „Pokaż na mapie”.
2. Wymagalność pól:
   - kod pocztowy (`00-000`) jest obowiązkowy;
   - planowany termin jest obowiązkowy;
   - dach nie jest zbierany w danych ogólnych;
   - usunięto pole powierzchni istniejącego budynku dla rozbudowy.
3. Dodano etap „Plan realizacji i etapy wniosku” zależny od rodzaju prac (dom/rozbudowa/remont/inne) z:
   - wymaganiami szczegółowymi,
   - kryteriami odbioru,
   - wskazówkami kroków adekwatnymi do typu prac.
4. Przy zapisie zlecenia generowany jest pełny raport tekstowy (`report_summary`) i zapisywany w bazie.
5. Opublikowane zlecenia klientów są widoczne w panelu Wykonawcy i Sklepu (w tym dla pracownika po aktywacji hasła),
   razem z terminem i raportem.
6. Dodano migracje i testy:
   - nowe kolumny raportu i wymagań;
   - aktualizacje walidacji/triggerów (w tym bezpieczne aktualizacje statusu starszych rekordów);
   - politykę odczytu rynku zleceń dla kont contractor/store;
   - testy pgTAP oraz E2E dla mapy, wymaganych pól, zdjęć, raportu i widoczności rynku.

### Weryfikacja

- `pnpm exec supabase migration up --local` — **PASS**
- `pnpm db:test` — **PASS** (82 asercje)
- `pnpm exec supabase db lint --local --schema public --fail-on error` — **PASS**
- `pnpm --filter @asystent/schemas test` — **PASS** (10/10)
- `pnpm --filter web build`, `pnpm --filter web lint` — **PASS**
- `pnpm test:e2e` — **PASS** (4 scenariusze, w tym nowy przebieg mapa+raport+market)
- `pnpm typecheck` — **PASS**
- `GET http://127.0.0.1:3010/` — **PASS** (HTTP 200)

### Kontynuacja — następne kroki

1. Rozbudować „wniosek” do pełnej wieloetapowej struktury domenowej (nie tylko plan realizacji, ale też podsekcje
   technologiczne i formalne per rodzaj prac) oraz wersjonowanie raportu.
2. Dodać filtrowanie i ranking zleceń w panelu Wykonawcy/Sklepu (obszar, termin, budżet, specjalizacja).
3. ETAP 4+: oferty, negocjacje, terminy zamknięcia i audyt zmian ofert.
4. ETAP 5+: katalog sklepu, RFQ i zamówienia.

Wznowienie: uruchom Docker, `pnpm db:status`, potem `pnpm --filter web build` i `pnpm --filter web exec next start --hostname 127.0.0.1 --port 3010`.

## Sesja 11 — 12 października 2026

### Zrobione

1. Sprawdzono zgłoszenie o polach szerokości/długości zamiast mapy. Po pełnym przeładowaniu lokalnej strony
   `http://127.0.0.1:3010/` aktualny formularz nie zawiera tych pól ani przycisku „Pokaż na mapie”; mapa jest
   osadzona bezpośrednio w sekcji lokalizacji.
2. Potwierdzono, że pusty formularz kieruje iframe na podgląd Warszawy, a kod pocztowy i termin są wymagane.
3. Rozszerzono E2E o jawne kontrole braku starych pól i przycisku mapy oraz wymagalności kodu pocztowego i terminu.

### Weryfikacja

- `pnpm test:e2e` — **PASS** (4 scenariusze).
- Kontrola formularza po przeładowaniu w przeglądarce — **PASS** (brak pól współrzędnych/przycisku, iframe
  z lokalizacją domyślną Warszawa).
- `git diff --check` — **PASS**.
- Zrzut ekranu mapy w narzędziu przeglądarkowym nie dostarczył wiarygodnego obrazu — **BLOCKED** jako kontrola
  wizualna. Potwierdzono obecność i adres iframe, nie poświadczono wyglądu kafelków mapy na zrzucie.

### Kontynuacja

Jeśli w otwartej karcie nadal widać starą wersję, wykonać twarde odświeżenie `Ctrl+F5` pod
`http://127.0.0.1:3010/`. Dalsza praca pozostaje lokalna; pełny kreator, filtrowanie rynku i ofertowanie są nadal
do wykonania zgodnie z sesją 10.

## Sesja 12 — 12 października 2026

### Zrobione

1. Zastąpiono sekcję z ręcznymi polami „Wymagania szczegółowe” i „Kryteria odbioru” automatycznymi warunkami
   zgodności z projektem, przepisami i zasadami wiedzy technicznej.
2. Dodano w formularzu osobne zakładki „Dane budowy” oraz „Materiały i technologia”. Ankieta dostosowuje etapy do
   budowy domu, rozbudowy, remontu albo innych prac; każda lista ma własną wyszukiwarkę i wymagany wybór.
3. Dodano katalog wyborów dla fundamentów, szalunków fundamentowych i stropowych, ścian i ich ocieplenia, stropów,
   dachu/pokrycia, instalacji, wykończenia remontu oraz pozostałych prac. Obejmuje m.in. bloczki szalunkowe 25/30 cm,
   szalunki tradycyjne i systemowe, stropy monolityczne/prefabrykowane/gęstożebrowe, blachę płaską na rąbek i
   rozwiązania membranowe.
4. Technologie zapisują się w dotychczasowym polu materiałów, są odtwarzane przy edycji i trafiają do raportu
   wyświetlanego przy zleceniu. Zachowano stare notatki tekstowe; limit tekstowy bazy rozszerzono migracją
   `20261012122000_construction_technology_catalog.sql`.
5. Przejrzano źródła ITB oraz poradniki branżowe dotyczące fundamentów, ścian, stropów, pokryć dachowych,
   ocieplenia, wentylacji, ogrzewania i systemów podłogowych. Odnośniki do źródeł są dostępne w ankiecie.
6. Udokumentowano ograniczenie katalogu: zawiera typowe rozwiązania i wybór „zgodnie z projektem/inne”, ale nie
   jest zamkniętą listą wszystkich systemów i produktów producentów. Wybór inwestora pozostaje preferencją, a nie
   projektem konstrukcyjnym.

### Weryfikacja

- `pnpm exec supabase migration up --local` — **PASS**
- `pnpm db:test` — **PASS** (83 asercje; sprawdzono również zapis materiałów ponad dotychczasowy limit 2000 znaków)
- `pnpm exec supabase db lint --local --schema public --fail-on error` — **PASS**
- `pnpm --filter @asystent/schemas test` — **PASS** (10/10)
- `pnpm test` — **PASS**
- `pnpm build` — **PASS** (8 zadań workspace, w tym produkcyjny build Web)
- `pnpm typecheck` — **PASS**
- `pnpm lint` — **PASS**
- `pnpm test:e2e` — **PASS** (4 scenariusze; filtrowanie wyszukiwarki, warunkowe szalowanie stropu, zapis i odtworzenie wyborów)
- `GET http://127.0.0.1:3010/` — **PASS** (HTTP 200); w aktywnej sesji klienta widać nową nawigację zakładek
- `git diff --check` — **PASS**

### Kontynuacja

Katalog technologii jest wersją bazową z odnośnikami, nie gwarantuje kompletności każdej technologii/produktu.
Kolejne prace: weryfikacja list z fachowcami i rozbudowa etapów pod dokładny zakres projektu, następnie filtrowanie
rynku oraz ofertowanie. Pełna aplikacja nadal nie jest ukończona; hosting i usługi chmurowe pozostają wyłączone.

## Sesja 13 — 12 października 2026

### Zrobione

1. Wymieniono osobne pole wyszukiwania i natywną listę na rozwijane menu z wyszukiwarką umieszczoną wewnątrz
   menu. Każda lista ma filtrowanie, wybór klawiaturą przez pola i czytelny stan wybranych wartości.
2. Sposób posadowienia obsługuje zaznaczenie więcej niż jednej technologii i zapisuje listę wartości; istniejące
   zapisane posadowienie w formacie pojedynczego tekstu jest automatycznie odczytywane jako lista jednoelementowa.
3. Wybór ściany monolitycznej ujawnia szalowanie fundamentów; ściany z bloczków betonowych lub szalunkowych nie
   wymagają oddzielnego pola szalowania.
4. Dodano osobne pytania o folię kubełkową (bąbelkową) i ocieplenie fundamentów (m.in. XPS, EPS fundamentowy,
   PIR, szkło piankowe), niezależne od hydroizolacji.
5. Dach rozbito na płytę skośną, poszycie/deskowanie, warstwę wstępnego krycia, pokrycie końcowe i ocieplenie.
   Etapy warstw nie wyświetlają się, jeśli użytkownik oznaczy, że zakres nie obejmuje prac przy dachu.
6. Dla budowy domu i rozbudowy dodano standard realizacji: stan surowy otwarty, zamknięty, deweloperski albo pod
   klucz. Izolacja ścian/dachu, stolarka, instalacje i wykończenia ujawniają się zgodnie z poziomem realizacji oraz
   wybranym układem ściany; dodano ankietę okien, montażu, drzwi, podłóg, ścian, sufitów oraz schodów.
7. Dla remontu wprowadzono wybór zakresu od odświeżenia po remont generalny i termomodernizację. Kolejne etapy
   (instalacje, stolarka, izolacje i dach) zależą od wybranego zakresu.
8. Dla „Innych prac” dodano etapy zależne od kategorii: ogrodzenie (przygotowanie, fundament, konstrukcja,
   wykończenie), podjazd (podbudowa i odwodnienie), drenaż (system i odbiornik), mur oporowy oraz elewacja.
9. Każda aktywnie wybrana pozycja „Inne” pokazuje wymagane pole opisu; walidacja wymaga jego treści, a raport
   zawiera nazwę wybranej technologii i opis. Formularz nadal zapisuje wybory w dotychczasowej kolumnie `materials`.
10. Rozszerzono testy schematu i E2E o menu wyszukiwane w środku, multi-select, szalowanie warunkowe, etapy domu,
    remontu i pozostałych prac, warstwy dachu, opis „Inne” i raport po zapisie. Uaktualniono specyfikację i ADR-010.

### Weryfikacja

- `pnpm build` — **PASS** (8 zadań workspace; produkcyjny build Web)
- `pnpm typecheck` — **PASS** (11 zadań Turbo)
- `pnpm lint` — **PASS** (5 zadań Turbo)
- `pnpm test` — **PASS** (15 testów schematów oraz wszystkie pozostałe testy workspace)
- `pnpm test:e2e` — **PASS** (4 scenariusze w Microsoft Edge; przetestowany zapis wielu posadowień i raportu)
- Kontrola wizualna nowego menu i wyszukiwarki wewnątrz niego — **PASS** (lokalny Web; menu nakłada się na formularz)
- `GET http://127.0.0.1:3010/` — **PASS** (HTTP 200)
- `git diff --check` — **PASS**

### Kontynuacja

Nowy model etapów i wyszukiwania działa lokalnie i zachowuje zgodność zapisu w JSON z dotychczasowym polem.
Następny zakres to ekspercka weryfikacja doboru list technologii oraz dalszy rozwój pełnego kreatora i rynku
ofert. Aplikacja pozostaje nieukończona i wyłącznie lokalna; nie zmieniono hostingu ani usług chmurowych.

## Sesja 14 — 12 października 2026

### Zrobione

1. Rozszerzono ankietę dachu o profile blachodachówki (m.in. fala, panel płaski, modułowa i cięta na wymiar),
   systemy rąbka dla blachy płaskiej oraz profile blachy trapezowej.
2. Dodano wybór systemu kominowego, warunkowy sposób obróbki i jej materiał; przy braku komina lub poza zakresem
   pola obróbki nie są wymagane.
3. Dodano niezależne wybory systemu rynnowego oraz rur spustowych i sposobu odprowadzenia wody.
4. Wszystkie nowe wybory korzystają z dotychczasowej walidacji, zapisu JSON w `materials` i generowania raportu;
   nie dodano migracji ani zmian usług zewnętrznych.
5. Uzupełniono testy schematu, scenariusze E2E, specyfikację i ADR-011.

### Weryfikacja

- `pnpm --filter @asystent/schemas test` — **PASS** (15/15)
- `pnpm build` — **PASS** (8 zadań workspace)
- `pnpm typecheck` — **PASS** (11 zadań Turbo)
- `pnpm lint` — **PASS** (5 zadań Turbo)
- `pnpm test` — **PASS** (wszystkie testy workspace; schemas 15/15)
- `pnpm test:e2e` — **PASS** (4 scenariusze w Microsoft Edge; profil blachy, system kominowy, obróbka, rynny i rury spustowe w raporcie i edycji)
- `git diff --check` — **PASS**
- `GET http://127.0.0.1:3010/` — **PASS** (HTTP 200)

### Kontynuacja

Katalog dachowy nadal jest zestawem typowych rozwiązań, a nie zamkniętą listą wszystkich produktów. Wybory wymagają
potwierdzenia z projektem i instrukcjami producentów. Aplikacja pozostaje lokalna i nieukończona.

## Sesja 15 — 12 października 2026

### Zrobione

1. Rozszerzono wybory wielokrotne na podłogi, wykończenie ścian i sufitów, wykończenia schodów/balustrad,
   elewację, wybrane wykończenia remontowe i elementy montowane w kuchni/łazience.
2. Konstrukcja schodów jest osobną odpowiedzią (m.in. żelbet wylewany na miejscu, prefabrykat, stal, drewno,
   istniejące schody lub brak schodów); wykończenie i balustrady wybiera się oddzielnie.
3. Instalacja wodno-kanalizacyjna, w tym kanalizacja, jest wymagana już w ankiecie stanu surowego.
4. Kategoria „Inne prace” pozwala łączyć zakresy. Dodano szczegóły nawierzchni/obrzeży i odwodnienia podjazdu,
   ścieżek, tarasu oraz kostki/opaski wokół domu.
5. Odczyt JSON normalizuje wcześniej zapisane pojedyncze wartości wielokrotnych do list; raport zachowuje wszystkie
   aktywne wybory. Uzupełniono specyfikację, ADR-012, testy schematu i E2E.

### Weryfikacja

- `pnpm --filter @asystent/schemas test` — **PASS** (15/15)
- `pnpm build` — **PASS** (8 zadań workspace)
- `pnpm typecheck` — **PASS** (11 zadań Turbo)
- `pnpm lint` — **PASS** (5 zadań Turbo)
- `pnpm test` — **PASS** (wszystkie testy workspace; schemas 15/15)
- `pnpm test:e2e` — **PASS** (4 scenariusze w Microsoft Edge; multi-select, raport, kuchnia/łazienka, instalacja wod-kan i łączone prace terenowe)
- `git diff --check` — **PASS**
- `GET http://127.0.0.1:3010/` — **PASS** (HTTP 200)

### Kontynuacja

Uruchomić pozostałe bramki po przebudowie aktualnego worktree. Aplikacja nadal pozostaje lokalna i nieukończona.

## Sesja 16 — 12 października 2026

### Zrobione

1. Usunięto „zgodnie z projektem” z wyboru kategorii „Inne prace”; schemat odrzuca tę odpowiedź jako zakres
   pozostałych prac.
2. Dla typu „Inne” pole opisu jest wyraźnie nazwane „Opis prac do wykonania”; ankieta informuje, że opis i co
   najmniej jedna konkretna kategoria są wymagane.
3. Zmieniono nazwę pozycji „Inne prace specjalistyczne” tak, aby wymagała doprecyzowania; jej opis zapisuje się
   w raporcie. Zaktualizowano test schematu, E2E, specyfikację i ADR-013.

### Weryfikacja

- `pnpm --filter @asystent/schemas test` — **PASS** (15/15)
- `pnpm test` — **PASS** (26 testów jednostkowych)
- `pnpm typecheck` — **PASS** (11 zadań Turbo)
- `pnpm lint` — **PASS** (5 zadań Turbo)
- `pnpm build` — **PASS** (8 zadań Turbo)
- `pnpm test:e2e` — **PASS** (4 scenariusze w Microsoft Edge)
- `git diff --check` — **PASS**
- `GET http://127.0.0.1:3010/` — **PASS** (HTTP 200)

### Kontynuacja

Praca nadal lokalna, bez wdrożenia i commita. Kategorie i etapy „Inne” wymagają konkretnych wyborów i opisu;
sprawdź tę regułę ponownie przy kolejnych rozszerzeniach katalogu.

## Sesja 17 — 12 października 2026

### Zrobione

1. Ujednolicono walidację rejestracji i logowania we wspólnych schematach Zod:
   normalizacja e-maila, poprawny format, wymagane hasło oraz limit długości; rejestracja wymaga też nazwy.
   Formularz Auth pokazuje błędy walidacji bez wysyłania niepoprawnego żądania.
2. Naprawiono inicjalizację Auth: jeżeli zdarzenie `onAuthStateChange` nadejdzie przed zakończeniem
   `getSession()`, spóźniony odczyt sesji nie nadpisuje już nowszego stanu. Widok logowania czeka jawnie
   na inicjalizację, a odczyt sesji ujawnia błędy zamiast pozostawiać niejednoznaczny ekran.
3. Skrót nawigacji w formularzu budowy widzi tylko administrator z serwerowo zarządzanym
   `app_metadata.role === "admin"`. Zwykłe konto przechodzi walidację danych przed wejściem do zakładki
   technologii; administrator może pominąć wyłącznie tę walidację nawigacji. Zapis nadal wymaga całej walidacji
   schematu. Rola `admin` organizacji nie jest traktowana jako globalny administrator.
4. Dodano E2E dla rzeczywistej rejestracji w UI, błędnego e-maila/hasła, dalszej ścieżki do formularza klienta
   i zakładki technologii, a także obecności/nieobecności skrótu i walidacji zapisu admina.
5. Zrzut „This page couldn’t load” nie odtworzył się w działającym środowisku: lokalny podgląd zwraca HTTP 200.
   Oprócz smoke testu przepływ uwierzytelniania i onboardingu przetestowano w E2E na lokalnym Supabase.

### Weryfikacja

- `pnpm --filter @asystent/schemas test` — **PASS** (17/17).
- `pnpm typecheck` — **PASS** (11 zadań Turbo).
- `pnpm --filter web lint` — **PASS**.
- `pnpm build` — **PASS** (8 zadań Turbo).
- `pnpm test` — **PASS** (11 zadań Turbo).
- `pnpm test:e2e` — **PASS** (6 scenariuszy w Microsoft Edge).
- `git diff --check` — **PASS** (ostrzeżenie Git tylko o normalizacji LF/CRLF).
- `GET http://127.0.0.1:3010/` — **PASS** (HTTP 200).

### Kontynuacja

Przepływ od rejestracji do danych budowy i technologii jest gotowy do dalszego sprawdzenia przez użytkownika.
Praca pozostaje lokalna, bez wdrożenia i commita. Skrót administratora wymaga nadania `app_metadata.role`
przez zaufany proces serwerowy; zwykłe konta i każdy zapis nadal podlegają walidacji.

## Sesja 18 — 12 października 2026

### Zrobione

1. Potwierdzono błąd mapy Google w lokalnej przeglądarce: iframe kończył się `ERR_ABORTED` i pozostawał pusty mimo
   HTTP 200 dostawcy. Zastąpiono go interaktywnym Leaflet/OpenStreetMap z widocznymi kafelkami i markerem.
2. Dodano uwierzytelniony endpoint wyszukiwania lokalizacji przez Nominatim. Zmiany zapytania są opóźniane podczas
   wpisywania; przy nieznalezieniu numeru/adresu mapa pokazuje jawne przybliżenie według kodu i miejscowości.
   Przy pustych polach pozostaje Warszawa; dane lokalizacji są ujawnione jako wysyłane do OpenStreetMap, a link
   do Google Maps nadal jest dostępny.
3. Uzupełniono wymagane wod-kan dla czterech standardów domu/rozbudowy oraz walidację braku tego wyboru w każdym
   standardzie. Dodano wymagany wybór systemu nawierzchni żywiczno-żwirowej, pełne warstwy pytań dla elewacji
   oraz prace: taras, przyłącza zewnętrzne, zieleń i rozbiórki.
4. E2E sprawdza renderowanie kafelków i markera, przybliżenie geokodera, ochronę endpointu przed anonimowym
   użyciem, wszystkie standardy wod-kan, wybór żywicznej nawierzchni/fasady oraz raport zapisany w Supabase.
5. Rozszerzono katalog „Inne prace” o szczegółowe, zależne od zakresu etapy dla fundamentów, żelbetu, murowania,
   dachu, fasady, instalacji, stolarki oraz robót zewnętrznych. Pytania o powłokę i kolor fasady są pokazywane
   wyłącznie po wyborze tynku lub malowania; okładziny nie wymagają tych odpowiedzi.
6. Geokoder preferuje wynik z pasującym numerem domu. Mapa pozwala wskazać dokładny budynek kliknięciem, zapisuje
   współrzędne w istniejącym polu JSON `materials.locationPin` i odtwarza je przy ponownej edycji; zmiana adresu
   kasuje przypięty wcześniej punkt. Dokładny wynik z Nominatim dla Grabie 156a nie został osobno zweryfikowany.
7. Pozostawiono pracę lokalną. Nie konfigurowano hostingu, nie kasowano danych użytkowników i nie tworzono commita.

### Weryfikacja

- `pnpm exec supabase migration up --local` — **PASS** (brak nowych, niezaaplikowanych migracji).
- `pnpm --filter @asystent/schemas test` — **PASS** (17/17 testów).
- `pnpm typecheck` — **PASS** (11 zadań Turbo).
- `pnpm lint` — **PASS** (5 zadań Turbo).
- `pnpm test` — **PASS** (11 zadań Turbo).
- `pnpm db:test` — **PASS** (83 testy pgTAP).
- `pnpm exec supabase db lint --local --schema public --fail-on error` — **PASS**.
- `pnpm test:e2e` — **PASS** (6 scenariuszy w Microsoft Edge; mapa, geokodowanie, formularz i raport).
- `pnpm build` — **PASS** (8 zadań Turbo; dynamiczna trasa geokodowania używa `connection()`).
- `git diff --check` — **PASS** (bez błędów whitespace; Git ostrzega o normalizacji LF/CRLF).
- Dodatkowa regresja warunkowych pytań fasady: `pnpm --filter @asystent/schemas test` — **PASS** (19/19),
  `pnpm --filter web build` — **PASS**, `pnpm test:e2e` po świeżym buildzie — **PASS** (6/6 scenariuszy).
- Lokalny podgląd `http://127.0.0.1:3010/` — **PASS** po uruchomieniu końcowego buildu; HTTP 200, na mapie
  Warszawy widocznych 6 kafelków i 1 marker.

### Kontynuacja

Następnym krokiem jest sprawdzenie przez użytkownika przejścia od logowania przez formularz budowy do raportu
oraz ręczne wskazanie budynku Grabie 156a na mapie, jeśli Nominatim nadal zwraca tylko przybliżenie.
Wszystkie pozostałe etapy aplikacji nadal są w toku; nie wdrażać aplikacji na hosting.

## Sesja 21 — 12 października 2026

### Zrobione

1. Zweryfikowano istniejący katalog „Inne prace” bez nadpisywania zmian w worktree: kategorie ogólne prowadzą do
   zależnych etapów dla fundamentów i zbrojenia, żelbetu, murowania, konstrukcji/pokrycia dachu, fasady, instalacji,
   stolarki, ogrodzeń, nawierzchni, odwodnienia, tarasów, przyłączy, zieleni i rozbiórek.
2. Dodano regresję E2E, która po zapisaniu zlecenia z wieloma zakresami „Innych prac” odświeża stronę i sprawdza,
   że kategorie, zbrojenie fundamentu, pokrycie dachu, kolor elewacji i wielokrotny wybór nawierzchni są odtworzone.
3. Potwierdzono, że raport obejmuje zapisane opisy i wybory technologiczne. Aplikacja pozostała lokalna; bez migracji,
   wdrożenia i commita.

### Weryfikacja

- `pnpm --filter @asystent/schemas test` — **PASS** (19/19).
- `pnpm typecheck` — **PASS** (11 zadań Turbo).
- `pnpm build` — **PASS** (8 zadań Turbo).
- `pnpm lint` — **PASS** (5 zadań Turbo, ponownie po zmianie E2E).
- `pnpm test` — **PASS** (11 zadań Turbo).
- `pnpm test:e2e` — **PASS** (6/6; w tym trwałość szczegółów „Innych prac” po pełnym odświeżeniu).
- `git diff --check` — **PASS** (bez błędów whitespace; ostrzeżenia Git dotyczą normalizacji LF/CRLF).
- `GET http://127.0.0.1:3010/` — **PASS** (HTTP 200).
- Testy bazy — **NOT RUN** (brak zmian schematu bazy lub migracji).

### Kontynuacja

Poprosić użytkownika o sprawdzenie ankiety „Inne prace” w lokalnym podglądzie i zebrać brakujące kategorie lub etapy.
Nie wdrażać aplikacji ani nie wykonywać commita bez prośby użytkownika.

## Sesja 19 — 12 października 2026

### Zrobione

1. Uogólniono kategorie „Inne prace”: lista główna zawiera teraz m.in. „Ogrodzenie”, „Podjazd, ścieżki i
   nawierzchnie” oraz „Fasada / elewacja”. Materiały i wykonanie wybiera się dopiero w zależnych etapach ankiety.
   Starsze zapisane kategorie (np. ogrodzenie drewniane, nawierzchnia żywiczna) są mapowane do nowej kategorii,
   bez utraty zapisanych odpowiedzi technologicznych.
2. Umożliwiono swobodne przejście z „Dane budowy” do „Materiałów i technologii”. Walidacja kompletnego wniosku
   (obu zakładek) pozostaje przy przycisku „Zapisz budowę i przejdź do panelu”.
3. Rozdzielono pole ulicy/nazwy miejsca od numeru budynku/działki; przed zapisem są składane do dotychczasowego
   pola adresowego. Jeśli podano numer, endpoint przyjmuje tylko wynik geokodera z dokładnie takim numerem
   `house_number`, nie wykonuje fallbacku do centrum miejscowości i nie zapisuje przybliżonego punktu. Gdy
   dokładnego dopasowania brak, marker jest usuwany, a użytkownik może wskazać lokalizację ręcznie.
4. Zapisany ręcznie punkt nadal jest przechowywany w `materials.locationPin`. Nie dodano migracji bazy ani
   nowych zależności; zachowano istniejące niezacommitowane zmiany repozytorium.

### Weryfikacja

- `pnpm --filter @asystent/schemas test` — **PASS** (19/19).
- `pnpm --filter web build` — **PASS**.
- `pnpm typecheck` — **PASS** (11 zadań Turbo).
- `pnpm lint` — **PASS** (5 zadań Turbo).
- `pnpm test` — **PASS** (11 zadań Turbo).
- `pnpm build` — **PASS** (8 zadań Turbo).
- `pnpm test:e2e` — **PASS** (6 scenariuszy; ogólne kategorie, swobodne przejście zakładek, walidacja przy zapisie,
  brak fallbacku/markera dla niedopasowanego numeru oraz ręczne wskazanie i trwałość punktu).
- `git diff --check` — **PASS** (brak błędów whitespace; ostrzeżenia wyłącznie o normalizacji LF/CRLF).
- `GET http://127.0.0.1:3010/` — **PASS** (HTTP 200); po przebudowaniu zrestartowano lokalny podgląd, aby
  serwował aktualny build.

### Kontynuacja

Sprawdzić w lokalnym podglądzie wpisanie `Grabie` i `156a` w oddzielnych polach. Jeśli OpenStreetMap nie ma
dokładnego numeru domu, mapa celowo nie wskaże centrum Grabia; należy wskazać dokładny punkt kliknięciem.

## Sesja 22 — 12 października 2026

### Zrobione

1. Zastąpiono wyszukiwanie przez Nominatim osadzoną mapą Google, która otrzymuje pełne zapytanie z ulicą/nazwą
   miejsca, numerem budynku, miejscowością i kodem pocztowym. Wpisy są opóźniane o 700 ms, żeby nie przeładowywać
   mapy przy każdym znaku.
2. Link obok mapy otwiera Google Maps w nowej karcie. Zapisany wcześniej `locationPin` nadal wyszukuje w mapie
   współrzędne; edycja adresu czyści poprzedni punkt.
3. Usunięto endpoint Nominatim, zależności Leaflet i arkusz CSS Leaflet. Osadzona mapa Google nie udostępnia
   klikniętych współrzędnych aplikacji; tworzenie nowych punktów wymaga osobnej integracji Maps Platform.
4. E2E sprawdza zapytanie mapy dla adresu `Grabie 156a, Łapanów, 32-740, Polska` oraz jego aktualizację po zmianie
   adresu. Nie wysyła w teście adresu do Google, ponieważ żądania mapy są mockowane.

### Weryfikacja

- `pnpm typecheck` — **PASS** (11 zadań Turbo).
- `pnpm lint` — **PASS** (5 zadań Turbo).
- `pnpm test` — **PASS** (11 zadań Turbo; schemas 19/19).
- `pnpm install --frozen-lockfile` — **PASS**.
- `pnpm --filter web build` — **PASS**.
- `pnpm build` — **PASS** (8 zadań Turbo).
- `pnpm test:e2e` — **PASS** (6/6 scenariuszy).
- `git diff --check` — **PASS**.
- `GET http://127.0.0.1:3010/` — **PASS** (HTTP 200; lokalny podgląd po przebudowie).
- Dokładność wskazania domu przez Google Maps — **NOT VERIFIED**; E2E weryfikuje przekazane zapytanie, nie dane
  geograficzne ani właściwy marker Google.
- Testy bazy — **NOT RUN** (bez zmian schematu bazy lub migracji).

### Kontynuacja

Sprawdzić mapę w lokalnym podglądzie dla Grabie 156a i potwierdzić, czy wynik Google Maps wskazuje właściwy budynek.
Jeśli aplikacja ma zapisywać nowe współrzędne po kliknięciu Google Maps, wymaga to osobnej decyzji o Google Maps
Platform API i jej konfiguracji rozliczeń.

## Sesja 23 — 12 października 2026

### Zrobione

1. Wykonano pełny commit poprzednich zmian ankiety i map Google: `658666d`.
2. Zastąpiono przycisk kończący formularz przez „Przejdź dalej”. Po walidacji danych ogólnych i technologii
   zapisuje szkic budowy i zdjęcia, następnie otwiera dokumentację, zamiast przechodzić od razu do panelu.
3. Wspólny katalog dokumentacji pokrywa 28 obecnych kategorii innych prac. Dla domu i rozbudowy dobiera
   fundamenty, piwnicę, osobne kondygnacje, dach i branże. Same roboty pokryciowe pokazują wyłącznie dach.
4. Kolejne kroki pokazują wymagane rysunki i pozwalają zapisać robocze opisy pomiarów oraz źródła danych.
   Nawigacja, powrót do danych budowy i zapis szkicu zachowują odpowiedzi. Po przeładowaniu można otworzyć
   „Edytuj”, kliknąć „Przejdź dalej” i wznowić zapisany etap.
5. Dodano osobną tabelę szkiców dokumentacji, RLS i RPC z optymistyczną kontrolą rewizji. Nie zapisujemy
   dokumentacji w ograniczonym polu `materials`. Migracje zastosowano lokalnie, bez resetu bazy.
6. Dodano ścisłe kontrakty geometrii w mm, pochodzenia danych, kalibracji i propozycji AI; funkcje przeliczenia
   współrzędnych, kontroli obrysów i zatwierdzania. Propozycja AI nie może sama zatwierdzić obiektów lub zbrojenia.
7. Użytkownik wybrał OpenAI API z własnym kluczem i wymaga MCP. Nie pobierano klucza, nie przesyłano projektów
   do modelu i nie wykonano płatnych operacji.

### Weryfikacja

- `pnpm build`, `pnpm --filter web build`, `pnpm typecheck`, `pnpm lint`, `pnpm test` — **PASS**.
- Testy jednostkowe — **PASS**: 51 przypadków; geometria 7, schemas 32, domain 7, kalkulatory 3, tokeny 2.
- `pnpm db:test` — **PASS**: 93 asercje, w tym zapis, izolacja danych, odrzucenie błędnej treści i konflikt wersji.
- `pnpm exec supabase db lint --local --schema public --fail-on error` — **PASS**.
- `pnpm test:e2e` — **PASS**: 6 scenariuszy, w tym kontynuacja ankiety, awaria zapisu i ponowienie,
  odtworzenie odpowiedzi/bieżącego etapu po przeładowaniu oraz dach bez dokumentacji całego domu.
- `git diff --check` — **PASS**.

### Niezakończone

- **NOT RUN:** pełna akceptacja nowego zadania. Katalog i pola tekstowe nie są pełną, ilościową ankietą CAD.
- **NOT RUN:** edytor geometrii, import PDF/obrazów, korekcja perspektywy, nakładka źródła i kalibracja w UI.
- **NOT RUN:** konfiguracja szyfrowanego BYOK, rozpoznawanie OpenAI, serwer MCP, audyt i trwałe zatwierdzenia.
- **NOT RUN:** automatyczny przedmiar i przekazanie zweryfikowanej dokumentacji wykonawcom.

### Kontynuacja

Nie oznaczać zadania jako zakończonego. Następny etap to rysowanie/import z prywatnym zapisem dokumentów,
kalibracją i ręczną weryfikacją, następnie OpenAI/BYOK oraz uwierzytelnione MCP na wspólnych przypadkach użycia.
Obecne pola pomiarów są opisami roboczymi, nie danymi nadającymi się automatycznie do kalkulacji.
Istniejąca publikacja zlecenia nadal publikuje bazowy raport, nie zatwierdzony projekt CAD.

## Sesja 24 — 12 października 2026

### Zrobione

1. Po korekcie użytkownika zastąpiono widok opisów przez pełnoszerokościowy edytor projektu z płótnem,
   zakładkami etapów/rysunków, paskiem narzędzi, listą elementów i panelem właściwości. Opisy są dodatkiem
   w zwijanej sekcji pod płótnem.
2. Dodano rysowanie ław, ścian, płyt/obrysów, połaci, prętów, wymiarów i opisów, przesuwanie elementów,
   edycję współrzędnych/parametrów, warstwy, pan/zoom/dopasowanie, undo/redo i eksport SVG.
3. Każdy rysunek ma osobny szkic w `cad_drawings`. Automatyczny zapis z rewizją przeżywa odświeżenie.
   Awaria zachowuje lokalne zmiany i blokuje przejście do czasu ponowienia. Konflikt innej karty nie nadpisuje danych.
4. Dodano „Skanuj lub importuj projekt”: zdjęcie lub wybrana strona PDF, lokalny raster PDF.js, prywatny
   oryginał oraz PNG strony, zgoda na transfer i koszty, konfiguracja/usuwanie szyfrowanego klucza per użytkownik.
5. Adapter OpenAI Responses API analizuje wybrany etap, a domena waliduje rozpoznane odcinki, obrysy i opisy.
   Propozycja trafia na to samo płótno jako edytowalna, niezatwierdzona geometria z pochodzeniem i confidence.
   Nie wymyślamy przekrojów/stali ani ilości na podstawie samego obrysu.
6. Ustawienie skali dwoma punktami reskaluje podkład i obiekty razem. Bez kalibracji UI ostrzega, że mm są
   tymczasowe. Rozpoznane obrysy nie mogą stać się podstawą zatwierdzonego przedmiaru bez klasyfikacji i parametrów.
7. Dodano trzy nieusuwające danych migracje, RLS, serwerowe RPC zapisu i atomowy limit 10 prób analizy/godzinę.
8. Test prostego rysunku wykrył spłaszczenie widoku przy odczycie pojedynczego odcinka przed montażem SVG.
   Poprawiono dopasowanie proporcji także przy zmianie rozmiaru płótna; test rysuje i sprawdza cztery różne narożniki.

### Weryfikacja

- `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm install --frozen-lockfile` — **PASS**.
- `pnpm test` — **PASS**: 57 testów; schemas 32, domain 11, geometria 9, kalkulatory 3, tokeny 2.
- `pnpm db:test` — **PASS**: 108 asercji w 5 plikach.
- SQL lint — **PASS**; kontrola edytora VS Code — **PASS**.
- `pnpm test:e2e` — **PASS**: 7 scenariuszy. Nowy test obejmuje odcinek, edycję, undo/redo, awarię/retry autosave,
  odświeżenie, osobne rysunki zbrojenia, obrys, eksport SVG, uprawnienia API, szyfrowany zapis klucza,
  propozycję AI z mocka, kalibrację z błędem ekranowym <0,01 mm, import PDF i brak overflow mobile.
- Kontrola screenshotów desktop/mobile — **PASS**. Wynik na płótnie pochodzi z testowego mocka AI.

### Ograniczenia / kontynuacja

- Rzeczywiste rozpoznawanie OpenAI — **BLOCKED**: brak skonfigurowanego klucza użytkownika i szyfrowania serwera.
  Nie wykonano płatnego wywołania ani transferu prywatnego projektu.
- Dokładność AI na zestawie projektów referencyjnych — **NOT RUN**. Testy geometrii i mocka nie są tym dowodem.
- Korekcja perspektywy, pełny asortyment narzędzi zbrojeniowych/3D, trwała historia wersji, MCP, audyt
  i limit wydatków w PLN — **NOT RUN**; obecny limit dotyczy liczby prób, nie kwoty.
- Ręcznie dodawane obiekty mają jawnie robocze parametry do uzupełnienia z projektu. Wszystkie rysunki są szkicami.
- Podłączyć niesensytywny projekt referencyjny po konfiguracji BYOK i zgodzie na rozliczenia; sprawdzić
  rzeczywistą jakość przed rozszerzaniem automatycznego przedmiaru lub przekazaniem projektu wykonawcom.

## Sesja 25 — 12 października 2026

### Zrobione

1. Dane budowy, technologie i projekt korzystają z tej samej szerokiej przestrzeni i nawigacji.
   Dodano numerowane, klikalne kroki rysunków: zielony to zapisany niepusty szkic, czerwony pusty dokument.
   „Przejdź dalej” przechodzi kolejno po rysunkach, nie pomija przekrojów ani zbrojenia etapu.
2. Usunięto sekcję „Dane szczegółowe etapu i źródła pomiarów” z UI bez usuwania starszych wpisów.
3. Zoom kółkiem zachowuje punkt pod kursorem; przyciski skalują wokół środka. Dodano osie, linijki
   i odczyt X/Y w mm. Przyciąganie jest regulowane, również 0 mm. Fit centruje również wąskie rzuty.
4. Wspólny katalog narzędzi rozróżnia ławy, stopy, ściany fundamentowe, słupy, belki, nadproża, wieńce,
   płyty, połacie, krokwie, otwory, warstwy/obszary wykończenia, nawierzchnie, obrzeża, ogrodzenia i trasy.
   Profile zależą od rodzaju i funkcji rysunku; API również odrzuca np. dach rysowany w fundamentach.
5. Ściany mają automatyczne linie wymiarowe i przerywane pomocnicze. Połączone końce mają uchwyty;
   ruch narożnika/elementu aktualizuje połączenia oraz związane otwory. Osie nie są węzłami konstrukcyjnymi.
6. Warstwy materiałowe mają funkcję, materiał, stronę i grubość mm; izolacja ma widoczne oznaczenie.
   Materiały ankiety są podpowiedzią, a nie domyślną grubością. Dla obrysów pas warstwy nie zastępuje przekroju.
7. Kopiowanie zapisanych rzutów zachowuje otwory i źródłową rewizję. Kopie są podkładami, nie dodatkowymi
   ilościami. Dodano automatyczne rozwinięcia ścian z jawnych wysokości i otworów, bez generowania konstrukcji.
8. Kreator belki/siatki rysuje edytowalne układy, opisy i wymiary z danych użytkownika.
   Strzemiona w rzucie są oznaczone jako projekcja i nie mogą udawać długości prętów do przedmiaru.
9. Skalibrowane obrysy AI można przypisać do typowanego elementu aktualnego etapu.
   Pochodzenie i confidence pozostają zachowane; parametry trzeba uzupełnić z dokumentacji.

### Weryfikacja

- Testy geometry/schemas/domain — **PASS**: 10 + 32 + 18 = 60 testów w zmienianych pakietach.
- Web build, `pnpm typecheck`, `pnpm lint`, `git diff --check` — **PASS**.
- Pełny Playwright — **PASS**: 8/8; w tym zoom, połączenia, ocieplenie, statusy, reuse, rozwinięcia,
  zbrojenie, refresh, klasyfikacja AI oraz edytory nawierzchni/elewacji/dachu i odrzucenie niewłaściwego typu przez API.
- Pierwsze iteracje — **FAIL**: naprawiono typowanie pustych punktów fabryki oraz jednoznaczne etykiety select;
  testy myszy przewijają teraz płótno do viewportu przed gestem. Końcowe kontrole — **PASS**.
- Baza pgTAP — **NOT RUN** w tej sesji: brak zmian SQL; izolacja dostępu nadal pokryta E2E API.

### Niedokończone wymagania użytkownika

- Pełne przeniesienie dowolnego projektu branżowego 1:1 — **NOT RUN**. Brakuje m.in. łuków/haków i
  pełnych rozwinięć gięcia, przekrojów konstrukcyjnych z poziomami, rozbudowanych detali i parametrycznych zestawień.
- Obecne rozwinięcie ścian nie jest automatycznym przekrojem budynku/stropu/fundamentu.
- Rzuty zbrojenia nie zastępują fizycznych kształtów prętów i zestawienia mas.
- Kopie nie synchronizują zmian źródła; otwory powierzchniowe nie mają jeszcze kompletnej topologii i odejmowania.
- Dokładny, zweryfikowany przedmiar, odbiór konstrukcyjny, przekazanie wykonawcy, MCP — **NOT RUN**.
- Rzeczywiste AI — **BLOCKED** do konfiguracji BYOK/szyfrowania i zgody na płatny test.
- Następny krok: model poziomów i przekrojów, powiązania otworów powierzchniowych, rozwinięcia prętów
  i obliczenia na potwierdzonych parametrach; test odwzorowania na niesensytywnym projekcie referencyjnym.

## Sesja 26 — 12 października 2026

### Zrobione

1. Uproszczono nawigację: jeden numerowany etap z podpunktami rysunków. Usunięto „Etap dokumentacji”
   oraz powtórzony pasek etapów. Czerwony etap ma brakujące rysunki; zielony wymaga zapisania wszystkich.
2. Ruch narożnika i elementu ma podgląd podczas gestu, bez snapu do siatki i początkowego skoku do uchwytu.
   Zwolnienie myszy dodaje jedną operację undo; anulowanie usuwa podgląd. Nawigacja jest blokowana podczas
   gestu i niezakończonego zapisu; podgląd nie trafia do autosave.
3. Zewnętrzny obrys rdzenia ściany/ławy ma wymiary długości i szerokości. Dodano gabaryty rzutu fundamentów.
   Stopy i słupy rysuje się narożnik–narożnik; długość/szerokość zmienia rzeczywiste wierzchołki prostokąta.
   Dostępność płyty odpowiada zapisanej technologii także w API.
4. Dla ściany fundamentowej wybiera się podparcie spośród technologii budowy i przepisuje parametry z projektu.
   Ława jest tworzona automatycznie i aktualizuje się razem ze ścianą. Płyta powstaje po zamknięciu obwodu,
   z projektową grubością i wysunięciem poza zewnętrzne lico. Rozgałęzienia i sprzeczne parametry są odrzucane.
5. Ocieplenie i hydroizolację z ankiety przypisuje się ścianie po podaniu projektowej grubości i strony.
   Canvas pokazuje oznaczenie warstwy, grubość i legendę zamiast powielania długich nazw na każdej ścianie.
6. Przejrzano MASTER_SPEC i aneks importu. Fundamenty mają czwarty podpunkt detali izolacji, odwodnienia
   i przejść oraz zapisywane referencje: rzut, przekroje/rzędne, zbrojenie, izolacje, geotechnika, materiały,
   instalacje. Nie są to automatycznie zatwierdzone ani wygenerowane dokumenty projektanta.
7. Kreator zbrojenia jest osobnym, responsywnym dialogiem: graficzny przekrój z uchwytem i wymiarami,
   pręty górne/dolne, strzemiona, otulina, stal i miejsce ułożenia. Zapisuje rzut i detal na głównym canvas.
   Układ może należeć do ściany/ławy/belki bieżącego rysunku lub skopiowanego podkładu.
   Ruch/obrót podparcia przenosi układ; zmiana długości ustawia ostrzeżenie, bez rozciągania prętów.
8. API odrzuca podparcie niezgodne z ankietą lub geometrią ściany. Kopie przepisują ID zależnych podpór,
   podparć zbrojenia i grup. Izolacja użytkowników, autosave/retry, skan i kalibracja pozostają pokryte regresją.
9. Zrestartowano lokalny podgląd na porcie 3010 z końcowego builda, bez przeładowywania formularza użytkownika.

### Weryfikacja

- Geometry/schemas/domain — **PASS**: 13 + 32 + 23 = 68 testów w zmienianych pakietach.
- Produkcyjny Web build, `pnpm typecheck`, `pnpm lint`, `git diff --check` — **PASS**.
- Pełny Playwright Edge — **PASS**: 10/10; ruch widoczny przed mouseup co 1 px (bez skoku 100 mm),
  pojedyncze undo/redo, zewnętrzne 5240/240 mm, zmiana stopy do 1800×1200 mm, trwałość po reload.
  Nowy scenariusz obejmuje zależną ławę, automatyczną płytę, izolacje, odrzucenie rozjechanej ławy przez API,
  graficzny kreator, przypisanie do podkładu, zapis przekroju i ostrzeżenie po zmianie długości podparcia.
- Dialog desktop/mobile i screenshoty — **PASS**; przy 390 px dialog nie ma poziomego overflow.
  Po końcowej kontroli proporcji SVG ponowiono build/lint i scenariusz fundamentów — **PASS** (1/1);
  przesunięcie uchwytu przekroju o 5 px daje dokładnie oczekiwaną zmianę mm w obu kierunkach.
- Podgląd aplikacji i PDF worker — **PASS**: HTTP 200.
- Pierwsze iteracje — **FAIL**: poprawiono typ grubości rdzenia, położenie eksportu helpera i narrowing listy
  podpór; poprawiono lint handlera oraz nieaktualne etykiety/selektory nowego testu.
  Test współrzędnych odsuniętej płyty stosuje tolerancję 0,000001 mm, nie ścisłą równość float.
- pgTAP — **NOT RUN**: brak zmian SQL; nowe relacje sprawdzają testy domain i API/E2E.
- Rzeczywiste OpenAI — **BLOCKED**; brak płatnego wywołania.

### Kontynuacja i ograniczenia

- Pełny CAD projektu 1:1, fizyczne kształty gięcia z hakami/łukami i zweryfikowany przedmiar — **NOT RUN**.
- Ławy/płyta są szkicem odtworzonym z jawnych parametrów, nie doborem nośności.
  Dla stóp, pali i nietypowego/istniejącego posadowienia układ podpór przenosi się ręcznie z projektu.
- Brakuje pełnych przekrojów z poziomami, warstwami w pionie i automatycznej kontroli kolizji/zestawień.
- Wymiary rdzenia i gabaryty nie zastępują wszystkich łańcuchów wymiarowych dowolnego projektu.
  Połączone pasy nie są jeszcze ujednoliconą bryłą do obliczenia objętości bez podwójnych przecięć.
- Źródłowe podkłady nadal nie synchronizują się z wcześniejszym dokumentem; związany układ śledzi tylko
  podparcie w bieżącym rysunku. Zmiana długości wymaga odtworzenia układu z projektu.

## Sesja 27 — 12 października 2026

### Zrobione

1. Przyciąganie końców działa podczas rysowania i przeciągania narożnika: 12 px niezależnie od zoomu,
   priorytet końca przed odcinkiem ściany. Zielony znacznik wskazuje połączenie. Można je wyłączyć,
   niezależnie od przyciągania siatki; płynny ruch i undo/redo zachowano.
2. Wspólne końce są trwałym połączeniem: narożnik przesuwa wszystkie dochodzące odcinki. Można złapać
   narożnik także blisko końca niezaznaczonego elementu. Połączenie T dzieli ścianę i przepisuje właściciela
   otworów. Połączenie wewnątrz otworu lub podział hosta zbrojenia daje jawny błąd.
3. Zależne ławy/płyty pozostają zsynchronizowane po podziale ściany. Testy sprawdzają T na obwodzie płyty,
   ścianę wewnętrzną oraz trzy ławy pod dochodzącymi odcinkami.
4. Canvas zajmuje pełną szerokość (przy 1440 px ponad 1250 px, wysokość co najmniej 640 px).
   Panel z obrazka i inspektor przeniesiono pod płótno; powiększono teksty i zgrupowano parametry
   fundamentów: ściana, podparcie, izolacje. Referencja dokumentacji jest opcjonalną sekcją rozwijaną.
5. Technologia podpowiada materiał; bloczki 24/25/30 cm ustawiają grubość 240/250/300 mm z możliwością
   ręcznej zmiany. Dodano bloczek szalunkowy 24 cm. Nie zgadujemy grubości wariantów bez podanego wymiaru.
6. Ściany są niebieskie, ławy bursztynowe, stopy fioletowe, słupy różowe, płyty turkusowe, wykopy ochrowe.
   Legenda opisuje kolory; zaznaczenie zmienia obrys, nie usuwa koloru roli. Dodano zwymiarowany obszar
   wykopu i pole „Głębokość wykopu (mm)”, bez automatycznego doboru czy przedmiaru ziemnego.

### Weryfikacja

- `pnpm --filter @asystent/schemas test`, `pnpm --filter @asystent/domain test` — **PASS**: 32 + 27 testów.
- Web build, `pnpm typecheck`, `pnpm lint`, `git diff --check` — **PASS**.
- Pełny Playwright Edge — **PASS**: 11/11. Nowy scenariusz sprawdza połączenie w odległości 7 px,
  wspólny ruch obu ścian przed puszczeniem myszy, undo, zamknięty obrys, węzeł T, kolory trzech ról,
  automatyczne 240 mm z technologii, pełne wymiary canvas i położenie panelu pod nim oraz reload.
- Desktop/mobile — **PASS**; 390 px bez poziomego overflow, panel nadal pod canvas.
- Pierwsze iteracje nowego testu — **FAIL**: ścisłą równość float zastąpiono tolerancją 0,001 mm;
  po undo/fit gest startował poza canvas, poprawiono współrzędne scenariusza do aktualnego widoku.
- Geometry tests — **NOT RUN**: brak zmian w pakiecie geometrii; dotychczasowe 13/13 pozostaje historycznym wynikiem.
- Baza pgTAP — **NOT RUN**: brak SQL; regresja uprawnień/zapisu objęta E2E.
- Rzeczywiste OpenAI — **BLOCKED**: bez klucza i płatnego wywołania.

### Kontynuacja

Pełny CAD 1:1, objętości po usunięciu nakładających się pasów, pionowe przekroje/poziomy, gięcie prętów
i zatwierdzony przedmiar pozostają **NOT RUN**. Przy podziale ściany z przypisanym zbrojeniem trzeba
usunąć układ i odtworzyć go na nowym podparciu; aplikacja nie zgaduje zmiany rozwiązania konstrukcyjnego.

## Sesja 28 — 12 października 2026

### Zrobione

1. Parametry ściany/podparcia zapisują się przy wpisywaniu, także bez geometrii i przy niekompletnych polach.
   Usunięto „Zastosuj do nowych ścian”. Nowe ściany używają poprawnych bieżących parametrów, istniejące
   zmienia się jawnie. Kolejny rysunek dziedziczy zapisane ustawienia fundamentów; refresh ich nie resetuje.
2. Strony wewnętrzna/zewnętrzna/obie dotyczą hydroizolacji. Ocieplenie jest niezależnie zewnętrzne,
   z rombowym symbolem, rzeczywistą grubością i ciągłością na licach narożników. Przy otwartym obrysie
   albo ścianach wewnętrznych aplikacja wymaga zamknięcia lub ręcznego wyboru strony.
3. Wymiary mają globalne rozmieszczenie etykiet, białe maski i ekranowe minimum 13 px. Usunięto
   redundantne powtórzenia jednakowych szerokości; gabaryty i pozycje podpór pozostają zwymiarowane.
4. Węzły X dzielą obie ściany na cztery połączone końce. T i X zachowują otwory, podpory i ich referencje.
   Stopa/słup dotykający ściany podąża za ruchem i obrotem. Wymiary rzeczywiste nie zmieniają się przez
   obrót; prostokąt można także zmieniać liczbowo w jego lokalnych osiach.
5. Oznaczenia W/SF/L/ST/S/P/B/WF/N są trwałe i edytowalne; walidacja nie dopuszcza duplikatów.
   Starsze elementy otrzymują oznaczenia przy wczytaniu. Słupy/stopy mają rozmiar X × X wewnątrz symbolu,
   wymiary względem hosta i X/Y względem gabarytu także dla podpór wolnostojących.
6. Usunięcie ściany odczepia słup/stopę/opis bez kasowania symbolu. Undo odtwarza relacje.
   Wykop rysuje się teraz pasem jak ścianę, z szerokością, głębokością i kolorem; stare obszary zachowano.
7. Zamknięte pola pokazują m² w świetle ścian, także po podziale i ze ślepo zakończonymi ścianami.
   Nowa opcja „Płyta denna między ławami” jest niezależna od płyty fundamentowej. Parametry wpisuje się
   pod canvas; kliknięcie pola ław wstawia powiązaną płytę, która podąża za obwodem.
8. Opis powstaje przez przeciągnięcie od elementu do wolnego miejsca. Tekst i czcionkę zmienia się
   bezpośrednio przy canvas. Legenda w prawym dolnym rogu obejmuje technologie, parametry i referencje;
   ma rezerwowany pas przy dopasowaniu widoku i przycisk ukrywania. Wyróżniono przyciski historii/widoku.
9. Skala arkusza 1:10–1:1000 jest trwała i niezależna od zoomu/kalibracji. Eksport SVG otrzymuje fizyczne
   wymiary według skali i tekst wymiarowy 2,5 mm na arkuszu.
10. API odrzuca płytę denną bez wyboru technologii oraz niespójne położenie podpór/płyty.
    Poprawiono race statusu autosave: zapis poprzedniej rewizji nie pokazuje sukcesu dla nowszych zmian.

### Weryfikacja

- Schemas / geometry / domain — **PASS**: 32/32 + 13/13 + 35/35.
- Produkcyjny Web build, workspace typecheck i lint — **PASS**.
- Pełny Playwright Edge — **PASS**: 12/12. Nowy scenariusz mierzy faktyczne ramki renderowanego tekstu
  i ich brak kolizji, weryfikuje czytelność, pusty rysunek z zapisanymi ustawieniami po refresh, dziedziczenie,
  symbole izolacji, słup podążający za ścianą, usunięcie hosta i undo, płytę kliknięciem, opis i skalę SVG,
  niezmieniony zoom przy zmianie skali, ruch czterech końców X i mobile 390 px bez overflow.
- API w E2E — **PASS**: HTTP 400 dla zmienionej geometrii płyty i starej ramy przyczepienia.
- Iteracje — **FAIL**: nowy wymagany etap zakłócał stare ankiety; zachowano nieokreślony, opcjonalny wybór
  i usunięto „zgodnie z projektem” z pytania tak/nie. Poprawiono kolejność kompilacji zależności, deklarację
  rozmiaru tekstu i stare asercje symboli. Test belki wykrył przedwczesny status autosave — poprawiono przyczynę.
- pgTAP — **NOT RUN**: bez zmian SQL; brak resetu danych.
- Rzeczywiste AI — **BLOCKED**: bez klucza i płatnego wywołania.

### Kontynuacja / granice

Powierzchnie pól nie odliczają stóp, słupów ani otworów w podłodze. Zmiana podziału pola istniejącej płyty
wymaga jej usunięcia i ponownego wskazania. Host z przypisanym zbrojeniem nadal wymaga usunięcia układu
przed podziałem. Identyfikatory S1/ST1 przygotowują przyszłe projektowanie zbrojenia podpór, nie dobierają
belki ani rozwiązania konstrukcyjnego. Pełny CAD 1:1, fizyczne gięcie, ujednolicone bryły i zatwierdzony
przedmiar pozostają **NOT RUN**.

## Sesja 29 — 12 października 2026

### Zrobione

1. Dwuklik na opisie otwiera edycję tekstu wewnątrz SVG, także w trybie płyty. Enter/blur zapisuje,
   Escape anuluje. Przechwycenie myszy dla opisu zaczyna się dopiero przy przeciąganiu, nie blokując dwukliku.
2. Przycisk „Wyczyść canvas” jest obok historii/eksportu. Potwierdzenie czyści elementy, podkład i kalibrację
   bieżącego arkusza; ustawienia pozostają. Cofnij odtwarza dokument. Nie usuwamy plików z Storage.
3. Prawy przycisk myszy z przeciąganiem przesuwa widok w każdym narzędziu; bez geometrii i menu kontekstowego.
4. Symbol ocieplenia powiększony 10× wzdłuż ściany, bez zmiany projektowej grubości warstwy.
5. Wymiary podzielonych T/X odcinków nie doliczają zakończeń rdzenia na wspólnych węzłach.
   Stopy i słupy mają położenie wzdłuż i prostopadle do lic hosta/najbliższej ściany, nie gabarytu rysunku.
   Projekcja poza końcem ściany pozostaje prostopadła; nie powstaje mylący wymiar ukośny.
6. Oba warianty płyty w fundamentach są wybierane kliknięciem zamkniętego pola ław. Nowe narzędzie
   „Pomieszczenie z piwnicą” jest warunkowane `basement=true`, także na API, i aktualizuje pole z ławami.
   Płyta i piwnica mogą być w tym samym polu, niezależnie. JSON pozostaje kompatybilny, bez migracji.
7. Blokada edytora podczas zmiany rysunku zapobiega kliknięciu/przeciąganiu poprzedniego arkusza.

### Weryfikacja

- Schemas **PASS** 32/32; domain **PASS** 38/38, w tym łańcuch X, najbliższa ściana i pole piwnicy.
- Web build, workspace typecheck/lint **PASS**. Pełna regresja Playwright **PASS** 13/13;
  dodatkowa kontrola czyszczenia podkładu importu i cofania jest raportowana w TEST_REPORT.
- E2E obejmuje dwuklik/Enter/Escape, wszystkie dostępne tryby prawego przeciągania, symbol 10×,
  piwnicę i płytę po reload, API 400 bez piwnicy oraz wybór płyty fundamentowej bez płyty dennej.
- Iteracje **FAIL**: stare testy zakładały ręczny wielokąt płyty; używają teraz narzędzia otworu
  do regresji wielokątów. Naprawiono przechwytywanie dwukliku i aktywność starego arkusza podczas nawigacji.
- pgTAP **NOT RUN** (bez SQL); rzeczywiste OpenAI **BLOCKED** (bez klucza/płatnego wywołania).

### Granice

Piwnica to oznaczenie wybranych pomieszczeń, nie wygenerowany projekt konstrukcyjny. Podział już
zaznaczonego pola wymaga usunięcia oznaczenia i ponownego wyboru. Pełny CAD i zatwierdzony
przedmiar pozostają **NOT RUN**.

## Sesja 30 — 12 października 2026

### Zrobione

1. Wspólna paleta rysunku i wymiarów: niebieskie ściany, pomarańczowe ławy, zielone wykopy;
   stopy/słupy zachowują własne kolory. Generowane ławy mają także wymiary długości.
2. Wymiary obu nierównych lic każdego odcinka wynikają z przecięć rzeczywistych krawędzi.
   T/X, narożniki i połączenia ukośne uwzględniają szerokość sąsiedniego elementu, nie kończą się na osi.
3. Liczbowa zmiana elementu przesuwa jego wspólne węzły, tak jak przeciąganie. Wymiary wynikają
   z pełnej aktualnej topologii, także gdy część warstw jest ukryta. Ręczny wymiar geometryczny
   podąża za węzłem; jawna wartość referencyjna nie jest nadpisywana.
4. Położenia podpór mają krótkie etykiety `ST1 → SF3 : 4500 mm`, 12 px i odnośnik do symbolu.
   Układ sprawdza rzeczywiste obrysy ścian/podpór zamiast dużych prostokątów ukośnych elementów.
   Pola pomieszczeń/płyt nie wypychają opisów na zewnątrz całego budynku.
5. SVG przelicza etykiety i maski dla fizycznego fontu 2,5 mm na arkuszu. Ekranowy układ
   i font podpór wracają natychmiast po eksporcie, bez zmiany widoku.

### Weryfikacja

- Geometry **PASS** 13/13; domain **PASS** 43/43, w tym pięć nowych scenariuszy.
- Pełna regresja Edge **PASS** 14/14. Po końcowej zmianie eksportu dodatkowy E2E **PASS** 2/2:
  dokładne wartości obu lic, kolory, żywy ruch węzła, liczbowe przesunięcie, undo/redo/reload,
  cztery oddalenia/siedem przybliżeń, brak kolizji etykiet oraz papierowy font i przywrócenie widoku.
- Web build/lint, workspace typecheck/lint **PASS**. Diagnostyka zmienionych plików **PASS**.
- Podgląd na porcie 3010 zrestartowany po końcowym build; aplikacja i worker PDF **PASS** HTTP 200.
- Pierwsze iteracje **FAIL**: stare oczekiwania osiowych długości i opisów; zbyt mały font
  przy stałej wielkości modelowej; odczyt dokumentu po reload przed zakończeniem ładowania.
  Poprawiono oczekiwania na rzeczywiste lica, zachowano minimum zwykłych wymiarów i dodano oczekiwanie.
- pgTAP **NOT RUN** (bez SQL); OpenAI rzeczywiste **BLOCKED** (bez płatnego wywołania).

### Granice i dalej

Pełny CAD dowolnego projektu i zatwierdzony przedmiar pozostają **NOT RUN**. Rozbudowane rzuty
mogą wymagać rozdzielenia arkuszy; nie deklarujemy pełnej czytelności dowolnej liczby wymiarów.
Dalszy etap to weryfikacja przeniesienia rzeczywistych projektów i reguł obliczeń, nie automatyczne
zatwierdzanie konstrukcji.

## Sesja 31 — 12 października 2026

### Publikacja repozytorium

- Na prośbę użytkownika przygotowano pierwsze wysłanie projektu wraz z historią gałęzi `master`
  do `https://github.com/KursaP442/Asystent_Budowlanca`.
- Ostatni commit funkcjonalny: `1384cd2` — poprawki wymiarowania CAD.
- Kontrola dostępu i pustej historii zdalnej przez `git ls-remote`: **PASS**.
- Kontrola śledzonych plików konfiguracyjnych i wzorców kluczy w historii: **PASS**;
  śledzony jest tylko przykładowy plik środowiska z placeholderami. Lokalne sekrety i buildy
  pozostają poza repozytorium. Kontrola wzorców nie jest pełnym audytem bezpieczeństwa.
- Testy kodu: **NOT RUN** w tej sesji (bez zmian kodu; wyniki sesji 30 pozostają aktualne).
- Publikacja źródeł nie uruchamia hostingu, płatnych usług ani migracji bazy.
- `origin` skonfigurowany; `git push -u origin master`: **BLOCKED** — brak uwierzytelnienia GitHub,
  Git nie może zapytać o poświadczenia w nieinteraktywnej sesji. Użytkownik wybrał logowanie
  przez VS Code; po jego potwierdzeniu ponowić push i porównać zdalny hash z lokalnym HEAD.
- Ponowna próba po logowaniu VS Code: **BLOCKED** — Git wymagał osobnych poświadczeń.
  Za zgodą użytkownika wykonano logowanie przeglądarkowe Git Credential Manager.
- `git push -u origin master`: **PASS** — projekt z historią wysłany; gałąź śledzi `origin/master`.
  `git ls-remote origin refs/heads/master`: **PASS** — zdalny hash zgodny z lokalnym HEAD
  `123d704defe2ef9ff14949320a8e7d9aa00e45b0` podczas kontroli pierwszej publikacji.

## Sesja 32 — 12 października 2026

### Zrobione

1. Użytkownik wskazał GitHub jako bieżące repozytorium: po zweryfikowanych zmianach commit i push
   do `origin/master`, bez force push. Przed pracą wykonano fetch i sprawdzono zgodność gałęzi.
2. Domyślnie jeden wymiar długości na odcinek ściany, po zewnętrznym rzeczywistym licu.
   Generowane ławy nie dublują widocznych ścian; przy ukryciu ścian ich wymiary są dostępne.
   Usunięto z domyślnego widoku dodatkowe grubości i gabaryty, nie geometrię ani parametry.
3. „Wymiary szczegółowe” odsłania oba nierówne lica, ławy, grubości i gabaryty.
   Przełączenie nie zapisuje/wczytuje dokumentu i nie gubi niezapisanych edycji. Reload wraca do uproszczenia.
4. Podpora ma jeden opis obu współrzędnych „wzdłuż / prostopadle” oraz lokalny odnośnik.
   Nie rysujemy przez cały budynek linii położenia podpór. Etykiety szukają miejsca z czterech stron symbolu.
   Linie długości omijają konstrukcję, a pomocnicze kreski mają ograniczoną długość.
5. SVG eksportuje wybrany wariant wymiarowania. Obejrzano screenshot ukośnego obrysu z odgałęzieniem T:
   sześć ścian = sześć wymiarów długości, dwie podpory = dwa zwarte opisy.

### Weryfikacja

- Domain **PASS** 46/46; trzy nowe scenariusze: liczba wymiarów i kierunki ścian, ukośny obrys/T
  z nieprzecinaniem konstrukcji oraz zerowa stacja podpory.
- Web build/lint i workspace typecheck **PASS**; diagnostyka zmienionych TS/TSX **PASS**.
- Podgląd na porcie 3010 zrestartowany; aplikacja i worker PDF **PASS** HTTP 200/200.
- Pełna regresja Edge **PASS** 15/15; nowy E2E mierzy 8 etykiet zamiast ponad 16 w szczegółach,
  długość kresek pomocniczych, brak kolizji ramek, eksport, przełączenie i zachowanie encji.
- Iteracje **FAIL**: test ukrywał złą warstwę; zmienny callback fit wyzwalał ponowne wczytanie
  dokumentu przy przełączeniu — ustabilizowano callback. Próby pionowego rozmieszczania podpór
  nadal odsuwały opisy; dodano boczne miejsca. Po trzech próbach potwierdzono z użytkownikiem
  pozostawienie trybu szczegółowego. Test bliskości mierzy odległość od symbolu, nie tylko jego środka.
- Równoległy lint/E2E **FAIL**: Playwright usuwał katalog wyników podczas skanowania ESLint;
  końcowy lint uruchomiony po E2E **PASS**, bez zmiany konfiguracji.
- SQL **NOT RUN** (bez migracji); OpenAI rzeczywiste **BLOCKED** (bez płatnych wywołań).

### Granice / dalej

Pełny CAD dowolnego projektu i zatwierdzony przedmiar **NOT RUN**. Tryb szczegółowy świadomie pokazuje
więcej danych i nadal może wymagać osobnych arkuszy. Nie kasowano danych użytkownika ani nie
odświeżano jego formularza.

## Sesja 33 — 13 października 2026

### Podgląd w GitHub Codespaces

- Dodano `pnpm dev:web`, który buduje zależności workspace Web i uruchamia Next.js na `0.0.0.0:3000`.
- Do README dodano instrukcję przekierowania portu `3000` i otwierania prywatnego linku Codespaces.
- Serwer działa pod portem 3000; zmiany źródeł są obsługiwane przez standardowy hot reload Next.js.
- Supabase nie uruchomił się w tym Codespace: Realtime nie uzyskał połączenia z PostgreSQL podczas migracji.
   Strona renderuje ekran wymaganej konfiguracji; logowanie i zapis są **BLOCKED** do czasu uruchomienia backendu.
- `pnpm db:status` potwierdziło brak kontenera bazy. Próba `supabase start --exclude realtime` również nie ominęła
   błędu migratora Realtime. Nie zmieniono konfiguracji projektu ani nie resetowano danych.
- Smoke test HTTP **PASS** (200), tytuł strony **PASS**. Pierwszy start zwrócił 500 z powodu niebudowanych pakietów
   workspace; komendę startową poprawiono i ponowiono z wynikiem PASS.
- Web lint i workspace typecheck **PASS** (13 zadań).
- Nie zmieniano istniejącego `package-lock.json` ani danych backendu.

## Sesja 34 — 13 października 2026

### Testowanie bez logowania

- Dodano wejście developerskie do trybu demo, widoczne tylko przy `next dev` i braku konfiguracji Supabase.
- Demo nie tworzy fikcyjnej sesji ani nie wywołuje API. Udostępnia istniejący pełny formularz klienta, walidację
   technologii, dokumentację i ręczny CAD; ankieta startuje z walidowanym przykładem domu. Szkice są zapisywane
   w localStorage przeglądarki.
- Test schematów ankiety **PASS** (32/32), Web typecheck/lint **PASS**.
- Po zgłoszeniu użytkownika poprawiono przedwczesne `getSupabaseClient()` w zapisie zlecenia; demo przechodzi dalej
   bez inicjalizowania Supabase.
- Zdjęcia, skan/import AI oraz pełne panele wykonawcy i sklepu nie są obsługiwane w trybie demo.
- Web typecheck i lint **PASS**; lokalny URL zwraca **HTTP 200**, a ekran konfiguracji zawiera wejście demo.
- Test kliknięć Playwright **BLOCKED**: Chromium wymaga brakującej systemowej biblioteki `libatk-1.0.so.0`.
- Logowanie do Supabase i zapis serwerowy nadal **BLOCKED** przez nieudany start lokalnego backendu opisanego powyżej.

## Sesja 35 — 13 października 2026

### Pełny ekran edytora CAD

- Dodano przełącznik widoku pełnoekranowego w nagłówku edytora, z przyciskiem powrotu do dokumentacji.
- W szerokim układzie narzędzia i właściwości są po bokach płótna; na małych ekranach układają się pod nim.
- Geometria, wybór narzędzi i autosave nie zmieniają się przy przełączaniu widoku.
- Web typecheck/lint **PASS**, serwer dev **PASS** HTTP 200.
- Playwright/browser **BLOCKED** z powodu brakującej biblioteki systemowej Chromium `libatk-1.0.so.0`.

## Sesja 36 — 13 października 2026

### Mobilna nawigacja canvasu

- Na mobile w głównym widoku widoczne jest samo płótno; dotknięcie go otwiera pełnoekranowy edytor.
- Pełny ekran nie przewija strony: ma pionowy pasek narzędzi po lewej, akcję „Zapisz i wyjdź z canvasu” oraz nakładane ustawienia.
- Wyjście czeka na zapis zmian; przy błędzie pozostaje w canvasie. Desktop zachowuje dotychczasowy układ inline.
- Web typecheck/lint **PASS**, lokalny serwer **PASS** HTTP 200.
- Test wizualny mobile Playwright **BLOCKED** przez brak systemowej biblioteki Chromium `libatk-1.0.so.0`.

## Sesja 37 — 13 października 2026

### Sterowanie mobile i prowadnice

- Dodano pinch-zoom i przesuwanie widoku dwoma palcami; pojedynczy dotyk zachowuje rysowanie/zaznaczanie.
- Długie przytrzymanie przycisku narzędzia pokazuje opis do zwolnienia; puszczenie wybiera narzędzie.
- Desktop pokazuje prowadnice poziomą/pionową, wyrównanie do narożników istniejących ścian i ΔX/ΔY/długość.
- Full screen canvasu działa tak samo na desktop/mobile po kliknięciu samego płótna; pełny widok nie przewija dokumentu.
- Web typecheck/lint **PASS**, dev server **PASS** HTTP 200.
- Test dotykowy Playwright **BLOCKED** przez brak `libatk-1.0.so.0` w Codespaces.

## Sesja 38 — 13 października 2026

### Fundamenty demo i edycja wymiarów

- Snap ścian wyrównuje współrzędne X/Y do najbliższych narożników innych ścian w promieniu ekranowym 10 px;
   dokładny snap narożnika/segmentu w promieniu 12 px zachowuje pierwszeństwo.
- Rzut startowy demo ma obrys 9,6 × 7,6 m podzielony na dwa pola; piwnica i płyta denna 250 mm C25/30 są tylko
   w lewej połowie. Dodano 3 pary stóp/słupów i 4 odcinki wykopu z szerokością 1600 mm oraz głębokością 1200 mm.
   Pusty starszy szkic migruje do przykładu; celowo wyczyszczony rysunek z zachowanymi ustawieniami pozostaje pusty.
- Kliknięcie wymiaru elementu wybiera ścianę i otwiera właściwości. Zmiana długości używa aktualizacji wspólnych
   węzłów, więc sąsiednie połączone ściany podążają za narożnikiem.
- Usunięto zbędne zgłaszanie `cadPending=true` przy samym ładowaniu CAD; stan rodzica blokuje przejście tylko
   podczas rzeczywistej, niezapisanej edycji, co usuwa pętlę renderowania zgłoszoną w demo.
- Test domeny **PASS** 46/46, Web lint/typecheck **PASS**, seed runtime **PASS** (17 wymiarów uproszczonych / 51
   szczegółowych), HTTP **PASS** 200.
- Test wizualny UI **BLOCKED**: Chromium wymaga brakującej systemowej biblioteki `libatk-1.0.so.0`.

## Sesja 39 — 13 października 2026

### Ukrywanie wymiarów CAD

- Dodano niezależny przełącznik „Ukryj/Pokaż wymiary” w ustawieniach canvasu.
- Ukrycie obejmuje wymiary geometryczne i etykiety pól m²; geometria, siatka i prowadnice pozostają bez zmian.
- Web lint/typecheck **PASS**, dev server **PASS** HTTP 200.

## Sesja 40 — 13 października 2026

### Przekroje fundamentów — działający zakres i ograniczenia

- Dodano opcjonalne metadane przekrojów do istniejącego JSON CAD: stabilny identyfikator, oznaczenie, odnośnik do linii cięcia, kierunek, zakres, skala, elementy powiązane i walidowane nadpisania. Bez migracji bazy; starsze dokumenty pozostają zgodne.
- Panel istniejącego edytora pokazuje rzut tylko do odczytu w tych samych współrzędnych, obsługuje wybór istniejącej linii cięcia, oznaczenia, przesuwanie/zoom, wskazanie elementów i podgląd SVG. Zmiany metadanych przechodzą przez dotychczasowy zapis CAD.
- Geometria przekroju korzysta z rzeczywistych przecięć geometrii rzutu. Formularz pokazuje dostępne wartości i ich źródło; nadpisanie przekroju nie mutuje encji rzutu. Konflikty pozostają jawne, nieznane wartości nie dostają wartości domyślnych.
- SVG przedstawia znane wymiary, materiały, rzędne tylko gdy zostały podane, elementy interaktywne i eksport wektorowy. Lista elementów pokazuje status roboczy/zweryfikowany; ilości celowo oznaczane są jako nieobliczone.
- Zakres nadal nie obejmuje przedmiarów/objętości, PDF/PNG, pełnego resolvera parametrów typów i ustawień projektu, mobilnego gestu pinch, automatycznego wykrywania warstw budowy ani testu UI end-to-end. Moduł nie jest projektem konstrukcyjnym.
- Schematy **PASS 33/33**, domena **PASS 50/50**, Web typecheck **PASS**, lint **PASS**, build produkcyjny **PASS**. UI/E2E **NOT RUN**.

### Kontynuacja

- Dodać testy UI/E2E dla zapisu, ponownego otwarcia, nadpisania, synchronizacji zaznaczenia i eksportu SVG.
- Następnie rozbudować resolver źródeł danych i dokładną geometrię warstw; przedmiotów nie wyliczać, dopóki model nie umożliwi wiarygodnego uniknięcia podwójnego zliczania.

## Sesja 41 — 13 października 2026

### Zakładka przekrojów i legenda znaczników CAD

- Przekroje fundamentów i poziomy posadowienia przeniesiono z rozwijanego bloku pod canvasem do osobnej zakładki nawigacji rysunków etapu fundamentów. Widok przekrojów nadal pracuje na aktywnym dokumencie CAD i jego dotychczasowym autosave.
- Dodano na canvasie przewijaną, responsywną legendę kategorii znaczników. Wpisy grupują typy elementów (bez wypisywania konkretnych egzemplarzy); obrys i płyta mają wspólny zielony kwadrat.
- Walidacja zmian: Web typecheck/lint/build **PASS**. HTTP aplikacji na porcie 3001 **PASS** (200). Test wizualny UI **NOT RUN**.

## Sesja 42 — 13 października 2026

### Kolorowe znaczniki i edycja ściany z canvasu

- Legenda prezentuje już kwadratowe, jawnie blokowe próbki kolorów obok kategorii; nie wylicza konkretnych encji. Obrys/płyta pozostaje wspólną pozycją zieloną.
- Dwuklik na encji otwiera panel właściwości na canvasie z przyciskiem ×. Dla ścian dostępne są długość, wysokość, grubość i materiał; zatwierdzenie pola zmianą wartości uruchamia dotychczasowy autosave.
- Zmiana długości ściany korzysta z istniejącej aktualizacji wspólnych węzłów, więc sąsiadujące połączone ściany i otwory podążają za geometrią. Wysokość jest aktualizowana dla ścian zamkniętego pomieszczenia; przy otwartym obrysie zmienia się tylko zaznaczona ściana.
- Dodano przycisk pokaż/ukryj wymiary bezpośrednio na canvasie.
- Test domeny **PASS 51/51**, Web typecheck/lint/build **PASS**, `git diff --check` **PASS**. Browser smoke: kolory legendy, otwarcie/zamknięcie panelu i przełącznik wymiarów **PASS**; test zapisu zmian ściany end-to-end **NOT RUN**.

## Sesja 43 — 13 października 2026

### Łączenie wykopów i właściwości powiązanych elementów

- Wykop zachowuje rysowanie odcinkami, a końce wykopów przyciągają się do narożników i odcinków wykopów. Skrzyżowania dzielą linię na połączone krawędzie; przesunięcie wspólnego narożnika aktualizuje sąsiednie odcinki bez łączenia topologii wykopu ze ścianą.
- Pojedyncze kliknięcie elementu w trybie zaznaczania otwiera istniejący inspektor „Właściwości elementu”. Kliknięcie nie otwiera go przy przeciąganiu geometrii; dwuklik na ścianie zachowuje dotychczasowe okno z przyciskiem zamknięcia.
- Dodano opcjonalne, zwalidowane relacje `relatedTo` w JSON CAD. Kopiowanie i podział ściany zachowują relacje, a istniejące dokumenty bez tego pola pozostają zgodne. Inspektor pozwala przechodzić do szczegółów powiązanych elementów; powiązane wykopy w przykładowym rzucie otwierają edytowalne pola długości, szerokości, głębokości, materiału i odniesienia.
- Właściwości automatycznej ławy/płyty zmienia się w elemencie źródłowym ściany; nie da się przypadkowo nadpisać wygenerowanego podparcia.
- Testy schematów **PASS 34/34**, domeny **PASS 53/53**, Web typecheck/lint **PASS**. Browser smoke rzeczywistego kliknięcia ściany SF3, widoczności inspektora oraz otwarcia szczegółów powiązanego wykopu **PASS**. Zapis zmienionych danych w przeglądarce **NOT RUN** (test UI nie zmieniał ani nie zapisywał parametrów projektu).

## Sesja 44 — 13 października 2026

### Łańcuchy wymiarowe i edycja czteroklikiem

- Wymiary podpór przy tej samej ścianie i po tej samej stronie są prezentowane wspólną, czytelną linią wymiarową; podpory w zamkniętym obrysie zachowują powiązanie i odsunięcie przy przesuwaniu ściany.
- Cztery szybkie kliknięcia etykiety wymiaru otwierają edycję wartości na canvasie. Cztery szybkie kliknięcia elementu otwierają osobny dialog właściwości; przechwycenie wskaźnika przez SVG nie gubi już celu kliknięcia.
- Dodano regułę widoczności dialogu w pełnoekranowym canvasie, który domyślnie ukrywa inspektor razem z ustawieniami arkusza.
- Schematy **PASS 34/34**, domena **PASS 55/55**, Web typecheck/lint oraz `git diff --check` **PASS**.
- Końcowa wizualna weryfikacja dialogu po poprawce CSS **NOT RUN**; browser smoke wykazał stan dialogu przed poprawką, ale inspektor pozostawał ukryty przez regułę pełnego ekranu. Ponowne sprawdzenie otwarcia/zamknięcia i trwałego zapisu pozostaje do wykonania.

## Sesja 45 — 13 października 2026

### Czytelność łańcuchów i indywidualne grubości ścian

- Zachowano wcześniejsze kolory znaczników elementów; linie wymiarowe są neutralne, tak aby kolory rzutu nie konkurowały z opisami.
- Każda ściana otrzymuje osobny wymiar grubości w mm obok wymiaru długości. Czteroklik etykiety grubości pozwala zmienić wartość na canvasie; dla automatycznej ławy aktualizuje źródłową szerokość w parametrach fundamentu.
- Dostosowano końcowe znaczniki wymiarowe do krótkich ukośnych kresek oraz ujednolicono wygląd linii pomocniczych i wymiarowych.
- Testy domeny **PASS 55/55**, Web typecheck/lint oraz `git diff --check` **PASS**. Browser smoke i końcowa kontrola wizualna **NOT RUN** — lokalny serwer `localhost:3001` zakończył pracę przed zmianą.

## Sesja 46 — 13 października 2026

### Położenie wymiarów grubości na każdej ścianie

- Znaczniki grubości są teraz umieszczane przy środku odcinka każdej ściany; zachowano linię wymiarową na rzeczywistym przekroju przez grubość i neutralny styl opisów.
- Rozmieszczenie szuka najbliższego wolnego pola dla tekstu, a w zatłoczonych rzutach wybiera miejsce o najmniejszym nakładaniu zamiast usuwać cały zestaw wymiarów.
- Kolory znaczników elementów pozostały bez zmian. Test domeny sprawdza również, że wymiar grubości jest zakotwiczony w środku ściany.
- Domena **PASS 55/55**. Browser smoke **PASS**: 7/7 oznaczeń grubości widoczne na rzucie bez błędu renderowania.
- Pozostało: zewnętrzne opisy położeń podpór i wymiarów nadal miejscami konkurują o przestrzeń; wymagają osobnej korekty wizualnej łańcuchów.

## Sesja 47 — 13 października 2026

### Kolorowe łańcuchy wymiarowe podpór

- Przywrócono kolor elementu dla linii, kresek i etykiet wymiarowych zamiast jednego czarnego koloru dla całego rysunku.
- Położenia słupów i stóp przy tej samej ścianie tworzą jeden wymiarowy łańcuch od lica narożnego do lica narożnego. Kreski obejmują oba narożniki i osie podpór, a opisy podają długości kolejnych odcinków zamiast kilku odrębnych opisów z odnośnikami.
- Współpołożone słup i stopa tworzą jeden węzeł łańcucha, nie dwa nakładające się opisy. Edycja wymiaru odcinka nadal przesuwa skojarzony element wzdłuż ściany.
- Wymiar grubości pozostaje indywidualny dla każdego odcinka ściany i zachowuje kolor ściany.
- Weryfikacja domeny, Web typecheck/lint i browser smoke po wdrożeniu zmian: **NOT RUN**.

## Sesja 48 — 13 października 2026

### Hierarchia pełnych pasów wymiarowych

- Pobrano i uruchomiono pełną implementację wymiarów z commita `6d3ff3a`; zachowano łańcuchy ścian, ław,
  wykopów, podpór, indywidualne grubości oraz przekroje fundamentów.
- Każda rodzina wymiarów otrzymała stabilny priorytet niezależny od kolejności encji: ściany → ławy fundamentowe
  → wykopy → podpory/pozostałe opisy → gabaryty.
- Łańcuchy korzystają ze wspólnego zewnętrznego obrysu wszystkich pasów konstrukcyjnych. Ściany zajmują pierwszy
  wolny pas, ławy kolejny, a wykopy następny; rodziny nie startują już z tego samego `chainLane`.
- Dodano regresję z encjami zapisanymi jako wykopy, ławy, ściany. Domena **PASS 58/58**, Web typecheck/lint
  **PASS**, HTTP `localhost:3000` **PASS** 200, `git diff --check` **PASS**.

## Sesja 49 — 13 października 2026

### Stała mała czcionka i płynniejszy zoom wymiarów

- Usunięto globalne wypychanie etykiet między rodzinami. Kolizje są rozwiązywane tylko wewnątrz jednego
  łańcucha, a ściany, ławy i wykopy pozostają na pasach ustalonych w sesji 48.
- Ekranowy tekst wymiarów ma stałe 8 px, a opisów podpór 7 px niezależnie od zoomu. Eksport nadal używa
  projektowego tekstu 2,5 mm na arkuszu.
- Memoizacja zatrzymuje ponowne obliczanie całego układu przy samym ruchu kursora. Wheel i pinch łączą wiele
  zdarzeń do jednej aktualizacji widoku na klatkę animacji.
- Domena **PASS 58/58**, Web typecheck/lint **PASS**, kompilacja dev bez błędów, HTTP `localhost:3000`
  **PASS** 200, `git diff --check` **PASS**.

## Sesja 50 — 13 października 2026

### Opisy wymiarów wzdłuż linii znaczników

- Etykieta każdego wymiaru jest obracana zgodnie z kierunkiem swojej linii wymiarowej i czytana od dołu
  albo od prawej; żaden opis nie biegnie już w poprzek znaczników.
- Pionowe i ukośne łańcuchy zajmują wąski pas wzdłuż linii, więc wymiary ścian, ław i wykopów przestają
  nawzajem wypychać swoje wartości.
- Kolizje, dopasowanie widoku i atrybut `data-label-box` liczone są na obwiedni obróconej ramki; tło,
  obszar klikalny i pole edycji obracają się razem z tekstem.
- Wzór rozmiaru etykiety został wyniesiony do wspólnych funkcji domeny (`cadDimensionLabelSize`,
  `cadDimensionLabelRect`, `cadDimensionLabelPlacement`, `cadDimensionLabelAngle`), bez duplikacji w rendererze.
- Domena **PASS 59/59**, Web typecheck/lint **PASS**, kompilacja dev bez błędów, HTTP `localhost:3000`
  **PASS** 200, `git diff --check` **PASS**.

### Dalej

- Wizualna weryfikacja obróconych opisów w przeglądarce pozostaje **NOT RUN** (brak zależności systemowych
  Playwright, `libatk-1.0.so.0`).

## Sesja 51 — 14 października 2026

### Hierarchia rodzin oraz osobne łańcuchy słupów i stóp

- Pełna hierarchia obejmuje teraz także gabaryt wewnątrz rodziny: podziały ścian → gabaryt ścian →
  podziały ław → gabaryt ław → podziały wykopów → gabaryt wykopów. Gabaryt ma zablokowany pas,
  więc kolizja nie może przenieść go za następną rodzinę.
- Każde zamknięte pomieszczenie ze słupami otrzymuje dokładnie dwa łańcuchy: poziomy i pionowy.
  Przecinające kreski wskazują osie słupów, a wartości pozostają na linii między sąsiednimi kreskami.
- Stopy mają niezależne dwa łańcuchy na pomieszczenie. Kreski wskazują obie krawędzie stopy, dzięki czemu
  widoczna jest odległość do stopy, jej szerokość i pozostały odstęp, np. `425 | 50 | 300`.
- Łańcuchy słupów i stóp nie mają indywidualnych linii pomocniczych. Dopasowanie widoku korzysta z ramek
  odpowiadających rzeczywistemu położeniu nieprzesuwanych etykiet.
- Domena **PASS 61/61**, Web typecheck/lint/build **PASS**, uruchomiony Web **PASS** HTTP 200,
  `git diff --check` **PASS**. Commit i push są wykonywane po końcowej kontroli tego wpisu.

## Sesja 52 — 14 października 2026

### Autostart aplikacji web przy otwarciu projektu

- Aplikacja została uruchomiona na żądanie: `pnpm dev:web`, `curl http://127.0.0.1:3000/` **PASS** HTTP 200.
- Dodano `scripts/dev-web.sh` — sprawdza zajętość portu `3000`, w razie potrzeby instaluje zależności
  i uruchamia `pnpm dev:web`. Skrypt przetestowany przy działającym serwerze: poprawnie pomija start (**PASS**).
- Dodano `.vscode/tasks.json` z zadaniem `Start aplikacji web (autostart)` (`runOn: folderOpen`,
  `isBackground: true`), więc aplikacja startuje sama po każdym otwarciu projektu (Codespaces i lokalny VS Code).
- Świadomie nie dodano `.devcontainer/devcontainer.json`, aby nie wymuszać przebudowy istniejącego Codespace
  (ADR-035). README opisuje autostart i sposób jego wyłączenia.

### Dalej

- Sprawdzenie autostartu po faktycznym ponownym otwarciu folderu pozostaje **NOT RUN** — wymaga akcji użytkownika.
- Push lokalnych commitów nadal wstrzymany na polecenie użytkownika.

## Sesja 53 — 14 października 2026

### Łańcuchy słupów i stóp wewnątrz pomieszczeń

- Odwrócono stronę odsunięcia poziomych i pionowych łańcuchów podpór: linie bazowe oraz przecinające
  znaczniki są teraz rysowane od dolnego i prawego lica do wnętrza właściwego pomieszczenia.
- Słupy korzystają z wewnętrznego pasa oddalonego maksymalnie o dwa rozmiary fontu, a stopy z osobnego pasa
  oddalonego maksymalnie o pięć rozmiarów fontu. Dla małego pomieszczenia oba odsunięcia są ograniczane do
  połowy jego głębokości. Nie zależą już od zewnętrznej obwiedni ani pasów ścian, ław i wykopów.
- Test regresyjny sprawdza współrzędne obu kierunków dla słupów i stóp oraz wymaga, aby wszystkie końce
  rzeczywistych linii wymiarowych mieściły się w granicach pomieszczenia.
- Domena **PASS 61/61**, Web typecheck **PASS**. Kontrola wizualna **NOT RUN** z powodu brakującej
  biblioteki systemowej Playwright `libatk-1.0.so.0`.

## Sesja 54 — 14 października 2026

### Zwarty mobilny canvas zgodny z układem desktopowym

- Zainstalowano brakujące biblioteki systemowe Chromium i wykonano rzeczywiste zrzuty pełnoekranowego CAD
  przy 390 × 844 oraz 1440 × 900 px.
- Mobilny nagłówek zmniejszono z 78 do 32 px, pasek narzędzi z 44 do 32 px, przyciski z 36 × 44 do
  28 × 34 px, a ikonę z 20 do 15 px. Zwarte są też legenda, komunikaty i kontrolka wymiarów.
- Canvas na telefonie zwiększył się z 324 × 588 do 346 × 769 px i zaczyna się na Y=71 zamiast Y=248.
  Daje to około 40% więcej powierzchni roboczej bez sztucznego skalowania geometrii lub gestów.
- Zrzuty porównawcze są zapisane poza repozytorium w folderze sesji jako `cad-mobile-before.png`,
  `cad-mobile-after.png`, `cad-desktop-before.png` i `cad-desktop-after.png`.
- Web lint **PASS**, Web typecheck **PASS**, automatyczny audyt wymiarów i zrzutów Playwright **PASS**.
  Desktop zachował dotychczasowe 1354 × 793 px. Sprawdzenie gestów na fizycznym telefonie **NOT RUN**.

## Sesja 55 — 14 października 2026

### Mniejsze etykiety wymiarów na mobile i desktopie

- Zmniejszono zwykłe etykiety wymiarowe na mobilnym canvasie z 8 do 6 px, a zwarte etykiety położenia
  słupów i stóp z 7 do 5 px.
- Na desktopie zwykłe etykiety zmniejszono z 8 do 7 px, a etykiety położenia podpór z 7 do 6 px.
- Próg responsywny jest oparty na rzeczywistej szerokości canvasu (`700 px`), dlatego reaguje również
  na zmianę rozmiaru okna. Eksport zachowuje dotychczasowe 2,5 mm na arkuszu.
- Web lint **PASS**, Web typecheck **PASS**. Playwright zmierzył rzeczywiste rozmiary ekranowe:
  mobile **PASS** 6/5 px, desktop **PASS** 7/6 px.

## Sesja 56 — 14 października 2026

### Automatyczne przekroje fundamentów

- Zakładka przekrojów korzysta teraz bezpośrednio z dokumentu `foundation-drawing-0`; nie utrzymuje kopii
  geometrii i nie pozwala edytować rzutu. Read-only canvas obsługuje pan, wheel/pinch zoom i dopasowanie widoku.
- Detektor tworzy trwałe propozycje przekrojów słup–stopa, ściana–ława, samodzielna stopa i belka.
  `automaticKey` zapobiega duplikatom, a fingerprint geometrii oznacza przekrój jako wymagający aktualizacji.
- Dodano kwadratowe znaczniki ze statusem, ręczne wskazanie elementu lub linii cięcia, kreator brakujących danych
  oraz dziedziczenie opisanych wartości z geometrii i ankiety technologii bez zgadywania danych konstrukcyjnych.
- Pełnoekranowy edytor generuje skalowalny SVG z rzeczywistymi przecięciami, wymiarami, osiami, rzędnymi,
  poziomem terenu, kreskowaniem gruntu i materiałów, XPS, hydroizolacją i podkładem, gdy dane są dostępne.
  Elementy są wybieralne; dynamiczny panel zapisuje lokalne nadpisania geometrii i materiałów bez zmiany rzutu.
- Dodano undo/redo, ilości netto i z zapasem, eksport SVG/PNG oraz czysty wydruk A4/A3 do systemowego PDF.
  Desktop używa bocznego inspektora, a mobile pełnoekranowego edytora i dolnego arkusza właściwości.
- Schematy **PASS 34/34**, domena **PASS 63/63**, Web typecheck/lint/build **PASS**, `git diff --check` **PASS**.
  Browser smoke na danych demo wykrył 10 znaczników, otworzył kreator, przeszedł desktop oraz 390 × 844
  i potwierdził zapis nadpisania przez autosave **PASS**.

### Ograniczenia i następny krok

- Automatyczne projektowanie zbrojenia, ocena nośności i deklaracja zgodności konstrukcji nie są wykonywane.
  Wszystkie automatyczne przekroje pozostają szkicem wymagającym weryfikacji projektanta.
- Suma ław deduplikuje elementy po ID, ale nie odejmuje jeszcze geometrycznej unii nakładających się brył w węzłach.
  Liczba bloczków wymaga jawnego formatu bloczka; aplikacja nie zgaduje go z samej nazwy materiału.
- PDF korzysta z systemowego okna wydruku przeglądarki. Standardowy Playwright z lokalnym Supabase jest
  **BLOCKED** przez brak `apps/web/.env.local`; scenariusz demo wykonano osobnym skryptem Playwright.
- Test odtworzenia tej samej budowy po pełnym reloadzie oraz gestów i ergonomii na fizycznym telefonie pozostaje
  **NOT RUN**. Tryb demo tworzy nową budowę po reloadzie. Następny krok to test na urządzeniu, test ze
  skonfigurowanym Supabase oraz pełna unia objętości w węzłach.

## Sesja 57 — 14 października 2026

### Podgląd rzutu i pełnoekranowy workspace przekrojów

- Zakładka przekrojów pokazuje teraz kompaktowy, klikany canvas podglądu. Nie wyświetla w tym stanie narzędzi
  edycji ani przycisków dodawania, dzięki czemu zachowuje charakter podglądu rzutu.
- Kliknięcie lub Enter/Spacja na canvasie otwiera pełnoekranowe podokno z tym samym rzutem i zapisanymi znacznikami.
  W workspace dostępne są zoom/pan, statusy przekrojów, undo/redo oraz `+ Dodaj własny przekrój`.
- Zamknięcie workspace wraca do zakładki bez zmiany geometrii rzutu. Dodawanie własnego przekroju działa wyłącznie
  przez metadane i linię cięcia w tym samym dokumencie CAD.
- Web typecheck **PASS**, Web lint **PASS**, produkcyjny build **PASS**. Browser smoke nowego przejścia nie został
  powtórzony, ponieważ lokalny tryb demo nie załadował zakładki w świeżym procesie bez konfiguracji środowiska;
  wymaga ponowienia po ustawieniu `apps/web/.env.local`.

## Sesja 58 — 14 października 2026

- Zatrzymano dodatkowe procesy Web na portach `3011` i `3012`.
- Uruchomiono aktualną aplikację wyłącznie na `http://127.0.0.1:3000/`; kontrola portów i HTTP 200 **PASS**.
- Browser smoke nie przeszedł, ponieważ tryb demo w tym środowisku nie przełączył się do zakładki bez konfiguracji
  Supabase; nie jest to blokada uruchomienia aplikacji na porcie 3000.

## Sesja 59 — 14 października 2026

### Trzystopniowy przepływ przekrojów zgodny z canvasem rzutu

- Zakładka pokazuje wyłącznie nieaktywny podgląd wspólnego rzutu fundamentów. Nie ma w nim nagłówka modułu,
  ostrzeżenia, narzędzi, gestów, linii cięcia ani znaczników przekrojów.
- Podgląd i pełny workspace używają tej samej klasy `cad-canvas` oraz `cad-canvas-frame` co główny rzut.
  Niewidoczny przycisk nakładkowy, zgodny z istniejącym wzorcem rzutu, otwiera pełnoekranowy workspace.
- Wejście do workspace nie wybiera pierwszego przekroju i nie uruchamia kreatora. Canvas pokazuje rzut,
  narzędzia przekrojów i znaczniki; dopiero kliknięcie S1/SF1/Ł1 otwiera osobny edytor z rysunkiem i właściwościami.
- Usunięto dublowanie rysunku, formularza i danych pod canvasem. Edycja nazwy, kierunku, skali, materiałów,
  brakujących danych i usuwanie przekroju są skupione w modalnym edytorze wybranego przekroju.
- Wielkość opisów jest przeliczana tak jak w głównym rzucie: 6 px na mobile i 7 px na desktopie.
  Znaczniki zachowują czytelny obszar dotykowy, a ich tekst ma 7 px przy 390 × 844.
- Browser smoke **PASS**: czysty podgląd → pełny workspace bez szczegółów → klik znacznika → rysunek i dane;
  mobile 390 × 844 bez poziomego overflow. Web typecheck/lint/build i `git diff --check` **PASS**.
- Aplikacja działa wyłącznie na porcie `3000`; porty `3011` i `3012` są nieaktywne.

## Sesja 61 — 14 października 2026

### Edytor etapów zbrojenia i zestawienie prostych prętów

- Przebudowano istniejący panel zbrojenia bez tworzenia osobnej aplikacji ani niezależnego rzutu. Etapy i ich
  elementy są wyliczane z encji bieżącego dokumentu CAD; kliknięcie elementu pokazuje przypisane układy.
- Dodano widoki rzutu, edycji prętów oraz zestawienia. Pręty zapisane jako osobne encje można modyfikować
  (długość osi, średnica, liczba, gatunek stali), kopiować z odsunięciem i usuwać. Zapis używa dotychczasowego
  `commit`/autosave CAD.
- Kreator belki obsługuje opcjonalne, uporządkowane strefy strzemion o różnych rozstawach. Waliduje
  nakładanie, przekroczenie długości oraz limit 1000 położeń.
- Zestawienie grupuje proste pręty według średnicy, stali, warstwy, otuliny i długości. Podaje liczbę sztuk,
  długość łączną i szacunkową masę przy jawnej gęstości 7850 kg/m³; projekcje strzemion nie są liczone jako
  ich rozwinięta długość.
- Status „Kompletne” wymaga zweryfikowanych encji i specjalistycznego potwierdzenia dla zbrojenia. Moduł
  nie wylicza nośności i nie deklaruje zgodności z normą.

### Granice i dalsza praca

- **NOT RUN / NOT IMPLEMENTED:** 3D, łuki gięcia, haki, zakłady, pręty wielosegmentowe i przestrzenne,
  rzeczywiste kształty strzemion, łączenie ciągów przez węzły L/T/X, pełne siatki płyt/ścian, szablony,
  eksport rysunków i automatyczna walidacja technologiczna/normowa.
- Canvas zbrojenia pokazuje geometrię zapisaną w bieżącym dokumencie; nie dodano nowej synchronizacji
  dwukierunkowej ze źródłowym rzutem ani nowej warstwy trwałości.
- Testy domeny i schema, Web typecheck/lint oraz produkcyjny build opisano w sesji 61 w `docs/TEST_REPORT.md`.
- Kontynuować od zaprojektowania wersjonowanego modelu osi pręta z łukami i rzeczywistych powiązań grup
  wieloodcinkowych, bez naruszania istniejącego rzutu i ręcznej geometrii.

## Sesja 59 — 14 października 2026

### Audyt i kontrola kompletności rzutu fundamentów

- Sprawdzono istniejący przepływ: ankieta technologii → dokument CAD w mm → encje i ustawienia fundamentów →
  autosave/wersjonowanie → renderer rzutu i przekrojów → SVG/druk. Nie dodano równoległego modelu geometrii.
- Pierwsze wejście do rzutu otwiera formularz tylko wtedy, gdy brakuje konfiguracji wymaganej do rozpoczęcia
  geometrii. Formularz korzysta z istniejącej ankiety i `foundationSettings`, zapisuje przez dotychczasowy autosave,
  umożliwia szkic mimo braków i nie generuje zastępczego obrysu ani parametrów konstrukcyjnych.
- Dodano wskaźnik kontroli z nawigacją do geometrii, ustawień, odwołań lub przekrojów. Walidacja rozróżnia
  braki, wymóg weryfikacji projektanta i błędy geometrii; status „kompletne” nie oznacza zatwierdzenia.
- Audyt parametrów:

| Parametr / grupa | Obecne źródło | Użycie i widoczność | Działanie / ograniczenie |
|---|---|---|---|
| Rodzaj fundamentowania i wskazówki materiałowe | Ankieta „Materiały i technologia” | Podpowiada dostępne typy podparcia i materiały | Ponownie używane; nie nadpisuje danych projektu |
| Obrys, ściany, ławy, stopy, płyty i słupy | Encje dokumentu CAD, geometria w mm | Canvas, wymiary, zależności ściana–podparcie, przekroje i eksport | Brak geometrii pozostaje brakiem; nie jest automatycznie zgadywana |
| Wymiary i parametry nowych ścian/podpór | `foundationSettings` oraz atrybuty encji | Używane przy rysowaniu i synchronizacji, zachowane w autosave | Formularz pyta tylko o niekompletne wartości; ogranicza zakresy |
| Osie i oznaczenia | Encje osi CAD i ich znaczniki | Rysowane w CAD; puste oznaczenia i niezweryfikowane osie trafiają do checklisty | Oznaczenie można edytować także, gdy wcześniej było puste |
| Poziom ±0,00, teren, spód fundamentu i wymiary przekroju | Metadane przekrojów / wartości z elementów i technologii | Rysowane w przekroju; braki oraz nieaktualność są sprawdzane | Wartości projektowe muszą pochodzić z dokumentacji; automat nie uzupełnia ich za projektanta |
| Klasa betonu, materiały, warstwy i izolacje | Atrybuty encji, warstwy oraz pola przekroju | Pokazywane na rzucie/przekroju zależnie od rodzaju elementu | Nie uznajemy pustych ani placeholderowych materiałów za konkretne; referencje wymagają potwierdzenia |
| Zbrojenie, stal i otulina | Istniejący edytor zbrojenia, dane elementu i odwołania | Detal/układ zbrojenia i przekroje; nie jest dobierane automatycznie | Wymaga danych projektowych i weryfikacji konstruktora |
| Geotechnika i woda gruntowa | Odwołanie `documentReferences.geotechnics`; poziom wody nie ma osobnego pola liczbowego | Odniesienie do dokumentacji jest widoczne jako pozycja do sprawdzenia | Nie dodano duplikatu danych; dane gruntowe i poziom wody pozostają w dokumentacji geotechnicznej, jeśli istotne |
| Numer, rewizja i skala | `requirementId`, `revision`, `paperScale` | Identyfikują dokument i skalę eksportu | Brak pełnej tabliczki rysunkowej z nazwą, datą i projektantem — dalsza praca |
| Przekroje i odwołania | Metadane `sections`, encje linii cięcia, `documentReferences` | Związane z tym samym dokumentem CAD i jego autosave | Automatyczne propozycje nie stanowią zatwierdzenia; braki są kierowane do przekrojów |

- Uwagi normatywne: zakres wymagań zależy od rodzaju posadowienia, projektu i dokumentacji towarzyszącej.
  Punktami odniesienia są [rozporządzenie o zakresie i formie projektu budowlanego (Dz.U. 2022 poz. 1679)](https://eli.gov.pl/api/acts/DU/2022/1679/text.html)
  oraz [warunki techniczne budynków (Dz.U. 2022 poz. 1225)](https://eli.gov.pl/api/acts/DU/2022/1225/text.html).
  Dostępny odczyt ELI zwrócił jedynie noty nowelizacyjne, bez wystarczającego tekstu do ustalenia aktualnego
  brzmienia; nie zweryfikowano późniejszych zmian ani aktualnych wydań Eurokodów i załączników krajowych w PKN.
  Nie deklarujemy zgodności prawnej ani normowej. Do weryfikacji przez projektanta pozostają m.in. właściwe części
  PN-EN 1997 (geotechnika) i PN-EN 1992 (konstrukcje betonowe), ich wydania i załączniki krajowe. Zbrojenie,
  nośność, grunt i rozwiązania wykonawcze wymagają projektu/obliczeń i odrębnych rysunków.
- Poprawiono kontrolę placeholdera „Zgodnie z projektem” jako braku konkretnego materiału oraz wykrywanie
  równoczesnego braku etykiety osi i potrzeby weryfikacji osi.
- Domena **PASS 66/66**, schematy **PASS 34/34**, Web typecheck **PASS**, Web lint **PASS**,
  produkcyjny build **PASS**, `git diff --check` **PASS**. Browser smoke (pierwsze wejście, zapis/odczyt,
  eksport i gesty) pozostaje **BLOCKED**: brak `apps/web/.env.local`; samo HTTP 200 strony startowej
  nie weryfikuje przepływu CAD.

### Dalsze kroki

- Zweryfikować obowiązujące teksty aktów prawnych i aktualne wydania PN-EN/załączników krajowych w oficjalnych
  źródłach; nie używać checklisty aplikacji jako opinii o zgodności.
- Uruchomić browser smoke na projekcie bez danych i częściowo uzupełnionym oraz sprawdzić zapis, ponowne otwarcie,
  zmianę geometrii, eksport SVG/druk PDF, zoom i pan.
- Rozważyć osobną tabliczkę rysunkową i ustrukturyzowane pole poziomu wody gruntowej dopiero po uzgodnieniu,
  czy mają być częścią wspólnego modelu projektu, czy pozostają w odwołanej dokumentacji geotechnicznej.

## Sesja 60 — 14 października 2026

### Profesjonalniejsza grafika przekrojów fundamentów

- Przebudowano renderer SVG przekrojów w istniejącym `CadFoundationSections`; nie zmieniono modelu geometrii,
  autosave ani sposobu wyznaczania rzeczywistych przecięć linii cięcia.
- Zastąpiono wspólne, ciężkie wypełnienie zestawem odrębnych symboli rysunkowych:
  - beton konstrukcyjny — regularne kreskowanie ukośne,
  - ściana murowana — układ warstwowy bloczków,
  - beton podkładowy — rzadsze kreskowanie,
  - grunt — nieregularne kreski i punkty z falistą linią terenu,
  - XPS — regularny zygzak,
  - hydroizolacja pionowa i pozioma — wyraźna niebieska linia warstwy.
- Elementy przecięte mają mocniejszy kontur niż osie, wymiary, linie pomocnicze i odnośniki. Wymiary używają
  stałych ukośnych znaczników architektonicznych, a rzędne symbolu trójkąta i wartości w metrach.
- Układ słup–stopa uwzględnia rzeczywiste przesunięcie pionowe: słup rozpoczyna się na górze stopy, a zakres SVG
  obejmuje łączną wysokość obu elementów. Analogicznie ściana pozostaje osadzona na ławie.
- Każdy element pozostaje osobną klikalną grupą SVG powiązaną z ID encji rzutu; lokalne nadpisania wymiarów nadal
  aktualizują rysunek bez modyfikacji geometrii rzutu.
- Dodano techniczny tytuł przekroju, skalę i oznaczenie „RYSUNEK ROBOCZY”. Nie dodano zbrojenia ani parametrów,
  których nie ma w projekcie.
- Konwencje opracowano opisowo na podstawie hierarchii linii i przekrojów PN-EN ISO 128 / PN-ISO 128-23,
  symboliki materiałowej PN-88/N-01607 oraz praktyki rysunków budowlanych. Nie skopiowano cudzych rysunków ani
  nie zadeklarowano zgodności normowej.

### Walidacja

- Web typecheck — **PASS**.
- Web lint — **PASS**.
- Browser smoke podgląd → workspace → szczegóły — **PASS**.
- Test zawartości SVG — **PASS**: 5 wzorów materiałowych, 3 klikalne elementy rzeczywistego przekroju S1,
  7 opisów wymiarowych, tytuł, skala, brak `NaN`/`Infinity` i brak błędów konsoli.
- Kontrola wizualna zrzutu stopa–słup — **PASS** po naprawie zbyt dużych grotów, grubości linii, nakładania
  wymiarów i obcinania słupa.
- Demo zawiera 10 przekrojów słup–stopa (`S1`–`S3`, `SF1`–`SF7`). Osobny zrzut ściana–ława — **NOT RUN**,
  ponieważ dane demonstracyjne nie zawierają takiego układu; renderer tej gałęzi przechodzi typecheck i lint.

## Sesja 62 — 14 października 2026

### Zakładki etapów, rzut tylko do odczytu i sub-okno detali zbrojenia

- Zakładka „Detale zbrojenia i zestawienie prętów” przestała być edytorem CAD rzutu. Nowa gałąź widoku
  `cad-reinforcement-view` w `apps/web/src/components/stage-cad-editor.tsx` renderuje nagłówek, Cofnij/Ponów,
  panel zbrojenia i status zapisu — bez paska narzędzi rysowania i bez ustawień wymiarów. Położenia ścian,
  słupów i stóp nie da się już z tego miejsca zmienić.
- Nowy komponent `apps/web/src/components/reinforcement-stage-plan.tsx` rysuje rzut wybranego etapu: wyłącznie
  elementy tego etapu jako klikalne obrysy z etykietą i statusem. Geometria spoza etapu nie jest renderowana —
  w zakładce „Ławy fundamentowe” widoczne są same ławy.
  Obsługuje pan, zoom kółkiem, pinch dwoma palcami oraz przyciski Przybliż/Oddal/Dopasuj.
- Obok canvasu utrzymano listę przycisków elementów etapu jako dostępną alternatywę dla kliknięcia obrysu.
- Kliknięcie elementu otwiera modalne sub-okno `cad-reinforcement-detail-dialog` z zakładkami: Rysunek 2D
  (widok podłużny, przekrój poprzeczny, rzut prętów), Widok 3D, właściwości prętów i strzemion, zestawienie stali.
  Wszystkie widoki korzystają z tych samych danych elementu.
- Usunięto tekstową listę elementów; wybór odbywa się wyłącznie przez rzut etapu lub listę przycisków.
- Naprawiono błąd wyboru elementu: `setPointerCapture` wywoływane przy `pointerdown` przekierowywało `click`
  na całe SVG, więc kliknięcie pojedynczej ławy nie otwierało detali. Przechwytywanie włączamy dopiero po
  przekroczeniu progu przeciągania, a osobny strażnik `panned` blokuje otwarcie detali po przesunięciu rzutu.

### Walidacja

- `pnpm --filter web typecheck` — **PASS**.
- `pnpm --filter web lint` — **PASS**.
- `pnpm test` (root) — **PASS**, 13/13 zadań.
- `pnpm build` (root) — **PASS**, 8/8 zadań.
- `git diff --check` — **PASS**.
- Browser smoke nowego przepływu — **PASS**, 14/14 asercji: brak paska narzędzi i panelu wymiarów, 4 etapy,
  rzut etapu z 14 klikalnymi elementami, kliknięcie otwiera sub-okno, rysunek 2D i podgląd 3D renderują się,
  brak poziomego przepełnienia przy 390 × 844, brak błędów JavaScript.
- Moduł nadal nie deklaruje nośności ani zgodności normowej — układ zbrojenia wymaga weryfikacji przez
  uprawnionego projektanta.

## Sesja 63 — 14 października 2026

### Usunięcie starego kreatora belki/płyty

- Zgodnie z decyzją użytkownika pozostawiono wyłącznie nowy przepływ etapowy i sub-okno detali elementu.
- Usunięto przycisk i dialog „Kreator zbrojenia belki / płyty”, jego stan formularza, generowanie układu
  po współrzędnych, podgląd, uchwyt zmiany przekroju oraz nieużywane style.
- Nagłówek panelu kieruje użytkownika do wyboru etapu i kliknięcia elementu na rzucie.
- Przycisk „Edytuj pręty” w sub-oknie przełącza bezpośrednio do nowego edytora prętów giętych/przestrzennych.
- Nowy edytor ma jawne pola gatunku stali i numeru rysunku konstrukcyjnego; wartości zapisują się na pręcie.
- Pusty rysunek bez rozpoznanych hostów nie pozwala już tworzyć niezależnego układu po współrzędnych. Informuje,
  że najpierw należy uzupełnić rzut źródłowy.
- Scenariusze E2E zaktualizowano tak, aby sprawdzały brak starego kreatora i trwały zapis pręta przez nowe
  sub-okno, zamiast oczekiwać dawnego formularza.

### Walidacja

- `pnpm --filter web typecheck` — **PASS**.
- `pnpm --filter web lint` — **PASS**, bez ostrzeżeń.
- `pnpm --filter web test` — **PASS** (pakiet nie ma jeszcze testów jednostkowych UI).
- `pnpm test` — **PASS**, 13/13 zadań monorepo.
- `pnpm build` — **PASS**, 8/8 zadań monorepo.
- `node --check apps/web/e2e/role-onboarding.spec.mjs` — **PASS**.
- Browser smoke trybu demonstracyjnego — **PASS**, 10/10.
- Pełny scenariusz Playwright z lokalnym Supabase — **BLOCKED**: brak `apps/web/.env.local`.
- `git diff --check` — **PASS**.

## Sesja 64 — 14 października 2026

### Dwa rysunki fundamentów i wieniec górny ściany

- Rozdzielono dotychczas nakładające się elementy na dwa etapy: „Ławy fundamentowe” oraz
  „Ściany fundamentowe i wieńce górne”.
- Pierwszy rysunek pokazuje wyłącznie encje ław. Drugi pokazuje odcinki ścian fundamentowych; ławy nie są
  jego tłem ani klikalnymi elementami.
- Dla ścian z materiałem bloczkowym, pustakowym, murowanym lub keramzytobetonowym brak wieńca górnego nadaje
  elementowi status „Wymaga weryfikacji”.
- Sub-okno ściany zawiera konfigurację wieńca. Szerokość jest pobierana ze ściany i tylko do odczytu.
  Wysokość, materiał/beton i numer rysunku użytkownik musi przepisać z projektu.
- Zapis tworzy osobny liniowy host `ring-beam`, powiązany ze ścianą przez `relatedTo`. Pręty wieńca są przypisywane
  do tego hosta, a nie do murowanej ściany.
- Nie wprowadzono domyślnych wymiarów, klasy betonu ani zbrojenia wieńca. Moduł nie deklaruje, że sam fakt
  dodania wieńca spełnia wymagania konstrukcyjne lub normowe.

### Walidacja

- Web typecheck i lint — **PASS**.
- Schemas — **PASS**, 36/36, w tym trwała relacja ściana → wieniec → pręt.
- Domain — **PASS**, 72/72.
- `pnpm test` — **PASS**, 13/13 zadań monorepo.
- `pnpm build` — **PASS**, 8/8 zadań monorepo.
- Browser smoke — **PASS**, 15/15: dwa osobne etapy, obowiązek konfiguracji wieńca przy bloczkach,
  szerokość 240 mm pobrana ze ściany, oddzielny host wieńca, 2D/3D i brak mobile overflow.
- `node --check apps/web/e2e/role-onboarding.spec.mjs` — **PASS**.
- Pełny E2E Supabase pozostaje **BLOCKED** przez brak `apps/web/.env.local`.

## Sesja 66 — 14 października 2026

### Nieklikalny obrys budynku dla stóp i słupów

- Na etapach „Stopy fundamentowe” oraz „Słupy i trzpienie żelbetowe” dodano obrys ław i ścian fundamentowych
  jako pomocniczy znacznik kontekstu.
- Obrys jest szary, przerywany i ma wyłączoną obsługę wskaźnika. Nie otwiera sub-okna, nie jest elementem listy
  klikalnej i nie dostaje wymiarów.
- Wymiary nadal są generowane wyłącznie z hostów aktywnego etapu.

### Walidacja

- Web typecheck — **PASS**.
- Web lint — **PASS**.
- Browser smoke — **PASS**, 22/22: markery stóp i słupów, brak ich klikalności/listowania, wcześniejsze
  trzy etapy, wymiary ław, sub-okno 2D/3D, brak błędów JS i brak mobile overflow.
- `git diff --check` — **PASS**.

## Sesja 67 — 14 października 2026

### Logiczne łączenie wieńców fundamentowych

- Usunięto wyjątek, który prezentował każdy segment wieńca fundamentowego osobno.
- Współliniowe fragmenty ścian rozdzielone węzłem T/X tworzą teraz jeden klikalny wieniec, tak samo jak ławy
  i pozostałe belki. Narożniki i łamane nie są scalane.
- Formularz wieńca zapisuje lub aktualizuje hosty wszystkich segmentów logicznego ciągu. Każdy host zachowuje
  relację do własnej ściany źródłowej, a sub-okno agreguje cały wieniec i jego pręty.
- Stały scenariusz E2E sprawdza, że etapy ścian i wieńców mają tę samą liczbę logicznych elementów.

### Walidacja

- Web typecheck — **PASS**.
- Web lint — **PASS**.
- Browser smoke — **PASS**, 23/23.
- `pnpm test` — **PASS**, 13/13 zadań monorepo.
- `pnpm build` — **PASS**, 8/8 zadań monorepo.
- `node --check apps/web/e2e/role-onboarding.spec.mjs` — **PASS**.
- `git diff --check` — **PASS**.
- Pełny E2E Supabase pozostaje **BLOCKED** przez brak `apps/web/.env.local`.

## Sesja 68 — 15 października 2026

### Lokalizacja stóp i słupów oraz proste wymiary współliniowe

- Etapy „Stopy fundamentowe” i „Słupy i trzpienie żelbetowe” wykorzystują pomocniczy obrys fundamentów do
  utworzenia łańcuchów: lico ściany → pierwsza krawędź podpory → druga krawędź → kolejne lico ściany.
- Słupy, podobnie jak stopy, są wymiarowane po obu krawędziach zamiast wyłącznie po osi.
- Canvas filtruje wynik do `supports:pad:*` albo `supports:column:*`; nie pokazuje wymiarów szarego obrysu.
- Tekst krótkiego wymiaru szerokości podpory dopasowuje rozmiar bez łamania lub wyginania linii wymiarowej.
- Współliniowe ściany, ławy i wykopy tej samej szerokości są scalane tylko dla wymiarowania. Techniczny podział
  węzłem T/X nie dodaje kreski; ukośny prosty przebieg ma jeden prosty wymiar. Faktyczna zmiana kierunku nadal
  tworzy osobne wymiary.

### Walidacja

- Domain — **PASS**, 74/74.
- Web typecheck i lint — **PASS**.
- Browser smoke — **PASS**, 25/25.
- `pnpm test` — **PASS**, 13/13 zadań monorepo.
- `pnpm build` — **PASS**, 8/8 zadań monorepo.
- `node --check apps/web/e2e/role-onboarding.spec.mjs` — **PASS**.
- `git diff --check` — **PASS**.

## Sesja 69 — 15 października 2026

### Osiowe i kompletne łańcuchy wymiarowe

- Wspólny generator rzutu tworzy dla każdej rodziny ścian, ław i wykopów jedną poziomą oraz jedną pionową
  rodzinę stacji niezależnie od technicznych podziałów, T/X i niewielkich zmian kierunku.
- Każda para sąsiednich stacji tworzy segment. Test regresyjny potwierdza pełną sekwencję
  `80–400–80–400–80`, bez pominięcia pierwszego, środkowego ani końcowego przedziału.
- Zwykłe wymiary i łańcuchy lokalizacyjne stóp/słupów są rzutowane na dominującą oś arkusza. Nie zmienia to
  geometrii źródłowych ścian ani podpór.
- Wspólny renderer używany przez rzut fundamentów, etapy zbrojenia i kopię rzutu w przekrojach rysuje wyłącznie
  poziome/pionowe bazy. Kreski stacji są pionowe na bazie poziomej i poziome na pionowej, a linie pomocnicze
  dochodzą prostopadle od rzeczywistej geometrii.
- Ręczne wymiary elewacji przekrojów pozostały osiowe i nie wymagają osobnej transformacji.

### Walidacja

- Domain — **PASS**, 75/75.
- Web typecheck i lint — **PASS**.
- Browser smoke — **PASS**, 27/27, w tym kontrola geometrii baz i kresek SVG.
- `pnpm test` — **PASS**, 13/13 zadań monorepo.
- `pnpm build` — **PASS**, 8/8 zadań monorepo.
- `node --check apps/web/e2e/role-onboarding.spec.mjs` — **PASS**.
- `git diff --check` — **PASS**.
- Pełny E2E Supabase pozostaje **BLOCKED** przez brak `apps/web/.env.local`.

## Sesja 70 — 15 października 2026

### Wymiary zależne od przeciwległej strony obrysu

- Każda pozioma i pionowa rodzina wymiarów buduje teraz dwa niezależne profile stacji: początkowej i końcowej
  strony obrysu.
- Jeżeli oba profile mają te same uporządkowane stacje, renderer pokazuje tylko jeden zestaw znaczników.
- Jeżeli choć jedna stacja lub skrajny zakres jest inny, obie strony dostają własne linie i znaczniki.
  Stacja wynikająca z załamania jednej strony nie jest kopiowana na stronę przeciwną.
- Element przecinający środek obrysu może należeć do obu stron; element kończący się przy środku albo występujący
  tylko po jednej stronie pozostaje przypisany wyłącznie do jej profilu. Ogranicza to chaos przy T/X i ścianach
  z lokalnym załamaniem.
- Tekst wymiaru został odsunięty wyżej od linii bazowej. Wspólny renderer dodatkowo sprawdza kolizje etykiet
  pomiędzy różnymi łańcuchami, nie tylko wewnątrz jednego łańcucha.

### Walidacja

- Domain — **PASS**, 77/77.
- Web typecheck i lint — **PASS**.
- Browser smoke — **PASS**, 28/28, w tym rzeczywiste odsunięcie tekstu od bazy SVG.
- `pnpm test` — **PASS**, 13/13 zadań monorepo.
- `pnpm build` — **PASS**, 8/8 zadań monorepo.
- `node --check apps/web/e2e/role-onboarding.spec.mjs` — **PASS**.
- `git diff --check` — **PASS**.
- Pełny E2E Supabase pozostaje **BLOCKED** przez brak `apps/web/.env.local`.

## Sesja 71 — 15 października 2026

### Nominalne grubości bez wymiarowania punktów podziału

- Stacje łańcucha nie są już tworzone z każdego końca albo technicznego punktu podziału ściany równoległej
  do linii wymiarowej.
- Ściany przecinające daną stronę są lokalizowane przez przecięcie ich osi z osią tej strony.
- Przedział zajmowany przez ścianę ma zawsze jej zapisaną grubość nominalną. Ukośne położenie nie może już
  zmienić grubości `1 cm` na projekcję typu `0,9 cm`.
- Pozostałe segmenty są wyłącznie rzeczywistymi przerwami między kolejnymi ścianami. Renderer zachowuje
  nominalną etykietę właściciela przedziału zamiast ponownie wyliczać ją z projekcji SVG.
- Test odtwarza wskazany przypadek: jedna strona daje dokładnie `|1 cm|5 cm|1 cm|`, a przesunięta strona
  `|1 cm|3 cm|1 cm|`.

### Walidacja

- Domain — **PASS**, 77/77.
- Web typecheck i lint — **PASS**.
- Browser smoke — **PASS**, 28/28.
- `pnpm test` — **PASS**, 13/13 zadań monorepo.
- `pnpm build` — **PASS**, 8/8 zadań monorepo.
- `node --check apps/web/e2e/role-onboarding.spec.mjs` — **PASS**.
- `git diff --check` — **PASS**.
- Pełny E2E Supabase pozostaje **BLOCKED** przez brak `apps/web/.env.local`.

## Sesja 72 — 15 października 2026

### Pełne grubości przesuniętych ścian bez powtórzonego wymiaru

- Ściana poprzeczna jest uwzględniana w obu profilach osiowych również wtedy, gdy po przesunięciu jej oś
  nie dochodzi już do globalnej krawędzi strony.
- Położenie przedziału jest liczone w punkcie przecięcia albo na najbliższym końcu osi, ale jego szerokość nadal
  pozostaje dokładną grubością nominalną.
- Test przesuniętej ściany wymaga kompletnego układu `grubość–odległość–grubość`; nie może zniknąć pierwsza
  ani ostatnia grubość.
- Jeżeli przeciwległy profil ma tę samą sekwencję, pokazywany jest tylko jeden łańcuch.
- Usunięto osobny wymiar całkowity dla rodziny pasm. Powtarzał on sumę pełnego łańcucha i wyglądał jak drugi,
  niekompletny zestaw wymiarów.

### Walidacja

- Domain — **PASS**, 78/78.
- Web typecheck i lint — **PASS**.
- Browser smoke — **PASS**, 28/28.
- `pnpm test` — **PASS**, 13/13 zadań monorepo.
- `pnpm build` — **PASS**, 8/8 zadań monorepo.
- `node --check apps/web/e2e/role-onboarding.spec.mjs` — **PASS**.
- `git diff --check` — **PASS**.
- Pełny E2E Supabase pozostaje **BLOCKED** przez brak `apps/web/.env.local`.

## Sesja 73 — 15 października 2026

### Osobne wymiary ścian poprzecznych wewnątrz rzutu

- Ściana należąca do dwóch zamkniętych pól jest rozpoznawana jako ściana wewnętrzna/poprzeczna.
- Ściany wewnętrzne oraz powiązane z nimi pasma nie uczestniczą w zewnętrznych profilach wymiarowych.
  Nie mogą więc dzielić bocznego wymiaru na przypadkowe wartości typu `2,5 cm` i `4,5 cm`.
- Każda taka ściana otrzymuje własny osiowy wymiar długości umieszczony wewnątrz rzutu, obok ściany.
- W środku rzutu pokazywana jest również jej nominalna grubość.
- Test prostokąta przeciętego ścianą wymaga niezmienionego zewnętrznego łańcucha `24–576–24 cm`,
  osobnego wymiaru długości ściany wewnętrznej `400 cm` i grubości `24 cm`.

### Walidacja

- Domain — **PASS**, 79/79.
- Web typecheck i lint — **PASS**.
- Browser smoke — **PASS**, 28/28.
- `pnpm test` — **PASS**, 13/13 zadań monorepo.
- `pnpm build` — **PASS**, 8/8 zadań monorepo.
- `node --check apps/web/e2e/role-onboarding.spec.mjs` — **PASS**.
- `git diff --check` — **PASS**.
- Pełny E2E Supabase pozostaje **BLOCKED** przez brak `apps/web/.env.local`.

## Sesja 65 — 14 października 2026

### Trzy rysunki fundamentowe, logiczne belki i wymiary etapowe

- Rozdzielono fundamenty na trzy etapy: „Ławy fundamentowe”, „Ściany fundamentowe” i „Wieńce fundamentowe”.
- Dodano do ankiety „Materiały i technologia” pytanie o wieniec górny z odpowiedziami „Tak”, „Nie”,
  „Zgodnie z projektem” i „Nie dotyczy”. Etap wieńców i możliwość zapisu wynikają z tej odpowiedzi, nie z nazwy
  materiału ściany. Sprzeczne istniejące dane są zachowywane i oznaczane ostrzeżeniem.
- Dodano domenowe grupowanie współliniowych segmentów rozdzielonych węzłami T/X. Prostokąt przecięty jedną
  ścianą środkową jest prezentowany jako pięć logicznych belek zamiast siedmiu segmentów. Narożniki i łamane
  pozostają osobnymi elementami; źródłowy rzut nie jest modyfikowany.
- Canvas etapu generuje wymiary z dokumentu ograniczonego do hostów bieżącej zakładki. Ławy pokazują wyłącznie
  wymiary ław, bez wymiarów ścian, słupów lub innych etapów.
- Sub-okno logicznego elementu agreguje przypisane pręty, długości i obrysy jego segmentów. Ręczne narzędzie
  łączenia pozostaje dostępne dla tras L i innych niejednoznacznych połączeń.

### Walidacja

- Schemas — **PASS**, 36/36.
- Domain — **PASS**, 73/73, w tym przypadek 7 segmentów → 5 belek i brak scalania łamanej.
- Web typecheck i lint — **PASS**.
- `pnpm test` — **PASS**, 13/13 zadań monorepo.
- `pnpm build` — **PASS**, 8/8 zadań monorepo.
- Browser smoke — **PASS**, 18/18: trzy etapy, wymiary ław ograniczone do aktywnego etapu, sub-okno, osobny
  host wieńca, 2D/3D, brak błędów JavaScript i brak poziomego overflow na ekranie mobilnym.
- `node --check apps/web/e2e/role-onboarding.spec.mjs` — **PASS**.
- Pełny E2E Supabase pozostaje **BLOCKED** przez brak `apps/web/.env.local`.
