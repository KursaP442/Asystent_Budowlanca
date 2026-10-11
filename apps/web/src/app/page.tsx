"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";

type Organization = {
  id: string;
  name: string;
  kind: "client" | "contractor" | "store";
  nip: string | null;
  role: "owner" | "admin" | "member";
};

const organizationKinds = [
  { value: "client", label: "Zleceniodawca" },
  { value: "contractor", label: "Wykonawca" },
  { value: "store", label: "Sklep" },
] as const;

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
  kind: Organization["kind"];
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

async function loadOrganizations(): Promise<Organization[]> {
  const supabase = getSupabaseClient();
  const { data: memberships, error: membershipError } = await supabase
    .from("memberships")
    .select("organization_id, role")
    .order("created_at");
  if (membershipError) throw membershipError;
  if (!memberships?.length) return [];

  const { data: organizations, error: organizationsError } = await supabase
    .from("organizations")
    .select("id, name, kind, nip")
    .in(
      "id",
      memberships.map((membership) => membership.organization_id),
    );
  if (organizationsError) throw organizationsError;

  const rolesByOrganization = new Map(
    memberships.map((membership) => [
      membership.organization_id,
      membership.role,
    ]),
  );
  return (organizations ?? []).flatMap((organization) => {
    const role = rolesByOrganization.get(organization.id);
    if (!role) return [];
    return [{
      id: organization.id,
      name: organization.name,
      kind: organization.kind,
      nip: organization.nip,
      role,
    }];
  });
}

export default function Home() {
  const configured = isSupabaseConfigured();
  const [session, setSession] = useState<Session | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [profileAccountType, setProfileAccountType] =
    useState<Organization["kind"] | null>(null);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [organizationKind, setOrganizationKind] =
    useState<Organization["kind"]>("client");
  const [nip, setNip] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingOrganizations, setLoadingOrganizations] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);

  useEffect(() => {
    if (!configured) return;

    const supabase = getSupabaseClient();
    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError) {
        setError(sessionError.message);
        return;
      }
      setSession(data.session);
      if (data.session) {
        setLoadingOrganizations(true);
        setLoadingProfile(true);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession) {
        setLoadingOrganizations(true);
        setLoadingProfile(true);
      } else {
        setOrganizations([]);
        setLoadingOrganizations(false);
        setProfileAccountType(null);
        setLoadingProfile(false);
        setAuthMode("signin");
        setEmail("");
        setPassword("");
      }
      setError("");
      setNotice("");
    });

    return () => subscription.unsubscribe();
  }, [configured]);

  useEffect(() => {
    if (!session) return;
    let active = true;
    void (async () => {
      try {
        const { data, error: profileError } = await getSupabaseClient()
          .from("profiles")
          .select("account_type")
          .eq("id", session.user.id)
          .single();
        if (!active) return;
        setLoadingProfile(false);
        if (profileError) {
          setError(`Nie udało się pobrać profilu: ${profileError.message}`);
          return;
        }
        setProfileAccountType(data.account_type);
        if (data.account_type) setOrganizationKind(data.account_type);
      } catch (profileError) {
        if (!active) return;
        setLoadingProfile(false);
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
  }, [session]);

  useEffect(() => {
    if (!session) return;
    let active = true;
    void loadOrganizations()
      .then((loadedOrganizations) => {
        if (!active) return;
        setLoadingOrganizations(false);
        setOrganizations(loadedOrganizations);
      })
      .catch((queryError: unknown) => {
        if (!active) return;
        setLoadingOrganizations(false);
        setError(
          `Nie udało się pobrać organizacji: ${
            queryError instanceof Error ? queryError.message : "nieznany błąd"
          }`,
        );
      });

    return () => {
      active = false;
    };
  }, [session]);

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);

    try {
      const supabase = getSupabaseClient();
      if (authMode === "signup") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { display_name: displayName.trim() } },
        });
        if (signUpError) throw signUpError;
        if (!data.session) {
          setNotice(
            "Konto utworzone. Otwórz wiadomość w lokalnym Mailpit i potwierdź adres e-mail, aby się zalogować.",
          );
        } else {
          setNotice("Konto utworzone. Możesz teraz skonfigurować organizację.");
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
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

  async function handleOrganizationSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);

    const normalizedNip = nip.replace(/[\s-]/g, "");
    try {
      const { error: insertError } = await getSupabaseClient()
        .from("organizations")
        .insert({
          name: organizationName.trim(),
          kind: organizationKind,
          nip: organizationKind === "client" ? normalizedNip || null : normalizedNip,
        });
      if (insertError) throw insertError;
      setOrganizationName("");
      setNip("");
      setNotice("Organizacja została utworzona. Otrzymujesz rolę właściciela.");
      setOrganizations(await loadOrganizations());
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Nie udało się utworzyć organizacji. Sprawdź dane i spróbuj ponownie.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleAccountTypeSelect(kind: Organization["kind"]) {
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
      setOrganizationKind(data.account_type);
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
      setOrganizationKind("client");
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
    setOrganizations([]);
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

      {!configured ? (
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
        </section>
      ) : session && (loadingProfile || loadingOrganizations) ? (
        <section className="workspace-loading" role="status">
          <span className="loading-spinner" aria-hidden="true" />
          <p>Przygotowujemy Twoje miejsce pracy…</p>
        </section>
      ) : session && !profileAccountType && organizations.length === 0 ? (
        <section className="account-type-page">
          <div className="account-type-heading">
            <p className="eyebrow">KROK 1 Z 2 · PERSONALIZACJA</p>
            <h1>Jak chcesz korzystać z aplikacji?</h1>
            <p>Wybierz swoją główną rolę. Zapiszemy ją na Twoim koncie — później możesz dołączyć do innych organizacji.</p>
          </div>
          {error && <div className="alert alert-error" role="alert">{error}</div>}
          <div className="account-type-grid">
            {accountTypes.map((accountType) => (
              <article className={`account-type-card type-${accountType.value}`} key={accountType.value}>
                <div className="account-type-art">
                  <AccountTypeIllustration kind={accountType.value} />
                  <span className="account-type-step">0{accountTypes.indexOf(accountType) + 1}</span>
                </div>
                <div className="account-type-content">
                  <p className="eyebrow">{accountType.value === "client" ? "INWESTOR" : accountType.value === "contractor" ? "FIRMA WYKONAWCZA" : "MATERIAŁY BUDOWLANE"}</p>
                  <h2>{accountType.title}</h2>
                  <p>{accountType.description}</p>
                  <button
                    className="account-type-button"
                    disabled={busy}
                    onClick={() => void handleAccountTypeSelect(accountType.value)}
                    type="button"
                  >
                    {busy ? "Zapisywanie…" : accountType.action}
                    <span aria-hidden="true">→</span>
                  </button>
                </div>
              </article>
            ))}
          </div>
          <p className="account-type-note">Każdy typ konta korzysta z tego samego bezpiecznego logowania.</p>
        </section>
      ) : session ? (
        <section className="workspace">
          <div className="welcome-row">
            <div>
              <p className="eyebrow">
                {profileAccountType && organizations.length === 0 ? "KROK 2 Z 2 · TWOJA ORGANIZACJA" : "TWOJE MIEJSCE PRACY"}
              </p>
              <h1>Witaj{session.user.user_metadata.display_name ? `, ${session.user.user_metadata.display_name}` : ""}.</h1>
              <p className="lead">
                {profileAccountType && organizations.length === 0
                  ? "Podaj nazwę, aby przygotować swoje miejsce pracy."
                  : "Wybierz organizację albo utwórz nowe miejsce pracy."}
              </p>
            </div>
            <div className="account-chip">
              <span className="avatar">{session.user.email?.slice(0, 1).toUpperCase()}</span>
              <span>{session.user.email}</span>
            </div>
          </div>

          {error && <div className="alert alert-error" role="alert">{error}</div>}
          {notice && <div className="alert alert-success" role="status">{notice}</div>}

          <div className="workspace-grid">
            <section className="panel organizations-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">KONTA I DOSTĘPY</p>
                  <h2>Twoje organizacje</h2>
                </div>
                <span className="count-badge">{organizations.length}</span>
              </div>
              {loadingOrganizations ? (
                <p className="empty-state">Wczytywanie organizacji…</p>
              ) : organizations.length ? (
                <div className="organization-list">
                  {organizations.map((organization) => (
                    <article className="organization-card" key={organization.id}>
                      <span className={`organization-icon kind-${organization.kind}`} aria-hidden="true">
                        {organization.kind === "client" ? "I" : organization.kind === "contractor" ? "W" : "S"}
                      </span>
                      <div className="organization-info">
                        <h3>{organization.name}</h3>
                        <p>{organizationKinds.find((kind) => kind.value === organization.kind)?.label}</p>
                      </div>
                      <span className="role-badge">{organization.role === "owner" ? "Właściciel" : organization.role}</span>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <span aria-hidden="true" className="empty-symbol">+</span>
                  <h3>Jeszcze bez organizacji</h3>
                  <p>Utwórz organizację, aby rozpocząć pracę nad projektami i zleceniami.</p>
                </div>
              )}
              <div className="panel-footnote">
                <span className="secure-dot" />
                Organizacje i role są chronione przez reguły dostępu bazy danych.
              </div>
            </section>

            <section className="panel create-panel">
              <p className="eyebrow">NOWE MIEJSCE PRACY</p>
              <h2>Utwórz organizację</h2>
              <p className="panel-intro">Możesz później należeć do wielu organizacji i przełączać swoje role.</p>
              {profileAccountType && organizations.length === 0 && (
                <div className="selected-account-type">
                  <span className={`organization-icon kind-${profileAccountType}`} aria-hidden="true">
                    <AccountTypeIllustration kind={profileAccountType} />
                  </span>
                  <span>
                    <small>WYBRANY TYP KONTA</small>
                    <strong>{accountTypes.find((item) => item.value === profileAccountType)?.title}</strong>
                  </span>
                  <button disabled={busy} onClick={() => void handleChangeAccountType()} type="button">
                    Zmień
                  </button>
                </div>
              )}
              <form className="form-stack" onSubmit={handleOrganizationSubmit}>
                <label>
                  Nazwa organizacji
                  <input
                    autoComplete="organization"
                    maxLength={120}
                    minLength={1}
                    onChange={(event) => setOrganizationName(event.target.value)}
                    placeholder="np. Budowa domu Nowak"
                    required
                    value={organizationName}
                  />
                </label>
                {(!profileAccountType || organizations.length > 0) && (
                  <label>
                    Typ organizacji
                    <select
                      onChange={(event) => setOrganizationKind(event.target.value as Organization["kind"])}
                      value={organizationKind}
                    >
                      {organizationKinds.map((kind) => (
                        <option key={kind.value} value={kind.value}>{kind.label}</option>
                      ))}
                    </select>
                  </label>
                )}
                {organizationKind !== "client" && (
                  <label>
                    NIP
                    <input
                      autoComplete="off"
                      inputMode="numeric"
                      maxLength={13}
                      onChange={(event) => setNip(event.target.value)}
                      placeholder="000-000-00-00"
                      required
                      value={nip}
                    />
                    <span className="field-hint">Numer zostanie sprawdzony przed zapisaniem.</span>
                  </label>
                )}
                <button className="primary-button" disabled={busy} type="submit">
                  {busy ? "Zapisywanie…" : "Utwórz organizację"}
                  <span aria-hidden="true">→</span>
                </button>
              </form>
            </section>
          </div>
        </section>
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

              <form className="form-stack auth-form" onSubmit={handleAuthSubmit}>
                {authMode === "signup" && (
                  <label>
                    Imię lub nazwa
                    <input
                      autoComplete="name"
                      maxLength={120}
                      onChange={(event) => setDisplayName(event.target.value)}
                      placeholder="Jak mamy się do Ciebie zwracać?"
                      required
                      value={displayName}
                    />
                  </label>
                )}
                <label>
                  Adres e-mail
                  <input
                    autoComplete="email"
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="twoj@email.pl"
                    required
                    type="email"
                    value={email}
                  />
                </label>
                <label>
                  Hasło
                  <input
                    autoComplete={authMode === "signin" ? "current-password" : "new-password"}
                    minLength={8}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Minimum 8 znaków"
                    required
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
