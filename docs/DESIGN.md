# Kelpo — design direction

The product is not "file storage". It is **a delivery wrapper that protects original
quality in transit**. Every design decision should say that, on a phone, in two seconds.

## What must be communicated

| Product truth | Design device |
| --- | --- |
| Originals are not compressed | A visible "original" seal; crisp edges, no soft gradients; a compressed-vs-original comparison as the hero motif |
| It expires | A drained stamp / countdown ring; expiry shown as a date and a ticking mono clock, never hidden in settings |
| It passes through chat apps where attachments fail | The share result is shown as a **chat message with a rich link card**, not a URL in a text box |
| It is for client delivery by creatives | Editorial / proof-sheet language: contact sheets, registration marks, packing slips, hairline rules |
| Clients are non-technical, on mobile data | One obvious primary action; previews are light, downloads are explicitly "the originals" |

## Visual language

**Paper, ink, and one signal colour.** No purple SaaS gradient, no glass cards, no
generic dark dashboard.

- Paper `#F4F1EA` (warm off-white) — surface, feels like a physical delivery envelope
- Ink `#141414` — text and hairline rules
- Signal `#FF4D00` — the seal, the primary action, the countdown accent
- Muted `#6B665E` — metadata, mono file sizes and dates
- Optional deep forest `#14382E` for success states only

**Type:** editorial contrast. A tight display face for the headline and the wordmark
(a serif or strong grotesk, e.g. Instrument Serif / Archivo), system sans for UI, and
**monospace for all metadata** (file sizes, expiry, dimensions). Mono communicates
precision — the opposite of "compressed".

**Texture:** print-proof registration marks, a faint grid, thin rules, generous
whitespace.

## Motion — fitted, not decorative

Every animation must explain the product. No bounce, no parallax, no generic fades
for their own sake. All motion is short (120–320 ms), eased with a mechanical
`cubic-bezier(0.2, 0, 0, 1)`, and disabled under `prefers-reduced-motion`.

| Moment | Motion | Meaning |
| --- | --- | --- |
| Page load | Wordmark/seal presses in with a 1px scale overshoot then settles | The "seal" is being stamped |
| Contact sheet | Frames reveal in a staggered sweep, each a slight upward settle | A proof sheet being laid out |
| Expiry ring | A conic-gradient ring drains slowly, clockwise | The link's life is literally running out |
| Seal / create | Seal scales down hard then up to rest; button label swaps to the link card | The action is a physical seal, not a "submit" |
| Download | Progress is a thin rule filling left-to-right in signal orange | Original bytes moving, no spinner |
| Password gate | Envelope flap opens once, then content appears | A sealed delivery being opened |

Hover states are limited to a 1px rule thickening or ink→signal colour shift.
Nothing floats or wiggles.

## Brand mark

A **pressed seal**: a square with a grid of dots (like a halftone original) and a
notched corner, stamped in signal orange. It doubles as the favicon, the OG card
stamp, and the success animation. It literally marks "this is the original".

## Create flow (sender)

1. **Delivery tray** — the file picker is a ruled drop area with a mono packing-slip
   list (name · type · size). Rejections explain in plain language.
2. **Details** — title and optional message typed like a note on the envelope.
3. **Expiry** — three stamps: `24 hours`, `7 days`, `30 days`. Each shows the exact
   date it dies. No slider, no ambiguity.
4. **Password** — a small "seal it" toggle; off by default.
5. **Seal & create link** — the seal presses; result shows the link **as a WhatsApp
   message with the OG card** (title, thumbnail, file count, expiry), plus copy/share.

Copy examples: *"Your originals arrive exactly as you made them."* · *"Seal & create
link"* · *"This link dies on 27 Nov, 09:41."*

## Client flow (recipient)

- Header in editorial type: sender's title + message, with a quiet line
  *"Delivered with original quality · Kelpo"*.
- **Contact sheet**: numbered frames with mono size/type labels — familiar to any
  designer. Light thumbnails load first; originals only on demand.
- Fullscreen viewer: swipe, pinch, keyboard; the download button always says
  **"Download original"** so the client knows what they get.
- Persistent primary action: **"Download all originals (.zip)"**.
- Expiry stamp in the corner: available until a date, with a draining ring.
- Password gate styled as a sealed envelope that opens on success.

## OG preview card (the most important asset)

The card is the product's first impression in chat. Composition: paper background,
thumbnail of the first file on the right, title in display type, mono line
`12 files · expires 27 Nov`, and the orange seal bottom-left. It must look like a
delivery note, not a website screenshot.

## Anti-patterns (avoid)

- Generic purple/indigo gradient buttons and glassmorphism
- Dashboard chrome, sidebars, avatars, "team" language — there are no accounts
- Vague labels like "Upload files" or "Submit" — name the product behaviour
- Burying expiry; hiding that downloads are original quality
- Animation for its own sake; heavy web fonts that slow mobile data
