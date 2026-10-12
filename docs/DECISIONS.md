# DECISIONS — Architecture Decision Records

Format: krótki wpis per decyzja — kontekst, decyzja, konsekwencje. Dodawaj nowe wpisy na końcu pliku, nie modyfikuj
wcześniejszych (jeśli decyzja się zmienia, dodaj nowy wpis odwołujący się do poprzedniego).

## ADR-001: Menedżer pakietów — pnpm workspaces + Turborepo

**Kontekst:** Specyfikacja (`docs/MASTER_SPEC.md` sekcja 3) wymaga monorepo z jedną bazą kodu dla `apps/web` i
`apps/mobile` oraz współdzielonych pakietów.

**Decyzja:** Używamy pnpm workspaces (`pnpm-workspace.yaml`) + Turborepo (`turbo.json`) do orkiestracji zadań
(`build`, `dev`, `lint`, `typecheck`, `test`).

**Konsekwencje:** pnpm nie było domyślnie dostępne w środowisku — zainstalowane globalnie (`npm install -g pnpm`).
Wymaga to, aby każde nowe środowisko deweloperskie miało wykonany ten krok (brak `corepack` w użytej wersji Node).

## ADR-002: Praca wyłącznie lokalna do czasu akceptacji hostingu

**Kontekst:** Użytkownik wprost zastrzegł: „na razie cała aplikacja musi być budowana lokalnie, gdy będzie gotowa to
wtedy zostanie wrzucona na host”.

**Decyzja:** Nie konfigurujemy ani nie uruchamiamy żadnych płatnych usług chmurowych (hosting, Supabase Cloud,
domeny, CI w chmurze) bez wyraźnej zgody użytkownika. Repozytorium Git pozostaje lokalne (bez `git remote`) do
czasu takiej decyzji.

**Konsekwencje:** ETAP 0 „podstawowy CI” z checklisty w `MASTER_SPEC.md` (pipeline w chmurze, ochrona gałęzi na
GitHub) jest odłożony — lokalnie wystarczą skrypty `pnpm lint/typecheck/test/build` uruchamiane ręcznie lub przez
lokalny git hook, jeśli zajdzie potrzeba.

## ADR-003: Brak lokalnego Supabase (Docker) na start

**Kontekst:** Lokalny Supabase (`supabase start`) wymaga Docker Desktop. Docker nie był zainstalowany w środowisku
na początku prac.

**Decyzja:** Nie instalujemy Dockera automatycznie — to duża, inwazyjna zmiana systemowa (Hyper-V/WSL2, usługi
systemowe). Czekamy na potwierdzenie użytkownika. Do tego czasu backend (Auth/DB/Storage/Edge Functions) jest
projektowany (schemas, migracje SQL, kontrakty API w `packages/schemas` i `packages/api-client`), ale nie uruchamiany
end-to-end.

**Konsekwencje:** Testy integracyjne wymagające bazy danych będą raportowane jako BLOCKED w `docs/TEST_REPORT.md`,
dopóki Docker + Supabase CLI nie zostaną zainstalowane.

## ADR-004: Wbudowany Node test runner zamiast Vitest

**Kontekst:** W środowisku Windows polityka Application Control blokowała natywny plik Rollupa wymagany przez
Vitest (`ERR_DLOPEN_FAILED`). Próba uruchomienia testów kończyła się przed wykonaniem testów.

**Decyzja:** Dla testów jednostkowych czystych pakietów używamy wbudowanego `node:test`. Pakiety kompilują TypeScript
przez `tsc`, a testy JavaScript uruchamiają się bez bundlera i bez nowej zależności testowej.

**Konsekwencje:** Nie zmieniono systemowych polityk bezpieczeństwa. W razie potrzeby DOM/UI tests można dodać osobno
po wyborze runnera kompatybilnego z ograniczeniami środowiska.

## ADR-005: Lokalny Docker Desktop i Supabase

**Kontekst:** ADR-003 odkładał instalację Dockera do czasu wyraźnej zgody użytkownika. Użytkownik poprosił o
zainstalowanie Dockera i Supabase.

**Decyzja:** Zainstalowano Docker Desktop i WSL 2 oraz dodano Supabase CLI jako lokalną zależność projektu.
Uruchamiamy Supabase wyłącznie lokalnie przez skrypty `pnpm db:*`; nie łączymy go z Supabase Cloud ani hostingiem.
Ta decyzja zastępuje ADR-003.

**Konsekwencje:** Lokalne usługi Auth, API, Studio i PostgreSQL są dostępne. Vector restartuje się z powodu
problemu łączności z endpointem Docker IPv6, a imgproxy i pooler pozostają zatrzymane; te usługi pomocnicze
wymagają diagnozy. Integracyjne Auth/RLS nie są jeszcze wdrożone ani zweryfikowane.

## ADR-006: Członkostwa wyłącznie przez bezpieczny przepływ zaproszeń

**Kontekst:** Etap 2 wymaga organizacji z rolami, a aplikacja musi obsłużyć wielu użytkowników w jednej
organizacji. Bezpośrednie przyznawanie członkostw z klienta pozwalałoby przypisać dowolne konto i rolę bez
potwierdzenia zaproszenia.

**Decyzja:** Na tym etapie klient może tworzyć organizację, a trigger przypisuje twórcy rolę `owner`. Tabele
członkostw są tylko do odczytu dla członków; nadawanie i zmiana ról pozostają zamknięte do wdrożenia
zweryfikowanego przepływu zaproszeń.

**Konsekwencje:** Tworzenie organizacji i izolacja danych są testowane na lokalnym Supabase. Do czasu następnej
migracji nie można dołączać kolejnych użytkowników ani przydzielać ról `admin`/`member`.

## ADR-007: Typ konta jako krok lokalnego onboardingu

**Kontekst:** Po pierwszym logowaniu użytkownik ma wybrać jeden z trzech głównych sposobów korzystania z aplikacji:
Zleceniodawca, Wykonawca albo Sklep. Nie może to zastępować ról członkostwa, bo użytkownik może należeć do wielu
organizacji i mieć różne role w każdej z nich.

**Decyzja:** Zapisujemy preferowany typ w `profiles.account_type`, mapowany na istniejący enum
`organization_kind`. Użytkownik wybiera typ na trzech kafelkach; aplikacja zapisuje go przez RLS i przechodzi do
formularza tworzenia organizacji tego typu. Typ organizacji pozostaje w `organizations.kind`, a role pozostają
przy członkostwach. Użytkownik może zmienić wybór przed utworzeniem pierwszej organizacji.

**Konsekwencje:** Wymagana jest wersjonowana migracja i test izolacji zapisu profilu. Onboarding jest lokalny i
nie uzależnia dalszego hostingu ani usługi chmurowej.

## ADR-008: Panele bez organizacji w interfejsie i zarządzane konta pracowników

**Kontekst:** Użytkownik zmienił przepływ 12 października: klient opisuje pierwszą budowę, firma/sklep zapisują dane
działalności; później właściciel sam tworzy konta pracowników z hasłem do przekazania. Nie ma kroku „organizacja”.

**Decyzja:** Klient zapisuje `construction_jobs` bez tworzenia organizacji. Po pierwszym zleceniu wraca do panelu.
Firma/sklep zapisuje `business_profiles` atomowym RPC razem z technicznym kontekstem RLS i członkostwem właściciela.
Nie usuwamy starszych organizacji ani członkostw. `account_type` wybiera panel, nie nadaje uprawnień właściciela.

Konto pracownika tworzy serwer Web po weryfikacji tokena Auth i uprawnień właściciela; losowe hasło jest zwracane
jednorazowo, nie jest zapisywane w tabelach aplikacji ani logach. Istniejący e-mail nie może zostać przejęty ani
mieć zresetowanego hasła. Serwer atomowo przypina nowe konto jako `member`; błąd przypięcia powoduje usunięcie
wyłącznie nowo utworzonego konta, a błąd wycofania jest jawnie raportowany.

Przed dostępem do danych pracownik zmienia hasło tymczasowe na własne. Wymóg jest egzekwowany w bazie, nie tylko
w UI. Klucz serwisowy jest wyłącznie w ignorowanym środowisku serwera, nigdy w zmiennej `NEXT_PUBLIC_*`.
To zastępuje ADR-006 dla kont tworzonych przez właściciela; zaproszenia istniejących kont to odrębny, niewdrożony
przepływ. ADR-007 nadal obowiązuje dla wyboru panelu, ale nie dla kroku utworzenia organizacji.

**Konsekwencje:** Dodano lokalne pgTAP i Playwright E2E wszystkich trzech przepływów. Pełne CAD, marketplace,
ofertowanie i mobile pozostają osobnymi etapami; nie są deklarowane jako ukończone.

## ADR-009: Osobna, przeszukiwalna ankieta materiałów i technologii

**Kontekst:** Użytkownik nie chce ręcznie wpisywanych wymagań wykonawczych ani kryteriów odbioru. Wybór rozwiązań
technicznych ma być osobną ankietą podzieloną według etapów budowy i rodzaju prac, z możliwością wyszukiwania na
każdej liście.

**Decyzja:** Formularz ma zakładki „Dane budowy” i „Materiały i technologia”. Katalog typowych rozwiązań i walidacja
znajdują się we wspólnym pakiecie `@asystent/schemas`; UI wyświetla filtrowalne listy, dostosowane do budowy domu,
rozbudowy, remontu i innych prac. Wybory zapisujemy jako JSON w istniejącej kolumnie `construction_jobs.materials`
(zwiększono jej limit długości, bez dodawania danych do schematu publicznego). Historyczne tekstowe notatki
materiałowe są zachowywane przy edycji.

Nowe zlecenia otrzymują automatyczne, nieedytowalne wymagania zgodności z dokumentacją projektową, przepisami i
zasadami wiedzy technicznej oraz analogiczny warunek odbioru. Opcje w ankiecie są preferencjami, nie instrukcją
konstrukcyjną; zawierają wariant „Zgodnie z projektem” i wymagają weryfikacji dla konkretnego obiektu. Katalog
obejmuje popularne rozwiązania wraz z wariantem „inne”, nie deklaruje wyczerpania wszystkich produktów i
specyfikacji producentów.

**Konsekwencje:** Raport zlecenia zawiera wybrane technologie. Źródła branżowe doboru kategorii są linkowane w
interfejsie i wymienione w `packages/schemas/src/construction-technology.ts`. Migracja limitu jest lokalna i
addytywna; starsze wymagane przez bazę pola pozostają kompatybilne i są wypełniane automatycznie przez formularz.

## ADR-010: Ankieta technologii z wyszukiwaniem i etapami warunkowymi

**Kontekst:** Kontrola formularza pokazała, że wcześniejsza wyszukiwarka stała obok natywnego selecta, więc nie
filtrowała menu wyboru. Użytkownik wymaga wyszukiwania wewnątrz menu, wielu sposobów posadowienia, warunkowego
szalowania, odrębnych warstw dachu oraz etapów dopasowanych do standardu i zakresu prac.

**Decyzja:** Zastąpiono natywne selecty wyszukiwanymi, rozwijanymi listami. Sposób posadowienia jest listą
wielokrotnego wyboru. Wspólny helper `getConstructionTechnologyStages` steruje widocznymi i wymaganymi polami
według wybranego rodzaju i postępu ankiety:

- Dom/rozbudowa rozpoczyna się od standardu realizacji (stan surowy otwarty/zamknięty, deweloperski, pod klucz lub
  inny). Izolacja, stolarka zewnętrzna, instalacje i wykończenia pojawiają się zgodnie ze standardem i wybranym
  układem ściany.
- Szalowanie fundamentów pokazuje się tylko dla monolitycznej ściany betonowej wymagającej szalunku; w elementach
  szalunkowych forma jest tracona i nie wymaga oddzielnego wyboru.
- Folia kubełkowa i ocieplenie fundamentów są niezależne od izolacji przeciwwilgociowej.
- Dach ma oddzielne pola: płyta skośna, deskowanie/poszycie, warstwa wstępnego krycia, pokrycie końcowe oraz
  ocieplenie. Etapy warstw dachu nie pokazują się, jeśli zakres wyklucza prace przy dachu.
- Remont rozpoczyna się od zakresu (odświeżenie, pomieszczenia, remont generalny, termomodernizacja). Wyższy
  zakres odsłania stolarkę i instalacje; termomodernizacja dodaje izolacje fundamentów/ścian i warstwy dachu.
- Inne prace rozwijają się na etapy właściwe dla wybranej kategorii: przygotowanie i fundament/konstrukcja/
  wykończenie ogrodzenia, podbudowa i odwodnienie podjazdu, system i odbiornik odwodnienia, mur oporowy z
  odwodnieniem albo przygotowanie/ocieplenie/warstwa elewacyjna.
- Każda wybrana opcja o wartości `other-*` wymaga opisu. Walidacja i formularz wymagają tego warunku, a opis trafia
  do raportu. Zapis nadal używa istniejącego JSON w polu `materials`; legacy pojedyncza wartość posadowienia
  jest odczytywana jako lista jednoelementowa.

**Konsekwencje:** Ankieta odzwierciedla wybrany zakres, a pominięte etapy nie są obowiązkowe przy zapisie.
Preferencje nadal nie zastępują projektu ani doboru projektanta/kierownika. Walidacja schematu oraz lokalne E2E
sprawdzają wybór wielu posadowień, filtrowanie w menu, warunkowe szalowanie, warstwy i zapis raportu.

## ADR-011: Szczegółowe wykończenia dekarskie zależne od pokrycia

**Kontekst:** Ankieta dachu nie rozróżniała profili blachodachówki, systemów blachy płaskiej i trapezowej ani
kominów z obróbką i odwodnienia dachu.

**Decyzja:** Dla blachodachówki, blachy na rąbek / płaskiej oraz blachy trapezowej pokazujemy odrębne wybory
profilu lub systemu. Każdy dach objęty ankietą pyta o komin, rynny i rury spustowe; sposób i materiał obróbki
komina są wymagane tylko wtedy, gdy wybrano komin lub istniejący przewód. Wybory pozostają preferencjami,
podlegają weryfikacji zgodnie z projektem i trafiają do dotychczasowego raportu/JSON materiałów.

**Konsekwencje:** Zmiana pokrycia odsłania tylko zgodny z nim detal blacharski. Wybór „brak komina” albo
„zakres nie obejmuje kominów” pomija pytania o obróbkę. Walidacja schematu i lokalne E2E obejmują profile,
system kominowy, obróbkę i odwodnienie.

## ADR-012: Wybory wielokrotne i szczegóły zakresu pomieszczeń oraz terenu

**Kontekst:** Wykonanie może się różnić między pokojami i częściami budynku, a pojedynczy wybór nie opisywał
różnych podłóg, wykończeń ścian, schodów, elewacji ani łączonych prac wokół domu.

**Decyzja:** Wspólny katalog deklaruje wielokrotność per etap; walidacja, formularz i raport zachowują listy
wyborów. Wielokrotne są posadzki, wykończenia ścian/sufitów, schodów i balustrad, wykończenia elewacji,
elementy kuchenne i łazienkowe podczas remontu, kategorie pozostałych prac oraz materiały nawierzchni i obrzeży.
Konstrukcja schodów jest osobnym polem. Instalacja wodno-kanalizacyjna pojawia się już w ankiecie stanu surowego.
Wybrane prace „Inne” mogą być łączone, po czym ujawniają wymagane dla nich podbudowy, nawierzchnie, obrzeża,
odwodnienie i inne etapy. Starsze zapisane tekstowo wybory są normalizowane do list przy odczycie.

**Konsekwencje:** Użytkownik może opisać różne materiały dla pomieszczeń/stref bez dopisywania ich do notatki.
Wybór „zgodnie z projektem” i wartości wykluczające zakresu nie mogą być łączone z innymi opcjami tego samego
pola wielokrotnego. Schemat, raport i E2E weryfikują łączenie wyborów i kompatybilność odczytu.

## ADR-013: Opis wymagany dla pozostałych prac

**Kontekst:** Kategoria „Inne prace” dopuszczała odpowiedź „zgodnie z projektem” zamiast określenia zakresu, przez
co zlecenie mogło nie wyjaśniać wykonawcom, jakich robót dotyczy.

**Decyzja:** Usunięto tę odpowiedź ze wszystkich kategorii i etapów ankiety „Inne”. Formularz wymaga konkretnego
opisu prac i wyboru co najmniej jednej kategorii; etykieta i wskazówki ankiety podkreślają ten obowiązek.
„Inne prace specjalistyczne” wymuszają osobne doprecyzowanie, a starsze zapisane odpowiedzi „zgodnie z projektem”
są czyszczone przy odczycie, aby użytkownik mógł zastąpić je konkretnym wyborem.

**Konsekwencje:** Raport zachowuje opis zakresu oraz wybrane konkretne kategorie. Zgodność wykonania z projektem,
przepisami i zasadami wiedzy technicznej pozostaje warunkiem ogólnym, nie odpowiedzią opisującą zamawiane prace.

## ADR-014: Walidacja onboardingu i skrót administratora

**Kontekst:** Rejestracja oraz wypełnianie wniosku wymagają walidacji, a administrator potrzebuje szybkiego
przechodzenia między zakładkami formularza podczas testowania.

**Decyzja:** Dane Auth są walidowane wspólnymi schematami Zod (`SignInInputSchema`, `SignUpInputSchema`).
Wyjątkowy skrót przejścia między sekcjami jest widoczny wyłącznie dla sesji z `app_metadata.role === "admin"`,
metadanymi zarządzanymi serwerowo przez Supabase Auth. Skrót omija walidację nawigacji, ale nie zapis: każde
zlecenie nadal przechodzi pełną walidację przed utrwaleniem. Rola członkostwa `admin` w pojedynczej organizacji
nie nadaje tego uprawnienia; nie wolno ustawiać go przez `user_metadata` ani przez klienta.

**Konsekwencje:** Konta zwykłe nie widzą skrótu. Nadanie uprawnienia wymaga zaufanego procesu administracyjnego
wykorzystującego serwerowy klucz Supabase; nie dodano formularza samodzielnego nadawania roli ani skrótu
zmieniającego walidację danych zapisywanych w bazie.

## ADR-015: Interaktywna mapa lokalizacji OpenStreetMap

**Kontekst:** Osadzona mapa Google zwracała HTTP 200, ale w lokalnym podglądzie kończyła nawigację ramki
`ERR_ABORTED` i nie renderowała mapy. Samo sprawdzanie adresu `iframe` nie potwierdzało widoczności ani działania
mapy.

**Decyzja:** Podgląd formularza używa Leaflet i kafelków OpenStreetMap, marker wskazuje wynik wyszukania adresu,
kodu pocztowego i miejscowości przez Nominatim. Wyszukiwanie jest opóźnione względem wpisywania, wymaga
uwierzytelnionej sesji w API aplikacji, odpowiedzi z lokalizacją nie są buforowane przez przeglądarkę, a
zapasowe wyszukanie kodu i miejscowości jest oddzielone odstępem zgodnym z limitem publicznego geokodera.
Jeśli pełny adres nie zostanie znaleziony, mapa pokazuje jawnie oznaczone przybliżenie; puste dane kierują mapę
na Warszawę. UI pokazuje źródło mapy i zapewnia osobny link do Google Maps. Kafelków OSM i geokodera używamy
zgodnie z ich atrybucją i przeznaczeniem; mapa wymaga połączenia z Internetem.

**Konsekwencje:** E2E sprawdza widoczne kafelki i marker, przybliżony wynik dla adresu, zapis raportu oraz odmowę
anonimowego wywołania geokodera. Hosting pozostaje niewłączony; przed publicznym wdrożeniem trzeba ponownie
ocenić skalowanie i limity publicznych usług mapowych.

## ADR-016: Warunkowe pytania dla innych prac i trwały punkt mapy

**Kontekst:** Kategoria „Inne prace” obejmuje wiele niezależnych zakresów robót. Stały zestaw pytań utrudniał
szczegółowy opis, a geokoder może zwrócić jedynie przybliżenie miejscowości, gdy konkretny numer budynku nie jest
dostępny.

**Decyzja:** Współdzielony katalog technologii dobiera etapy ankiety do zaznaczonych zakresów; dalsze pytania mogą
zależeć również od wybranej technologii (np. kolor i powłoka elewacji tylko dla tynku lub malowania). Dla adresu
z numerem geokoder preferuje wynik z tym samym numerem domu. Użytkownik może skorygować lokalizację kliknięciem
mapy, a punkt zapisuje się w istniejącym JSON `materials` jako `locationPin`, bez migracji bazy.

**Konsekwencje:** Zmiana adresu czyści ręcznie wskazany punkt, a zapisane zlecenie odtwarza go po ponownym otwarciu.
Geokoder nie gwarantuje dokładnego wyniku dla każdego adresu; jeśli numer nie zostanie dopasowany, lokalizacja
pozostaje przybliżona do czasu ręcznego wskazania budynku.

## ADR-017: Ogólne kategorie pozostałych prac i ścisłe dopasowanie adresu

**Kontekst:** Kategorie „Inne prace” mieszały zakres robót z materiałem (np. ogrodzenie drewniane jako osobna
kategoria), a kliknięcie zakładki technologii wymagało wcześniej uzupełnienia danych budowy. Geokoder mógł też
po braku dopasowania numeru domu ustawić marker na środku miejscowości.

**Decyzja:** Główne kategorie opisują ogólny rodzaj robót (np. ogrodzenie, podjazd/nawierzchnie, fasada); materiał
i technologia są wybierane wyłącznie w etapach szczegółowych. Między zakładkami można przechodzić bez walidacji;
pełny formularz jest walidowany dopiero przy zapisie. Ulica/nazwa miejsca i numer budynku/działki są osobnymi
polami, łączonymi do istniejącego pola adresowego. Gdy podano numer, geokoder zwraca wynik tylko przy zgodnym
`house_number`, bez fallbacku do miejscowości. Brak dopasowania nie ustawia markera; użytkownik może wskazać
punkt ręcznie.

**Konsekwencje:** Przy odczycie starych zapisów dawne kategorie materiałowe są mapowane do nowych ogólnych
kategorii, zachowując zapisane szczegóły technologii. Brak dokładnego adresu wymaga ręcznego wskazania punktu,
zamiast prezentowania nieprecyzyjnego środka miejscowości jako adresu inwestycji.

## ADR-018: Osadzona mapa Google do wyszukiwania adresu

**Kontekst:** Publiczny geokoder OpenStreetMap nie rozpoznaje wszystkich nowych lub niepełnych adresów, w tym
adresów, których numer budynku nie znajduje się w jego danych. Dla inwestora ważniejsze jest sprawdzenie adresu
bezpośrednio w Google Maps niż blokowanie podglądu przez ścisłe dopasowanie zewnętrznego geokodera.

**Decyzja:** Podgląd formularza korzysta z osadzonego wyszukiwania Google Maps przez adres URL z parametrem `q`,
złożonym z nazwy miejsca, numeru, miejscowości i kodu pocztowego. Wpisy są opóźnione przed przeładowaniem mapy,
a link obok otwiera pełną wersję Google Maps. Usuwamy zależność Leaflet, kafelki OSM i własny endpoint Nominatim.
Zachowujemy odczyt już zapisanych współrzędnych `locationPin` jako wyszukiwania punktu w Google Maps.

**Konsekwencje:** Iframe Google Maps nie udostępnia aplikacji współrzędnych kliknięcia; nie obiecujemy więc zapisu
nowego punktu przez kliknięcie mapy. Integracja zapisu punktów wymagałaby osobnej decyzji, klucza Google Maps
Platform i konfiguracji rozliczeń. Zapytanie lokalizacyjne jest przekazywane Google. Ta decyzja zastępuje
wyświetlanie mapy z ADR-015 oraz sposób geokodowania opisany w ADR-016 i ADR-017.

## ADR-019: Warunkowa dokumentacja i bramka zatwierdzenia CAD

**Kontekst:** Kolejne kroki wniosku muszą zbierać rysunki i szczegółowe wymiary odpowiednie do zakresu,
zanim aplikacja przystąpi do przedmiaru. Użytkownik wybrał OpenAI API do rozpoznawania oraz wymaga MCP.

**Decyzja:** Wspólny katalog dokumentacji w `packages/schemas` pokrywa każdą aktualną kategorię „Innych prac”.
Dom i rozbudowa mają identyfikowane kondygnacje oraz opcjonalną piwnicę. Wyłączone zakresy nie dodają
dokumentacji. Schematy CAD definiują jednostki mm, źródło, status weryfikacji, wersję i klucz idempotencji.
Propozycja nie zatwierdza geometrii ani zbrojenia. Wspólne przypadki użycia w `packages/domain` sprawdzają
skalę, obrysy, rewizję oraz wymagane zatwierdzenia przed zmianą statusu dokumentu.

**Konsekwencje:** Kalibracja jest odwracalną transformacją; rozbieżność skal referencyjnych powyżej 1% blokuje
zatwierdzenie w tej bramce. Ten limit jest kontrolą jakości pomiarów, nie deklaracją dokładności konstrukcyjnej
ani tolerancją wykonawczą. Edytor/import w UI, Storage dokumentów, OpenAI i MCP pozostają do zaimplementowania
na tych kontraktach. Adaptacyjna lista rysunków i zapisywane opisy pomiarów są jedynie dokumentacją roboczą.
Zbrojenie nie może zostać zaakceptowane wyłącznie na podstawie odpowiedzi modelu.

## ADR-020: Wersjonowany szkic kolejnych kroków ankiety

**Kontekst:** „Przejdź dalej” ma otwierać dalszą ankietę, a nie kończyć wniosek. Odpowiedzi muszą przetrwać
odświeżenie bez rozbudowy JSON technologii i jego limitu 12 000 znaków.

**Decyzja:** Dane ogólne i zdjęcia zapisujemy jako szkic przed otwarciem kroków dokumentacji.
Osobna tabela `construction_documentation_drafts` przechowuje aktualny etap oraz robocze opisy pomiarów.
Odczyt podlega RLS właściciela zlecenia; zapis jest dostępny wyłącznie przez RPC sprawdzające właściciela,
kształt danych i oczekiwaną rewizję. Konflikt innej karty nie nadpisuje odpowiedzi. Każda nawigacja między
etapami zapisuje postęp. „Zapisz szkic i wróć do panelu” nie oznacza zatwierdzenia dokumentacji.

**Konsekwencje:** Po przeładowaniu wchodzimy w „Edytuj” i „Przejdź dalej”; bieżący etap i zapisane odpowiedzi
są przywracane. Niezapisane zmiany w bieżącym polu nie są autosave. Ta warstwa nie przechowuje jeszcze
plików, geometrii ani zatwierdzeń i nie może służyć do automatycznego przedmiaru.

## ADR-021: Etapowy edytor wektorowy i jawne rozpoznawanie skanu OpenAI

**Kontekst:** Użytkownik wskazał, że formularz opisów nie zastępuje ekranu CAD. Wymaga płótna z narzędziami,
zakładek rysunków i skanowania, które odtwarza bieżący etap bezpośrednio na płótnie.

**Decyzja:** Płótno SVG odwzorowuje wspólny model mm (nie bitmapę jako projekt). Umożliwia ręczne rysowanie
odcinków, obrysów, prętów, wymiarów i opisów, przesuwanie, edycję parametrów/współrzędnych, warstwy, pan/zoom,
undo/redo i eksport SVG bez prywatnego podkładu. Każdy wymagany rysunek ma osobny dokument i rewizję w
`cad_drawings`. Autosave jest serializowany; błąd blokuje przejście do innego rysunku do czasu ponowienia zapisu.
API sprawdza właściciela, etap, schemat oraz status roboczy, a RPC dostępne tylko dla serwera egzekwuje rewizję.

PDF jest renderowany lokalnie przez PDF.js (Apache-2.0), bez natywnych modułów w przeglądarce. Oryginał i PNG
wybranej strony są zapisywane prywatnie w `project-scans`. OpenAI Responses API otrzymuje tylko PNG oraz nazwę
etapu po zgodzie użytkownika na transfer i koszty. Klucz jest przypisany do użytkownika i szyfrowany AES-256-GCM
z AAD identyfikatora użytkownika. Klucz szyfrujący jest wyłącznie konfiguracją serwera.

Model zwraca odcinki, proste obrysy i opisy w pikselach źródła; adapter w domenie sprawdza granice, typy,
topologię oraz zapisuje pochodzenie i confidence. Nie uzupełnia domyślnie wymiarów konstrukcyjnych.
Rozpoznane obrysy pozostają `trace-line`/`trace-area`: wymagają klasyfikacji i parametrów przed przedmiarem.
Kalibracja reskaluje geometrię oraz podkład razem. Początkowe 1 mm/piksel jest wyraźnie oznaczoną skalą
tymczasową, nie odczytanym wymiarem. Zbrojenie pozostaje szkicem i nie otrzymuje zatwierdzenia specjalisty.

**Konsekwencje:** Do rzeczywistego skanowania potrzebne są klucz API, szyfrowanie serwera i środki na koncie OpenAI.
Domyślny model to `gpt-4.1`, `store:false`, limit 12 000 tokenów odpowiedzi i 10 prób na użytkownika/godzinę.
Limit prób nie jest limitem kwotowym wydatków. Import zastępuje bieżący rysunek po jawnym ostrzeżeniu; undo
może przywrócić poprzedni. Historia undo jest lokalna do karty; zapisywana jest bieżąca rewizja, nie archiwum zmian.
Nie ma korekcji perspektywy, 3D, zatwierdzania konstrukcji ani MCP w tej zmianie. Testy mockowanego dostawcy
nie dowodzą dokładności rzeczywistego rozpoznawania.

## ADR-022: Typowane narzędzia etapu, warstwy, węzły i podkłady między rysunkami

**Kontekst:** Jeden zestaw ogólnych kresek nie opisuje projektu do przyszłych obliczeń. Użytkownik wymaga
narzędzi właściwych dla rysunku, warstw izolacyjnych, wspólnych narożników, wymiarów i ponownego używania rzutów.

**Decyzja:** Wspólny katalog `cadDrawingTools` i `getCadDrawingTools` w schemas dobiera narzędzia do rodzaju
dokumentacji i funkcji rysunku. `construction-line`/`construction-area` mają jawne role, parametry i referencję
projektową. Serwer odrzuca elementy niepasujące do rysunku; kopie odniesienia są oddzielnie oznaczone.
Warstwy przechowują funkcję, materiał, rzeczywistą grubość i stronę. Typowane fabryki w domain obsługują
rysowanie ręczne i klasyfikację skalibrowanych obrysów AI, bez utraty confidence i źródła.

Węzły ścian/ław i wybranych elementów konstrukcyjnych są łączone przez zgodne współrzędne (tolerancja 0,001 mm).
Przyciąganie do końców zależy od tolerancji ekranowej. Ruch węzła zmienia wszystkie połączone końce;
przesunięcie całego elementu jest atomowe. Otwory zachowują względną pozycję w ścianie.
Osie i zwykłe trasy nie są przypadkowo włączane do tej samej sieci połączeń.

Kopia rysunku dodaje geometrię z nowymi ID, przepisuje powiązania otworów i zachowuje identyfikator
rysunku/elementu źródłowego oraz rewizję. Nie synchronizuje późniejszych zmian. Kopie są podkładami,
nie drugimi pozycjami przedmiaru i nie przechodzą bramki zatwierdzania.
API wymaga istniejącego rysunku tego samego projektu i rewizji nie nowszej od zapisanej.
Rozwinięcie ściany wykorzystuje długość, wysokość oraz wysokość/parapet otworów; odrzuca otwory poza obrysem.
Nie jest przekrojem konstrukcyjnym z doborem poziomów, podpór i zbrojenia.

Kreator belki/siatki generuje edytowalne pręty, opisy oraz wymiary z jawnych parametrów użytkownika.
Położenia strzemion są `representation: projection`, bez domyślnej długości gięcia;
nie mogą przejść zatwierdzania jako fizyczne pręty. Zbrojenie nadal wymaga kontroli projektanta.

**Konsekwencje:** Kolor kroków wynika z zapisanych obiektów, nie z przejścia przez ankietę.
Usunięto UI pomiarów opisowych, zachowując starsze dane. Obecny zestaw jest rozszerzonym szkicem CAD,
nie pełnym zamiennikiem branżowego CAD 1:1. Nie ma jeszcze pełnych przekrojów konstrukcyjnych,
kształtów gięcia z łukami/hakami, kompletnej topologii otworów powierzchniowych ani zweryfikowanego przedmiaru.

## ADR-023: Zależne podparcia fundamentów i graficzne układy zbrojenia

**Kontekst:** Użytkownik wymaga prostych etapów z podpunktami, ciągłej edycji narożników, wymiarów
zewnętrznych, automatycznych fundamentów pod ścianami oraz graficznego kreatora belki z miejscem ułożenia.
Potwierdził wybór podparcia przy rysowaniu każdej ściany, gdy technologia obejmuje kilka rozwiązań.

**Decyzja:** Podgląd gestu jest oddzielony od utrwalonego dokumentu; po zwolnieniu wskaźnika zapisuje się
jedno polecenie. Ruch wykorzystuje różnicę współrzędnych, bez snapu i bez skoku do środka uchwytu.
Wymiary rdzenia wynikają z jego obrysu, nie z osi. Dla istniejącego modelu odcinka z kwadratowymi końcami
długość zewnętrzna to długość osi plus szerokość. Izolacje mają osobne wymiary i legendę.

Opcjonalne `foundationBase` ściany zapisuje projektowe parametry ławy/płyty albo ręcznego posadowienia.
`supportFor` wskazuje ściany generujące ławę lub płytę. Synchronizacja w domain jest wspólna dla commit,
podglądu i kontroli API. Zamknięty nierozgałęziony obwód płyty wyznacza odsunięty wielokąt; otwarty obwód
jest celowo szkicem bez wygenerowanej płyty. Rozgałęzienia i sprzeczne parametry dają jawny błąd.
Płyta bez ścian może być rysowana ręcznie, gdy technologia na nią pozwala. Pozostałe typy posadowienia
nie otrzymują wymyślonego rozstawu podpór.

Kreator zbrojenia jest dialogiem z trzema krokami: geometria, pręty, umiejscowienie. Nowy detal przekroju
jest opcjonalną strukturą `section` w adnotacji zbrojenia; starsze układy pozostają czytelne.
Pręty górne/dolne mają osobne warstwy. `placement` przechowuje ID podparcia, grupę i ramę początkową:
przesunięcie/obrót przenosi układ sztywno, zmiana długości ustawia `needsReview`, zamiast rozciągać pręty.
Kopia rysunku przepisuje relacje podpór i grup oraz zachowuje referencje dokumentów.

**Konsekwencje:** Etap jest zielony dopiero po zapisaniu geometrii każdego podpunktu. Dodatkowy rysunek
fundamentów ma indeks 3; wcześniejsze indeksy i stare dokumenty zachowano. Rozszerzenia JSON są opcjonalne;
nie zmieniają tabel ani nie wymagają migracji. Strzemiona nadal są projekcją, bez długości gięcia.
Nie rozwiązano doboru konstrukcyjnego, pełnej topologii powierzchni, układów gięcia ani zatwierdzonego
przedmiaru. Rysunki oraz referencje dokumentów nie są dowodem kompletności projektu 1:1.

## ADR-024: Przyciąganie połączeń ścian i pełnoszerokościowe płótno

**Kontekst:** Użytkownik wymaga prostego zamykania obrysu, trwałego wspólnego narożnika, ustawień
pod canvas, większej przestrzeni rysowania, podstawowych pól i odróżnienia elementów kolorami.

**Decyzja:** Przyciąganie topologiczne jest niezależne od siatki. Promień 12 px przelicza się przez
aktualną skalę widoku, najpierw szukając końca, potem projekcji na odcinek ściany.
Ruch węzła wyklucza jego własne odcinki i wygenerowane podpory, żeby nie przyciągał się do starej pozycji.
Podgląd i końcowy zapis używają tej samej reguły. Wspólny węzeł zachowuje istniejącą tolerancję 0,001 mm.

Połączenie T dzieli ścianę, zachowuje pierwszy ID i tworzy nowe ID kolejnych odcinków. Otwory są przypisane
do zawierającego je odcinka bez zmiany geometrii. Podział w otworze albo podparcia z przypisanym zbrojeniem
daje jawny błąd, zamiast uszkadzać relacje. Synchronizacja fundamentów następuje po normalizacji węzłów;
podział obwodu zachowuje płytę, a każdy odcinek ławy otrzymuje relację ze swoją ścianą.

Ustawienia i inspektor zajmują drugi wiersz pod pełnoszerokościowym canvas. Przy 1440 px płótno ma ponad
1250 px szerokości i co najmniej 640 px wysokości; mobile zachowuje kolejność pionową bez overflow.
Legenda ról i odrębne kolory nie są nadpisywane kolorem zaznaczenia; zaznaczenie ma pomarańczowy obrys.
Dodano rolę obszarową `excavation`, bez automatycznego generowania wykopów czy przedmiaru.

Jawne warianty technologii bloczków 24/25/30 cm ustawiają edytowalną grubość oraz materiał. Dodano wariant
bloczka szalunkowego 24 cm. Materiały bez konkretnego wymiaru nie tworzą domyślnej grubości.
Referencja dokumentacyjna jest opcjonalnym polem rozwijanym; brak pozostaje oznaczony „Do uzupełnienia
z projektu”, bez zatwierdzenia. Wysokości, parametry podpór i grubości izolacji nadal wymagają danych projektu.

## ADR-025: Trwałe parametry i topologiczny rzut fundamentów

**Kontekst:** Użytkownik wymaga czytelnych wymiarów, automatycznego zapisu ustawień, węzłów T/X,
przyczepionych podpór, oznaczeń konstrukcyjnych, powierzchni pól, płyty dennej, opisów i skali.
Potwierdził niezależną skalę arkusza oraz oddzielny wybór płyty dennej między ławami.

**Decyzja:** Opcjonalne `foundationSettings` przechowuje surowe pola, także niekompletne. Zmiana pola
jest zapisywana przez istniejące wersjonowane autosave; nowa ściana wymaga poprawnych parametrów.
Nie zmieniamy automatycznie wcześniejszych ścian. Rysunek bez własnych ustawień dziedziczy je z pierwszego
zapisanego rysunku fundamentów tego projektu. Brak nowej odpowiedzi `foundationBottomSlab` pozostaje
nieokreślony i nie blokuje starszych ankiet; nie jest traktowany jako „tak”.
Poprawiono status autosave: potwierdzenie starszego snapshotu nie oznacza zapisania kolejnych zmian.

Warstwy obsługują semantyczne strony `interior`/`exterior`, oprócz dawnych `left`/`right`/`both`.
Strona hydroizolacji jest oddzielona od zewnętrznego ocieplenia. Wnętrze wynika z zamkniętych pól,
nie kierunku ściany. Brak jednoznacznego wnętrza nie generuje zgadywanego pasa.
Ocieplenie ma wielokątny pas na licach narożników i wzór rombowy dostosowany do grubości.

Normalizacja rozcina również przecięcia X i samodzielne ławy. Węzły mają wspólne współrzędne;
otwory i relacje przyczepionych symboli przechodzą na właściwy odcinek. Pozostaje blokada podziału
wewnątrz otworu i hosta zbrojenia. `attachment` zapisuje host i jego poprzednią ramę. Przesunięcie/obrót
przenosi symbol sztywno; zmiana długości zmienia względną pozycję, nie rozmiar. Wymiary prostokąta
są mierzone w lokalnych osiach także po obrocie. Usunięcie hosta odczepia stopę/słup/opis.

Zorientowane półkrawędzie wyznaczają zamknięte pola. Odsunięcie do wewnętrznych lic uwzględnia grubości
oraz zakończenia ścian ślepych. Powierzchnia jest polem w świetle ścian, bez odliczania symboli podpór
i otworów w podłodze. `infillFor` wiąże płytę denną ze wskazanym zamkniętym polem ław; geometria
aktualizuje się po przesunięciu. Podział pola wymaga ponownego wskazania płyty. API kontroluje zgodność
geometrii przyczepionych elementów/płyty i wymaga odpowiedzi „tak” w technologii.

Wspólne rozmieszczenie wymiarów wyznacza bezkolizyjne ramki etykiet poza geometrią. Tekst ekranowy ma
minimum 13 px; maska pod tekstem zachowuje czytelność przy krzyżowaniu linii pomocniczych.
Powtarzalną grubość/szerokość tej samej roli opisuje się raz. Pozycje podpór mają wymiary od hosta
oraz X/Y od zewnętrznego gabarytu. `mark` jest trwałym, unikalnym oznaczeniem do przyszłych powiązań
zbrojenia; stare elementy dostają oznaczenia przy wczytaniu. Kopie otrzymują własne oznaczenia.

`paperScale` nie zmienia zoomu ani kalibracji. SVG otrzymuje fizyczne wymiary mm / mianownik skali;
tekst wymiarów w eksporcie ma 2,5 mm na arkuszu, niezależnie od ekranowego minimum.
Legenda rezerwuje prawy pas dopasowanego widoku i może być ukryta. Opisy mają kotwicę, linię prowadzącą
i rozmiar czcionki na arkuszu. Wykop jest teraz pasem `construction-line`; stare `construction-area`
z tą rolą pozostają kompatybilne. Nie zmieniono SQL ani zależności.

**Konsekwencje:** Rysunek pozostaje roboczy. Rozwiązania konstrukcyjne, przejścia powierzchniowe,
pełne zestawienia gięcia, ujednolicone bryły oraz zatwierdzony przedmiar nie są ukończone.
