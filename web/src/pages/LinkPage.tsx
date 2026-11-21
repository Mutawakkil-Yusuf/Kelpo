import { type CSSProperties, type MouseEvent, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import Loading from "../components/Loading";
import Seal from "../components/Seal";
import SiteFooter from "../components/SiteFooter";
import TryKelpoPrompt from "../components/TryKelpoPrompt";
import { api, ApiError, type Pin, type PublicLink } from "../lib/api";
import { downloadUrl, formatBytes, formatExpiry, previewUrl, timeLeft, zipUrl } from "../lib/format";
import { setAccessToken } from "../lib/session";

type Phase = "loading" | "locked" | "ready" | "gone" | "error";

/** Client flow: open, preview, download. No account, no app, no jargon. */
export default function LinkPage({ slug }: { slug: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [link, setLink] = useState<PublicLink | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [viewer, setViewer] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("other");
  const [reportSent, setReportSent] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [brand, setBrand] = useState<{ accentColor: string | null; logoUrl: string | null }>({
    accentColor: null,
    logoUrl: null,
  });
  const [pins, setPins] = useState<Pin[]>([]);
  const [pinMode, setPinMode] = useState(false);
  const [draftPin, setDraftPin] = useState<{ x: number; y: number } | null>(null);
  const [pinText, setPinText] = useState("");
  const [pinAuthor, setPinAuthor] = useState("Client");
  const [savingPin, setSavingPin] = useState(false);

  async function load() {
    setPhase("loading");
    try {
      setLink(await api.getLink(slug));
      const [brandResult, pinResult] = await Promise.allSettled([
        api.getBrand(slug),
        api.getPins(slug),
      ]);
      if (brandResult.status === "fulfilled") setBrand(brandResult.value);
      if (pinResult.status === "fulfilled") setPins(pinResult.value.pins);
      setPhase("ready");
    } catch (cause) {
      if (cause instanceof ApiError) {
        if (cause.status === 401) setPhase("locked");
        else if (cause.status === 404 || cause.status === 410) setPhase("gone");
        else setPhase("error");
      } else {
        setPhase("error");
      }
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (link && now >= link.expiresAt) setPhase("gone");
  }, [now, link]);

  useEffect(() => {
    if (viewer === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setViewer(null);
      if (event.key === "ArrowRight" && link) {
        setViewer((current) => (current === null ? null : (current + 1) % link.files.length));
      }
      if (event.key === "ArrowLeft" && link) {
        setViewer((current) =>
          current === null ? null : (current - 1 + link.files.length) % link.files.length,
        );
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewer, link]);

  const ringDuration = useMemo(
    () => (link ? Math.max(1, (link.expiresAt - Date.now()) / 1000) : 1),
    [link],
  );

  async function unlock() {
    setError("");
    try {
      const unlocked = await api.unlock(slug, password);
      setAccessToken(slug, unlocked.accessToken);
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not open the delivery.");
    }
  }

  async function sendReport() {
    try {
      await api.report(slug, reportReason);
      setReportSent(true);
    } catch {
      setError("The report could not be sent.");
    }
  }

  function openViewer(index: number) {
    setViewer(index);
    try {
      if (!sessionStorage.getItem("kelpo_seen_prompt")) {
        sessionStorage.setItem("kelpo_seen_prompt", "1");
        window.setTimeout(() => setPromptOpen(true), 500);
      }
    } catch {
      // Storage can be blocked; the prompt just won't show again this session.
    }
  }

  async function reloadPins() {
    try {
      const result = await api.getPins(slug);
      setPins(result.pins);
    } catch {
      // The delivery still works if notes cannot be loaded.
    }
  }

  async function submitPin() {
    if (viewer === null || !draftPin || !pinText.trim()) return;
    setSavingPin(true);
    try {
      await api.addPin(slug, {
        fileId: link!.files[viewer].id,
        x: draftPin.x,
        y: draftPin.y,
        message: pinText.trim(),
        author: pinAuthor.trim() || "Client",
      });
      setDraftPin(null);
      setPinText("");
      await reloadPins();
    } catch {
      setError("The note could not be saved.");
    } finally {
      setSavingPin(false);
    }
  }

  function placePin(event: MouseEvent<HTMLImageElement>) {
    if (!pinMode || viewer === null) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setDraftPin({
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((event.clientY - rect.top) / rect.height) * 100,
    });
  }

  if (phase === "loading") {
    return (
      <main className="page wrap" style={{ display: "grid", alignContent: "center" }}>
        <Loading label="Opening files." detail="Bringing in the originals and any notes." />
      </main>
    );
  }

  if (phase === "gone") {
    return (
      <main className="page wrap">
        <header className="masthead"><span className="brand"><Seal /><span className="brand-name">Kelpo</span></span></header>
        <section className="section" style={{ borderTop: 0 }}>
          <Seal size="lg" />
          <h1 className="h2" style={{ marginTop: "2rem" }}>This link has ended.</h1>
          <p className="lede" style={{ marginTop: "1rem" }}>
            The files were deleted when it ended. Ask the sender for a fresh one.
          </p>
        </section>
        <SiteFooter />
      </main>
    );
  }

  if (phase === "error") {
    return (
      <main className="page wrap">
        <header className="masthead"><span className="brand"><Seal /><span className="brand-name">Kelpo</span></span></header>
        <section className="section" style={{ borderTop: 0 }}>
          <Seal size="lg" />
          <h1 className="h2" style={{ marginTop: "2rem" }}>This delivery could not be opened.</h1>
          <button className="btn" style={{ marginTop: "2rem" }} onClick={() => void load()}>Try again</button>
        </section>
        <SiteFooter />
      </main>
    );
  }

  if (phase === "locked") {
    return (
      <main className="page wrap">
        <header className="masthead"><span className="brand"><Seal /><span className="brand-name">Kelpo</span></span></header>
        <section className="section" style={{ borderTop: 0 }}>
          <motion.div className="envelope" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
            <Seal size="lg" />
            <h1 className="h2" style={{ marginTop: "2rem" }}>This link needs a password.</h1>
            <p className="lede" style={{ marginTop: "0.8rem" }}>Enter the password to open it.</p>
            <input
              className="field mono"
              style={{ marginTop: "2rem" }}
              type="password"
              placeholder="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") void unlock(); }}
            />
            {error && <p className="error-line">{error}</p>}
            <button className="btn btn-block" style={{ marginTop: "1.5rem" }} onClick={() => void unlock()}>Open link</button>
          </motion.div>
        </section>
        <SiteFooter />
      </main>
    );
  }

  if (!link) return null;

  const current = viewer === null ? null : link.files[viewer];

  return (
    <main
      className="page wrap"
      style={brand.accentColor ? ({ "--color-signal": brand.accentColor } as CSSProperties) : undefined}
    >
      <header className="masthead">
        <span className="brand">
          {brand.logoUrl ? (
            <img className="brand-logo" src={brand.logoUrl} alt="" />
          ) : (
            <Seal />
          )}
          {!brand.logoUrl && <span className="brand-name">Kelpo</span>}
        </span>
        <span className="masthead-meta">Delivered at original quality</span>
      </header>

      <section className="client-head" style={{ marginTop: "clamp(2.5rem, 8vh, 5rem)" }}>
        <div>
          <h1 className="display" style={{ fontSize: "clamp(2.8rem, 6vw, 4.75rem)" }}>{link.title}</h1>
          {link.message && <p className="lede" style={{ marginTop: "1.2rem" }}>{link.message}</p>}
          <p className="mono muted" style={{ marginTop: "1.2rem" }}>
            {link.files.length} {link.files.length === 1 ? "file" : "files"}. Original quality.
          </p>
        </div>
        <div className="expiry">
          <div
            className="ring-drain expiry-ring"
            style={{ "--drain-duration": `${ringDuration}s` } as CSSProperties}
            aria-hidden="true"
          />
          <div>
            <p className="mono">Ends {formatExpiry(link.expiresAt)}</p>
            <p className="mono muted">{timeLeft(link.expiresAt)} left</p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head"><h2 className="h3">Contact sheet</h2></div>
        <p className="mono muted" style={{ marginBottom: "1.2rem" }}>Tap a frame to view it full size.</p>
        <div className="sheet-grid" aria-label="Files in this delivery">
          {link.files.map((file, index) => (
            <motion.figure
              key={file.id}
              className="frame"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.32, delay: Math.min(index, 12) * 0.035 }}
            >
              <button type="button" className="frame-button" onClick={() => openViewer(index)} aria-label={`View ${file.name}`}>
                {file.contentType.startsWith("image/") ? (
                  <img src={previewUrl(file.id, slug)} alt={file.name} loading="lazy" />
                ) : (
                  <span className="doc-card">
                    <span className="h3 signal">PDF</span>
                    <span className="mono muted">Document</span>
                  </span>
                )}
                <span className="frame-number">{String(index + 1).padStart(2, "0")}</span>
              </button>
              <div className="frame-meta">
                <span className="frame-name" title={file.name}>{file.name}</span>
                <a href={downloadUrl(file.id, slug)}>Original, {formatBytes(file.sizeBytes)}</a>
              </div>
            </motion.figure>
          ))}
        </div>

        <div className="download-band">
          <a className="btn btn-block" style={{ maxWidth: "30rem" }} href={zipUrl(slug)}>
            Download all originals (.zip)
          </a>
          <p className="mono muted">Previews are light. Downloads are the real files.</p>
        </div>
      </section>

      <section className="delivery-notes">
        <div className="delivery-stamp mono">
          <Seal size="sm" />
          <span>Delivered at original quality. Kelpo. Ends {formatExpiry(link.expiresAt)}</span>
        </div>
        <div className="mono muted">
          {reportSent ? (
            <span>Report sent.</span>
          ) : reportOpen ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
              <select className="field field-compact" style={{ width: "auto" }} value={reportReason} onChange={(event) => setReportReason(event.target.value)}>
                <option value="spam">Spam</option>
                <option value="harmful">Harmful content</option>
                <option value="stolen">Stolen work</option>
                <option value="other">Something else</option>
              </select>
              <button className="text-btn" onClick={() => void sendReport()}>Send report</button>
            </div>
          ) : (
            <button className="text-btn" onClick={() => setReportOpen(true)}>Report this link</button>
          )}
        </div>
        {error && <p className="error-line">{error}</p>}
        {pins.length > 0 && (
          <div style={{ borderTop: "1px solid var(--color-ink)", paddingTop: "1.25rem", width: "100%" }}>
            <p className="field-label">Client notes</p>
            <div style={{ display: "grid", gap: "0.75rem", marginTop: "1rem" }}>
              {pins.map((pin, index) => {
                const file = link.files.find((item) => item.id === pin.file_id);
                return (
                  <div className="pin-note" key={pin.id}>
                    <span className="pin-note-number">{index + 1}</span>
                    <div style={{ minWidth: 0 }}>
                      <p>{pin.message}</p>
                      <p className="mono muted" style={{ marginTop: "0.25rem" }}>{pin.author}, {file?.name ?? "file"}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      <SiteFooter />

      <AnimatePresence>
        {current && viewer !== null && (
          <motion.div
            className="viewer"
            role="dialog"
            aria-modal="true"
            key="viewer"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            onClick={() => setViewer(null)}
          >
            <div className="viewer-bar" onClick={(event) => event.stopPropagation()}>
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{current.name}</span>
              <div style={{ display: "flex", alignItems: "center", gap: "1rem", flex: "none" }}>
                {current.contentType.startsWith("image/") && (
                  <button
                    onClick={() => { setPinMode((value) => !value); setDraftPin(null); }}
                    style={pinMode ? { color: "var(--color-signal)" } : undefined}
                  >
                    {pinMode ? "Cancel note" : "Add a note"}
                  </button>
                )}
                <a href={downloadUrl(current.id, slug)}>Download original</a>
                <button onClick={() => setViewer(null)}>Close</button>
              </div>
            </div>
            <div className="viewer-stage" onClick={(event) => event.stopPropagation()}>
              {link.files.length > 1 && (
                <button className="viewer-nav" onClick={() => setViewer((viewer - 1 + link.files.length) % link.files.length)} aria-label="Previous">←</button>
              )}
              {current.contentType.startsWith("image/") ? (
                <div className={`viewer-image-wrap ${pinMode ? "is-pinning" : ""}`}>
                  <img className="viewer-image" src={previewUrl(current.id, slug)} alt={current.name} onClick={placePin} />
                  {pins.filter((pin) => pin.file_id === current.id).map((pin, index) => (
                    <span key={pin.id} className="pin-marker" style={{ left: `${pin.x}%`, top: `${pin.y}%` }} title={`${pin.author}: ${pin.message}`}>
                      {index + 1}
                    </span>
                  ))}
                  {draftPin && <span className="pin-marker is-draft" style={{ left: `${draftPin.x}%`, top: `${draftPin.y}%` }}>+</span>}
                </div>
              ) : (
                <div className="viewer-pdf" onClick={(event) => event.stopPropagation()}>
                  <span className="display signal">PDF</span>
                  <p style={{ marginTop: "1rem" }}>{current.name}</p>
                  <a className="btn" style={{ marginTop: "1.5rem" }} href={downloadUrl(current.id, slug)}>Download original</a>
                </div>
              )}
              {link.files.length > 1 && (
                <button className="viewer-nav" onClick={() => setViewer((viewer + 1) % link.files.length)} aria-label="Next">→</button>
              )}
            </div>
            {draftPin && (
              <div className="pin-form" onClick={(event) => event.stopPropagation()}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem" }}>
                  <p className="field-label">New note</p>
                  <button className="text-btn" onClick={() => setDraftPin(null)}>Drop it</button>
                </div>
                <input className="field" style={{ marginTop: "0.75rem" }} placeholder="What should be changed?" value={pinText} onChange={(event) => setPinText(event.target.value)} />
                <input className="field mono" style={{ marginTop: "0.75rem" }} placeholder="Your name" value={pinAuthor} onChange={(event) => setPinAuthor(event.target.value)} />
                <button className="btn btn-block" style={{ marginTop: "1rem" }} disabled={savingPin} onClick={() => void submitPin()}>
                  {savingPin ? "Saving note." : "Pin note"}
                </button>
              </div>
            )}
            <div className="viewer-count" onClick={(event) => event.stopPropagation()}>
              {viewer + 1} / {link.files.length}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <TryKelpoPrompt open={promptOpen} onClose={() => setPromptOpen(false)} />
    </main>
  );
}
