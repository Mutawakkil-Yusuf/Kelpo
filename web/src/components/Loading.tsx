/** A loader that belongs to Kelpo: a seal pressing and a rule being drawn.
 *  Each screen supplies its own plain-language line. */

export default function Loading({
  label,
  detail,
  compact = false,
}: {
  label: string;
  detail: string;
  compact?: boolean;
}) {
  return (
    <div className={`loading-state ${compact ? "loading-compact" : ""}`} role="status" aria-live="polite">
      <span className="seal loading-seal" aria-hidden="true">
        {Array.from({ length: 9 }, (_, i) => <i key={i} />)}
      </span>
      <p className="loading-label">{label}</p>
      <p className="loading-detail">{detail}</p>
      <div className="loading-rule" aria-hidden="true"><span /></div>
    </div>
  );
}

export function SkeletonRows({ count = 3 }: { count?: number }) {
  return (
    <div className="mt-8 space-y-3" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="skeleton-row" style={{ animationDelay: `${index * 80}ms` }}>
          <span className="skeleton-title" />
          <span className="skeleton-meta" />
        </div>
      ))}
    </div>
  );
}
