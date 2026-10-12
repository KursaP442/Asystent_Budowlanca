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

## CAD i skanowanie — 12 października 2026

Poniższe zasady dotyczą nowego edytora i importu (historyczny status powyżej opisuje wcześniejszy szkielet):

- `cad_drawings` i `project-scans` są prywatne dla właściciela budowy. API odrzuca obcy projekt i nieaktywny etap.
- Zapis CAD odbywa się przez autoryzowany endpoint i serwerowe RPC; klient nie ma prawa bezpośredniego zapisu.
  Konflikt rewizji zwraca 409 bez nadpisania. Edytor nie pozwala nadawać statusu zatwierdzonego.
- `ai_user_credentials` nie jest dostępne przez klienta nawet dla właściciela klucza. Klucz OpenAI pozostaje
  w stanie formularza wyłącznie do przesłania, potem jest czyszczony. Nie trafia do localStorage ani logów.
- AES-256-GCM używa niezależnego losowego IV i AAD identyfikatora użytkownika. Klucz szyfrujący
  `AI_KEY_ENCRYPTION_KEY` nie może mieć prefiksu `NEXT_PUBLIC_`, trafić do Git lub być ujawniany w rozmowie.
  Należy go zachować w bezpiecznym miejscu: zmiana/unieważnienie bez migracji wymaga ponownego podania kluczy API.
- Upload jest ograniczony do PDF/JPEG/PNG/WebP, 10 MB i obrazów do 25 MP. PDF renderuje się lokalnie,
  raster maksymalnie 2400 px na dłuższym boku; serwer sprawdza sygnaturę PNG i wymiary.
- Analiza wymaga zgody na transfer obrazu i osobne rozliczenia API. Nie używać skanów z danymi osobowymi
  lub poufnymi. Oryginał PDF nie jest przesyłany do OpenAI; do API trafia tylko PNG wybranej strony.
- Każda próba zużywa limit 10/godzinę; limit jest egzekwowany atomowo w bazie. Nie jest to budżet kwotowy.
  Brakuje jeszcze panelu wydatków, rozliczeń tokenów, pełnego audytu i idempotencji płatnego importu.
- Tekst skanu nie jest instrukcją modelu; odpowiedź podlega ścisłej walidacji i nie wykonuje kodu ani SQL.
  Błędna/niedokończona odpowiedź nie zmienia płótna. Rozpoznana geometria nie jest zatwierdzana automatycznie.

### Konfiguracja lokalna

1. W lokalnym terminalu wygenerować niezależny klucz 32 bajtów, np.
   `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
2. Ustawić wynik jako `AI_KEY_ENCRYPTION_KEY` w ignorowanym `apps/web/.env.local` zgodnie z `.env.example`
   i zrestartować lokalny serwer. Nie kopiować tego klucza do czatu, repo ani pól przeglądarkowych.
3. W oknie „Skanuj lub importuj projekt” rozwinąć konfigurację i wpisać własny klucz OpenAI API.
   Przycisk „Usuń mój klucz AI” usuwa wyłącznie zaszyfrowany wpis bieżącego użytkownika.
4. Dopiero po osobnej zgodzie na koszty wykonać analizę niesensytywnego rysunku referencyjnego.
   Testy automatyczne nie wysyłają skanów do OpenAI i nie wykonują płatnych analiz.
