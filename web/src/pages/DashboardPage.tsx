import { useEffect, useState, type FormEvent } from "react";
import Credits from "../components/Credits";
import LikeButton from "../components/LikeButton";
import Loading from "../components/Loading";
import { api, ApiError, type DashboardData } from "../lib/api";
import { clearSession, getSession, setSession } from "../lib/auth";
import { formatExpiry } from "../lib/format";
import { getOwnerToken } from "../lib/session";

type Mode = "signup" | "login";

export default function DashboardPage() {
  const [mode, setMode] = useState<Mode>("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [brandColor, setBrandColor] = useState("#ff4d00");
  const [brandLogo, setBrandLogo] = useState("");
  const [brandSaved, setBrandSaved] = useState(false);
  const [waitlistEmail, setWaitlistEmail] = useState("");
  const [waitlistDone, setWaitlistDone] = useState(false);

  async function load() {
    if (!getSession()) {
      setLoaded(true);
      return;
    }
    try {
      const result = await api.me();
      setData(result);
      setBrandColor(result.brand.accentColor || "#ff4d00");
      setBrandLogo(result.brand.logoUrl || "");
    } catch {
      clearSession();
      setData(null);
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result =
        mode === "signup"
          ? await api.signup({ email, password, ownerToken: getOwnerToken() || undefined })
          : await api.login({ email, password });
      setSession(result.token);
      await load();
      setLoaded(true);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not sign in. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function act(action: () => Promise<unknown>) {
    setError("");
    try {
      await action();
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "That action did not go through.");
    }
  }

  if (!loaded) {
    return (
      <main className="mx-auto min-h-dvh max-w-xl px-5 py-16">
        <Loading label="Finding your links." detail="Gathering deliveries, views and expiry dates." />
      </main>
    );
  }

  if (!data) {
    return (
      <main className="mx-auto min-h-dvh max-w-xl px-5 py-10 sm:py-14">
        <header className="flex items-center justify-between border-b border-ink pb-4">
          <a className="font-display text-2xl" href="/">Kelpo</a>
          <a className="text-btn" href="/">New delivery ↗</a>
        </header>

        <section className="mt-14">
          <span className="seal" aria-hidden="true">
            {Array.from({ length: 9 }, (_, i) => <i key={i} />)}
          </span>
          <h1 className="mt-8 font-display text-4xl tracking-tight sm:text-5xl">
            Keep your deliveries together.
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-muted">
            An account is optional. Creating and sending a link never asks for one. Save an
            account only when you want history, revoke, extend and client notes.
          </p>
        </section>

        <form className="mt-10 space-y-5" onSubmit={(event) => void submit(event)}>
          <label className="block">
            <span className="font-mono text-xs uppercase tracking-widest text-muted">Email</span>
            <input
              className="field mt-2"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@studio.com"
            />
          </label>
          <label className="block">
            <span className="font-mono text-xs uppercase tracking-widest text-muted">Password</span>
            <input
              className="field mt-2 font-mono text-sm"
              type="password"
              required
              minLength={mode === "signup" ? 8 : 1}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
            />
          </label>
          {error && <p className="border-l-2 border-signal pl-3 text-sm text-signal">{error}</p>}
          <button className="primary-btn w-full" disabled={busy}>
            {busy
              ? mode === "signup" ? "Opening your account." : "Signing in."
              : mode === "signup" ? "Create account" : "Sign in"}
          </button>
        </form>

        <button
          className="text-btn mt-5"
          onClick={() => {
            setMode((current) => (current === "signup" ? "login" : "signup"));
            setError("");
          }}
        >
          {mode === "signup" ? "Already have an account? Sign in" : "Need an account? Create one"}
        </button>

        <footer className="mt-14 border-t border-ink/10 pt-4">
          <Credits />
        </footer>
        <LikeButton />
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-dvh max-w-3xl px-5 py-10 sm:py-14">
      <header className="flex items-center justify-between gap-3 border-b border-ink pb-4">
        <span className="font-display text-2xl">Kelpo</span>
        <div className="flex items-center gap-5 font-mono text-xs text-muted">
          <a className="underline underline-offset-2" href="/">New delivery ↗</a>
          <button
            className="underline underline-offset-2"
            onClick={() => {
              clearSession();
              setData(null);
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      <section className="mt-10 flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl tracking-tight sm:text-5xl">Your deliveries.</h1>
          <p className="mt-2 font-mono text-xs text-muted">{data.account.email} · {data.account.plan}</p>
        </div>
        <span className="font-mono text-xs text-muted">{data.links.length} links</span>
      </section>

      <section className="mt-10">
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs uppercase tracking-widest text-muted">History</span>
          <span className="h-px flex-1 bg-ink/15" />
        </div>
        {data.links.length === 0 ? (
          <p className="mt-6 text-sm text-muted">
            No saved deliveries yet. The links you create from now on will appear here.
          </p>
        ) : (
          <div className="mt-5 divide-y divide-ink/10 border-y border-ink/15">
            {data.links.map((link) => (
              <article key={link.slug} className="py-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-display text-xl">{link.title}</p>
                    <p className="mt-1 font-mono text-xs text-muted">
                      {link.status} · {link.view_count} views · ends {formatExpiry(link.expires_at)}
                    </p>
                  </div>
                  <a className="text-btn" href={`/p/${link.slug}`} target="_blank" rel="noreferrer">
                    Open ↗
                  </a>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    className="small-btn"
                    onClick={() => void act(() => api.revoke(link.slug))}
                    disabled={link.status === "disabled"}
                  >
                    Revoke
                  </button>
                  {(["24h", "7d", "30d"] as const).map((expiry) => (
                    <button
                      key={expiry}
                      className="small-btn"
                      onClick={() => void act(() => api.extend(link.slug, expiry))}
                    >
                      +{expiry}
                    </button>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="mt-14">
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs uppercase tracking-widest text-muted">Brand kit</span>
          <span className="h-px flex-1 bg-ink/15" />
        </div>
        <p className="mt-4 text-sm text-muted">
          Your accent and logo appear on every delivery page you send from this account.
        </p>
        <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end">
          <label className="block">
            <span className="font-mono text-xs uppercase tracking-widest text-muted">Accent</span>
            <input
              className="color-input"
              type="color"
              value={brandColor}
              onChange={(event) => setBrandColor(event.target.value)}
            />
          </label>
          <label className="block flex-1">
            <span className="font-mono text-xs uppercase tracking-widest text-muted">Logo URL</span>
            <input
              className="field mt-2 text-sm"
              placeholder="https://…/logo.png"
              value={brandLogo}
              onChange={(event) => setBrandLogo(event.target.value)}
            />
          </label>
          <button
            className="small-btn"
            onClick={() =>
              void act(async () => {
                await api.saveBrand({ accentColor: brandColor, logoUrl: brandLogo || null });
                setBrandSaved(true);
              })
            }
          >
            {brandSaved ? "Saved" : "Save kit"}
          </button>
        </div>
      </section>

      <section className="mt-14">
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs uppercase tracking-widest text-muted">Plans</span>
          <span className="h-px flex-1 bg-ink/15" />
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="plan-card">
            <p className="font-display text-2xl">Free</p>
            <p className="mt-2 text-sm text-muted">15 files · 25 MB each · 30 days · expiry links</p>
          </div>
          <div className="plan-card plan-pro">
            <p className="font-display text-2xl">Studio</p>
            <p className="mt-2 text-sm text-muted">Larger files · longer expiry · your domain · client pins</p>
            <form
              className="mt-5 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void act(async () => {
                  await api.joinWaitlist(waitlistEmail);
                  setWaitlistDone(true);
                });
              }}
            >
              <input
                className="field flex-1 text-sm"
                type="email"
                required
                placeholder="you@studio.com"
                value={waitlistEmail}
                onChange={(event) => setWaitlistEmail(event.target.value)}
              />
              <button className="small-btn" type="submit">
                {waitlistDone ? "Added" : "Join the list"}
              </button>
            </form>
          </div>
        </div>
      </section>

      {error && <p className="mt-8 border-l-2 border-signal pl-3 text-sm text-signal">{error}</p>}

      <footer className="mt-14 flex flex-col gap-4 border-t border-ink/10 pt-4 sm:flex-row sm:items-end sm:justify-between">
        <Credits />
        <LikeButton />
      </footer>
    </main>
  );
}
