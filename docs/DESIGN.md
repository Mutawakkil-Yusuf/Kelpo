# Kelpo — design direction

The product is not "file storage". It is **a delivery wrapper that protects original
quality in transit**. Every design decision should say that, on a phone, in two seconds.

The visual world is **The proof sheet**: studio paperwork that has been ruled, stamped
and sent. Nothing floats, nothing glows, nothing is a rounded SaaS card.

## What must be communicated

| Product truth | Design device |
| --- | --- |
| Originals are not compressed | A visible pressed seal; crisp halftone, no soft gradients; a compressed-vs-original proof strip on the first screen |
| It expires | A draining mono ring beside an exact date and a ticking mono clock, never hidden in settings |
| It passes through chat apps where attachments fail | The share result is shown as a chat message with a rich link card, not a URL in a text box |
| It is for client delivery by creatives | Contact-sheet language: numbered frames, hairline rules, packing slips, tabular measurements |
| Clients are non-technical, on mobile data | One obvious primary action; light previews; downloads explicitly "the originals" |

## Visual language

**Paper, ink, one signal colour, and a dark proof room.** No purple gradient, no glass,
no dashboard chrome.

- Paper `#F4F1EA` — the main surface, feels like a delivery envelope
- Paper 2 `#E9E4D8`, paper 3 `#DCD5C6` — tinted surfaces and proof panels
- Ink `#141414` — text, hairline rules, the dark-room viewer (`#121211`)
- Signal `#FF4D00` — a *field*, not a hairline: the seal, primary buttons, active stamps
- Muted `#6B665E` — metadata and mono measurements
- Forest `#14382E` — success states only

**Type:** editorial contrast. Display is **Instrument Serif**, self-hosted from
`web/public/fonts`, used at 3–6rem with tight tracking and an italic cut for emphasis.
UI is the system sans. **All measurements, dates, file sizes and statuses are mono**
with tabular numerals — precision is the opposite of "compressed".

**Composition:** equal left and right edges on a 74rem max wrap. Asymmetric first
screen (copy left, proof right), hairline grids instead of cards, registration marks at
the proof's corners, generous vertical rhythm with more space above a heading than
below. Section headings are display type led by a short signal rule, never by a kicker.

**Native surfaces are designed too:** selection, caret, focus rings, scrollbars and
underline offsets use the palette.

## Motion — authored, not scattered

One entrance timeline on the first screen (seal press → headline lines rise → lede →
actions → proof), and one scroll-scrubbed degradation of the compressed half of the
proof strip. React state transitions use Motion: packing-slip rows, the password field,
the result card, the contact sheet and the fullscreen viewer. Lenis smooths the
create page on capable devices.

| Moment | Motion | Meaning |
| --- | --- | --- |
| First load | Seal presses, type lines rise from a clip, proof settles | A delivery being stamped and laid out |
| Proof strip | Compressed half blurs and desaturates as it scrolls | What a chat app does to the file |
| Contact sheet | Frames deal in with a short stagger | A proof sheet being laid out |
| Seal / create | The button and result card press and deal in | A physical seal, not a "submit" |
| Viewer | Dark room opens over the paper page | Stepping into the proof room |
| Expiry ring | A conic ring drains clockwise over the link's life | Its life is literally running out |

All motion is short (120–450 ms), eased mechanically, and fully disabled under
`prefers-reduced-motion`. Three.js is deliberately unused: a delivery tool has no
genuine 3D need.

## Brand mark

A **pressed seal**: a square with a 3×3 halftone grid and a notched corner, stamped in
signal orange. It is the favicon, the OG stamp, the loading state and the success
animation.

## Surfaces

- **Create** — hero with the live proof strip; three-step rule; delivery tray with a
  mono packing slip; expiry stamps showing exact dates; seal to create; result shown
  as a chat card.
- **Client** — title and message in editorial type with the expiry ring; a numbered
  contact sheet; persistent "Download all originals (.zip)"; dark fullscreen viewer
  with swipe/keyboard navigation, notes and "Download original".
- **Account** — the ledger: ruled rows with tabular view counts, extend/stop controls,
  a stationery (brand kit) panel, and plans. No card grid, no avatars, no sidebars.

## Anti-patterns (avoid)

- Generic gradients, glassmorphism, rounded cards with soft shadows
- Kicker/eyebrow labels above headings; decorative section numbers
- Dashboard chrome, team language, invented accounts for recipients
- Burying expiry or hiding that downloads are original quality
- Animation for its own sake; heavy web fonts that slow mobile data
