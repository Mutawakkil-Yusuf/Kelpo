/** Light previews made on the phone before upload, so clients never download a
 *  full-size image just to see what it is. Animated GIFs keep their original. */

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
