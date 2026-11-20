import { type CSSProperties, type MouseEvent, useEffect, useMemo, useState } from "react";
import Credits from "../components/Credits";
import LikeButton from "../components/LikeButton";
import Loading from "../components/Loading";
import TryKelpoPrompt from "../components/TryKelpoPrompt";
import { api, ApiError, type Pin, type PublicLink } from "../lib/api";
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
      <main className="mx-auto flex min-h-dvh max-w-xl items-center px-5">
        <Loading label="Opening delivery." detail="Bringing in the originals and your notes." />
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
        <footer className="mt-12 flex flex-col gap-4 border-t border-ink/10 pt-4 sm:flex-row sm:items-end sm:justify-between">
          <Credits />
          <LikeButton />
        </footer>
      </main>
    );
  }

  if (phase === "error") {
    return (
      <main className="mx-auto min-h-dvh max-w-xl px-5 py-16">
        <Seal />
        <h1 className="mt-10 font-display text-4xl tracking-tight">This delivery could not be opened.</h1>
        <button className="primary-btn mt-8" onClick={() => void load()}>Try again</button>
        <footer className="mt-12 flex flex-col gap-4 border-t border-ink/10 pt-4 sm:flex-row sm:items-end sm:justify-between">
          <Credits />
          <LikeButton />
        </footer>
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
        <footer className="mt-12 flex flex-col gap-4 border-t border-ink/10 pt-4 sm:flex-row sm:items-end sm:justify-between">
          <Credits />
          <LikeButton />
        </footer>
      </main>
    );
  }

  if (!link) return null;

  const current = viewer === null ? null : link.files[viewer];

  return (
    <main
      className="mx-auto min-h-dvh max-w-3xl px-5 py-8 sm:py-12"
      style={brand.accentColor ? ({ "--color-signal": brand.accentColor } as CSSProperties) : undefined}
    >
      <header className="flex items-center justify-between gap-3 border-b border-ink pb-4">
        <span className="flex shrink-0 items-center gap-3">
          {brand.logoUrl ? (
            <img className="brand-logo" src={brand.logoUrl} alt="" />
          ) : (
            <span className="font-display text-2xl">Kelpo</span>
          )}
        </span>
        <span className="hidden text-right font-mono text-[10px] uppercase leading-tight tracking-widest text-muted sm:block sm:text-xs">
          Delivered at original quality
        </span>
      </header>

      <section className="mt-10 flex items-start justify-between gap-4 sm:gap-6">
        <div className="min-w-0">
          <h1 className="break-words font-display text-3xl leading-tight tracking-tight sm:text-5xl">{link.title}</h1>
          {link.message && <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">{link.message}</p>}
          <p className="mt-3 font-mono text-xs text-muted">
            {link.files.length} {link.files.length === 1 ? "file" : "files"} · original quality
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div
            className="ring-drain ml-auto h-10 w-10 rounded-full sm:h-12 sm:w-12"
            style={{ "--drain-duration": `${ringDuration}s` } as CSSProperties}
            aria-hidden="true"
          />
          <p className="mt-2 whitespace-nowrap font-mono text-[11px] text-muted">
            {timeLeft(link.expiresAt)}
          </p>
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
              onClick={() => openViewer(index)}
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
        <div className="flex items-start gap-2 font-mono text-xs text-muted">
          <span className="mt-0.5 shrink-0"><Seal small /></span>
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
        {pins.length > 0 && (
          <div className="mt-6 border-t border-ink/10 pt-5">
            <p className="font-mono text-xs uppercase tracking-widest text-muted">Client notes</p>
            <div className="mt-3 space-y-3">
              {pins.map((pin, index) => {
                const file = link.files.find((item) => item.id === pin.file_id);
                return (
                  <div key={pin.id} className="pin-note">
                    <span className="pin-note-number">{index + 1}</span>
                    <div className="min-w-0">
                      <p className="text-sm">{pin.message}</p>
                      <p className="mt-1 font-mono text-[11px] text-muted">
                        {pin.author} · {file?.name ?? "file"}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <div className="mt-8 flex flex-col gap-4 border-t border-ink/10 pt-4 sm:flex-row sm:items-end sm:justify-between">
          <Credits />
          <LikeButton />
        </div>
      </footer>

      {current && viewer !== null && (
        <div className="viewer" role="dialog" aria-modal="true" onClick={() => setViewer(null)}>
          <div className="viewer-bar" onClick={(event) => event.stopPropagation()}>
            <span className="hidden min-w-0 truncate text-xs sm:block sm:text-sm">{current.name}</span>
            <div className="flex items-center gap-2 text-xs sm:gap-4 sm:text-sm">
              {current.contentType.startsWith("image/") && (
                <button
                  className={pinMode ? "shrink-0 text-signal underline underline-offset-2" : "shrink-0 underline underline-offset-2"}
                  onClick={() => {
                    setPinMode((value) => !value);
                    setDraftPin(null);
                  }}
                >
                  {pinMode ? "Cancel note" : "Add a note"}
                </button>
              )}
              <a className="shrink-0 underline underline-offset-2" href={downloadUrl(current.id, slug)}>
                <span className="hidden sm:inline">Download original</span>
                <span className="sm:hidden">Download</span>
              </a>
              <button className="shrink-0" onClick={() => setViewer(null)}>Close</button>
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
              <div className={`viewer-image-wrap ${pinMode ? "is-pinning" : ""}`}>
                <img
                  className="viewer-image"
                  src={previewUrl(current.id, slug)}
                  alt={current.name}
                  onClick={placePin}
                />
                {pins
                  .filter((pin) => pin.file_id === current.id)
                  .map((pin, index) => (
                    <span
                      key={pin.id}
                      className="pin-marker"
                      style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
                      title={`${pin.author}: ${pin.message}`}
                    >
                      {index + 1}
                    </span>
                  ))}
                {draftPin && (
                  <span className="pin-marker is-draft" style={{ left: `${draftPin.x}%`, top: `${draftPin.y}%` }}>
                    +
                  </span>
                )}
              </div>
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
          {draftPin && (
            <div className="pin-form" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono text-xs uppercase tracking-widest">New note</p>
                <button className="text-xs underline underline-offset-2" onClick={() => setDraftPin(null)}>
                  Drop it
                </button>
              </div>
              <input
                className="field mt-3 text-sm"
                placeholder="What should be changed?"
                value={pinText}
                onChange={(event) => setPinText(event.target.value)}
              />
              <input
                className="field mt-3 font-mono text-xs"
                placeholder="Your name"
                value={pinAuthor}
                onChange={(event) => setPinAuthor(event.target.value)}
              />
              <button className="primary-btn mt-4 w-full" disabled={savingPin} onClick={() => void submitPin()}>
                {savingPin ? "Saving note." : "Pin note"}
              </button>
            </div>
          )}
          <div className="viewer-count" onClick={(event) => event.stopPropagation()}>
            {viewer + 1} / {link.files.length}
          </div>
        </div>
      )}

      <TryKelpoPrompt open={promptOpen} onClose={() => setPromptOpen(false)} />
    </main>
  );
}
