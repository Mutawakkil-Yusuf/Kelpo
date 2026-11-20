import Credits from "./Credits";

/** Shown once, when a recipient opens their first file. Bottom sheet on a phone,
 *  centred card on a laptop. Stays out of the way of the files. */
export default function TryKelpoPrompt({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section
        className="try-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Try Kelpo"
        onClick={(event) => event.stopPropagation()}
      >
        <button className="sheet-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <span className="seal" aria-hidden="true">
          {Array.from({ length: 9 }, (_, i) => <i key={i} />)}
        </span>
        <h2 className="mt-6 font-display text-3xl leading-tight tracking-tight sm:text-4xl">
          Sent with Kelpo.
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Your files arrived as originals — no compression, no account, no app. Send your
          own work the same way.
        </p>
        <a className="primary-btn mt-7 block text-center" href="/">
          Create a link
        </a>
        <button className="text-btn mt-4" onClick={onClose}>
          Not now
        </button>
        <div className="mt-7 border-t border-ink/10 pt-4">
          <Credits />
        </div>
      </section>
    </div>
  );
}
