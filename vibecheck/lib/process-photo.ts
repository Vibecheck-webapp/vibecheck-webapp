// Client-side only (canvas, createImageBitmap) — must run in the browser,
// never during SSR.

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_DIMENSION = 1080;
const TARGET_MAX_BYTES = 700 * 1024; // soft cap on the final data URL
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export class PhotoProcessingError extends Error {}

function canEncodeWebp(canvas: HTMLCanvasElement): boolean {
  return canvas.toDataURL("image/webp").startsWith("data:image/webp");
}

// A base64 data URL is ~4/3 the size of the bytes it encodes — close enough
// for a soft quality-stepping target, no need to decode it to measure exactly.
function estimatedByteSize(dataUrl: string): number {
  return dataUrl.length * 0.75;
}

export async function processPhotoFile(file: File): Promise<string> {
  if (!ACCEPTED_TYPES.has(file.type)) {
    throw new PhotoProcessingError("Please choose a JPEG, PNG, or WebP image.");
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new PhotoProcessingError("That image is over 10MB — please choose a smaller one.");
  }

  let bitmap: ImageBitmap;
  try {
    // imageOrientation: "from-image" reads the EXIF orientation tag and
    // rotates accordingly, so a phone photo taken sideways comes out upright
    // instead of literally sideways in the final image.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new PhotoProcessingError("Couldn't read that image — try a different file.");
  }

  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new PhotoProcessingError("Couldn't process that image in this browser.");
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  // Drawing into a canvas and re-encoding from pixel data — rather than
  // re-uploading the original file bytes — strips all metadata, including
  // EXIF GPS location: canvas pixels carry no metadata to begin with.
  const mimeType = canEncodeWebp(canvas) ? "image/webp" : "image/jpeg";

  let quality = 0.85;
  let dataUrl = canvas.toDataURL(mimeType, quality);
  while (estimatedByteSize(dataUrl) > TARGET_MAX_BYTES && quality > 0.35) {
    quality -= 0.15;
    dataUrl = canvas.toDataURL(mimeType, quality);
  }

  return dataUrl;
}
