import { type CSSProperties, useMemo, useRef, useState } from "react";
import Credits from "../components/Credits";
import LikeButton from "../components/LikeButton";
import { api, ApiError, type PublicLink } from "../lib/api";
import { formatBytes, formatExpiry, ogUrl } from "../lib/format";
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

function Seal({ small = false }: { small?: boolean }) {
  return (
    <span className={`seal animate-seal ${small ? "seal-sm" : ""}`} aria-hidden="true">
      {Array.from({ length: 9 }, (_, i) => <i key={i} />)}
    </span>
  );
}

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
  const inputRef = useRef<HTMLInputElement>(null);

  const totalBytes = useMemo(() => files.reduce((sum, item) => sum + item.file.size, 0), [files]);
  const endsAt = useMemo(() => Date.now() + LIFETIMES[expiry], [expiry]);

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

  if (stage === "uploading") {
    const fraction = progress.fraction;
    return (
      <main className="mx-auto min-h-dvh max-w-xl px-5 py-16">
        <Seal />
        <h1 className="mt-8 font-display text-4xl tracking-tight">Sealing your delivery.</h1>
        <p className="mt-2 text-sm text-muted">Sending file {progress.index} of {files.length}. Keep this tab open.</p>
        <div className="progress-rule mt-10" style={{ "--fill": `${fraction * 100}%` } as CSSProperties}>
          <span />
        </div>
        <p className="mt-3 font-mono text-xs text-muted">Originals first. Previews ride along.</p>
      </main>
    );
  }

  if (stage === "done" && result) {
    const first = result.link.files[0];
    return (
      <main className="mx-auto min-h-dvh max-w-xl px-5 py-10 sm:py-14">
        <header className="flex items-center gap-3">
          <Seal />
          <span className="font-display text-2xl">Kelpo</span>
        </header>

        <h1 className="settle-in mt-12 font-display text-5xl tracking-tight">Ready to send.</h1>
        <p className="mt-2 text-sm text-muted">This is how it will look in chat.</p>

        <div className="mt-8 flex items-center gap-3">
          <span className="font-mono text-xs uppercase tracking-widest text-muted">Link preview</span>
          <span className="h-px flex-1 bg-ink/15" />
        </div>

        <div className="chat-preview settle-in mt-3">
          <div className="chat-contact">
            <span className="seal seal-sm" aria-hidden="true">
              {Array.from({ length: 9 }, (_, i) => <i key={i} />)}
            </span>
            <div>
              <p className="text-sm font-medium">Kelpo</p>
              <p className="font-mono text-[11px] text-muted">
                link · {new URL(result.url).host}
              </p>
            </div>
          </div>
          <a
            className="chat-card chat-card-link"
            href={result.url}
            target="_blank"
            rel="noreferrer"
            aria-label="Open the shared delivery"
          >
            {first && <img className="chat-thumb" src={ogUrl(result.link.slug)} alt="" />}
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{result.link.title}</p>
              <p className="mt-1 truncate text-xs text-muted">
                {result.link.files.length} files · {formatBytes(result.link.files.reduce((s, f) => s + f.sizeBytes, 0))} · original quality
              </p>
              <p className="mt-2 font-mono text-[11px] text-signal">Ends {formatExpiry(result.expiresAt)}</p>
            </div>
            <span className="chat-arrow" aria-hidden="true">↗</span>
          </a>
          <p className="mt-2 font-mono text-[11px] text-muted">
            Tap the card to open the delivery.
          </p>
        </div>

        <div className="og-links mt-3">
          <a href={result.url} target="_blank" rel="noreferrer">
            Open link <span aria-hidden="true">↗</span>
          </a>
          <a href={ogUrl(result.link.slug)} target="_blank" rel="noreferrer">
            View preview image <span aria-hidden="true">↗</span>
          </a>
        </div>

        <div className="mt-8">
          <p className="font-mono text-xs uppercase tracking-widest text-muted">Your link</p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              className="field flex-1 font-mono text-sm"
              readOnly
              value={result.url}
              onFocus={(event) => event.currentTarget.select()}
            />
            <button className="primary-btn shrink-0" onClick={copyLink}>
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-xs text-muted">
            <a
              className="underline underline-offset-2"
              href={`https://wa.me/?text=${encodeURIComponent(`${result.link.title}\n${result.url}`)}`}
              target="_blank"
              rel="noreferrer"
            >
              Send on WhatsApp
            </a>
            <a
              className="underline underline-offset-2"
              href={`mailto:?subject=${encodeURIComponent(result.link.title)}&body=${encodeURIComponent(result.url)}`}
            >
              Send by email
            </a>
            {typeof navigator.share === "function" && (
              <button
                className="underline underline-offset-2"
                onClick={() => navigator.share({ title: result.link.title, url: result.url }).catch(() => {})}
              >
                Share
              </button>
            )}
          </div>
        </div>

        <p className="mt-8 border-t border-ink/15 pt-5 text-sm text-muted">
          Link ends {formatExpiry(result.expiresAt)}. The files are deleted then.
        </p>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
          <button className="text-btn" onClick={reset}>Create another delivery</button>
          <a className="text-btn" href="/dashboard">Save this one to an account — optional</a>
        </div>
        <footer className="mt-10 flex flex-col gap-4 border-t border-ink/10 pt-4 sm:flex-row sm:items-end sm:justify-between">
          <Credits />
          <LikeButton />
        </footer>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-dvh max-w-xl px-5 py-8 sm:py-12">
      <header className="flex items-center justify-between gap-3 border-b border-ink pb-4">
        <div className="flex shrink-0 items-center gap-3">
          <Seal />
          <span className="font-display text-2xl">Kelpo</span>
        </div>
        <span className="hidden text-right font-mono text-[10px] uppercase leading-tight tracking-widest text-muted sm:block sm:text-xs">
          Original quality, delivered
        </span>
      </header>

      <section className="settle-in mt-12">
        <h1 className="font-display text-[2.6rem] leading-[1.03] tracking-tight sm:text-5xl lg:text-6xl">
          Your work arrives
          <br />
          exactly as you made it.
        </h1>
        <p className="mt-5 max-w-md text-sm leading-relaxed text-muted">
          Send finals through WhatsApp, Instagram or email. One link, every file, no compression.
        </p>
      </section>

      <section className="mt-10">
        <div
          className={`delivery-tray ${dragging ? "is-dragging" : ""}`}
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
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") inputRef.current?.click();
          }}
        >
          <div className="reg-mark mx-auto" aria-hidden="true" />
          <p className="mt-4 font-display text-xl">Drop your delivery here</p>
          <p className="mt-1 font-mono text-xs text-muted">
            JPG · PNG · WebP · GIF · PDF — up to 15 files, 25 MB each
          </p>
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

        {files.length > 0 && (
          <div className="packing-list mt-4">
            <div className="flex items-center justify-between font-mono text-xs text-muted">
              <span>{files.length} {files.length === 1 ? "file" : "files"}</span>
              <span>{formatBytes(totalBytes)}</span>
            </div>
            {files.map((item) => (
              <div key={item.key} className="flex items-center justify-between gap-3 border-b border-ink/10 py-2.5">
                <span className="min-w-0 flex-1 truncate text-sm">{item.file.name}</span>
                <span className="shrink-0 font-mono text-xs text-muted">{formatBytes(item.file.size)}</span>
                <button
                  className="shrink-0 text-xs text-muted underline underline-offset-2"
                  onClick={() => setFiles((current) => current.filter((entry) => entry.key !== item.key))}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-10 space-y-8">
        <label className="block">
          <span className="font-mono text-xs uppercase tracking-widest text-muted">Title</span>
          <input
            className="field mt-2 font-display text-2xl"
            placeholder="Brand refresh — final files"
            value={title}
            maxLength={120}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label className="block">
          <span className="font-mono text-xs uppercase tracking-widest text-muted">A note for your client</span>
          <textarea
            className="field mt-2 min-h-20 resize-y text-sm"
            placeholder="Optional"
            value={message}
            maxLength={600}
            onChange={(event) => setMessage(event.target.value)}
          />
        </label>

        <fieldset>
          <legend className="font-mono text-xs uppercase tracking-widest text-muted">This link lives for</legend>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {(["24h", "7d", "30d"] as Expiry[]).map((option) => (
              <button
                key={option}
                type="button"
                className={`stamp-btn ${expiry === option ? "is-active" : ""}`}
                onClick={() => setExpiry(option)}
              >
                {option === "24h" ? "24 hours" : option === "7d" ? "7 days" : "30 days"}
              </button>
            ))}
          </div>
          <p className="mt-2 font-mono text-xs text-muted">
            Ends {formatExpiry(endsAt)}. We delete the files then.
          </p>
        </fieldset>

        <fieldset>
          <legend className="font-mono text-xs uppercase tracking-widest text-muted">Password</legend>
          <label className="mt-3 flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={hasPassword}
              onChange={(event) => setHasPassword(event.target.checked)}
            />
            Seal it with a password
          </label>
          {hasPassword && (
            <input
              className="field mt-3 font-mono text-sm"
              type="password"
              placeholder="At least 6 characters"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          )}
        </fieldset>
      </section>

      {error && <p className="mt-8 border-l-2 border-signal pl-3 text-sm text-signal">{error}</p>}

      <button className="primary-btn mt-10 w-full" onClick={() => void seal()}>
        Seal &amp; create link
      </button>
      <p className="mt-4 text-center font-mono text-xs text-muted">
        No account. No app. No compression.
      </p>
      <footer className="mt-12 flex flex-col gap-4 border-t border-ink/10 pt-4 sm:flex-row sm:items-end sm:justify-between">
        <Credits />
        <LikeButton />
      </footer>
    </main>
  );
}
