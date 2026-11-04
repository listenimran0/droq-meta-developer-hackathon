/** Detect the real image format from the first base64 chars (Muse returns WebP, not PNG). */
export type ImageKind = { ext: 'webp' | 'png' | 'jpg'; mime: string; uti: string };

export function detectImageKind(b64: string): ImageKind {
  const head = b64.replace(/^data:[^;]+;base64,/, '').slice(0, 8);
  if (head.startsWith('UklGR')) return { ext: 'webp', mime: 'image/webp', uti: 'org.webmproject.webp' }; // "RIFF"
  if (head.startsWith('/9j/')) return { ext: 'jpg', mime: 'image/jpeg', uti: 'public.jpeg' };
  return { ext: 'png', mime: 'image/png', uti: 'public.png' }; // iVBOR… and unknown
}

/** `data:image/…;base64,XXXX` → raw base64, or null when not a base64 data URI. */
export function dataUriToBase64(uri: string): string | null {
  const m = /^data:[^;,]+;base64,([A-Za-z0-9+/=\s]+)$/.exec(uri);
  return m ? m[1].replace(/\s/g, '') : null;
}

/** Cache file name for a Found card; drop ids are uuids but never trust them in a path. */
export function foundCardFileName(dropId: string, ext: string): string {
  const safe = dropId.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 64) || 'card';
  return `droq-found-${safe}.${ext}`;
}
