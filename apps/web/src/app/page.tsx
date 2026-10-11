import { UI_TOKENS } from "@asystent/ui-tokens";

export default function Home() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: UI_TOKENS.color.background, color: UI_TOKENS.color.text }}>
      <header className="flex min-h-16 items-center justify-between px-6 text-white sm:px-10" style={{ backgroundColor: UI_TOKENS.color.navigation }}>
        <span className="text-lg font-semibold">Asystent Budowlańca</span>
        <span className="hidden text-sm text-slate-200 sm:inline">Lokalny pulpit</span>
      </header>
      <main className="mx-auto max-w-5xl px-5 py-10 sm:px-8">
        <p className="mb-2 text-sm font-medium" style={{ color: UI_TOKENS.color.mutedText }}>MIEJSCE PRACY</p>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Twoja budowa, w jednym miejscu</h1>
        <p className="mt-3 max-w-2xl text-base leading-7" style={{ color: UI_TOKENS.color.mutedText }}>
          Zarządzaj projektami, dokumentacją i współpracą z wykonawcami. To lokalna wersja aplikacji — dane nie są
          jeszcze podłączone do serwera.
        </p>
        <section aria-label="Status aplikacji" className="mt-8 rounded-2xl border p-6 shadow-sm" style={{ backgroundColor: UI_TOKENS.color.surface, borderColor: UI_TOKENS.color.border }}>
          <div className="flex items-start gap-4">
            <span aria-hidden="true" className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: UI_TOKENS.color.warning }} />
            <div>
              <h2 className="font-semibold">Przygotowanie środowiska lokalnego</h2>
              <p className="mt-1 text-sm leading-6" style={{ color: UI_TOKENS.color.mutedText }}>
                Interfejs jest gotowy do dalszej rozbudowy. Po uruchomieniu lokalnego Supabase będzie można dodać
                konta i zapisywanie projektów.
              </p>
            </div>
          </div>
        </section>
        <section aria-label="Obszary aplikacji" className="mt-8 grid gap-4 sm:grid-cols-3">
          {[
            ["Projekty", "Dokumentacja i rysunki budowy"],
            ["Zlecenia", "Współpraca z wykonawcami"],
            ["Materiały", "Listy i zapytania ofertowe"],
          ].map(([title, description]) => (
            <article key={title} className="rounded-2xl border p-5" style={{ backgroundColor: UI_TOKENS.color.surface, borderColor: UI_TOKENS.color.border }}>
              <h2 className="font-semibold">{title}</h2>
              <p className="mt-2 text-sm leading-6" style={{ color: UI_TOKENS.color.mutedText }}>{description}</p>
            </article>
          ))}
        </section>
        <p className="mt-10 text-xs" style={{ color: UI_TOKENS.color.mutedText }}>
          Tryb lokalny · Dane pozostają na tym urządzeniu
        </p>
      </main>
    </div>
  );
}
