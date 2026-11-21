import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import gsap from "gsap";
import Lenis from "lenis";
import Credits from "../components/Credits";
import LikeButton from "../components/LikeButton";
import Seal from "../components/Seal";
import { api, ApiError, type PublicLink } from "../lib/api";
import { formatBytes, formatExpiry, ogUrl } from "../lib/format";
import { prefersReducedMotion } from "../lib/motion";
import { setOwnerToken } from "../lib/session";
import { makeOgCard, makeThumbnail } from "../lib/thumbnails";

type Expiry = "24h" | "7d" | "30d";
type Stage = "editing" | "uploading" | "done";
type Picked = { key: string; file: File; thumb: Blob | null };

const LIFETIMES: Record<Expiry, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};
const ALLOWED = /\.(jpe?g|png|webp|gif|pdf)$/i;
const MAX_BYTES = 25 * 1024 * 1024;

/** Sender flow: pick files, set the terms, seal, then see the exact chat card. */
export default function CreatePage() {
  const [files, setFiles] = useState<Picked[]>([]);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [expiry, setExpiry] = useState<Expiry>("7d");
  const [hasPassword, setHasPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [stage, setStage] = useState<Stage>("editing");
  const [progress, setProgress] = useState({ index: 0, fraction: 0 });
  const [result, setResult] = useState<{ url: string; expiresAt: number; link: PublicLink } | null>(
    null,
  );
  const [copied, setCopied] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [ogCard, setOgCard] = useState<Blob | null>(null);
  const [stats, setStats] = useState<{ opens: number; downloads: number; zips: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const heroRef = useRef<HTMLElement>(null);

  const totalBytes = useMemo(() => files.reduce((sum, item) => sum + item.file.size, 0), [files]);
  const endsAt = useMemo(() => Date.now() + LIFETIMES[expiry], [expiry]);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const lenis = new Lenis({ lerp: 0.11, wheelMultiplier: 0.9 });
    let frame = 0;
    const tick = (time: number) => {
      lenis.raf(time);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      lenis.destroy();
    };
  }, []);

  useEffect(() => {
    if (stage !== "editing" || prefersReducedMotion() || !heroRef.current) return;
    const context = gsap.context(() => {
      const timeline = gsap.timeline({ defaults: { ease: "power4.out" } });
      timeline
        .from("[data-seal]", { scale: 1.18, rotate: -4, opacity: 0, duration: 0.34 })
        .from(".hero-title .line > span", { yPercent: 112, opacity: 0, duration: 0.75, stagger: 0.09 }, "-=0.08")
        .from(".hero-lede", { y: 14, opacity: 0, duration: 0.5 }, "-=0.42")
        .from(".hero-actions > *", { y: 10, opacity: 0, duration: 0.4, stagger: 0.07 }, "-=0.34");
    }, heroRef);
    return () => context.revert();
  }, [stage]);

  async function addFiles(list: FileList | File[]) {
    const incoming = Array.from(list);
    const remaining = 15 - files.length;
    if (remaining <= 0) {
      setError("Up to 15 files per link.");
      return;
    }
    const accepted = incoming.filter((file) => ALLOWED.test(file.name) && file.size <= MAX_BYTES);
    if (accepted.length !== incoming.length) {
      setError("Only JPG, PNG, WebP, GIF and PDF files under 25 MB.");
    } else {
      setError("");
    }
    const prepared = await Promise.all(
      accepted.slice(0, remaining).map(async (file, index) => ({
        key: `${Date.now()}-${index}-${file.name}`,
        file,
        thumb: await makeThumbnail(file),
      })),
    );
    setFiles((current) => [...current, ...prepared]);
  }

  async function seal() {
    setError("");
    if (!files.length) return setError("Add at least one file.");
    if (!title.trim()) return setError("Give the delivery a title.");
    if (hasPassword && password.length < 6) return setError("Password needs at least 6 characters.");

    setStage("uploading");
    try {
      const created = await api.createLink({
        title: title.trim(),
        message: message.trim() || undefined,
        expiry,
        hasPassword,
        password: hasPassword ? password : undefined,
        fileCount: files.length,
      });
      setOwnerToken(created.ownerToken);
      const card = await makeOgCard(title.trim(), files.length, created.expiresAt, files[0]?.thumb ?? null);
      setOgCard(card);
      for (let index = 0; index < files.length; index++) {
        setProgress({ index: index + 1, fraction: 0 });
        const item = files[index];
        await api.uploadFile(
          created.slug,
          item.file,
          item.thumb,
          (fraction) => setProgress({ index: index + 1, fraction }),
          index === 0 ? card : null,
        );
      }
      const finalized = await api.finalize(created.slug);
      setResult({ url: finalized.url, expiresAt: created.expiresAt, link: finalized.link });
      setStage("done");
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "The delivery could not be sealed. Try again.");
      setStage("editing");
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(result?.url ?? "");
      setCopied(true);
    } catch {
      setError("Copy failed. Select the link and copy it yourself.");
    }
  }

  function reset() {
    setFiles([]);
    setTitle("");
    setMessage("");
    setPassword("");
    setHasPassword(false);
    setResult(null);
    setCopied(false);
    setOgCard(null);
    setError("");
    setStage("editing");
  }

  useEffect(() => {
    if (!result) return;
    let active = true;
    const load = () => {
      api
        .stats(result.link.slug)
        .then((value) => { if (active) setStats(value); })
        .catch(() => {});
    };
    load();
    const timer = window.setInterval(load, 10_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [result]);

  if (stage === "uploading") {
    return (
      <main className="page wrap">
        <header className="masthead">
          <span className="brand"><Seal /><span className="brand-name">Kelpo</span></span>
          <span className="masthead-meta">Sealing your delivery</span>
        </header>
        <section className="section" style={{ borderTop: 0 }}>
          <Seal size="lg" className="animate-seal" />
          <h1 className="h2" style={{ marginTop: "1.8rem" }}>Preparing your link.</h1>
          <p className="mono muted" style={{ marginTop: "0.7rem" }}>
            Sending file {progress.index} of {files.length}. Keep this tab open.
          </p>
          <div className="progress-rule" style={{ "--fill": `${progress.fraction * 100}%`, marginTop: "2.5rem" } as CSSProperties}>
            <span />
          </div>
          <p className="mono muted" style={{ marginTop: "0.8rem" }}>
            Uploading originals and making small previews.
          </p>
        </section>
      </main>
    );
  }

  if (stage === "done" && result) {
    const first = result.link.files[0];
    return (
      <main className="page wrap">
        <header className="masthead">
          <a className="brand" href="/"><Seal /><span className="brand-name">Kelpo</span></a>
          <span className="masthead-meta">Original quality, delivered</span>
        </header>

        <section className="result-head" style={{ marginTop: "clamp(2.5rem, 8vh, 5rem)" }}>
          <div>
            <motion.h1
              className="h2"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              Ready to send.
            </motion.h1>
            <p className="lede" style={{ marginTop: "0.8rem" }}>This is how it looks in chat.</p>
          </div>
          <Seal size="lg" className="animate-seal" />
        </section>

        <section className="section" style={{ paddingTop: "2rem" }}>
          <div className="section-head"><h2 className="h3">The delivery card</h2></div>
          <motion.div
            className="chat-preview"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.1 }}
          >
            <div className="chat-contact">
              <Seal size="sm" />
              <div>
                <p style={{ fontWeight: 600 }}>Kelpo</p>
                <p className="mono muted">link · {new URL(result.url).host}</p>
              </div>
            </div>
            <a className="chat-card" href={result.url} target="_blank" rel="noreferrer" aria-label="Open the shared delivery">
              {first && <img className="chat-thumb" src={ogUrl(result.link.slug)} alt="" />}
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 }}>{result.link.title}</p>
                <p className="mono muted" style={{ marginTop: "0.35rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {result.link.files.length} files · {formatBytes(result.link.files.reduce((sum, file) => sum + file.sizeBytes, 0))} · original quality
                </p>
                <p className="mono signal" style={{ marginTop: "0.55rem" }}>Ends {formatExpiry(result.expiresAt)}</p>
              </div>
              <span className="chat-arrow" aria-hidden="true">↗</span>
            </a>
            <p className="mono muted" style={{ marginTop: "0.6rem" }}>Tap the card to open the delivery.</p>
          </motion.div>
          <div className="og-links">
            <a href={result.url} target="_blank" rel="noreferrer">Open link ↗</a>
            <a href={ogUrl(result.link.slug)} target="_blank" rel="noreferrer">View preview image ↗</a>
          </div>
        </section>

        <section className="section">
          <div className="section-head"><h2 className="h3">Your link</h2></div>
          <div className="link-field">
            <label className="field-label" htmlFor="kelpo-link">Copy and send</label>
            <input
              id="kelpo-link"
              className="field mono"
              readOnly
              value={result.url}
              onFocus={(event) => event.currentTarget.select()}
            />
            <button className="btn" onClick={() => void copyLink()}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={copied ? "copied" : "copy"}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  transition={{ duration: 0.15 }}
                >
                  {copied ? "Copied" : "Copy link"}
                </motion.span>
              </AnimatePresence>
            </button>
          </div>
          <div className="og-links" style={{ marginTop: "1.25rem" }}>
            <a href={`https://wa.me/?text=${encodeURIComponent(`${result.link.title}\n${result.url}`)}`} target="_blank" rel="noreferrer">Send on WhatsApp ↗</a>
            <a href={`mailto:?subject=${encodeURIComponent(result.link.title)}&body=${encodeURIComponent(result.url)}`}>Send by email ↗</a>
            {typeof navigator.share === "function" && (
              <a href="#" onClick={(event) => { event.preventDefault(); void navigator.share({ title: result.link.title, url: result.url }).catch(() => {}); }}>Share ↗</a>
            )}
          </div>
          <p className="mono muted" style={{ marginTop: "1.5rem" }}>
            Link ends {formatExpiry(result.expiresAt)}. Then the files are deleted.
          </p>
          {stats && (
            <p className="mono muted" style={{ marginTop: "0.6rem" }}>
              Opened {stats.opens} {stats.opens === 1 ? "time" : "times"}, {stats.downloads} original downloads, {stats.zips} ZIP downloads
            </p>
          )}
        </section>

        {error && <p className="error-line">{error}</p>}

        <div className="hero-actions" style={{ marginTop: "2.5rem" }}>
          <button className="text-btn" onClick={reset}>Create another delivery</button>
          <a className="text-btn" href="/dashboard">Save your links</a>
        </div>

        <footer className="footer">
          <Credits />
          <LikeButton />
        </footer>
      </main>
    );
  }

  return (
    <main className="page wrap">
      <header className="masthead">
        <a className="brand" href="/"><Seal /><span className="brand-name">Kelpo</span></a>
        <span className="masthead-meta">Original quality, delivered</span>
      </header>

      <section className="hero" ref={heroRef}>
        <div className="hero-copy">
          <h1 className="display hero-title">
            <span className="line"><span>Send the originals.</span></span>
            <span className="line"><span>Uncompressed.</span></span>
          </h1>
          <p className="lede hero-lede">
            One link for up to 15 files. Send it in WhatsApp, Instagram or email. When the
            link ends, the files are gone.
          </p>
          <div className="hero-actions">
            <button className="btn" onClick={() => document.getElementById("delivery-tray")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
              Start a delivery
            </button>
            <a className="text-btn" href="/dashboard">Save your links ↗</a>
          </div>
          <p className="assurance">No account · No app · No compression</p>
        </div>

        <div className="compare" aria-label="The same file, compressed in a chat app and intact with Kelpo">
          {[
            {
              key: "compressed",
              label: "In a chat app",
              note: "Blurry. Capped. Sometimes blocked.",
              src: "/images/compare-compressed.jpg",
              tag: "Compressed, 2 KB",
              original: false,
            },
            {
              key: "original",
              label: "With Kelpo",
              note: "Every byte. Intact.",
              src: "/images/compare-original.jpg",
              tag: "Original, 190 KB",
              original: true,
            },
          ].map((side, index) => (
            <motion.div
              className="compare-panel"
              key={side.key}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.2 + index * 0.12 }}
            >
              <div className="compare-label">
                <strong>{side.label}</strong>
                <span className="mono muted">0{index + 1} / 02</span>
              </div>
              <div className={`compare-frame ${side.original ? "is-original" : "is-compressed"}`}>
                <img src={side.src} alt="A photograph of paint and a brush, shown at two quality levels" />
                <span className={`compare-tag ${side.original ? "is-original" : ""}`}>{side.tag}</span>
              </div>
              <p className={`compare-note mono ${side.original ? "signal" : "muted"}`}>{side.note}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="section" aria-label="How Kelpo works">
        <div className="section-head"><h2 className="h3">Three steps. One link.</h2></div>
        <div className="steps">
          {[
            ["01", "Pick your files", "Up to 15 originals."],
            ["02", "Set an expiry", "24 hours, 7 or 30 days."],
            ["03", "Send one link", "Works in any chat app."],
          ].map(([number, stepTitle, detail]) => (
            <div className="step" key={number}>
              <span className="step-index">{number}</span>
              <p className="step-title">{stepTitle}</p>
              <p className="mono muted">{detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section" id="delivery-tray">
        <div className="section-head"><h2 className="h3">Your delivery tray.</h2></div>
        <div
          className={`tray ${dragging ? "is-dragging" : ""}`}
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void addFiles(event.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          aria-label="Choose files to deliver"
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") inputRef.current?.click();
          }}
        >
          <span className="reg-mark" aria-hidden="true" />
          <p className="tray-title">Drop files here</p>
          <p className="mono muted">Or tap to choose. JPG, PNG, WebP, GIF, PDF. Up to 15 files, 25 MB each.</p>
          <input
            ref={inputRef}
            className="hidden"
            type="file"
            multiple
            accept=".jpg,.jpeg,.png,.webp,.gif,.pdf"
            onChange={(event) => {
              if (event.target.files) void addFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </div>

        <AnimatePresence initial={false}>
          {files.length > 0 && (
            <motion.div
              className="packing"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              style={{ overflow: "hidden" }}
            >
              <div className="packing-head mono muted">
                <span>{files.length} {files.length === 1 ? "file" : "files"}</span>
                <span className="num">{formatBytes(totalBytes)}</span>
              </div>
              <AnimatePresence initial={false}>
                {files.map((item) => (
                  <motion.div
                    className="packing-row"
                    key={item.key}
                    layout
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -16 }}
                    transition={{ duration: 0.22 }}
                  >
                    <span className="packing-name">{item.file.name}</span>
                    <span className="mono muted num">{formatBytes(item.file.size)}</span>
                    <button
                      className="packing-remove"
                      onClick={() => setFiles((current) => current.filter((entry) => entry.key !== item.key))}
                    >
                      Remove
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <section className="section">
        <div className="section-head"><h2 className="h3">Set the terms.</h2></div>
        <div className="form-row">
          <label className="block">
            <span className="field-label">Title</span>
            <input
              className="field field-display"
              placeholder="Brand refresh final files"
              value={title}
              maxLength={120}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className="block">
            <span className="field-label">A note for your client</span>
            <textarea
              className="field"
              style={{ minHeight: "5.5rem", resize: "vertical" }}
              placeholder="Optional"
              value={message}
              maxLength={600}
              onChange={(event) => setMessage(event.target.value)}
            />
          </label>
        </div>

        <div className="form-row">
          <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
            <legend className="field-label">Link expires after</legend>
            <div className="stamps" style={{ marginTop: "0.9rem" }}>
              {(["24h", "7d", "30d"] as Expiry[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`stamp ${expiry === option ? "is-active" : ""}`}
                  onClick={() => setExpiry(option)}
                >
                  {expiry === option && (
                    <motion.span
                      className="stamp-active-bg"
                      layoutId="stamp-active"
                      transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    />
                  )}
                  <span>{option === "24h" ? "24 hours" : option === "7d" ? "7 days" : "30 days"}</span>
                  <small>{formatExpiry(Date.now() + LIFETIMES[option])}</small>
                </button>
              ))}
            </div>
            <p className="mono muted" style={{ marginTop: "0.8rem" }}>
              Ends {formatExpiry(endsAt)}. Then the files are deleted.
            </p>
          </fieldset>

          <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
            <legend className="field-label">Password</legend>
            <label className="toggle" style={{ marginTop: "0.8rem" }}>
              <input
                type="checkbox"
                checked={hasPassword}
                onChange={(event) => setHasPassword(event.target.checked)}
              />
              <span>Require a password</span>
            </label>
            <AnimatePresence initial={false}>
              {hasPassword && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  style={{ overflow: "hidden" }}
                >
                  <input
                    className="field mono"
                    style={{ marginTop: "1rem" }}
                    type="password"
                    placeholder="At least 6 characters"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </fieldset>
        </div>
      </section>

      {error && <p className="error-line">{error}</p>}

      <button className="btn btn-block" style={{ marginTop: "2.5rem" }} onClick={() => void seal()}>
        Seal and create link
      </button>
      <p className="mono muted" style={{ marginTop: "1rem", textAlign: "center" }}>
        No account. No app. No compression.
      </p>

      <footer className="footer">
        <div>
          <Credits />
          <p className="mono muted" style={{ marginTop: "0.4rem" }}>Comparison photograph: Unsplash.</p>
        </div>
        <LikeButton />
      </footer>
    </main>
  );
}
