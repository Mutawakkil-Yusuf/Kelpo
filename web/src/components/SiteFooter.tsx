import Credits from "./Credits";
import LikeButton from "./LikeButton";
import Seal from "./Seal";

/** One footer on every surface: the mark, the promise, the two ways forward, the credits. */
export default function SiteFooter({ note }: { note?: string }) {
  return (
    <footer className="footer">
      <div className="footer-top">
        <a className="footer-brand" href="/">
          <Seal size="sm" />
          <span className="footer-wordmark">Kelpo</span>
        </a>
        <p className="footer-promise mono">Original files. One link. No compression.</p>
        <nav className="footer-nav mono" aria-label="Site">
          <a href="/">Create a link</a>
          <a href="/dashboard">Your links</a>
        </nav>
      </div>
      <div className="footer-bottom">
        <Credits />
        {note && <p className="mono muted">{note}</p>}
        <LikeButton />
      </div>
    </footer>
  );
}
