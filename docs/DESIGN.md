# Kelpo — design direction

Kelpo is a delivery wrapper that protects original quality in transit. Every screen
must say that, on a phone, in two seconds. The world is **Courier desk**: a working
desk, not a mood board.

## Product truth

| Truth | Device |
| --- | --- |
| Originals are not compressed | The words "Send the originals. Uncompressed." in the first viewport; a single client message with an original-quality link card |
| It expires | A draining ring beside an exact date and a mono countdown |
| It works in chat apps where attachments fail | The result is shown as a chat message with a rich link card, never a bare URL |
| It is for creatives delivering to clients | Contact sheets, packing slips, measured file sizes, tabular counts |
| Clients are on mobile data | One obvious primary action; light previews; downloads labelled "the originals" |

## Colors

- Ground `#EDEEEA`, surface `#F7F8F5`, surface 2 `#E2E4DE`, line `#C9CCC5`
- Ink `#101211` — text, rules, primary actions and the dark viewer (`#101211`)
- Muted `#5E635E` — metadata, secondary copy
- Signal `#FF4D00` — **status only**: the pressed seal, expiry ring, active stamp,
  the "original" marker and hover feedback. Never a decorative accent or a field.
- Forest `#14382E` — success states only

## Typography

One face: **Archivo**, self-hosted at `web/public/fonts/archivo-latin.woff2` (variable
weight 100–900). Display 600/700 with -0.035em to -0.045em tracking; UI 400/500;
**mono only for real data** — sizes, dates, counts, statuses. No serif, no italics,
no decorative tracked labels above headings. Headings start at the grid edge with no
dash or kicker in front of them.

## Components

- Pressed seal: 3×3 halftone square with a notched corner in signal orange; used as
  mark, favicon, loader and success stamp.
- Client message: a single chat message containing the delivery card — title, file
  count, original-quality line and expiry. Nothing else shares the frame. This is the
  hero visual.
- Buttons: ink field with light text; hover becomes signal; press steps down. Signal
  is never the default button fill.
- Fields: hairline underline, signal on focus. Expiry choices are three equal stamps
  with the exact end date on each; the selected one slides across on a shared layout.
- Contact sheet: numbered frames on a one-pixel ink grid; originals are always named.
- Ledger: ruled rows with tabular counts, never a card grid.

## Motion

One authored entrance on the first screen (seal presses, headline lines rise, lede
and actions follow; the desk card and its manifest rows deal in). State motion only:
the expiry stamp selection slides, packing-slip rows add and remove, the password
field opens, the result card arrives, the contact sheet staggers, the viewer opens
over the page, and the copy label swaps. The expiry ring drains for the link's life.
All motion is short (120–550 ms), mechanical, and fully disabled under
`prefers-reduced-motion` via `MotionConfig reducedMotion="user"` and GSAP guards.
Three.js is intentionally absent — a delivery tool has no genuine 3D need.

## Surfaces

**Create:** product statement and live desk card; three-step rule; delivery tray and
packing slip; exact expiry stamps; seal to create; result as a chat card with copy and
share actions. **Client:** title and expiry; contact sheet; persistent ZIP download;
dark fullscreen viewer with notes. **Account:** the ledger, a stationery panel and
plans, all on the same grid.

## Anti-patterns

Warm cream + serif + orange editorial templates, dashes or eyebrows before headings,
gradients, glass, rounded cards with soft shadows, dashboard chrome, animation that
does not explain the product.
