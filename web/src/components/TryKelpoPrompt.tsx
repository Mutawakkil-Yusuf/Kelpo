import { AnimatePresence, motion } from "motion/react";
import Credits from "./Credits";
import Seal from "./Seal";

/** Shown once, when a recipient opens their first file. Bottom sheet on a phone,
 *  centred card on a laptop. Stays out of the way of the files. */
export default function TryKelpoPrompt({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="sheet-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
        >
          <motion.section
            className="try-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Try Kelpo"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.3 }}
            onClick={(event) => event.stopPropagation()}
          >
            <button className="sheet-close" onClick={onClose} aria-label="Close">×</button>
            <Seal />
            <h2 className="h3" style={{ marginTop: "1.5rem" }}>Sent with Kelpo.</h2>
            <p className="lede" style={{ marginTop: "0.8rem" }}>
              Your files arrived intact. No compression. No account. No app. Send your own
              work the same way.
            </p>
            <a className="btn btn-block" style={{ marginTop: "2rem" }} href="/">Create a link</a>
            <button className="text-btn" style={{ marginTop: "1rem" }} onClick={onClose}>Not now</button>
            <div style={{ marginTop: "2rem", borderTop: "1px solid var(--color-ink)", paddingTop: "1rem" }}>
              <Credits />
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
