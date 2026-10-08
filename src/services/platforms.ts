/**
 * Platform detection and ID parsing for supported video sources.
 *
 * Keeping this in one place means validation, metadata lookup and transcript
 * extraction all agree on which platform a URL belongs to — the previous
 * mismatch (validation accepted Vimeo, the pipeline rejected it) came from
 * that logic being duplicated.
 */

export type Platform = 'youtube' | 'vimeo' | 'dailymotion' | 'direct'

/** Server-side passthrough for arbitrary media/caption URLs (dev proxy). */
export function proxiedUrl(absoluteUrl: string): string {
  return `/api/fetch?url=${encodeURIComponent(absoluteUrl)}`
}

/**
 * Detects which platform a URL belongs to.
 * @returns The platform, or null if the URL isn't a supported video source.
 */
export function detectPlatform(url: string): Platform | null {
  if (/(?:youtube\.com|youtu\.be)/i.test(url)) return 'youtube'
  if (/vimeo\.com/i.test(url)) return 'vimeo'
  if (/(?:dailymotion\.com|dai\.ly)/i.test(url)) return 'dailymotion'
  if (/\.(mp4|webm|ogg|ogv|m4v|mov)(\?[^\s]*)?$/i.test(url)) return 'direct'
  return null
}

/**
 * Parses a YouTube video ID (11 chars) from watch, short-link, embed,
 * shorts and live URL formats.
 */
export function parseYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?.*v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/,
  ]

  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]
  }

  return null
}

/**
 * Parses a Vimeo numeric video ID.
 * Handles vimeo.com/123, vimeo.com/channels/x/123, player.vimeo.com/video/123
 * and unlisted links of the form vimeo.com/123/abcdef.
 */
export function parseVimeoId(url: string): string | null {
  const patterns = [
    /player\.vimeo\.com\/video\/(\d+)/,
    /vimeo\.com\/(?:channels\/[^/]+\/)(\d+)/,
    /vimeo\.com\/(?:groups\/[^/]+\/videos\/)(\d+)/,
    /vimeo\.com\/(\d+)/,
  ]

  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]
  }

  return null
}

/**
 * Parses a Dailymotion video ID from dailymotion.com/video/xXXXXX
 * or the dai.ly/xXXXXX short form.
 */
export function parseDailymotionId(url: string): string | null {
  const patterns = [
    /dailymotion\.com\/video\/([a-zA-Z0-9]+)/,
    /dai\.ly\/([a-zA-Z0-9]+)/,
  ]

  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]
  }

  return null
}

/**
 * Returns the platform-specific ID for a URL, or null when the platform
 * doesn't use IDs (direct file links).
 */
export function parsePlatformId(url: string): string | null {
  switch (detectPlatform(url)) {
    case 'youtube':
      return parseYouTubeId(url)
    case 'vimeo':
      return parseVimeoId(url)
    case 'dailymotion':
      return parseDailymotionId(url)
    default:
      return null
  }
}

/** Human-readable label used in UI copy and error messages. */
export function platformLabel(platform: Platform): string {
  switch (platform) {
    case 'youtube':
      return 'YouTube'
    case 'vimeo':
      return 'Vimeo'
    case 'dailymotion':
      return 'Dailymotion'
    case 'direct':
      return 'direct video link'
  }
}
