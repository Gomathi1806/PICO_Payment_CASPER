/**
 * URL → renderer-type detection.
 *
 * Used by both the create/edit forms (to auto-pick the Content Type
 * picker when the creator pastes a URL) and the post-payment unlock
 * page (to render an embedded player / viewer instead of a bare link).
 */

export type DetectedContent =
  | { kind: 'youtube'; embedSrc: string }
  | { kind: 'vimeo'; embedSrc: string }
  | { kind: 'pdf'; href: string }
  | { kind: 'image'; href: string }
  | { kind: 'audio'; href: string }
  | { kind: 'archive'; href: string }
  | { kind: 'generic'; href: string };

const YT_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'];
const YT_SHORT = ['youtu.be'];
const VIMEO_HOSTS = ['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'];
const IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg'];
const AUDIO_EXT = ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac'];
const ARCHIVE_EXT = ['.zip', '.tar', '.gz', '.7z', '.rar'];

export function detectContent(rawUrl: string): DetectedContent {
  const url = (rawUrl || '').trim();
  if (!url) return { kind: 'generic', href: url };

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { kind: 'generic', href: url };
  }

  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname.toLowerCase();

  // YouTube — long form (?v=ID) and short form (youtu.be/ID)
  if (YT_HOSTS.includes(host)) {
    const id = parsed.searchParams.get('v') || path.split('/').filter(Boolean).pop() || '';
    if (id) return { kind: 'youtube', embedSrc: `https://www.youtube.com/embed/${encodeURIComponent(id)}` };
  }
  if (YT_SHORT.includes(host)) {
    const id = path.replace(/^\//, '').split('/')[0];
    if (id) return { kind: 'youtube', embedSrc: `https://www.youtube.com/embed/${encodeURIComponent(id)}` };
  }

  // Vimeo — public videos at vimeo.com/{id}
  if (VIMEO_HOSTS.includes(host)) {
    const segments = path.split('/').filter(Boolean);
    const id = segments[segments.length - 1];
    if (id && /^\d+$/.test(id)) {
      return { kind: 'vimeo', embedSrc: `https://player.vimeo.com/video/${id}` };
    }
  }

  // File extensions — checked after host-based matches so a .pdf served
  // from YouTube (nonsense, but possible) still resolves to YouTube first.
  if (path.endsWith('.pdf')) return { kind: 'pdf', href: url };
  if (IMAGE_EXT.some((ext) => path.endsWith(ext))) return { kind: 'image', href: url };
  if (AUDIO_EXT.some((ext) => path.endsWith(ext))) return { kind: 'audio', href: url };
  if (ARCHIVE_EXT.some((ext) => path.endsWith(ext))) return { kind: 'archive', href: url };

  return { kind: 'generic', href: url };
}

// Maps the detected kind back to the human-readable type label used by
// the dashboard's Content Type picker. Lets the create/edit form
// auto-set the type when a URL is pasted.
export function detectedKindToType(kind: DetectedContent['kind']): string | null {
  switch (kind) {
    case 'youtube':
    case 'vimeo':
      return 'Video';
    case 'pdf':
      return 'PDF';
    case 'image':
      return 'Image';
    case 'audio':
      return 'Audio';
    case 'archive':
    case 'generic':
      return null;
  }
}
