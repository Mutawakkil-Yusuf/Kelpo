/** Light previews made on the phone before upload, so clients never download a
 *  full-size image just to see what it is. Animated GIFs keep their original.
 *  The OG card is a 1200x630 PNG so chat apps always get a correctly sized image. */

const PAPER = "#f4f1ea";
const INK = "#141414";
const SIGNAL = "#ff4d00";
const MUTED = "#6b665e";

export async function makeThumbnail(file: File): Promise<Blob | null> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return null;
  if (typeof createImageBitmap !== "function") return null;

  try {
    const bitmap = await createImageBitmap(file);
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, 560 / longest);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), "image/webp", 0.62);
    });
  } catch {
    return null;
  }
}

function wrapTitle(context: CanvasRenderingContext2D, title: string, maxWidth: number): string[] {
  const words = title.trim().split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  if (lines.length > 2) {
    const kept = lines.slice(0, 2);
    kept[1] = `${kept[1].replace(/,?$/, "")}…`;
    return kept;
  }
  return lines;
}

export async function makeOgCard(
  title: string,
  fileCount: number,
  expiresAt: number,
  thumbnail: Blob | null,
): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, 1200, 630);

  // Seal.
  ctx.fillStyle = SIGNAL;
  ctx.beginPath();
  ctx.moveTo(80, 80);
  ctx.lineTo(209, 80);
  ctx.lineTo(250, 121);
  ctx.lineTo(250, 250);
  ctx.lineTo(80, 250);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = PAPER;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      ctx.beginPath();
      ctx.arc(130 + col * 48, 130 + row * 48, 9, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.fillStyle = MUTED;
  ctx.font = "20px monospace";
  ctx.textAlign = "right";
  ctx.fillText("KELPO", 1120, 115);
  ctx.fillText("ORIGINAL QUALITY, DELIVERED", 1120, 150);

  ctx.fillStyle = INK;
  ctx.textAlign = "left";
  ctx.font = "bold 62px Georgia, serif";
  wrapTitle(ctx, title, 720).forEach((line, index) => {
    ctx.fillText(line, 80, 335 + index * 70);
  });

  ctx.fillRect(80, 512, 1040, 2);
  ctx.font = "21px monospace";
  ctx.fillStyle = INK;
  ctx.fillText("ONE LINK. EVERY FILE. NO COMPRESSION.", 80, 560);
  ctx.textAlign = "right";
  ctx.fillStyle = SIGNAL;
  ctx.fillText(`${fileCount} ${fileCount === 1 ? "FILE" : "FILES"}`, 1120, 560);
  ctx.textAlign = "left";

  const expiry = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(expiresAt));
  ctx.fillStyle = MUTED;
  ctx.font = "18px monospace";
  ctx.fillText(`ENDS ${expiry.toUpperCase()}`, 80, 602);

  if (thumbnail && typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(thumbnail);
      const size = 220;
      const x = 920;
      const y = 260;
      ctx.fillStyle = INK;
      ctx.fillRect(x - 2, y - 2, size + 4, size + 4);
      ctx.fillStyle = "#e8e3d9";
      ctx.fillRect(x, y, size, size);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, size, size);
      ctx.clip();
      const scale = Math.max(size / bitmap.width, size / bitmap.height);
      const width = bitmap.width * scale;
      const height = bitmap.height * scale;
      ctx.drawImage(bitmap, x + (size - width) / 2, y + (size - height) / 2, width, height);
      ctx.restore();
      bitmap.close();
    } catch {
      // A missing preview never blocks the card.
    }
  }

  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}
