/**
 * Caption extraction for Vimeo and Dailymotion.
 *
 * Both platforms expose their player configuration (title, duration and
 * caption tracks) on endpoints that need no API key, so no credentials are
 * required. Requests go through the dev proxy because neither endpoint sends
 * CORS headers.
 */

import type { TranscriptSegment } from '../types/course'
import { proxiedUrl } from './platforms'

/** Confidence for real published captions. */
export const CAPTION_CONFIDENCE = 0.95

// ---------------------------------------------------------------------------
// Vimeo
// ---------------------------------------------------------------------------

interface VimeoConfig {
  video?: { title?: string; duration?: number }
  request?: {
    text_tracks?: Array<{
      lang: string
      url: string
      label?: string
      kind?: string
    }>
  }
}

/** Fetches the Vimeo player config (title, duration, caption tracks). */
export async function fetchVimeoConfig(videoId: string): Promise<VimeoConfig> {
  const response = await fetch(`/api/vimeo/video/${videoId}/config`, {
    signal: AbortSignal.timeout(12000),
  })

  if (!response.ok) {
    throw new Error(
      response.status === 403
        ? 'This Vimeo video is private or embedding is restricted.'
        : `Vimeo returned ${response.status} for this video.`
    )
  }

  return (await response.json()) as VimeoConfig
}

/**
 * Extracts caption segments from a Vimeo video.
 * @throws Error if the video has no caption tracks
 */
export async function extractFromVimeo(
  videoId: string
): Promise<TranscriptSegment[]> {
  const config = await fetchVimeoConfig(videoId)
  const tracks = config.request?.text_tracks ?? []

  if (tracks.length === 0) {
    throw new Error('This Vimeo video has no captions or subtitles.')
  }

  const track = pickEnglish(tracks, (t) => t.lang)

  // Caption URLs are absolute and signed; route via the passthrough proxy
  const absolute = track.url.startsWith('http')
    ? track.url
    : `https://player.vimeo.com${track.url}`

  const captionsResponse = await fetch(proxiedUrl(absolute), {
    signal: AbortSignal.timeout(12000),
  })

  if (!captionsResponse.ok) {
    throw new Error(`Could not download Vimeo captions (${captionsResponse.status}).`)
  }

  const vtt = await captionsResponse.text()
  const segments = parseWebVtt(vtt)

  if (segments.length === 0) {
    throw new Error('Vimeo captions could not be parsed.')
  }

  return segments
}

// ---------------------------------------------------------------------------
// Dailymotion
// ---------------------------------------------------------------------------

interface DailymotionMetadata {
  title?: string
  duration?: number
  subtitles?: {
    data?: Record<string, { label?: string; urls?: string[] }>
  }
  error?: { title?: string }
}

/** Fetches Dailymotion player metadata (title, duration, subtitles). */
export async function fetchDailymotionMetadata(
  videoId: string
): Promise<DailymotionMetadata> {
  const response = await fetch(
    `/api/dailymotion/player/metadata/video/${videoId}`,
    { signal: AbortSignal.timeout(12000) }
  )

  if (!response.ok) {
    throw new Error(`Dailymotion returned ${response.status} for this video.`)
  }

  const data = (await response.json()) as DailymotionMetadata

  if (data.error) {
    throw new Error(data.error.title || 'Dailymotion rejected this video.')
  }

  return data
}

/**
 * Extracts caption segments from a Dailymotion video.
 * @throws Error if the video has no subtitles
 */
export async function extractFromDailymotion(
  videoId: string
): Promise<TranscriptSegment[]> {
  const metadata = await fetchDailymotionMetadata(videoId)
  const subtitles = metadata.subtitles?.data ?? {}
  const langs = Object.keys(subtitles)

  if (langs.length === 0) {
    throw new Error('This Dailymotion video has no subtitles.')
  }

  const lang = langs.find((l) => l.toLowerCase().startsWith('en')) ?? langs[0]
  const url = subtitles[lang]?.urls?.[0]

  if (!url) {
    throw new Error('Dailymotion subtitle track has no URL.')
  }

  const captionsResponse = await fetch(proxiedUrl(url), {
    signal: AbortSignal.timeout(12000),
  })

  if (!captionsResponse.ok) {
    throw new Error(
      `Could not download Dailymotion subtitles (${captionsResponse.status}).`
    )
  }

  const vtt = await captionsResponse.text()
  const segments = parseWebVtt(vtt)

  if (segments.length === 0) {
    throw new Error('Dailymotion subtitles could not be parsed.')
  }

  return segments
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Prefers an English track, falling back to the first available. */
function pickEnglish<T>(items: T[], langOf: (item: T) => string): T {
  return (
    items.find((item) => langOf(item)?.toLowerCase().startsWith('en')) ??
    items[0]
  )
}

/**
 * Parses WebVTT / SRT-style cues into TranscriptSegments.
 * Cue shape:
 *   00:00:05.237 --> 00:00:08.043
 *   Caption text possibly spanning lines
 */
export function parseWebVtt(vtt: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = []
  const blocks = vtt.split(/\r?\n\r?\n/)

  for (const block of blocks) {
    const lines = block.split(/\r?\n/).filter((line) => line.trim())
    const timeLine = lines.find((line) => line.includes('-->'))
    if (!timeLine) continue

    const [startRaw, endRaw] = timeLine.split('-->').map((part) => part.trim())
    const startTime = parseVttTimestamp(startRaw)
    const endTime = parseVttTimestamp(endRaw)

    if (startTime === null || endTime === null || endTime <= startTime) continue

    const timeIndex = lines.indexOf(timeLine)
    const text = decodeEntities(
      stripTags(lines.slice(timeIndex + 1).join(' '))
    )
      .replace(/\s+/g, ' ')
      .trim()

    if (text) segments.push({ text, startTime, endTime })
  }

  return segments.sort((a, b) => a.startTime - b.startTime)
}

/** Converts HH:MM:SS.mmm or MM:SS.mmm to seconds. */
function parseVttTimestamp(stamp: string): number | null {
  const clean = stamp.split(/\s+/)[0].trim().replace(',', '.')
  const parts = clean.split(':')

  if (parts.length === 3) {
    const total =
      parseInt(parts[0], 10) * 3600 +
      parseInt(parts[1], 10) * 60 +
      parseFloat(parts[2])
    return isNaN(total) ? null : total
  }

  if (parts.length === 2) {
    const total = parseInt(parts[0], 10) * 60 + parseFloat(parts[1])
    return isNaN(total) ? null : total
  }

  return null
}

function stripTags(text: string): string {
  return text.replace(/<[^>]+>/g, '')
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
}
