import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { api, ApiError, type PublicLink } from "../lib/api";
import { downloadUrl, formatBytes, formatExpiry, previewUrl, timeLeft, zipUrl } from "../lib/format";
import { setAccessToken } from "../lib/session";

type Phase = "loading" | "locked" | "ready" | "gone" | "error";

function Seal({ small = false }: { small?: boolean }) {
  return (
    <span className={`seal animate-seal ${small ? "seal-sm" : ""}`} aria-hidden="true">
      {Array.from({ length: 9 }, (_, i) => <i key={i} />)}
    </span>
  );
}

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

  async function load() {
    setPhase("loading");
    try {
      setLink(await api.getLink(slug));
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

  if (phase === "loading") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-xl items-center px-5">
        <p className="font-display text-2xl text-muted">Opening delivery…</p>
      </main>
    );
  }

  if (phase === "gone") {
    return (
      <main className="mx-auto min-h-dvh max-w-xl px-5 py-16">
        <Seal />
        <h1 className="mt-10 font-display text-5xl tracking-tight">This link has ended.</h1>
        <p className="mt-4 text-sm leading-relaxed text-muted">
          The files were deleted when it ended. Ask the sender for a fresh one.
        </p>
      </main>
    );
  }

  if (phase === "error") {
    return (
      <main className="mx-auto min-h-dvh max-w-xl px-5 py-16">
        <Seal />
        <h1 className="mt-10 font-display text-4xl tracking-tight">This delivery could not be opened.</h1>
        <button className="primary-btn mt-8" onClick={() => void load()}>Try again</button>
      </main>
    );
  }

  if (phase === "locked") {
    return (
      <main className="mx-auto min-h-dvh max-w-xl px-5 py-16">
        <div className="envelope settle-in">
          <span className="seal" aria-hidden="true">
            {Array.from({ length: 9 }, (_, i) => <i key={i} />)}
          </span>
          <h1 className="mt-8 font-display text-4xl tracking-tight">This delivery is sealed.</h1>
          <p className="mt-3 text-sm text-muted">Enter the password to open it.</p>
          <input
            className="field mt-8 font-mono text-sm"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") void unlock(); }}
          />
          {error && <p className="mt-3 text-sm text-signal">{error}</p>}
          <button className="primary-btn mt-4 w-full" onClick={() => void unlock()}>Open delivery</button>
        </div>
      </main>
    );
  }

  if (!link) return null;

  const current = viewer === null ? null : link.files[viewer];

  return (
    <main className="mx-auto min-h-dvh max-w-3xl px-5 py-8 sm:py-12">
      <header className="flex items-center justify-between border-b border-ink pb-4">
        <span className="font-display text-2xl">Kelpo</span>
        <span className="font-mono text-xs uppercase tracking-widest text-muted">
          Delivered at original quality
        </span>
      </header>

      <section className="mt-10 flex items-start justify-between gap-6">
        <div>
          <h1 className="font-display text-4xl leading-tight tracking-tight sm:text-5xl">{link.title}</h1>
          {link.message && <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">{link.message}</p>}
          <p className="mt-3 font-mono text-xs text-muted">
            {link.files.length} {link.files.length === 1 ? "file" : "files"} · original quality
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div
            className="ring-drain ml-auto h-12 w-12 rounded-full"
            style={{ "--drain-duration": `${ringDuration}s` } as CSSProperties}
            aria-hidden="true"
          />
          <p className="mt-2 font-mono text-xs text-muted">{timeLeft(link.expiresAt)}</p>
        </div>
      </section>

      <p className="settle-in mt-8 font-mono text-xs uppercase tracking-widest text-muted">
        Tap a frame to view it full size.
      </p>

      <section className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Files in this delivery">
        {link.files.map((file, index) => (
          <figure
            key={file.id}
            className="frame-reveal border border-ink/15"
            style={{ animationDelay: `${Math.min(index, 12) * 45}ms` }}
          >
            <button
              type="button"
              className="frame-button"
              onClick={() => setViewer(index)}
              aria-label={`View ${file.name}`}
            >
              {file.contentType.startsWith("image/") ? (
                <img
                  className="h-full w-full object-cover"
                  src={previewUrl(file.id, slug)}
                  alt={file.name}
                  loading="lazy"
                />
              ) : (
                <span className="doc-card">
                  <span className="font-display text-3xl text-signal">PDF</span>
                  <span className="font-mono text-[11px] text-muted">Document</span>
                </span>
              )}
              <span className="frame-number">{String(index + 1).padStart(2, "0")}</span>
            </button>
            <figcaption className="px-2 py-2">
              <p className="truncate text-xs">{file.name}</p>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] text-muted">{formatBytes(file.sizeBytes)}</span>
                <a className="text-[11px] underline underline-offset-2" href={downloadUrl(file.id, slug)}>
                  Download original
                </a>
              </div>
            </figcaption>
          </figure>
        ))}
      </section>

      <div className="mt-8 border-t border-ink pt-6">
        <a className="primary-btn block text-center" href={zipUrl(slug)}>
          Download all originals (.zip)
        </a>
        <p className="mt-3 text-center font-mono text-xs text-muted">
          Previews are light. Downloads are the real files.
        </p>
      </div>

      <footer className="mt-14 border-t border-ink/15 pt-5">
        <div className="flex items-center gap-2 font-mono text-xs text-muted">
          <Seal small />
          <span>Delivered at original quality · Kelpo · ends {formatExpiry(link.expiresAt)}</span>
        </div>
        <div className="mt-4 font-mono text-xs text-muted">
          {reportSent ? (
            <span>Report sent.</span>
          ) : reportOpen ? (
            <div className="flex flex-wrap items-center gap-3">
              <select
                className="field field-compact w-auto text-xs"
                value={reportReason}
                onChange={(event) => setReportReason(event.target.value)}
              >
                <option value="spam">Spam</option>
                <option value="harmful">Harmful content</option>
                <option value="stolen">Stolen work</option>
                <option value="other">Something else</option>
              </select>
              <button className="underline underline-offset-2" onClick={() => void sendReport()}>Send report</button>
            </div>
          ) : (
            <button className="underline underline-offset-2" onClick={() => setReportOpen(true)}>
              Report this delivery
            </button>
          )}
        </div>
      </footer>

      {current && viewer !== null && (
        <div className="viewer" role="dialog" aria-modal="true" onClick={() => setViewer(null)}>
          <div className="viewer-bar" onClick={(event) => event.stopPropagation()}>
            <span className="truncate text-sm">{current.name}</span>
            <div className="flex items-center gap-4">
              <a className="underline underline-offset-2 text-sm" href={downloadUrl(current.id, slug)}>
                Download original
              </a>
              <button onClick={() => setViewer(null)}>Close</button>
            </div>
          </div>
          <div className="viewer-stage" onClick={(event) => event.stopPropagation()}>
            {link.files.length > 1 && (
              <button
                className="viewer-nav"
                onClick={() => setViewer((viewer - 1 + link.files.length) % link.files.length)}
                aria-label="Previous"
              >
                ←
              </button>
            )}
            {current.contentType.startsWith("image/") ? (
              <img
                className="viewer-image"
                src={previewUrl(current.id, slug)}
                alt={current.name}
                onClick={(event) => event.stopPropagation()}
              />
            ) : (
              <div className="viewer-pdf" onClick={(event) => event.stopPropagation()}>
                <span className="font-display text-6xl text-signal">PDF</span>
                <p className="mt-4 text-sm">{current.name}</p>
                <a className="primary-btn mt-6" href={downloadUrl(current.id, slug)}>Download original</a>
              </div>
            )}
            {link.files.length > 1 && (
              <button
                className="viewer-nav"
                onClick={() => setViewer((viewer + 1) % link.files.length)}
                aria-label="Next"
              >
                →
              </button>
            )}
          </div>
          <div className="viewer-count" onClick={(event) => event.stopPropagation()}>
            {viewer + 1} / {link.files.length}
          </div>
        </div>
      )}
    </main>
  );
}
