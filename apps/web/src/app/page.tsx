"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import type { OrganizationKind } from "@asystent/api-client";
import { SignInInputSchema, SignUpInputSchema } from "@asystent/schemas";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";
import { DemoWorkspace } from "@/components/demo-workspace";
import { RoleWorkspace } from "@/components/role-workspace";

const accountTypes = [
  {
    value: "client",
    title: "Zleceniodawca",
    description: "Zaplanuj budowę domu, opisz prace i znajdź sprawdzonych wykonawców.",
    action: "Zlecę budowę",
  },
  {
    value: "contractor",
    title: "Wykonawca",
    description: "Przeglądaj zlecenia, przedstawiaj oferty i rozwijaj swoją firmę.",
    action: "Szukam zleceń",
  },
  {
    value: "store",
    title: "Sklep",
    description: "Pokaż materiały, odpowiadaj na zapytania i docieraj do nowych klientów.",
    action: "Pokażę ofertę",
  },
] as const;

function AccountTypeIllustration({
  kind,
}: {
  kind: OrganizationKind;
}) {
  if (kind === "client") {
    return (
      <svg aria-hidden="true" viewBox="0 0 160 112">
        <path d="M29 53 80 16l51 37" />
        <path d="M41 48v48h78V48M68 96V67h25v29" />
        <path d="M52 61h8m40 0h8M25 102h110" />
        <circle cx="125" cy="27" r="9" />
      </svg>
    );
  }
  if (kind === "contractor") {
    return (
      <svg aria-hidden="true" viewBox="0 0 160 112">
        <path d="M38 75c0-24 18-43 42-43s42 19 42 43H38Z" />
        <path d="M29 75h102v13H29zM80 32V19m-28 38h56M47 88l-8 10m74-10 8 10M61 99h38" />
        <circle cx="80" cy="52" r="5" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 160 112">
      <path d="M30 51h100v48H30zM24 51l12-25h88l12 25" />
      <path d="M36 51c0 10 16 10 16 0 0 10 16 10 16 0 0 10 16 10 16 0 0 10 16 10 16 0 0 10 16 10 16 0" />
      <path d="M44 69h22v30H44zm39 0h29v18H83zM24 101h112" />
    </svg>
  );
}

export default function Home() {
  const configured = isSupabaseConfigured();
  const demoAvailable = process.env.NODE_ENV === "development";
  const [demoActive, setDemoActive] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [authInitialized, setAuthInitialized] = useState(!configured);
  const [profileAccountType, setProfileAccountType] =
    useState<OrganizationKind | null>(null);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [profileFailed, setProfileFailed] = useState(false);
  const [profileRevision, setProfileRevision] = useState(0);
  const authUserId = useRef<string | null>(null);
  const userId = session?.user.id;

  useEffect(() => {
    if (!configured) return;

    const supabase = getSupabaseClient();
    let active = true;
    let authEventReceived = false;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      authEventReceived = true;
      setSession(nextSession);
      setAuthInitialized(true);
      const changedUser = nextSession?.user.id !== authUserId.current;
      authUserId.current = nextSession?.user.id ?? null;
      if (nextSession && changedUser) {
        setLoadingProfile(true);
        setProfileFailed(false);
        setProfileAccountType(null);
      } else if (!nextSession) {
        setProfileAccountType(null);
        setLoadingProfile(false);
        setAuthMode("signin");
        setEmail("");
        setPassword("");
      }
      setError("");
      setNotice("");
    });

    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active || authEventReceived) return;
      setAuthInitialized(true);
      if (sessionError) {
        setError(`Nie udało się odczytać sesji: ${sessionError.message}`);
        return;
      }
      setSession(data.session);
      if (data.session) {
        authUserId.current = data.session.user.id;
        setLoadingProfile(true);
      }
    }).catch((sessionError: unknown) => {
      if (!active || authEventReceived) return;
      setAuthInitialized(true);
      setError(`Nie udało się odczytać sesji: ${
        sessionError instanceof Error ? sessionError.message : "nieznany błąd"
      }`);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [configured]);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    void (async () => {
      try {
        const { data, error: profileError } = await getSupabaseClient()
          .from("profiles")
          .select("account_type")
          .eq("id", userId)
          .single();
        if (!active) return;
        setLoadingProfile(false);
        if (profileError) {
          setProfileFailed(true);
          setError(`Nie udało się pobrać profilu: ${profileError.message}`);
          return;
        }
        setProfileAccountType(data.account_type);
        setProfileFailed(false);
      } catch (profileError) {
        if (!active) return;
        setLoadingProfile(false);
        setProfileFailed(true);
        setError(
          `Nie udało się pobrać profilu: ${
            profileError instanceof Error ? profileError.message : "nieznany błąd"
          }`,
        );
      }
    })();

    return () => {
      active = false;
    };
  }, [userId, profileRevision]);

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    const form = new FormData(event.currentTarget);
    const parsed = authMode === "signup"
      ? SignUpInputSchema.safeParse({
          display_name: form.get("display_name"),
          email: form.get("email"),
          password: form.get("password"),
        })
      : SignInInputSchema.safeParse({
          email: form.get("email"),
          password: form.get("password"),
        });
    if (!parsed.success) {
      setError(parsed.error.issues.map((issue) => issue.message).join(" "));
      return;
    }
    setBusy(true);

    try {
      const supabase = getSupabaseClient();
      if (authMode === "signup") {
        if (!("display_name" in parsed.data)) {
          throw new Error("Nie udało się zweryfikować danych rejestracji.");
        }
        const input = parsed.data;
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: input.email,
          password: input.password,
          options: { data: { display_name: input.display_name } },
        });
        if (signUpError) throw signUpError;
        if (!data.session) {
          setNotice(
            "Konto utworzone. Otwórz wiadomość w lokalnym Mailpit i potwierdź adres e-mail, aby się zalogować.",
          );
        } else {
          setNotice("Konto utworzone. Wybierz, jak chcesz korzystać z aplikacji.");
        }
      } else {
        const input = parsed.data;
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: input.email,
          password: input.password,
        });
        if (signInError) throw signInError;
      }
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Nie udało się wykonać operacji. Spróbuj ponownie.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleAccountTypeSelect(kind: OrganizationKind) {
    if (!session) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { data, error: updateError } = await getSupabaseClient()
        .from("profiles")
        .update({ account_type: kind })
        .eq("id", session.user.id)
        .select("account_type")
        .single();
      if (updateError) throw updateError;
      if (!data.account_type) {
        throw new Error("Nie udało się zapisać wybranego typu konta.");
      }
      setProfileAccountType(data.account_type);
    } catch (selectError) {
      setError(
        selectError instanceof Error
          ? selectError.message
          : "Nie udało się zapisać typu konta. Spróbuj ponownie.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleChangeAccountType() {
    if (!session) return;
    setBusy(true);
    setError("");
    try {
      const { error: updateError } = await getSupabaseClient()
        .from("profiles")
        .update({ account_type: null })
        .eq("id", session.user.id);
      if (updateError) throw updateError;
      setProfileAccountType(null);
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Nie udało się zmienić typu konta.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    setError("");
    const { error: signOutError } = await getSupabaseClient().auth.signOut();
    if (signOutError) {
      setError(signOutError.message);
      return;
    }
    setProfileAccountType(null);
    setAuthMode("signin");
    setEmail("");
    setPassword("");
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="Asystent Budowlańca — strona główna">
          <span aria-hidden="true" className="brand-mark">A</span>
          <span>Asystent <strong>Budowlańca</strong></span>
        </Link>
        <div className="topbar-right">
          <span className="local-indicator"><span /> Środowisko lokalne</span>
          {session && (
            <button className="quiet-button" type="button" onClick={handleSignOut}>
              Wyloguj
            </button>
          )}
        </div>
      </header>

      {!configured && demoAvailable && demoActive ? (
        <DemoWorkspace onExit={() => setDemoActive(false)} />
      ) : !configured ? (
        <section className="setup-card" aria-labelledby="setup-title">
          <div className="setup-icon" aria-hidden="true">!</div>
          <p className="eyebrow">WYMAGANA KONFIGURACJA</p>
          <h1 id="setup-title">Połącz lokalne konto</h1>
          <p>
            Uzupełnij zmienne środowiskowe Web, aby połączyć ekran logowania z lokalnym
            Supabase. Nie używaj kluczy z projektu produkcyjnego.
          </p>
          <code>
            NEXT_PUBLIC_SUPABASE_URL<br />
            NEXT_PUBLIC_SUPABASE_ANON_KEY
          </code>
          <p className="setup-help">
            Wartości dla środowiska lokalnego wyświetla polecenie <strong>pnpm db:status</strong>.
          </p>
          {demoAvailable && (
            <button className="primary-button" type="button" onClick={() => setDemoActive(true)}>
              Otwórz tryb testowy bez logowania
            </button>
          )}
        </section>
      ) : session && loadingProfile ? (
        <section className="workspace-loading" role="status">
          <span className="loading-spinner" aria-hidden="true" />
          <p>Przygotowujemy Twoje miejsce pracy…</p>
        </section>
      ) : !authInitialized ? (
        <section className="workspace-loading" role="status">
          <span className="loading-spinner" aria-hidden="true" />
          <p>Sprawdzamy Twoją sesję…</p>
        </section>
      ) : session && profileFailed ? (
        <section className="workspace">
          <div className="alert alert-error" role="alert">{error}</div>
          <button className="quiet-button" onClick={() => { setLoadingProfile(true); setProfileRevision((value) => value + 1); }}>
            Spróbuj ponownie
          </button>
        </section>
      ) : session && !profileAccountType ? (
        <section className="account-type-page">
          <div className="account-type-heading">
            <p className="eyebrow">KROK 1 Z 2 · PERSONALIZACJA</p>
            <h1>Jak chcesz korzystać z aplikacji?</h1>
            <p>Wybierz swój panel. Zleć budowę, rozwijaj firmę wykonawczą lub zaprezentuj ofertę sklepu.</p>
          </div>
          {error && <div className="alert alert-error" role="alert">{error}</div>}
          <div className="account-type-grid">
            {accountTypes.map((accountType) => (
              <button
                className={`account-type-card type-${accountType.value}`}
                disabled={busy}
                key={accountType.value}
                onClick={() => void handleAccountTypeSelect(accountType.value)}
                type="button"
              >
                <span className="account-type-art">
                  <AccountTypeIllustration kind={accountType.value} />
                  <span className="account-type-step">0{accountTypes.indexOf(accountType) + 1}</span>
                </span>
                <span className="account-type-content">
                  <span className="eyebrow">{accountType.value === "client" ? "INWESTOR" : accountType.value === "contractor" ? "FIRMA WYKONAWCZA" : "MATERIAŁY BUDOWLANE"}</span>
                  <span className="account-type-title">{accountType.title}</span>
                  <span className="account-type-description">{accountType.description}</span>
                  <span className="account-type-action">
                    {busy ? "Zapisywanie…" : accountType.action}
                    <span aria-hidden="true">→</span>
                  </span>
                </span>
              </button>
            ))}
          </div>
          <p className="account-type-note">Każdy typ konta korzysta z tego samego bezpiecznego logowania.</p>
        </section>
      ) : session && profileAccountType ? (
        <>
        {error && <div className="workspace"><div className="alert alert-error" role="alert">{error}</div></div>}
        <RoleWorkspace
          key={`${session.user.id}:${profileAccountType}`}
          session={session}
          kind={profileAccountType}
          isAdministrator={session.user.app_metadata.role === "admin"}
          onChangeType={handleChangeAccountType}
        />
        </>
      ) : (
        <section className="auth-layout">
          <div className="hero-panel">
            <div className="hero-copy">
              <p className="eyebrow light">PROJEKTUJ · PLANUJ · BUDUJ</p>
              <h1>Twoja budowa,<br />w jednym miejscu.</h1>
              <p>
                Projekty, dokumentacja i współpraca z wykonawcami — uporządkowane od
                pierwszego szkicu po realizację.
              </p>
            </div>
            <div className="blueprint" aria-hidden="true">
              <div className="blueprint-building">
                <span className="roof" />
                <span className="house">
                  <i /><i /><i /><i />
                </span>
                <span className="foundation" />
              </div>
              <span className="blueprint-note">RZUT · PARTER</span>
              <span className="blueprint-measure measure-top">9 600</span>
              <span className="blueprint-measure measure-side">8 400</span>
            </div>
            <div className="hero-footer">
              <span>01 / PRZESTRZEŃ ROBOCZA</span>
              <span>Dane pozostają lokalnie</span>
            </div>
          </div>

          <div className="auth-side">
            <div className="auth-card">
              <p className="eyebrow">{authMode === "signin" ? "WRÓĆ DO SWOJEJ BUDOWY" : "ZACZNIJ SWÓJ PROJEKT"}</p>
              <h2>{authMode === "signin" ? "Zaloguj się" : "Utwórz konto"}</h2>
              <p className="auth-subtitle">
                {authMode === "signin"
                  ? "Zaloguj się, aby przejść do swoich projektów."
                  : "Załóż konto i przygotuj przestrzeń dla swojej budowy."}
              </p>

              {error && <div className="alert alert-error" role="alert">{error}</div>}
              {notice && <div className="alert alert-success" role="status">{notice}</div>}

              <form className="form-stack auth-form" noValidate onSubmit={handleAuthSubmit}>
                {authMode === "signup" && (
                  <label>
                    Imię lub nazwa
                    <input
                      autoComplete="name"
                      name="display_name"
                      maxLength={120}
                      onChange={(event) => setDisplayName(event.target.value)}
                      placeholder="Jak mamy się do Ciebie zwracać?"
                      value={displayName}
                    />
                  </label>
                )}
                <label>
                  Adres e-mail
                  <input
                    autoComplete="email"
                    name="email"
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="twoj@email.pl"
                    type="email"
                    value={email}
                  />
                </label>
                <label>
                  Hasło
                  <input
                    autoComplete={authMode === "signin" ? "current-password" : "new-password"}
                    name="password"
                    maxLength={128}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Minimum 8 znaków"
                    type="password"
                    value={password}
                  />
                </label>
                <button className="primary-button auth-submit" disabled={busy} type="submit">
                  {busy
                    ? "Chwileczkę…"
                    : authMode === "signin"
                      ? "Zaloguj się"
                      : "Utwórz konto"}
                  <span aria-hidden="true">→</span>
                </button>
              </form>

              <div className="auth-switch">
                <span>{authMode === "signin" ? "Nie masz jeszcze konta?" : "Masz już konto?"}</span>
                <button
                  onClick={() => {
                    setAuthMode(authMode === "signin" ? "signup" : "signin");
                    setError("");
                    setNotice("");
                  }}
                  type="button"
                >
                  {authMode === "signin" ? "Utwórz konto" : "Zaloguj się"}
                </button>
              </div>
              <p className="auth-privacy">
                <span aria-hidden="true">⌑</span> Połączenie z lokalnym serwerem. Twoje dane nie opuszczają środowiska.
              </p>
            </div>
            <footer className="auth-footer">
              <span>© 2026 Asystent Budowlańca</span>
              <span>Wersja lokalna · 0.1</span>
            </footer>
          </div>
        </section>
      )}
    </main>
  );
}
