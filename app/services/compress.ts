/**
 * Shrink a phone photo of a college ID so it fits the upload limit.
 * PDFs and small files are returned unchanged. Runs in the browser only.
 */
export async function fitCollegeId(file: File, maxBytes: number): Promise<{ file: Blob; tooLarge: boolean }> {
  if (file.size <= maxBytes) return { file, tooLarge: false };
  if (!file.type.startsWith("image/") || typeof createImageBitmap !== "function") {
    return { file, tooLarge: true };
  }
  try {
    const bitmap = await createImageBitmap(file);
    let scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) break;
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
      if (blob && blob.size <= maxBytes) return { file: blob, tooLarge: false };
      scale *= 0.75;
    }
  } catch {
    /* fall through */
  }
  return { file, tooLarge: true };
}
