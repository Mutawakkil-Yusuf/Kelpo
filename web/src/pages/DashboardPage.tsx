import { useEffect, useState, type FormEvent } from "react";
import { motion } from "motion/react";
import Loading from "../components/Loading";
import Seal from "../components/Seal";
import SiteFooter from "../components/SiteFooter";
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
      <main className="page wrap" style={{ display: "grid", alignContent: "center" }}>
        <Loading label="Loading your links." detail="Getting views, expiry dates and notes." />
      </main>
    );
  }

  if (!data) {
    return (
      <main className="page wrap">
        <header className="masthead">
          <a className="brand" href="/"><Seal /><span className="brand-name">Kelpo</span></a>
          <a className="masthead-meta" href="/">New link ↗</a>
        </header>

        <section className="section" style={{ borderTop: 0 }}>
          <Seal size="lg" />
          <h1 className="display" style={{ fontSize: "clamp(2.8rem, 6vw, 4.75rem)", marginTop: "2rem" }}>
            Keep your links in one place.
          </h1>
          <p className="lede" style={{ marginTop: "1.2rem" }}>
            No account needed to send. Sign in when you want your links saved, with views,
            expiry controls and client notes.
          </p>
        </section>

        <section className="section">
          <div className="section-head"><h2 className="h3">Your account</h2></div>
          <form onSubmit={(event) => void submit(event)} style={{ display: "grid", gap: "1.75rem", maxWidth: "34rem" }}>
            <label className="block">
              <span className="field-label">Email</span>
              <input className="field" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@studio.com" />
            </label>
            <label className="block">
              <span className="field-label">Password</span>
              <input
                className="field mono"
                type="password"
                required
                minLength={mode === "signup" ? 8 : 1}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
              />
            </label>
            {error && <p className="error-line">{error}</p>}
            <button className="btn btn-block" disabled={busy}>
              {busy
                ? mode === "signup" ? "Opening your account." : "Signing in."
                : mode === "signup" ? "Create account" : "Sign in"}
            </button>
          </form>
          <button
            className="text-btn"
            style={{ marginTop: "1.25rem" }}
            onClick={() => { setMode((current) => (current === "signup" ? "login" : "signup")); setError(""); }}
          >
            {mode === "signup" ? "Already have an account? Sign in" : "Need an account? Create one"}
          </button>
        </section>

        <SiteFooter />
      </main>
    );
  }

  return (
    <main className="page wrap">
      <header className="masthead">
        <span className="brand"><Seal /><span className="brand-name">Kelpo</span></span>
        <div style={{ display: "flex", alignItems: "center", gap: "1.25rem" }}>
          <a className="masthead-meta" href="/">New link ↗</a>
          <button className="masthead-meta" onClick={() => { clearSession(); setData(null); }}>Sign out</button>
        </div>
      </header>

      <section className="client-head" style={{ marginTop: "clamp(2.5rem, 8vh, 5rem)" }}>
        <div>
          <h1 className="display" style={{ fontSize: "clamp(2.8rem, 6vw, 4.75rem)" }}>Your links.</h1>
          <p className="mono muted" style={{ marginTop: "1rem" }}>{data.account.email}, {data.account.plan}</p>
        </div>
        <p className="mono">{data.links.length} {data.links.length === 1 ? "link" : "links"}</p>
      </section>

      <section className="section">
        <div className="section-head"><h2 className="h3">The ledger</h2></div>
        {data.links.length === 0 ? (
          <p className="lede">No saved deliveries yet. The links you create from now on will appear here.</p>
        ) : (
          <div className="ledger">
            {data.links.map((link) => (
              <motion.article className="ledger-row" key={link.slug} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                <div>
                  <p className="ledger-title">{link.title}</p>
                  <p className="mono muted" style={{ marginTop: "0.5rem" }}>
                    {link.status}. Ends {formatExpiry(link.expires_at)}
                  </p>
                </div>
                <div className="mono muted num">
                  <p>opened {link.opens} times</p>
                  <p>{link.view_count} page loads</p>
                </div>
                <div>
                  <div className="ledger-actions" style={{ justifyContent: "flex-end" }}>
                    <a className="small-btn" href={`/p/${link.slug}`} target="_blank" rel="noreferrer">Open ↗</a>
                    <button className="small-btn" onClick={() => void act(() => api.revoke(link.slug))} disabled={link.status === "disabled"}>
                      Stop link
                    </button>
                  </div>
                  <div className="ledger-actions" style={{ justifyContent: "flex-end", marginTop: "0.5rem" }}>
                    {(["24h", "7d", "30d"] as const).map((expiry) => (
                      <button key={expiry} className="small-btn" onClick={() => void act(() => api.extend(link.slug, expiry))}>
                        +{expiry === "24h" ? "24h" : expiry === "7d" ? "7d" : "30d"}
                      </button>
                    ))}
                  </div>
                </div>
              </motion.article>
            ))}
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-head"><h2 className="h3">Stationery</h2></div>
        <p className="lede">Your colour and logo appear on every delivery page you send.</p>
        <div className="form-row" style={{ alignItems: "end" }}>
          <label className="block">
            <span className="field-label">Accent</span>
            <input className="color-input" style={{ display: "block", marginTop: "0.7rem" }} type="color" value={brandColor} onChange={(event) => setBrandColor(event.target.value)} />
          </label>
          <label className="block">
            <span className="field-label">Logo URL</span>
            <input className="field mono" style={{ marginTop: "0.3rem" }} placeholder="https://…/logo.png" value={brandLogo} onChange={(event) => setBrandLogo(event.target.value)} />
          </label>
        </div>
        <button
          className="btn"
          style={{ marginTop: "1.5rem" }}
          onClick={() => void act(async () => {
            await api.saveBrand({ accentColor: brandColor, logoUrl: brandLogo || null });
            setBrandSaved(true);
          })}
        >
          {brandSaved ? "Saved" : "Save kit"}
        </button>
      </section>

      <section className="section">
        <div className="section-head"><h2 className="h3">Plans</h2></div>
        <div className="plan-grid">
          <div className="plan-card">
            <p className="h3">Free</p>
            <p className="mono muted" style={{ marginTop: "0.8rem" }}>15 files. 25 MB each. 30 days. Expiring links.</p>
          </div>
          <div className="plan-card plan-pro">
            <p className="h3">Studio</p>
            <p className="mono muted" style={{ marginTop: "0.8rem" }}>Larger files. Longer expiry. Your domain. Client pins.</p>
            <form
              style={{ display: "flex", gap: "0.6rem", marginTop: "1.5rem" }}
              onSubmit={(event) => {
                event.preventDefault();
                void act(async () => {
                  await api.joinWaitlist(waitlistEmail);
                  setWaitlistDone(true);
                });
              }}
            >
              <input className="field mono" type="email" required placeholder="you@studio.com" value={waitlistEmail} onChange={(event) => setWaitlistEmail(event.target.value)} />
              <button className="btn" type="submit">{waitlistDone ? "Added" : "Notify me"}</button>
            </form>
          </div>
        </div>
      </section>

      {error && <p className="error-line">{error}</p>}

      <SiteFooter />
    </main>
  );
}
