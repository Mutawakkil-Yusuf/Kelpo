import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

/** One like per visitor. The popup is a short note, not a confetti moment. */
export default function LikeButton() {
  const [count, setCount] = useState(0);
  const [liked, setLiked] = useState(false);
  const [open, setOpen] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) popRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [open]);

  useEffect(() => {
    api
      .getLikes()
      .then((result) => setCount(result.count))
      .catch(() => {});
    return () => window.clearTimeout(timer.current);
  }, []);

  async function like() {
    if (liked) {
      setOpen(true);
    } else {
      try {
        const result = await api.like();
        setCount(result.count);
        setLiked(true);
      } catch {
        return;
      }
    }
    setOpen(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(false), 3600);
  }

  return (
    <div className="like-wrap">
      {open && (
        <div className="like-pop" role="status" ref={popRef}>
          <span className="seal seal-sm" aria-hidden="true">
            {Array.from({ length: 9 }, (_, i) => <i key={i} />)}
          </span>
          <div>
            <p className="font-display text-lg leading-tight">Thanks for the like.</p>
            <p className="mt-1 text-xs text-muted">
              {liked ? "It keeps Kelpo free while it is small." : "You already liked this one."}
            </p>
          </div>
        </div>
      )}
      <button
        className={`like-btn ${liked ? "is-liked" : ""}`}
        onClick={() => void like()}
        aria-label={liked ? "Liked" : "Like Kelpo"}
      >
        <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
          <path
            d="M12 20.5s-7.5-4.6-7.5-10a4.3 4.3 0 0 1 7.5-2.8A4.3 4.3 0 0 1 19.5 10.5c0 5.4-7.5 10-7.5 10Z"
            fill={liked ? "var(--color-signal)" : "none"}
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
        <span className="font-mono text-xs tabular-nums">{count}</span>
        <span className="hidden text-xs sm:inline">Like</span>
      </button>
    </div>
  );
}
