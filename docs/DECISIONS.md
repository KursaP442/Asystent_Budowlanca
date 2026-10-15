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
Pozycje podpór mają wymiary od hosta
oraz X/Y od zewnętrznego gabarytu. `mark` jest trwałym, unikalnym oznaczeniem do przyszłych powiązań
zbrojenia; stare elementy dostają oznaczenia przy wczytaniu. Kopie otrzymują własne oznaczenia.

`paperScale` nie zmienia zoomu ani kalibracji. SVG otrzymuje fizyczne wymiary mm / mianownik skali;
tekst wymiarów w eksporcie ma 2,5 mm na arkuszu, niezależnie od ekranowego minimum.
Legenda rezerwuje prawy pas dopasowanego widoku i może być ukryta. Opisy mają kotwicę, linię prowadzącą
i rozmiar czcionki na arkuszu. Wykop jest teraz pasem `construction-line`; stare `construction-area`
z tą rolą pozostają kompatybilne. Nie zmieniono SQL ani zależności.

**Konsekwencje:** Rysunek pozostaje roboczy. Rozwiązania konstrukcyjne, przejścia powierzchniowe,
pełne zestawienia gięcia, ujednolicone bryły oraz zatwierdzony przedmiar nie są ukończone.

## ADR-026: Edycja opisów i wybór pól fundamentów/piwnicy

**Kontekst:** Użytkownik wymaga edycji opisu dwuklikiem, czyszczenia, prawego przeciągania,
czytelnego ocieplenia, wymiarów T/X i położeń od ścian oraz wyboru pól zamiast rysowania płyty.

**Decyzja:** Opis używa tymczasowego HTML input w SVG foreignObject; poprawny tekst zapisuje
się przez dotychczasowe autosave. Eksport pomija pole edycji. Opis przechwytuje pointer dopiero
po ruchu, aby natywny dwuklik trafił do tekstu. Prawa mysz ma osobny gest widoku bez zmiany narzędzia.
Czyszczenie jest potwierdzane, cofalne i dotyczy dokumentu, nie prywatnych plików Storage.

`basement-area` jest obszarową rolą oznaczenia pomieszczenia. Współdzieli `infillFor` i synchronizację
pól ław ze slab, bez zależności między płytą i piwnicą. UI i API wymagają piwnicy w zakresie projektu.
Narzędzie slab na fundamentach zawsze wybiera zamknięte pole; poza fundamentami zachowuje rysowanie.
Nowy symbol thermal ma 10× większą długość wzoru, ale zachowuje rzeczywistą grubość pasa.

Wymiarowanie usuwa nadmiarowe półgrubości na kolinearnych węzłach podziału. Pozycja podpory
ma odniesienie do przyczepionej/najbliższej ściany i jej lica, w lokalnych osiach także poza końcem.
Gabaryt rysunku pozostaje fallback wyłącznie przy braku ścian/ław. Na czas zapisu zmiany arkusza
edytor jest inert, żeby interakcja nie trafiła do poprzedniego dokumentu.

**Konsekwencje:** Bez zmian zależności/SQL. Starsze obrysy slab są zachowane, nowe oznaczenie
piwnicy wymaga obwodu. Przy zmianie podziału wybranego pola nadal wymagamy ponownego wyboru.
Nie generujemy konstrukcji ani zatwierdzonego przedmiaru.

## ADR-027: Rzeczywiste lica i lokalne etykiety wymiarów

**Kontekst:** Wymiary T/X nadal kończyły się na osi węzła, pomijały długości generowanych ław
i miały wspólny szary kolor. Prostokątne rezerwacje ukośnych ścian oraz pól wypychały opisy podpór
daleko od symboli. Liczbowa edycja odcinka nie przesuwała wszystkich wspólnych końców.

**Decyzja:** `cadStripFaceSegment` w domain przecina odsunięte lica z licami sąsiednich elementów
tej samej rodziny. Wolne końce zachowują kwadratowe zakończenie; podział kolinearny nie dodaje
sztucznego zakończenia. Przy różnych długościach opisujemy obie strony, także dla ław automatycznych.
Paleta `cadEntityColor` jest wspólna dla geometrii i wymiarów. Warstwy sterują widocznością wymiarów,
ale nie usuwają geometrii potrzebnej do topologii i odniesień.

`updateConnectedCadEntity` używa tego samego jednoczesnego mapowania węzłów co przeciąganie.
Geometryczny ręczny wymiar aktualizuje długość; inna, jawna wartość referencyjna pozostaje.
Opisy podpór mają 12 px w widoku, krótkie oznaczenia i odnośnik do środka symbolu; ich ramki
planujemy przed pozostałymi etykietami. Kolizje sprawdzamy z rzeczywistymi wielokątami pasów/podpór,
nie z gabarytem ukośnej ściany ani wypełnieniem pola. Zwykłe wymiary zachowują minimum 13 px.

Przed klonowaniem SVG render eksportowy przelicza wszystkie ramki przy font size odpowiadającym
2,5 mm na arkuszu. Natychmiast przywraca układ ekranowy. Sama zmiana fontu sklonowanego tekstu
nie wystarcza, bo maski i rozmieszczenie byłyby niezgodne z nowym rozmiarem.

**Konsekwencje:** Bez nowych zależności, schematów i migracji. Zbyt krótki odcinek dla danych lic
daje jawny błąd zamiast wymiaru osiowego. To wymiarowanie istniejącej geometrii, nie zatwierdzenie
projektu ani przedmiaru. ADR-027 zastępuje wcześniejsze uproszczenie długości kończących się na węźle.

## ADR-028: Uproszczone wymiarowanie jako widok domyślny

**Kontekst:** Pełne wymiarowanie obu lic, ław, grubości, gabarytu i lokalizacji podpór jednocześnie
przesłaniało rzut. Użytkownik wymaga jednego wymiaru na ścianę; potwierdził zachowanie szczegółów
pod osobnym przyciskiem.

**Decyzja:** `getCadPlanDimensions` domyślnie emituje jeden wymiar długości odcinka. Strona wynika
z zewnętrznego lica zamkniętego obrysu (także przy odwróconym kierunku); przy braku jednoznacznej
strony wybieramy dłuższe rzeczywiste lico. Generowane podparcie nie dubluje widocznego hosta;
przy ukrytej warstwie hosta ława znów ma własny wymiar. Grubości i gabaryt pozostają w szczegółach.

Oba pomiary położenia podpory łączymy w jeden opis „wzdłuż / prostopadle”. W obu trybach renderujemy
wyłącznie opis z lokalnym odnośnikiem, bez pełnych łańcuchów przecinających rzut. Położenie szukane
jest nad, pod, z lewej lub prawej strony symbolu. Zerowa stacja nie usuwa niezerowego odsunięcia.
Linia wymiarowa nie może przecinać pasów geometrii; kreski pomocnicze ograniczamy do 1,5 fontu.
Wymiary nadal odnoszą się do prawdziwych lic, nie osi.

Przełącznik zmienia wyłącznie prezentację, bez zapisu/ponownego wczytywania dokumentu.
Callback dopasowania widoku pozostaje stabilny, ponieważ jest zależnością efektu wczytującego rysunek.
SVG używa wybranego trybu oraz istniejącego układu papierowego. Reload wraca do widoku uproszczonego.

**Konsekwencje:** Bez migracji i utraty danych. ADR-028 zastępuje domyślne jednoczesne pokazywanie
obu lic z ADR-027, nie jego obliczenia. Szczegółowy rzut nadal może być gęsty; nie deklarujemy
pełnego odwzorowania dowolnego projektu ani zatwierdzonego przedmiaru.

## ADR-029: Przekroje fundamentów jako opcjonalne metadane istniejącego CAD

**Kontekst:** Przekrój musi odnosić się do istniejącego rzutu i jego stabilnych identyfikatorów, bez osobnego
edytora ani ryzyka odrzucenia starszych dokumentów CAD. Model projektu nie udostępnia jeszcze kompletnego
źródła parametrów typów elementów ani danych do wiarygodnego przedmiaru.

**Decyzja:** Przechowywać odnośniki do istniejących linii cięcia, ustawienia widoku i jawne nadpisania
w opcjonalnym polu `sections` dokumentu CAD. Obliczać geometrię przekroju z bieżących przecięć encji rzutu,
nie utrzymywać drugiej, rozjeżdżającej się kopii konstrukcji. Puste lub sprzeczne dane pozostają nieznane
albo są sygnalizowane; nie wolno wyprowadzać poziomów, warstw, klas betonu ani ilości bez danych źródłowych.

**Konsekwencje:** Nie wymaga migracji bazy i zachowuje zgodność starych rysunków. Istniejący zapis CAD
zachowuje metadane. Obecny renderer i resolver to funkcjonalny zakres początkowy, nie pełna realizacja
przedmiaru, eksportu PDF/PNG, mobilnego workflow, parametrów typów/projektu ani weryfikacji konstrukcyjnej.

## ADR-030: Połączenia wykopów i właściwości elementów powiązanych

**Kontekst:** Wykop jest odcinkiem w istniejącym modelu CAD, lecz nie korzystał ze wspólnych węzłów i
przyciągania ścian. Inspektor właściwości był ukryty w pełnym widoku canvasu, a wieloelementowe relacje
nie mogły być przedstawione bez mylenia ich z automatycznym podparciem konstrukcyjnym.

**Decyzja:** Wykopy mają własną rodzinę topologii: snapują się do narożników/odcinków i dzielą na wspólnych
węzłach, niezależnie od ścian. Kliknięcie elementu bez przeciągania otwiera istniejący inspektor.
Opcjonalne `relatedTo` opisuje powiązanie do edycji; `supportFor` pozostaje wyłącznie relacją automatycznej
ławy/płyty. Powiązania są walidowane w obrębie dokumentu, remapowane przy kopiowaniu i przenoszone przy
podziale hosta. Parametry wygenerowanego podparcia zmienia się na encji źródłowej, nie na kopii.

**Konsekwencje:** Starszy JSON nie wymaga migracji, a nowe pole jest opcjonalne. Relacja grupuje elementy
w inspektorze, nie zgaduje geometrii wykopu ani jego szerokości/głębokości. Automatyczne wyznaczanie
parametrów wykopu nadal wymaga danych projektu i nie jest generowane z niepotwierdzonych założeń.

## ADR-031: Hierarchia pasów pełnych łańcuchów wymiarowych

**Kontekst:** Pełny renderer łańcuchów przydzielał wszystkim rodzinom ten sam pas `chainLane`, a łańcuchy podpór
powstawały przed wymiarami konstrukcji. Ławy, wykopy i opisy podpór mogły przez to nakładać się na wymiary ścian
albo wypychać ich etykiety. Kolejność zależała również od kolejności encji zapisanych w dokumencie.

**Decyzja:** Wszystkie żądania wymiarów otrzymują stabilny priorytet: ściany, ławy fundamentowe, wykopy,
podpory i pozostałe opisy, a następnie gabaryty. Rodziny pasów są sortowane według tego priorytetu. Położenie
każdego łańcucha jest liczone od wspólnego zewnętrznego obrysu wszystkich pasów konstrukcyjnych, z osobnym
odsunięciem dla kolejnych rodzin. W ramach jednego priorytetu zachowujemy stabilną kolejność wejściową.

**Konsekwencje:** Pełne łańcuchy, indywidualne grubości, kolory i edycja wymiarów pozostają zachowane,
ale ława ani wykop nie mogą zająć pasa ściany. Zmiana nie modyfikuje geometrii ani zapisanego JSON i nie wymaga
migracji. Test regresyjny zapisuje encje w odwrotnej kolejności i potwierdza układ ściana → ława → wykop.

## ADR-032: Stały mały tekst wymiarów i izolowane kolizje rodzin

**Kontekst:** Renderer używał wspólnej listy zajętych ramek dla wszystkich łańcuchów, dlatego etykieta jednej
rodziny mogła przesuwać etykietę innej rodziny poza jej pas. Ekranowy font był równocześnie ograniczony wielkością
papierową `2,5 mm × skala`, więc podczas przybliżania tekst wizualnie rósł. Kosztowny układ wymiarów był liczony
ponownie także przy renderach kursora i dla każdego zdarzenia zoomu.

**Decyzja:** Kolizje etykiet rozwiązujemy wyłącznie wewnątrz pojedynczego łańcucha; odseparowane pasy rodzin
zapewnia ADR-031. Na desktopie zwykły wymiar ma stałe 7 px, a położenie podpory 6 px; na mobilnym canvasie
odpowiednio 6 px i 5 px. Wartości są przeliczane do jednostek modelu według bieżącego viewBox. Eksport nadal
używa fizycznego tekstu 2,5 mm. Układ ścian, pól i wymiarów jest memoizowany, a kolejne zdarzenia wheel/pinch
są łączone do jednej aktualizacji widoku na klatkę animacji.

**Konsekwencje:** Zoom nie zmienia wizualnego rozmiaru tekstu, jedna rodzina nie wypycha etykiet innej, a ruch
kursora nie uruchamia ponownie całego algorytmu wymiarowania. Mniejszy tekst świadomie zastępuje wcześniejsze
minimum 13 px. Zmiana dotyczy prezentacji i wydajności; nie modyfikuje geometrii ani zapisu CAD.

## ADR-033: Etykiety wymiarów zapisywane wzdłuż linii znaczników

**Kontekst:** Wszystkie opisy wymiarów były rysowane poziomo, niezależnie od kierunku linii wymiarowej.
Przy pionowych i ukośnych łańcuchach tekst biegł w poprzek znaczników, wystawał daleko poza swój pas
i wymuszał przesuwanie sąsiednich etykiet, co odtwarzało chaos mimo hierarchii pasów z ADR-031.
Jest to też niezgodne z konwencją rysunku technicznego.

**Decyzja:** `cadDimensionLabelAngle` wyznacza kąt etykiety z kierunku `start → end` i normalizuje go do
przedziału `[-90°, 90°)`, więc tekst nigdy nie jest do góry nogami i czyta się od dołu albo od prawej.
`cadDimensionLabelPlacement` zwraca punkt bazowy tekstu odsunięty prostopadle w układzie obróconym oraz
obwiednię (AABB) obróconej ramki, używaną do wykrywania kolizji, dopasowania widoku i atrybutu
`data-label-box`. Renderer rysuje tło, obszar trafienia, tekst i pole edycji wewnątrz
`<g transform="rotate(...)">`, korzystając z nieobróconego prostokąta `cadDimensionLabelRect`.
Wymiar grubości pasa odsuwa się teraz o połowę szerokości etykiety wzdłuż linii, bo po obrocie to jej
rzeczywisty zasięg w tym kierunku.

**Konsekwencje:** Pionowy opis zajmuje pas wąski jak wysokość fontu zamiast całej swojej długości, więc
rodziny wymiarów przestają się wypychać, a rysunek jest zgodny z konwencją techniczną. Wspólne funkcje
pomiarowe etykiety usuwają dotychczasową duplikację wzoru szerokości w domenie i w rendererze.
Zmiana dotyczy wyłącznie prezentacji — geometria, jednostki i zapis CAD pozostają bez zmian, migracja
nie jest potrzebna. Czterokliknięcie etykiety nadal otwiera edycję, ale pole wejściowe jest obrócone
razem z opisem.

## ADR-034: Hierarchia wewnątrz rodzin oraz osie słupów i krawędzie stóp

**Kontekst:** ADR-031 porządkował rodziny ściana → ława → wykop, ale wszystkie wymiary całkowite miały
wspólny końcowy priorytet. W efekcie po cząstkowych wymiarach ściany mogły pojawić się ławy lub wykopy,
a gabaryt ścian dopiero za nimi. Dotychczasowy algorytm podpór łączył słupy i stopy, grupował je według
zbliżonej współrzędnej i tworzył osobne rzędy zamiast stałych dwóch kierunków na pomieszczenie.

**Decyzja:** Każda rodzina zajmuje dwa następujące po sobie poziomy układu: cząstkowe łańcuchy mają
priorytet `family × 2`, a ich zablokowany gabaryt `family × 2 + 1`. Odległości od wspólnej obwiedni
są odpowiednio `4 + family × 8` i `8 + family × 8` wysokości fontu. Układ nie może przesunąć gabarytu
na pas następnej rodziny podczas rozwiązywania kolizji.

Zamknięte pola ścian (awaryjnie ław, gdy nie ma ścian) są jednostką wymiarowania podpór. Słupy tworzą
na każde pole dokładnie jeden poziomy i jeden pionowy łańcuch, którego stacje są osiami słupów.
Stopy tworzą osobną parę łańcuchów, a stacjami są minimalna i maksymalna krawędź ich obrysu w danej osi.
Końcami są wewnętrzne lica pola. Łańcuchy podpór mają tylko linię bazową i przecinające kreski; bez
indywidualnych linii pomocniczych. Etykiety pozostają na tej linii pomiędzy znacznikami i nie są
przenoszone na kolejne pasy. Poziome i pionowe linie bazowe są odsunięte maksymalnie o dwa rozmiary fontu
dla słupów i pięć dla stóp, zawsze od dolnego lub prawego lica do wnętrza pomieszczenia. W małym polu
odsunięcie jest ograniczane do połowy jego głębokości. Obwiednie zwracane przez domenę odpowiadają
rzeczywistemu położeniu renderera.

**Konsekwencje:** Pełna kolejność to ściany cząstkowe → ściany całkowite → ławy cząstkowe → ławy
całkowite → wykopy cząstkowe → wykopy całkowite. Słupy i stopy nie trafiają do tej hierarchii zewnętrznej:
ich linie pozostają wewnątrz właściwego pomieszczenia. Współpołożone słupy i stopy zachowują oddzielne
łańcuchy, ponieważ opisują inne odniesienia (oś oraz krawędzie). Przykładowa stopa daje ciąg
`425 cm | 50 cm | 300 cm`. Podpory bez zamkniętego pola zachowują dotychczasowe lokalne odniesienie
do ściany. Zmiana nie modyfikuje geometrii ani JSON CAD i nie wymaga migracji.

## ADR-035: Autostart serwera deweloperskiego przy otwarciu projektu

**Kontekst:** Praca nad edytorem CAD wymaga stale działającej aplikacji web. Każda sesja zaczynała się
od ręcznego `pnpm dev:web`, a repozytorium nie miało ani `.devcontainer`, ani `.vscode`.

**Decyzja:** Dodajemy zadanie VS Code `Start aplikacji web (autostart)` w `.vscode/tasks.json`
z `runOptions.runOn: folderOpen` i `isBackground: true`. Zadanie uruchamia `scripts/dev-web.mjs`
przez `pnpm`, więc nie wymaga Bash ani WSL i działa w PowerShell, lokalnym VS Code oraz Codespaces.
Skrypt sprawdza port `3000`, w razie potrzeby instaluje zależności i wywołuje `pnpm dev:web`. Świadomie nie
dodajemy pliku `.devcontainer/devcontainer.json`: w istniejącym Codespace jego pojawienie się wymusza
przebudowę kontenera, a zadanie `folderOpen` działa tak samo w Codespaces i w lokalnym VS Code.

**Konsekwencje:** Aplikacja startuje sama po otwarciu projektu, a ponowne otwarcie okna nie uruchamia
drugiego serwera dzięki kontroli portu. Autostart wyłącza się przez usunięcie `runOptions.runOn`,
a ręczne uruchomienie jest dostępne w **Terminal → Run Task…**. Nie uruchamiamy żadnych płatnych
ani zdalnych usług — zmiana dotyczy wyłącznie lokalnego środowiska deweloperskiego.

## ADR-036: Zwarty pełnoekranowy canvas na telefonie

**Kontekst:** Mobilne reguły pełnoekranowego edytora zwiększały udział interfejsu względem obszaru roboczego:
nagłówek miał 78 px wysokości, pasek narzędzi 44 px szerokości, przyciski narzędzi 36 × 44 px, a legenda
i kontrolka wymiarów zajmowały kolejne duże pasy. Na ekranie 390 × 844 px canvas zaczynał się dopiero
na wysokości 248 px i miał 324 × 588 px. Desktopowy układ na tym samym telefonie był czytelniejszy,
ponieważ przeglądarka skalowała jego zwarty interfejs.

**Decyzja:** Dla pełnoekranowego CAD przy szerokości do 700 px zachowujemy pionowy układ desktopowy,
ale zmniejszamy wyłącznie chrom interfejsu: nagłówek do 32 px, pasek narzędzi do 32 px, przyciski do
28 × 34 px, ikony do 15 px, kontrolkę canvasu do 28 px wysokości oraz legendę do pojedynczego zwartego
pasa. Panel rysunku zaczyna się 36 px od lewej krawędzi. Ustawienia nadal otwierają się jako osobny panel,
a obszar dotykowy SVG i przeliczanie współrzędnych pozostają bez zmian.

**Konsekwencje:** Przy 390 × 844 px canvas ma 346 × 769 px i zaczyna się na wysokości 71 px, czyli zajmuje
około 40% więcej powierzchni niż wcześniej. Rysunek, jego etykiety i gesty nie są skalowane sztucznie;
zmienia się tylko rozmiar otaczającego UI. Reguły desktopowe przy 1440 px pozostają bez zmian.

## ADR-037: Przekroje jako metadane wspólnego dokumentu CAD

**Kontekst:** Przekroje muszą pozostać zsynchronizowane z rzutem fundamentów, zachować ręczne nadpisania
i nie mogą tworzyć drugiej, rozjeżdżającej się kopii geometrii. Starsze dokumenty CAD nie zawierają metadanych
przekrojów, a automatyczny generator nie może ponownie tworzyć tych samych propozycji po każdym wejściu.

**Decyzja:** Widok przekrojów zawsze otwiera `foundation-drawing-0` w trybie tylko do odczytu. Definicje przekrojów
są opcjonalnymi metadanymi tego samego JSON CAD, a linie cięcia zwykłymi encjami `construction-line` z rolą
`section-cut`. `sourceElementIds` wiążą przekrój z geometrią, `automaticKey` zapewnia idempotencję,
`sourceFingerprint` wykrywa zmianę źródła, a lokalne `overrides` przechowują świadome odstępstwa bez modyfikowania
rzutu. Automatyczne dane pozostają niezatwierdzone i mają status wymagający weryfikacji.

Rysunek wynikowy jest semantycznym SVG składanym z osobnych, wybieralnych obiektów. Ilości są wyliczane z jawnych
wymiarów; elementy deduplikujemy po ID, ale nie deklarujemy pełnej unii brył w węzłach. Eksport PDF realizuje
druk czystego SVG przez przeglądarkę, dzięki czemu nie dodajemy zależności generującej PDF.

**Konsekwencje:** Starszy JSON pozostaje zgodny i nie jest potrzebna migracja SQL. Autosave, undo/redo i historia
działają dla rzutu oraz przekrojów w jednym repozytorium dokumentu. Zmiana rzutu może oznaczyć przekrój jako
nieaktualny bez usunięcia pracy użytkownika. Edycja przekroju nie aktualizuje automatycznie rzutu; konflikt musi
być rozstrzygnięty świadomie. Obliczenia zbrojenia, nośności i zgodności z normami pozostają poza tym modułem.

## ADR-038: Etapowy edytor zbrojenia w istniejącym dokumencie CAD

**Kontekst:** Obecny kreator zbrojenia generował zestaw linii, ale nie udostępniał nawigacji po istniejących
elementach, edycji pojedynczych prętów ani różnych rozstawów strzemion wzdłuż belki. Dane zbrojenia muszą
pozostawać w tym samym, wersjonowanym dokumencie CAD i nie mogą modyfikować źródłowego rzutu.

**Decyzja:** Etapy i lista elementów są budowane z istniejących encji CAD bieżącego rysunku. Zbrojenie
przypisane do podparcia jest aktualizowane przez dotychczasowy autosave dokumentu, a operacje edycji dotyczą
wyłącznie encji prętów. Dopuszczamy opcjonalne, uporządkowane, niepokrywające się strefy strzemion w
`ReinforcementLayoutSchema`; walidujemy ich długość i limit liczby linii. Zestawienie grupuje wyłącznie
proste, fizyczne pręty o tej samej średnicy, gatunku, warstwie, otulinie i długości. Projekcje strzemion
nie są traktowane jako rozwinięta długość pręta. Masa używa jawnie przyjętej gęstości 7850 kg/m³.

**Konsekwencje:** Zmiana jest wstecznie zgodna i nie wymaga migracji; istniejące projekty zachowują JSON.
Status kompletności nie jest zatwierdzeniem konstrukcyjnym. Łuki, haki, zakłady, wielosegmentowa geometria,
rzeczywiste strzemiona, połączenia wieloodcinkowe, powierzchniowe siatki, model 3D, eksport dokumentacji
oraz walidacja normowa pozostają poza obecnym zakresem i nie są zastępowane szacunkami.

## ADR-039: Ciągi hostów, szablony i zachowanie ręcznego zbrojenia

**Kontekst:** Rzut fundamentów może dzielić logicznie ciągłą ławę lub belkę na wiele encji przy węzłach.
Moduł zbrojenia musi pozwalać prowadzić pręty przez wybrane odcinki, ale nie może zmieniać rzutu ani samodzielnie
rozstrzygać przebiegu głównego w węzłach T/X. Ponowna konfiguracja podobnych elementów wymaga też trwałych
szablonów, a zmiana geometrii źródłowej nie może niszczyć ręcznej pracy.

**Decyzja:** Dokument CAD przechowuje opcjonalne `reinforcementChains` z uporządkowanymi ID źródłowych hostów,
jawnie wybranym ciągiem głównym, fingerprintem geometrii i statusem weryfikacji. Łączenie i rozdzielanie zmienia
wyłącznie metadane zbrojenia. Węzły rozgałęzione wymagają decyzji użytkownika. Zmiana źródła porównuje fingerprint
i oznacza układ jako wymagający sprawdzenia zamiast transformować pręty.

`reinforcementTemplates` są częścią tego samego dokumentu. Przechowują względną geometrię prętów, a zastosowanie
do liniowego hosta wykonuje kontrolowaną translację i obrót do jego osi. Każda nowa encja otrzymuje własne ID.

**Konsekwencje:** Źródłowy rzut pozostaje niezmienny, starsze dokumenty są zgodne dzięki opcjonalnym polom,
a autosave i historia obejmują ciągi oraz szablony. Szablon nie jest rozwiązaniem zatwierdzonym konstrukcyjnie;
konflikty geometrii i stan po zmianie źródła muszą zostać zweryfikowane przez użytkownika.

## ADR-040: Walidacja ostrzegawcza i lekki interaktywny podgląd 3D

**Kontekst:** Edytor wymaga natychmiastowej informacji o oczywistych konfliktach i przestrzennego podglądu,
ale aplikacja nie ma danych ani zweryfikowanych procedur wystarczających do deklarowania zgodności normowej
lub nośności. Pełny silnik bryłowy zwiększyłby zakres i koszt bez rozwiązania problemu obliczeń konstrukcyjnych.

**Decyzja:** Walidacja domenowa zgłasza jawne ostrzeżenia dla brakującego materiału, położenia względem otuliny,
przecięć osi w 2D dla tej samej warstwy i hosta, podejrzanie małego promienia gięcia oraz nieaktualnego
fingerprintu. Nie poprawia automatycznie geometrii. Podgląd 3D jest interaktywną projekcją SVG wspólnej ścieżki
pręta, z grubością wynikającą ze średnicy, wyborem, filtrowaniem warstw, kamerą i półprzezroczystym betonem.

**Konsekwencje:** Widoki 2D, zestawienie i 3D korzystają z tych samych encji, a użytkownik widzi problemy bez
fałszywej deklaracji bezpieczeństwa. Kontrole nie zastępują analizy kolizji brył 3D, obliczeń konstrukcyjnych
ani walidacji wskazanej normy. Analityczne łuki przestrzenne i renderer WebGL/B-Rep pozostają przyszłym zakresem.

## ADR-041: Automatyczna referencja rzutu i eksport bez ciężkich zależności

**Kontekst:** Pusty rysunek zbrojenia nie powinien wymagać ręcznego duplikowania rzutu fundamentów ani ponownego
wprowadzania znanych wymiarów. Dokumentacja techniczna ma być możliwa lokalnie bez płatnych usług i bez dodawania
dużych bibliotek tylko dla podstawowych formatów.

**Decyzja:** Przy pierwszym otwarciu pustego rysunku zbrojenia aplikacja pobiera istniejący dokument rzutu
fundamentów przez dotychczasowy mechanizm kopiowania geometrii i zapisuje `derivedFrom`. Dalsze zmiany źródła
są wykrywane dla ciągów przez fingerprint, lecz nie nadpisują ręcznych prętów. Zestawienie eksportujemy jako CSV,
rysunek jako SVG lub PNG, a PDF przez systemowy dialog druku przeglądarki.

**Konsekwencje:** Użytkownik zaczyna od geometrii projektu, a źródłowy rzut nie jest modyfikowany. To wersjonowana
referencja-kopia, nie współdzielona instancja ani pełna synchronizacja dwukierunkowa. XLSX wymagałby osobnej,
zaakceptowanej zależności i pozostaje poza obecnym zakresem.

## ADR-042: Zakładka zbrojenia oddzielona od edytora CAD rzutu

**Status:** Zaakceptowany (sesja 62).

**Kontekst:** Rysunek „Detale zbrojenia i zestawienie prętów” dzielił komponent `StageCadEditor` z rzutem
fundamentów, więc pokazywał pasek narzędzi rysowania, ustawienia wymiarów i pozwalał przesuwać ściany, słupy
oraz stopy. Geometria konstrukcji jest jednak ustalana w poprzednich rysunkach, a jej przypadkowa edycja w module
zbrojenia rozjeżdżała model źródłowy. Lista elementów w formie tekstowej nie odwzorowywała też faktycznego układu
ław i belek.

**Decyzja:** Zakładka zbrojenia ma własną gałąź widoku (`cad-reinforcement-view`) bez narzędzi rysowania i bez
panelu wymiarów. Pracę organizują zakładki etapów; po wybraniu etapu nowy komponent `ReinforcementStagePlan`
rysuje wyłącznie elementy tego etapu jako klikalne obrysy. Geometria nienależąca do etapu nie jest renderowana
w ogóle — zakładka „Ławy fundamentowe” pokazuje same ławy, bez tła pozostałych encji.
Rzut jest tylko do odczytu — obsługuje jedynie pan, zoom i pinch. Kliknięcie elementu otwiera modalne sub-okno
z detalami: rysunkiem 2D (widok podłużny, przekrój poprzeczny, rzut prętów), podglądem 3D, właściwościami prętów
i strzemion oraz zestawieniem stali.

**Konsekwencje:** Model geometryczny pozostaje jedną instancją definiowaną w rzucie fundamentów; moduł zbrojenia
go konsumuje, lecz nie modyfikuje. Obok klikalnego canvasu utrzymujemy równoważną listę przycisków elementów,
aby wybór był dostępny także bez precyzyjnego wskazywania (dotyk, klawiatura, czytniki ekranu). Przechwytywanie
wskaźnika (`setPointerCapture`) włączamy dopiero po przekroczeniu progu przeciągania, ponieważ ustawione już przy
`pointerdown` przekierowywało zdarzenie `click` na całe SVG i uniemożliwiało wybór pojedynczego elementu.

## ADR-043: Jeden etapowy przepływ edycji zbrojenia

**Status:** Zaakceptowany (sesja 63).

**Kontekst:** Po wprowadzeniu zakładek etapów i sub-okna detali nadal pozostawał starszy, równoległy dialog
„Kreator zbrojenia belki / płyty”. Pozwalał tworzyć układ po współrzędnych oraz zmieniać przekrój niezależnie
od hosta. Dublował nowy edytor, omijał wybór elementu z istniejącego rzutu i pozostawiał dwie sprzeczne ścieżki UX.

**Decyzja:** Usuwamy stary kreator, jego przyciski, stan formularza, generator po współrzędnych i dedykowane style.
Jedyną ścieżką jest: etap → element na rzucie tylko do odczytu → sub-okno detali → „Edytuj pręty”. Geometria
betonu pochodzi z hosta. Nowy edytor przechowuje gatunek stali i odniesienie do rysunku bez korzystania z pól
usuniętego formularza.

**Konsekwencje:** Nie można już tworzyć zbrojenia oderwanego od rozpoznanego elementu konstrukcyjnego. Brak hosta
jest sygnalizowany komunikatem o konieczności uzupełnienia rzutu źródłowego. Istniejące zapisane encje zbrojenia
pozostają zgodne i edytowalne; usunięto wyłącznie starszy interfejs ich tworzenia.

## ADR-044: Oddzielne rysunki ław i ścian z wieńcem górnym

**Status:** Zaakceptowany (sesja 64).

**Kontekst:** Ławy i ściany fundamentowe były klasyfikowane do jednego etapu, przez co ich współliniowe obrysy
nakładały się na canvasie. Dla murowanych ścian fundamentowych brakowało też jawnego modelu wieńca na górze.
Wieniec nie może być utożsamiany ani z ławą, ani z samą ścianą, ponieważ ma własny przekrój i zbrojenie.

**Decyzja:** Etapy „Ławy fundamentowe” i „Ściany fundamentowe i wieńce górne” są oddzielnymi rysunkami.
W drugim etapie ściana z bloczków/pustaków wymaga konfiguracji wieńca. Wieniec jest osobną encją liniową
`construction-line` o roli `ring-beam`, powiązaną ze źródłową ścianą przez `relatedTo`. Jego szerokość dziedziczy
znaną szerokość ściany; wysokość, materiał i numer rysunku pozostają wymaganymi danymi projektowymi.

**Konsekwencje:** Rzut nie ma już nakładających się klikalnych ław i ścian w jednym etapie. Zbrojenie wieńca
ma własny host, zestawienie i status. System wykrywa brak konfiguracji, ale nie dobiera wymiarów, betonu,
prętów ani strzemion i nie zastępuje weryfikacji uprawnionego projektanta.

## ADR-045: Trzy rysunki fundamentowe i jawna decyzja o wieńcu

**Status:** Zaakceptowany (sesja 65); zastępuje organizację etapów z ADR-044.

**Kontekst:** Umieszczenie murowanej ściany i jej wieńca na jednym rysunku nadal łączyło dwa różne elementy
konstrukcyjne. Rozpoznawanie obowiązku wieńca po tekście materiału było niepewne i mogło zastępować informację
z projektu konstrukcyjnego.

**Decyzja:** Ławy, ściany fundamentowe i wieńce fundamentowe mają trzy osobne rysunki etapowe. Ankieta
„Materiały i technologia” zawiera pytanie „Wieniec górny na ścianach fundamentowych” z odpowiedziami „Tak”,
„Nie”, „Zgodnie z projektem” i „Nie dotyczy”. Odpowiedzi „Tak” i „Zgodnie z projektem” udostępniają konfigurację,
brak odpowiedzi wymaga weryfikacji i blokuje zapis, a „Nie” oraz „Nie dotyczy” ukrywają pusty etap. Już zapisane
wieńce pozostają widoczne z ostrzeżeniem o konflikcie, aby zmiana ankiety nie usuwała danych.

**Konsekwencje:** Wieniec nadal jest osobnym hostem powiązanym ze ścianą. Nie wnioskujemy rozwiązania
konstrukcyjnego z materiału i nie wymyślamy wymiarów, betonu ani zbrojenia. Starsze dane technologii są zgodne
ze schematem dzięki wartości `null`, ale przy kolejnej edycji pełnego formularza użytkownik musi odpowiedzieć.

## ADR-046: Logiczne belki współliniowe i wymiary ograniczone do etapu

**Status:** Zaakceptowany (sesja 65).

**Kontekst:** Węzeł T dzieli źródłową ścianę i jej ławę na segmenty techniczne. Prostokątny obwód przecięty
jedną ścianą środkową ma przez to siedem encji, chociaż na rysunku zbrojenia powinien przedstawiać pięć prostych
elementów: górny, dolny, lewy, prawy i środkowy. Jednocześnie canvas etapu potrzebuje wymiarów, ale nie wymiarów
ścian, słupów ani innych etapów.

**Decyzja:** Rzut zbrojenia grupuje połączone współliniowe hosty w jeden logiczny element bez modyfikowania encji
źródłowych. Kryterium wymaga wspólnego końca i zgodnego kierunku; narożniki, łamane i krzywizny pozostają
oddzielne. Dla aktywnego etapu tworzymy odfiltrowany dokument wymiarowy zawierający wyłącznie jego hosty
i renderujemy istniejącym mechanizmem `CadPlanDimensions`.

**Konsekwencje:** Przykład 7 segmentów daje 5 klikalnych belek, a sub-okno sumuje długości i pokazuje zbrojenie
wszystkich segmentów logicznego elementu. Ręczne ciągi pozostają potrzebne dla tras L i rozgałęzień. Wymiary
dziedziczą jednostki i reguły rozmieszczania z głównego modelu CAD, lecz identyfikatory ich encji zawsze należą
do bieżącego etapu.

## ADR-047: Obrys budynku jako nieklikalny kontekst dla stóp i słupów

**Status:** Zaakceptowany (sesja 66).

**Kontekst:** Etapy stóp fundamentowych oraz słupów potrzebują odniesienia do położenia budynku, ale ławy
i fundamenty nie są w tych etapach edytowanymi hostami zbrojenia. Pokazywanie ich jako zwykłych elementów
dodawałoby niepotrzebne kliknięcia i wymiary.

**Decyzja:** Na canvasach etapów „Stopy fundamentowe” oraz „Słupy i trzpienie żelbetowe” renderujemy ławy
oraz ściany fundamentowe jako szary, przerywany obrys pomocniczy. Warstwa ma `pointer-events: none`, nie jest
dodawana do listy elementów, nie ma statusu zbrojenia i nie trafia do dokumentu wymiarów. Kliknięcia pozostają
obsługiwane wyłącznie przez aktywne hosty stóp lub słupów.

**Konsekwencje:** Użytkownik widzi kontekst budynku bez ryzyka otwarcia niewłaściwego sub-okna i bez mieszania
wymiarów fundamentów z wymiarami aktywnego etapu. Źródłowa geometria pozostaje tylko do odczytu.

## ADR-048: Wieńce fundamentowe korzystają z logicznych ciągów współliniowych

**Status:** Zaakceptowany (sesja 67).

**Kontekst:** Etap wieńców używa ścian fundamentowych jako selektorów. Wyjątek pozostawiający każdy segment
ściany jako osobny selektor powodował, że prosty wieniec rozcięty węzłem T/X był przedstawiany jako kilka belek,
chociaż ławy i pozostałe belki były już grupowane.

**Decyzja:** Usuwamy wyjątek dla wieńców fundamentowych. Selektory ścian są grupowane przez tę samą funkcję
geometrii współliniowej co ławy i belki. Zapis konfiguracji aktualizuje lub tworzy host `ring-beam` dla każdego
źródłowego segmentu logicznego ciągu. Sub-okno agreguje wszystkie hosty, pręty, długości i statusy tego ciągu.
Narożniki, łamane i krzywizny nadal pozostają osobnymi wieńcami.

**Konsekwencje:** Rysunek ścian i rysunek wieńców mają tę samą liczbę logicznych prostych ciągów. Relacja
`ring-beam` → ściana pozostaje jednoznaczna i źródłowe segmenty nie są modyfikowane, ale użytkownik pracuje
z całym prostym wieńcem jako jedną belką.

## ADR-049: Krawędziowe wymiary stóp i słupów oraz proste łańcuchy współliniowe

**Status:** Zaakceptowany (sesja 68).

**Kontekst:** Etapy stóp i słupów miały obrys budynku jako kontekst, ale wymiarowanie nie korzystało z niego.
Słupy były lokalizowane osiami, podczas gdy wymagany zapis wykonawczy to: ściana → początek podpory → koniec
podpory → następna ściana. Techniczne podziały prostego, także ukośnego odcinka dodawały ponadto zbędne kreski.

**Decyzja:** Dla stóp i słupów generujemy wyłącznie łańcuchy `supports:pad:*` albo `supports:column:*` z dokumentu
obliczeniowego zawierającego aktywne podpory oraz nieklikalny obrys fundamentów. Obie role używają krawędzi
prostokąta, nie osi. Krótki segment szerokości podpory może mieć proporcjonalnie mniejszy tekst, ale linia bazowa
pozostaje prosta. Przed generowaniem zwykłych wymiarów scalamy połączone, współliniowe pasma tej samej rodziny
i szerokości wyłącznie na potrzeby prezentacji wymiarowej. Zmiana kierunku nie jest scalana.

**Konsekwencje:** Obrys fundamentów wyznacza początek i koniec łańcucha, ale nie dostaje własnych wymiarów
w etapach podpór. T/X nie tworzy kreski pośrodku prostego przebiegu, także ukośnego. Geometria encji i relacje
pozostają bez zmian; uproszczenie dotyczy tylko żądania wymiarowego.

## ADR-050: Osiowe, kompletne rodziny stacji wymiarowych

**Status:** Zaakceptowany (sesja 69).

**Kontekst:** Scalanie wyłącznie współliniowych pasm nadal pozostawiało ukośne bazy przy lekko przekrzywionych
ścianach, a rodzina nie powstawała, gdy algorytm nie znalazł co najmniej dwóch połączonych przedziałów. Renderer
dodatkowo obracał kreski końcowe o 45 stopni względem bazy. Skutkiem były rozdzielone linie oraz brakujące
przedziały, np. niepełny zapis zamiast `80–400–80–400–80`.

**Decyzja:** Dla każdej widocznej rodziny pasm generujemy jedną kompletną rodzinę poziomych stacji X i jedną
pionowych stacji Y. Stacje pochodzą z krawędzi pasm prostopadłych oraz końców osi pasm w kierunku rodziny, są
sortowane i deduplikowane, a wymiar powstaje między każdą sąsiednią parą. Ten sam renderer osiowo normalizuje
zwykłe wymiary i łańcuchy podpór. Baza pozioma ma wyłącznie pionowe kreski, baza pionowa wyłącznie poziome.
Rzeczywiste punkty geometrii zachowujemy jako początki prostopadłych linii pomocniczych.

**Konsekwencje:** Rzut fundamentów, etapowe canvasy zbrojenia i plan pomocniczy przekrojów mają tę samą regułę
prezentacji. Techniczny podział, T/X lub niewielkie przekrzywienie nie obracają linii wymiarowej i nie usuwają
żadnego przedziału. Geometria projektu nie jest prostowana ani modyfikowana; zmienia się wyłącznie prezentacja.

## ADR-051: Porównywanie przeciwległych profili wymiarowych

**Status:** Zaakceptowany (sesja 70).

**Kontekst:** Jedna globalna rodzina stacji usuwała duplikaty prostokątnego obrysu, ale przy załamaniu tylko jednej
strony przenosiła jej stacje również na stronę przeciwną. Próba pokazania wszystkich grubości na jednej linii
powodowała chaos, a identyczne przeciwległe strony niepotrzebnie powtarzały te same wymiary.

**Decyzja:** Dla każdej osi obliczamy osobno profil strony początkowej i końcowej. Element przechodzący przez
środek obrysu może zasilać oba profile; pozostałe elementy trafiają na stronę wynikającą z ich położenia.
Porównujemy kompletne, uporządkowane stacje z tolerancją 1 mm. Profile identyczne są prezentowane tylko po stronie
końcowej. Każda różnica powoduje pokazanie obu niezależnych łańcuchów wraz z ich własnymi wymiarami całkowitymi.

**Konsekwencje:** Prosty prostokąt pozostaje opisany oszczędnie. Obrys z krzywą, załamaniem, niesymetrycznym
odgałęzieniem albo różnymi długościami stron dostaje osobne wymiary tam, gdzie rzeczywiście się różni. Żaden
łańcuch nie przejmuje stacji należących wyłącznie do strony przeciwnej.

## ADR-052: Nominalne szerokości pasm na przecięciach osiowych

**Status:** Zaakceptowany (sesja 71).

**Kontekst:** Obrys osiowo wyrównanego prostokąta ściany ukośnej ma inną szerokość niż rzeczywista grubość pasa.
Użycie jego krawędzi jako stacji prowadziło do sztucznych wartości, np. `0,9 cm` dla ściany o zapisanej grubości
`1 cm`. Końce kolejnych segmentów ściany tworzyły ponadto niepotrzebne podwymiary.

**Decyzja:** Położenie pasa na konkretnej stronie obliczamy przez przecięcie jego osi z osią tej strony. Wokół
punktu przecięcia odkładamy połowę zapisanej grubości nominalnej po obu stronach. Stacjami są wyłącznie krawędzie
tak zdefiniowanych pasm oraz skraje profilu; końce ścian równoległych i techniczne punkty podziału nie tworzą
osobnych stacji. Renderer używa zapisanej etykiety nominalnej dla przedziału należącego do ściany.

**Konsekwencje:** Ukośność i przesunięcie zmieniają położenie pasa oraz rzeczywiste przerwy, ale nigdy jego
zadeklarowaną grubość. Łańcuch zawiera tylko grubości ścian i odległości między nimi, np. `1–5–1` po jednej stronie
i `1–3–1` po stronie przesuniętej, bez dodatkowych wymiarów punktów pośrednich.

## ADR-053: Kompletne profile bez osobnego wymiaru całkowitego

**Status:** Zaakceptowany (sesja 72).

**Kontekst:** Ograniczenie ściany poprzecznej do profilu, którego globalnej krawędzi faktycznie dotykała jej oś,
usuwało grubość ściany po jej przesunięciu. Osobna linia wymiaru całkowitego powtarzała równocześnie sumę
łańcucha i była odbierana jako drugi, niekompletny zestaw.

**Decyzja:** Każdy poprzeczny pas zasila oba porównywane profile. Jeśli oś nie przecina pozycji strony, stosujemy
najbliższy koniec osi do ustalenia położenia, zachowując pełną szerokość nominalną pasa. Deduplikacja następuje
dopiero po zbudowaniu kompletnych sekwencji obu stron. Dla rodziny z kompletnym łańcuchem nie generujemy
dodatkowej linii wymiaru całkowitego.

**Konsekwencje:** Przesunięta ściana nie może zgubić swojej grubości, identyczna strona przeciwna nie jest
powtarzana, a użytkownik widzi wyłącznie pełne sekwencje `grubość–odległość–grubość...`, bez drugiej linii
z sumą tych samych wartości.

## ADR-054: Ściany wewnętrzne wymiarowane wewnątrz rzutu

**Status:** Zaakceptowany (sesja 73).

**Kontekst:** Ściana poprzeczna należąca do dwóch pomieszczeń była traktowana jak kolejna ściana obwodowa.
Jej grubość dzieliła przeciwległe zewnętrzne łańcuchy na małe, nieczytelne wartości, mimo że użytkownik potrzebuje
tam wyłącznie wymiarów obrysu. Pominięcie ściany całkowicie usuwałoby jednak informację o jej długości i grubości.

**Decyzja:** Liczymy wystąpienia identyfikatorów ścian w wykrytych zamkniętych polach. Element należący do więcej
niż jednego pola jest wewnętrzny; reguła przechodzi również na powiązane ławy i inne pasma przez `supportFor`
lub `relatedTo`. Takie elementy wyłączamy z profili obwodowych. W zamian generujemy przy ich osi osobny,
wewnętrzny łańcuch długości oraz lokalny wymiar nominalnej grubości.

**Konsekwencje:** Zewnętrzne boki pozostają pełnymi i prostymi łańcuchami bez stacji ściany środkowej. Informacja
o ścianie poprzecznej nie ginie, lecz jest pokazana w miejscu, którego dotyczy, wewnątrz rzutu. Wymiary wewnętrzne
mogą celowo znajdować się w obrysie konstrukcji, podczas gdy wymiary zewnętrzne nadal unikają brył.

## ADR-055: Biblioteka kształtów zbrojenia jest zasobem użytkownika

**Status:** Zaakceptowany (sesja 74).

**Kontekst:** Podgięcia i strzemiona mają być przygotowywane raz i używane w różnych elementach oraz projektach
danego użytkownika. Istniejące `reinforcementTemplates` należą do dokumentu CAD i przechowują całe układy prętów,
więc nie są właściwym miejscem dla osobistej minibazy pojedynczych kształtów.

**Decyzja:** Kształty zapisujemy w osobnej tabeli `reinforcement_shape_templates` identyfikowanej przez
`(user_id, id)`, z politykami RLS ograniczającymi odczyt i zapis do właściciela. Wspólny schemat przechowuje
kategorię, nazwę oraz uniwersalną geometrię `ReinforcementShape`. Tryb demonstracyjny używa osobnego klucza
`localStorage`, a podglądy 2D i 3D korzystają z tego samego silnika `reinforcementPath3d`.

**Konsekwencje:** Biblioteka nie duplikuje szablonów projektowych i może działać między projektami jednego konta.
Pierwszy krok kreatora dotyczy wyłącznie geometrii kształtu; średnica, stal, otulina i odniesienie projektowe są
uzupełniane po zastosowaniu kształtu do konkretnego pręta. Walidacja techniczna ostrzega, ale zapis kształtu nie
stanowi zatwierdzenia konstrukcyjnego.

## ADR-056 — Wymiarowany podgląd 2D kształtu zbrojenia

**Status:** Zaakceptowana.

**Kontekst:** Kreator podgięć i strzemion pokazywał sam przebieg osi pręta. Użytkownik nie mógł odczytać z rysunku
długości poszczególnych części ani kątów gięcia, a konwencja graficzna różniła się od wymiarowania rzutów.

**Decyzja:** Podgląd 2D rysuje łańcuchy wymiarowe w tej samej konwencji co canvasy rzutu — linia pomocnicza,
prostopadła kreska stacji, linia bazowa i etykieta na białym tle odsunięta od mierzonej krawędzi. Linie wymiarowe
są odsuwane na zewnątrz kształtu względem środka ciężkości punktów, a tekst jest obracany wzdłuż odcinka i
odwracany o 180°, gdy wypadłby do góry nogami. Kąty gięcia różne od 0° są opisywane łukiem między kierunkami
sąsiednich odcinków, z etykietą na dwusiecznej. Wariant `compact` kafelków biblioteki rysuje te same wymiary
i kąty, ale z własnym, mniejszym zestawem proporcji (`font`, `offset`, `tick`, `labelGap`, `arc`) i cieńszym
prętem. Łańcuchy wymiarowe rysowane są nad prętem, aby etykieta krótkiego odcinka nie znikała pod jego linią.

**Konsekwencje:** Rysunek kształtu jest czytelny bez otwierania tabeli danych i spójny wizualnie z rzutami,
a kafelek biblioteki pozwala rozpoznać kształt bez wchodzenia w szczegóły. Proporcje rysunku muszą pozostać
sparametryzowane — wpisanie ich na sztywno rozjechałoby jeden z dwóch rozmiarów podglądu.
Definicje `pattern` i `linearGradient` muszą pochodzić z `useId`, ponieważ na stronie działa wiele podglądów
jednocześnie. Testy przeglądarkowe muszą wskazywać oś pręta selektorem `path.reinforcement-shape-bar`, bo SVG
zawiera teraz wiele ścieżek. Wymiary opisują geometrię zadeklarowaną przez użytkownika i nie stanowią
zatwierdzenia konstrukcyjnego.

## ADR-057 — Orientacja całego kształtu niezależna od gięć

**Status:** Zaakceptowana.

**Kontekst:** Kąty zapisane przy częściach opisują gięcia pomiędzy kolejnymi odcinkami, ale nie pozwalają obrócić
gotowego podgięcia lub strzemienia jako całości. Modyfikowanie pierwszego gięcia w celu zmiany orientacji
zmieniałoby kształt zamiast jego położenia.

**Decyzja:** `ReinforcementShape` otrzymuje opcjonalne `rotationDegrees` w zakresie od −360° do 360°.
`reinforcementPath3d` używa tej wartości jako początkowego kierunku dla części płaskich i dodaje ją do azymutu
części przestrzennych. Kreator udostępnia szybkie obroty o ±90° i 180°, reset oraz dokładne pole liczbowe.
Brak pola w starszych danych oznacza 0°. Wstawianie pominiętych części pozostaje osobną operacją na kolejności
segmentów i nie modyfikuje orientacji.

**Konsekwencje:** Orientacja jest trwałą częścią kształtu i jest jednakowa w bibliotece, podglądach 2D/3D oraz
utworzonym pręcie. Nie wpływa na długości części, kąty gięcia, promienie ani długość rozwiniętą. Obrót jest
transformacją wokół początku pręta; po przypisaniu do konkretnego elementu nadal podlega kontroli położenia,
otuliny i kolizji.

## ADR-058 — Średnica drutu jako część kształtu, a promień gięcia jako jej pochodna

**Status:** Zaakceptowana.

**Kontekst:** Kreator podgięć i strzemion opisywał wyłącznie długości części i kąty. Kształt „strzemię 30×50”
nie niósł informacji, z jakiego drutu ma być wykonany, a promień roboczy gięcia był stałą 20 mm wpisaną
na sztywno, niezależną od średnicy. Kolumna `shape` w `reinforcement_shape_templates` jest typu `jsonb`
i waliduje wyłącznie tablicę `bends`.

**Decyzja:** `ReinforcementShape` otrzymuje opcjonalne `diameterMm` (0–100 mm). Dzięki temu średnica jest
zapisywana razem z geometrią, bez migracji bazy i bez zmian w trasie API. Promień gięcia nie jest już stałą:
wynika z minimalnej średnicy trzpienia gnącego — 2Ø dla Ø ≤ 16 mm i 3,5Ø powyżej — i nie schodzi poniżej 20 mm.
Obliczona wartość jest pokazywana wprost w kreatorze i w szczegółach kształtu. Grubość drutu rysowanego w 2D
i 3D jest proporcjonalna do średnicy, z ograniczeniem od góry i od dołu, aby rysunek pozostał czytelny.
Brak pola w starszych danych oznacza Ø12 wyłącznie na potrzeby rysunku; szczegóły kształtu pokazują wtedy
„nie podano”.

**Konsekwencje:** Kształt biblioteczny jest kompletną definicją wyrobu, a nie samą łamaną. Średnica przechodzi
do pola Ø edytora pręta, więc nie trzeba wpisywać jej dwa razy. Długość rozwinięta zależy teraz od średnicy,
ponieważ promień łuku wchodzi do obliczeń — to zamierzone i bliższe rzeczywistości niż stałe 20 mm. Wartość
promienia jest minimum technologicznym, a nie zatwierdzeniem konstrukcyjnym; dobór pozostaje po stronie
uprawnionego projektanta.

## ADR-059 — Oś pręta bez znaczników punktowych i odsuwanie kolidujących opisów

**Status:** Zaakceptowana.

**Kontekst:** Podgląd kształtu rysował białe kropki na początku i końcu osi pręta. Na miniaturach zasłaniały
one etykiety wymiarowe, a po usunięciu samego znacznika końcowego drut wyglądał na ucięty, bo jeden koniec
miał kropkę, a drugi nie. Osobnym problemem było nakładanie się opisu krótkiego haka na opis długiego boku
strzemienia.

**Decyzja:** Oś pręta nie ma żadnych znaczników punktowych. Jest rysowana jednolitą linią z zaokrąglonymi
zakończeniami, identycznie na obu końcach, więc nic nie sugeruje ucięcia ani nie przykrywa wymiarów. Znaczniki
gięcia pozostają jako małe punkty przy łukach kątowych, ponieważ należą do warstwy opisowej, a nie do pręta.
Łańcuchy wymiarowe są układane kolejno; jeżeli etykieta nachodziłaby na wcześniej umieszczoną, cały jej łańcuch
jest odsuwany o jeden krok na zewnątrz. Margines wewnętrzny rysunku jest dobrany tak, aby odsunięta etykieta
nadal mieściła się w `viewBox`.

**Konsekwencje:** Rysunek jest czytelny również na miniaturze kafelka. Odsuwanie wykonuje jeden krok, więc
przy kilku bardzo krótkich odcinkach w jednym narożniku opisy mogą pozostać ciasne — wtedy pełny podgląd
jest dostępny po kliknięciu kafelka. Testy przeglądarkowe sprawdzają, że liczba elementów
`.reinforcement-shape-node` wynosi zero w obu rozmiarach podglądu.

## ADR-060 — Konstruktor belki jako konfiguracja hostów istniejącego rzutu

**Status:** Zaakceptowana.

**Kontekst:** Prosty formularz liczby prętów nie pozwalał definiować kilku stref strzemion, lokalnych zagęszczeń
ani pakietów. Jednocześnie przywrócenie niezależnego kreatora belki po własnych współrzędnych stworzyłoby drugi
model geometrii, sprzeczny z zasadą jednego rzutu CAD. Logiczna belka może składać się z kilku współliniowych
segmentów rozdzielonych technicznie węzłami T/X.

**Decyzja:** Konfiguracja `ReinforcementBeamAssembly` jest opcjonalną częścią dokumentu CAD i przechowuje
identyfikatory hostów, wymiary odczytane z rzutu oraz uporządkowane strefy strzemion. Każda strefa wskazuje
kształt z biblioteki użytkownika, rozstaw, pakiet 1–4 sztuk i dowolne podstrefy zagęszczenia. Strefy są ciągłe,
nie mogą wyjść poza dopuszczalny zakres, a wspólna stacja dwóch stref jest deduplikowana na rzecz następnej
strefy. `beamStirrupPlacements` rozwija konfigurację do fizycznych stacji, a `locateBeamHostStation` mapuje
stację całej logicznej belki na konkretny segment i lokalną odległość. Wygenerowane `rebar-line` mają
`placement.groupId` równe identyfikatorowi konfiguracji; ponowny zapis atomowo zastępuje tylko tę grupę.
Pierwsze i ostatnie strzemię są odsunięte o połowę szerokości hosta i opisane jako reguła geometryczna,
nie wymaganie normowe.

**Konsekwencje:** Długość, nazwa i przekrój belki mają jedno źródło w istniejącym rzucie, a pierwotne segmenty
nie są modyfikowane. Konfiguracja przetrwa zapis dokumentu JSON bez osobnej migracji SQL. Edytor może pokazać
rzuty front/bok i 3D oraz odtworzyć wszystkie strefy. Limit 1000 rozwiniętych strzemion chroni dokument i renderer
przed niekontrolowaną liczbą encji. Dobór rozstawu, średnicy, zagęszczeń i odsunięcia wymaga sprawdzenia przez
uprawnionego projektanta; konstruktor nie deklaruje nośności ani zgodności normowej.

## ADR-061 — Pakiet strzemion jako wspólna stacja i kierunkowy offset przekroju

**Status:** Zaakceptowana.

**Kontekst:** Pierwsza wersja `bundleCount` interpretowała odstęp pakietu jako przesunięcie stacji wzdłuż belki.
To zmieniało zadany rozstaw i nie odpowiadało znaczeniu „strzemiona obok siebie”. Pakiet ma powtarzać kilka
strzemion w tym samym miejscu osiowym, ale rozsunąć je w przekroju.

**Decyzja:** Każdy `BeamStirrupPlacement` przechowuje wspólną `stationMm`, indeks pakietu oraz dwa offsety:
poprzeczny i pionowy. Pierwszy egzemplarz ma offset 0, a kolejne `index × bundleGapMm`. `bundleDirection`
wybiera znak i oś: `left`/`right` dla osi poprzecznej oraz `up`/`down` dla pionowej. Pole jest opcjonalne dla
zgodności ze starszymi dokumentami; jego brak oznacza `right`. Deduplikacja styku stref zastępuje cały pakiet
poprzedniej strefy pakietem następnej, ale nie usuwa egzemplarzy mających tę samą stację wewnątrz jednego pakietu.
Interfejs przelicza milimetry modelu na centymetry, nie zmieniając jednostki bazowej CAD.

**Konsekwencje:** Rozstaw wzdłuż belki jest niezależny od liczby strzemion obok siebie. Te same dane sterują
rzutem frontowym, przekrojem i podglądem 3D. Starsze konfiguracje pozostają poprawne. Podany odstęp jest odległością
osiową pomiędzy kolejnymi egzemplarzami, a nie automatycznie wyliczonym stykiem boków; jego dobór pozostaje decyzją
projektanta.

## ADR-062 — Rzut przekroju rysuje rzeczywisty obrys strzemienia, a wystawanie wymaga decyzji użytkownika

**Status:** przyjęta.

**Kontekst:** Rzut boczny konstruktora belek rysował strzemię jako prostokąt o wymiarach 80% przekroju betonu.
Kształt z biblioteki nie miał więc żadnego wpływu na rysunek: strzemię 50 × 50 cm pokazywało się jako 40 cm.
Brakowało też reakcji na przypadek, w którym wybrany kształt jest wyższy niż wysokość zalewanego etapu.

**Decyzja:** Rzut przekroju rysuje strzemię z rzeczywistego obrysu kształtu, wyliczanego przez czystą funkcję
domenową `reinforcementShapeOutline`. Funkcja rzutuje ścieżkę 3D na płaszczyznę o największym rozpiętości
i zwraca punkty znormalizowane do narożnika wraz z rzeczywistą szerokością i wysokością w milimetrach.
Ta sama funkcja zasila podgląd kształtu, więc rzutowanie ma jedno źródło. Skala rysunku jest wspólna dla betonu
i zbrojenia, a kadr przekroju obejmuje również elementy wychodzące poza beton. Jeżeli wysokość obrysu przekracza
wysokość elementu, strefa nie powstaje automatycznie: użytkownik dostaje ostrzeżenie z obiema wysokościami
i wielkością wystawania oraz wybiera „Wybierz inne” albo „Potwierdź”. Potwierdzenie zapisuje `oversizeAccepted`
w strefie i ustawia status belki na „do weryfikacji”.

**Konsekwencje:** Rysunek odpowiada danym z biblioteki, a błędny dobór kształtu jest widoczny zamiast być
ukryty przez umowny prostokąt. Flaga akceptacji jest opcjonalna, więc starsze dokumenty pozostają poprawne.
Akceptacja opisuje wyłącznie geometrię: nie jest potwierdzeniem otulenia ani nośności i nie zastępuje
sprawdzenia przez uprawnionego projektanta.

## ADR-063 — Pakiet ma identyfikowalne wymiary, a każdy podgląd rozdziela nawigację od geometrii

**Status:** przyjęta.

**Kontekst:** Kilka przesuniętych strzemion było widocznych na przekroju, ale tylko pierwszy egzemplarz miał
wymiary, a wszystkie obrysy miały ten sam kolor. Opis betonu nie istniał. Rzut frontowy nie miał nawigacji,
a model 3D łączył przeciąganie wyłącznie z obrotem, mimo że użytkownik potrzebuje także przesuwania.
Ostrzeżenie o strzemieniu wyższym od betonu zajmowało miejsce wewnątrz formularza zamiast być osobną decyzją.

**Decyzja:** Indeks egzemplarza pakietu `bundleIndex` wybiera stały kolor z czteroelementowej palety. Każdy
unikalny egzemplarz w przekroju otrzymuje własny obrys oraz dwa odsunięte łańcuchy wymiarowe opisane numerem
`S1`–`S4`; kolor obrysu, linii i tekstu jest wspólny. Margines kadru rośnie wraz z liczbą prezentowanych
egzemplarzy. Beton jest identyfikowany przez etykietę z linią prowadzącą umieszczoną poza zbrojeniem.
Rzuty 2D używają wspólnego modelu nawigacji: zoom zmienia `viewBox`, pan przesuwa jego początek, a reset
przywraca bazowy kadr. Model 3D zachowuje obrót jako domyślny tryb i dodaje jawny tryb pan; zoom oraz przesunięcie
obejmują stal i półprzezroczystą bryłę betonu. Decyzja o zaakceptowaniu strzemienia wystającego ponad beton
odbywa się w modalnym `dialog`, którego nie można przypadkowo zamknąć klawiszem Escape.

**Konsekwencje:** Pakiety są jednoznaczne także przy nakładających się kształtach, a użytkownik może powiązać
każdy wymiar z konkretnym egzemplarzem. Opisy materiału nie zasłaniają zbrojenia. Sterowanie frontem, przekrojem
i modelem 3D jest przewidywalne, natomiast wybór geometrycznie za wysokiego strzemienia pozostaje świadomą,
rejestrowaną decyzją wymagającą późniejszej weryfikacji konstrukcyjnej.

## ADR-064 — Standardowe druty są jedną konfiguracją czterech narożnych prętów belki

**Status:** przyjęta.

**Kontekst:** Stała paleta średnic tworząca po jednym niezależnym pręcie nie odpowiada żądanemu przepływowi.
Standardowy układ ma powstać jednym przyciskiem, wykorzystywać geometrię istniejących strzemion, być edytowany
jako kafelek i znikać jako całość. Przebiegi niestandardowe używają odrębnego edytora i nie zmieniają tej
atomowej konfiguracji.

**Decyzja:** `ReinforcementBeamAssembly` przechowuje opcjonalną konfigurację `standardMainBars` z jedną średnicą.
Konfiguracja jest dozwolona tylko przy co najmniej jednej strefie strzemion. Funkcja domenowa rzutuje wszystkie
kształty strzemion, wybiera dodatni obrys o najmniejszym polu (przy remisie o najmniejszym obwodzie) i zwraca
cztery narożniki jego prostokąta ograniczającego. Środek pręta jest odsuwany od osi każdego narożnika do wnętrza
o `(Ø strzemienia + Ø drutu) / 2`, aby okrąg pręta był styczny do wewnętrznych ramion strzemienia. Przekrój,
kafelek i model 3D korzystają z czterech offsetów. Front 2D redukuje pary o tej samej wysokości do dwóch linii
projekcyjnych, ponieważ lewy i prawy pręt nakładają się w tym widoku. Zapis tworzy cztery proste pręty na każdy
segment hosta, zachowuje wspólny `groupId` konfiguracji i rozdziela je na warstwy górną oraz dolną. Usunięcie
konfiguracji albo ostatniej strefy usuwa układ. Organizację wspólnej sekcji i drutów niestandardowych określa
ADR-065.

**Konsekwencje:** Średnica i obecność całego układu są trwałe i atomowe, a geometria automatycznie reaguje
na najmniejsze strzemię bez tworzenia niezależnego modelu przekroju. Cztery pręty trafiają do zestawienia jako
fizyczne encje. Dobór średnicy, otulenia i nośności nadal wymaga weryfikacji przez uprawnionego projektanta.

## ADR-065 — Druty standardowe i niestandardowe korzystają z jednej sekcji kafelkowej

**Status:** przyjęta.

**Kontekst:** Dawny formularz „Pręty podłużne i indywidualne” był stale wyświetlany pod Konstruktorem belek,
podczas gdy standardowe druty miały osobny przycisk nad nieaktywnym kafelkiem `+`. Rozdzielało to dwie odmiany
tej samej operacji i nie pozwalało rozpocząć dodawania niestandardowego przebiegu bez opuszczania głównego UI.

**Decyzja:** Sekcja „2. Druty główne” jest jedynym punktem wejścia dla obu odmian. W jednej responsywnej siatce
renderuje warunkowy kafelek dodawania standardowego układu oraz zawsze aktywny kafelek `+` dla drutu
niestandardowego. Standardowy kafelek po użyciu zastępuje się konfiguracją czterech prętów. Kafelek
niestandardowy otwiera modal korzystający z istniejących stanów i funkcji tworzenia ręcznego pręta. Wybór
kształtu w bibliotece otwiera ten sam modal z wczytanymi danymi, a udany zapis go zamyka. Formularz inline
został usunięty, lecz domenowy sposób tworzenia encji pozostał bez zmian.

**Konsekwencje:** Użytkownik widzi obie drogi dodawania obok siebie, standardowy przycisk znika zgodnie ze stanem
konfiguracji, a niestandardowy przebieg jest dostępny bez stałego zajmowania miejsca pod konstruktorem. Modal
można rozwijać o dokładne pozycjonowanie pręta bez komplikowania podstawowego widoku belki.

## ADR-066 — Strzemię opasuje drut, a grubości są rzeczywiste w milimetrach

**Status:** przyjęta.

**Kontekst:** Druty narożne były poprawnie wyliczane w domenie, ale renderowane niezgodnie z geometrią. Model 3D
dodawał do jawnego `offset.z` narożnika domyślną wysokość warstwy (`rebar-top` / `rebar-bottom`), więc pręty były
przesuwane dwukrotnie i wychodziły poza strzemię. Obrys strzemienia w 3D zaczynał się w punkcie startowym ścieżki,
czyli zajmował `[0, szerokość] × [0, wysokość]`, podczas gdy pręty były rozmieszczone symetrycznie wokół zera.
W widokach 2D reguła CSS `stroke-width: 4` z `vector-effect: non-scaling-stroke` nadpisywała atrybut prezentacyjny
i wymuszała grubość w pikselach ekranu, podczas gdy promień okręgu pręta skalował się z `viewBox`. Dodatkowo pręty
w przekroju zakładały środek betonu, chociaż strzemię ponadwymiarowe jest tam wyrównywane do dołu.

**Decyzja:** Jawny `offset.z` wyłącza domyślną wysokość warstwy w `Reinforcement3dView`. Obrysy strzemion
w podglądzie 3D są wyśrodkowane przez pomniejszenie offsetu o połowę własnego obrysu. We wszystkich widokach
strzemiona są rysowane po prętach, co odwzorowuje montaż: pręt podłużny jest pod strzemieniem, które go opasuje.
Strzemiona mają rzeczywistą grubość swojego drutu w jednostkach użytkownika — z CSS usunięto stałą grubość
i `non-scaling-stroke`. Pręty w przekroju są kotwione w faktycznie narysowanym obrysie najmniejszego strzemienia,
a nie w geometrycznym środku betonu. Rzut frontowy realizuje hierarchię jawnymi warstwami `data-front-layer`:
wszystkie pręty podłużne trafiają do warstwy `bars`, a strzemiona do rysowanej nad nią warstwy `stirrups`,
więc przyszłe druty niestandardowe automatycznie znajdą się pod strzemionami bez zmiany kolejności JSX.
Znacznik drutu na froncie 2D jest linią poglądową o grubości `Ø / 6`, a nie odwzorowaniem przekroju: w tej
projekcji reprezentuje parę nakładających się prętów, a grubsza linia zasłaniała łańcuchy wymiarowe stref
i rozstawu. Reguła insetu w domenie pozostała bez zmian — była poprawna.

**Konsekwencje:** Rysunki są wiernym odwzorowaniem geometrii domenowej w każdej skali, a zmiana średnicy
strzemienia lub drutu natychmiast widać jako zmianę grubości i położenia. Grubość linii zależy teraz od zoomu,
co jest zamierzone dla elementów konstrukcyjnych, ale wyklucza użycie tych klas do znaczników pomocniczych.
Dobór otulenia, rozstawu i nośności nadal wymaga weryfikacji przez uprawnionego projektanta.

## ADR-067 — Standardowe druty narożne powstają w każdym strzemieniu pakietu

**Status:** przyjęta.

**Kontekst:** `beamStandardMainBarCorners` zwracało zawsze cztery narożniki wyliczone z obrysu najmniejszego
strzemienia, ignorując fakt, że strefa może stawiać strzemiona obok siebie w pakiecie. Gdy najmniejsze strzemię
było właśnie takim pakietem, drugie i kolejne strzemiona pozostawały bez prętów podłużnych, co jest niewykonalne
na budowie. Identyfikator narożnika był też nazwą pozycji (`top-left`), więc nie dało się odróżnić narożników
należących do różnych strzemion pakietu ani powiązać pręta z jego obrysem w widokach.

**Decyzja:** Dodano `beamStandardMainBarBundles`, która wyznacza rozróżnialne przesunięcia pakietu z rzeczywistych
rozmieszczeń zwracanych przez `beamStirrupPlacements`, ograniczonych do strzemion o obrysie najmniejszego.
Obejmuje to także lokalne zagęszczenia z własnym pakietem. `beamStandardMainBarCorners` generuje komplet czterech
narożników na każde przesunięcie pakietu, a `BeamMainBarCorner` ma unikalne `id`, nazwę pozycji w polu `corner`
oraz `bundleIndex`. Widoki wiążą pręt z jego strzemieniem po `bundleIndex`: przekrój i miniatura rysują osobny
obrys dla każdego pakietu, a kotwica przekroju liczy środek bazowy strzemienia bez przesunięcia pakietu, bo
przesunięcie jest już zawarte w narożniku.

**Konsekwencje:** Liczba drutów w zestawieniu odpowiada rzeczywistemu układowi — pakiet dwóch strzemion daje osiem
prętów zamiast czterech. Kafelek, przekrój i model 3D pokazują tę samą liczbę. Konsumenci `BeamMainBarCorner` muszą
używać pola `corner` zamiast porównywać `id` z nazwą pozycji. Dobór liczby i rozmieszczenia prętów nadal wymaga
weryfikacji przez uprawnionego projektanta.

## ADR-068 — Rzut frontowy przerywa drut poświatą strzemienia

**Status:** przyjęta.

**Kontekst:** Rzut frontowy belki rysował już pręty i strzemiona w osobnych warstwach, ze strzemionami nad prętami.
Mimo poprawnej kolejności malowania użytkownik nadal widział drut jako element przesłaniający strzemiona. Przyczyną
jest to, że obie linie mają `vector-effect: non-scaling-stroke` i zbliżoną grubość ekranową (strzemię 3 px, drut
`Ø / 6`), a drut biegnie przez całą długość belki. Przy kilkudziesięciu przecięciach różnica trzech pikseli nie
czyta się jako hierarchia.

**Decyzja:** Każda linia strzemienia na rzucie frontowym jest rysowana dwukrotnie: najpierw szersza poświata
w kolorze wypełnienia betonu, potem właściwa linia strzemienia. Poświata przerywa drut dokładnie w miejscu
przecięcia, więc hierarchia jest jednoznaczna niezależnie od grubości linii i poziomu przybliżenia.

**Konsekwencje:** Rzut frontowy czyta się jak rysunek warsztatowy — widać, że drut przechodzi wewnątrz strzemienia.
Poświata jest związana z kolorem tła betonu, więc zmiana wypełnienia przekroju wymaga aktualizacji obu wartości.

## ADR-069 — Krytyczna grafika rzutów nie może zależeć wyłącznie od CSS

**Status:** przyjęta.

**Kontekst:** Poświata przerywająca drut pod strzemieniem (ADR-068) była opisana wyłącznie regułą
`.beam-constructor-stirrup-halo` w `globals.css`. Reguła nie trafiła do arkusza serwowanego przez serwer
deweloperski, więc element poświaty istniał w DOM z domyślnym `stroke: none` i grubością 1 px i niczego nie
przerywał. Rzut wyglądał dokładnie tak, jakby poprawki nigdy nie było. Kontrola smoke sprawdzała wyłącznie
obecność elementu, więc raportowała PASS mimo niewidocznego efektu.

**Decyzja:** Parametry, od których zależy czytelność rysunku — kolor poświaty, jej grubość, grubość linii
strzemienia i `vector-effect` — są zapisywane wprost w atrybutach SVG. CSS odpowiada tylko za detale kosmetyczne.
Grubość poświaty jest liczona z grubości linii strzemienia i najgrubszego rysowanego drutu, więc przerwa zawsze
obejmuje cały drut, niezależnie od ustawionej średnicy. Kontrole smoke sprawdzają **wyliczony** styl i relacje
grubości, a nie samą obecność węzła.

**Konsekwencje:** Rzut zachowuje się tak samo niezależnie od stanu arkusza stylów i kolejności przeładowań.
Zmiana koloru betonu wymaga zmiany w dwóch miejscach: w wypełnieniu przekroju i w kolorze poświaty.

## ADR-070 — Pakiet strzemion ma własny wymiar łączny na rzucie bocznym

**Status:** przyjęta.

**Kontekst:** Rzut boczny wymiarował każde strzemię pakietu osobno (`S1`, `S2`). Nie dawało to informacji
o rzeczywistej przestrzeni zajmowanej przez cały pakiet, czyli o wymiarze od lica pierwszego strzemienia do lica
ostatniego, razem z przesunięciem. Bez tej wartości nie da się sprawdzić, czy pakiet mieści się w przekroju betonu.

**Decyzja:** Dla każdej strefy z więcej niż jednym strzemieniem obok siebie rysowany jest dodatkowy łańcuch
wymiarowy obejmujący obrys całego pakietu. Wymiar pojawia się wyłącznie w osi, w której pakiet faktycznie się
rozciąga: przy kierunku lewo/prawo jako szerokość, przy kierunku góra/dół jako wysokość. Dzięki temu nie dubluje
wymiaru pojedynczego strzemienia. Etykieta podaje liczbę strzemion w pakiecie.

**Konsekwencje:** Użytkownik widzi od razu, że dwa strzemiona 50 cm przesunięte o 25 cm zajmują łącznie 75 cm.
Ocena, czy taki pakiet jest dopuszczalny konstrukcyjnie, nadal wymaga uprawnionego projektanta.

## ADR-071 — Druty niestandardowe są wstawiane w sloty strzemion

**Status:** przyjęta.

**Kontekst:** Dodawanie drutów niestandardowych przez swobodny formularz pozwalało umieścić pręt w dowolnym punkcie
przekroju — także poza strzemieniem albo w miejscu zajętym przez inny drut. Przy strzemionach o różnej wysokości
(np. 30 / 50 / 30 cm) drut prowadzony „przez całą belkę” przechodziłby przez strzemiona, do których nie da się go
przywiązać.

**Decyzja:** Drut niestandardowy wybiera się jako slot na wewnętrznym licu strzemienia konkretnej strefy i pakietu:
narożnik, środek boku albo punkt co ok. 2 cm. Zapisywane są strefa, indeks strzemienia w pakiecie, bok i położenie
na boku, a pozycja jest wyliczana w `packages/domain`, więc zmiana średnicy zachowuje styczność. Slot jest zajęty,
gdy w zakresie strefy biegnie drut, z którym nowy pręt by kolidował. Zakres drutu jest ograniczony do ciągłego ciągu
stref, w których strzemię ma slot w tym samym miejscu; poza nim drut jest docinką, a użytkownik wybiera stronę
(początek albo koniec zakresu), od której ją dodaje. Model 3D w sub-oknie jest zablokowany w widoku od frontu.

**Konsekwencje:** Drut zawsze leży wewnątrz i przy strzemieniu oraz nie nachodzi na inne druty. Zakłady i długości
zakotwienia docinek nie są jeszcze wyznaczane — ich dobór i ocena konstrukcyjna wymagają uprawnionego projektanta.

## ADR-072 — Drut przez całą belkę wymaga slotu w każdym strzemieniu

**Status:** przyjęta.

**Kontekst:** Drut wybrany „przez całą belkę” był po cichu skracany do ciągłego zakresu zgodnych stref, gdy
strzemiona miały różne wysokości. Użytkownik oczekuje, że taki drut zajmuje slot w każdym strzemieniu belki.

**Decyzja:** Drut niestandardowy ma jawną flagę `fullBeam`. Domena (`beamCustomMainBarFullBeamCheck`) sprawdza, czy
każda strefa ma strzemię trzymające drut w tym samym punkcie przekroju i czy slot nie jest zajęty. Gdy reguła nie
jest spełniona, przycisk „Cała belka” jest zablokowany z podaniem powodu, a drut może być tylko docinką od
wybranej strony. Drut `fullBeam`, który przestał spełniać regułę, nie jest skracany — kafelek pokazuje błąd, a zapis
belki jest blokowany (`beamCustomMainBarIssues`).

**Konsekwencje:** Zapisany drut „cała belka” zawsze biegnie od 0 do długości belki przez wszystkie strzemiona.
Reguła dotyczy wyłącznie geometrii slotów — dobór i ocena konstrukcyjna zbrojenia wymagają uprawnionego projektanta.

## ADR-073 — Typy strzemion mają wspólne kolory, a docinki mogą mieć wypust

**Status:** przyjęta.

**Kontekst:** Przy różnych strzemionach w belce (np. 30 / 50 / 30 cm) rzut frontowy rysował wszystkie strzemiona
tym samym kolorem i na 80% wysokości betonu, a rzut boczny powtarzał ten sam kształt dla każdej strefy. Docinki
kończyły się równo z zakresem strzemion.

**Decyzja:** Typ strzemienia to kształt (szerokość × wysokość, Ø) i pozycja w pakiecie. Typ dostaje kolor
z jednej palety używanej na rzucie frontowym, bocznym, w kafelkach drutów i w sub-oknie slotów. Front rysuje
strzemię na rzeczywistą wysokość z wymiarem „S{n}”, a bok pokazuje każdy typ raz z listą stref. Drut niestandardowy
ma opcjonalne `extensionStartMm` / `extensionEndMm`; domena wydłuża docinkę poza zakres strzemion i przycina wypust
do długości belki. Drut „Cała belka” ignoruje wypust.

**Konsekwencje:** Kolory i wysokości są spójne między rzutami. Wypust zajmuje miejsce w przekroju sąsiednich stref
(uwzględniane w zajętości slotów). Dobór długości wypustu, zakładu i zakotwienia wymaga uprawnionego projektanta.

## ADR-074 — Niezależne wyrównanie strzemion i diagnostyka geometrii ciągłego pręta

**Status:** przyjęta.

**Kontekst:** Strzemiona w różnych strefach mogą mieć różne wymiary, a ich położenie musi być jawnie kontrolowane
zamiast zakładać centrowanie lub automatycznie zmieniać geometrię. Również informacja, że pręt przechodzi przez
kolejne strzemiona, wymaga sprawdzenia wspólnego pola przekroju, bez sugerowania obliczeń konstrukcyjnych.

**Decyzja:** Strefa przechowuje opcjonalne wyrównanie szerokości (środek/lewo/prawo) i wysokości
(środek/góra/dół), liczone niezależnie względem najmniejszego obrysu w danej osi. Offset wyrównania jest
sumowany z offsetem pakietu. Rzuty, przekrój, sloty, pręty standardowe i zapis CAD korzystają z jednej domenowej
geometrii położenia. Diagnostyka oznacza brak wolnego otworu strzemienia oraz brak wspólnego pola przekroju
między sąsiednimi strefami jako błędy geometrii i blokuje zapis układu. Nie wyznacza nośności, otuliny ani
zgodności normowej.

**Konsekwencje:** Pola są opcjonalne, więc starsze definicje zachowują dotychczasowe wyrównanie domyślne.
Użytkownik może dopasować większe strzemiona do krawędzi niezależnie w obu osiach, a zmiana pakietu nie
nadpisuje tego ustawienia. Komunikat geometrii nie jest deklaracją bezpieczeństwa; ostateczną weryfikację
konstrukcyjną wykonuje uprawniony projektant.
