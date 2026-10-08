import type {
  VideoInput,
  VideoMetadata,
  ValidationResult,
  VideoSource,
} from '../types/course'
import { detectPlatform, parseVimeoId, parseDailymotionId } from './platforms'
import { fetchVimeoConfig, fetchDailymotionMetadata } from './captionSources'

/**
 * Valid MIME types for uploaded video files.
 */
const VALID_MIME_TYPES = [
  'video/mp4',
  'video/webm',
  'video/ogg',
  'video/quicktime',
] as const

/**
 * Maximum file size: 500MB in bytes.
 */
const MAX_FILE_SIZE = 500 * 1024 * 1024

/**
 * Minimum file size: 1KB in bytes.
 */
const MIN_FILE_SIZE = 1024

/**
 * Maximum URL length allowed.
 */
const MAX_URL_LENGTH = 2048

/**
 * Allowlist regex patterns for accepted video URLs.
 * Matches YouTube, Vimeo, and direct video links.
 */
const URL_ALLOWLIST_PATTERNS: RegExp[] = [
  // YouTube: watch, short-link, embed, shorts, live
  /^https?:\/\/(www\.)?youtube\.com\/watch/i,
  /^https?:\/\/(www\.)?youtu\.be\//i,
  /^https?:\/\/(www\.)?youtube\.com\/embed\//i,
  /^https?:\/\/(www\.)?youtube\.com\/shorts\//i,
  /^https?:\/\/(www\.)?youtube\.com\/live\//i,
  // Vimeo (including player and unlisted links)
  /^https?:\/\/(www\.)?vimeo\.com\//i,
  /^https?:\/\/player\.vimeo\.com\/video\//i,
  // Dailymotion
  /^https?:\/\/(www\.)?dailymotion\.com\/video\//i,
  /^https?:\/\/dai\.ly\//i,
  // Direct video files
  /^https?:\/\/.+\.(mp4|webm|ogg|ogv|m4v|mov)(\?.*)?$/i,
]

/**
 * Patterns that indicate dangerous embedded content in URLs.
 */
const DANGEROUS_URL_PATTERNS: RegExp[] = [
  /javascript:/i,
  /data:/i,
  /<script/i,
  /<\/script/i,
  /%3Cscript%3E/i,
  /%3C\/script%3E/i,
  /%3cscript%3e/i,
  /%3c\/script%3e/i,
]

/**
 * Regex matching HTML tags in a URL.
 */
const HTML_TAG_PATTERN = /<[^>]+>/i

/**
 * Validates a VideoInput for correctness and security.
 *
 * For file inputs: checks MIME type, minimum size (≥1KB), and maximum size (≤500MB).
 * For URL inputs: performs security checks first, then validates against the allowlist.
 *
 * @param input - The video input to validate
 * @returns A ValidationResult indicating whether the input is valid and any errors
 */
export function validateInput(input: VideoInput): ValidationResult {
  const errors: string[] = []

  if (input.type === 'file') {
    if (!input.file) {
      errors.push('No file provided')
    } else {
      if (!VALID_MIME_TYPES.includes(input.file.type as typeof VALID_MIME_TYPES[number])) {
        errors.push(
          `Unsupported file type: ${input.file.type || 'unknown'}. Supported formats: MP4, WebM, OGG, QuickTime`
        )
      }
      if (input.file.size < MIN_FILE_SIZE) {
        errors.push('File size is below the minimum of 1KB')
      }
      if (input.file.size > MAX_FILE_SIZE) {
        errors.push('File size exceeds 500MB limit')
      }
    }
  } else if (input.type === 'url') {
    if (!input.url) {
      errors.push('No URL provided')
    } else {
      // Security checks FIRST
      const securityErrors = validateUrlSecurity(input.url)
      if (securityErrors.length > 0) {
        errors.push(...securityErrors)
      } else {
        // Only check allowlist if security checks pass
        if (!matchesAllowlist(input.url)) {
          errors.push(
            'URL must be a YouTube, Vimeo, or Dailymotion link, or a direct video file (.mp4, .webm, .ogg, .m4v, .mov)'
          )
        }
      }
    }
  } else {
    errors.push('Input type must be "file" or "url"')
  }

  return { isValid: errors.length === 0, errors }
}

/**
 * Performs security validation on a URL.
 *
 * Rejects URLs that:
 * - Use a scheme other than http:// or https://
 * - Contain javascript: or data: scheme patterns
 * - Exceed 2048 characters in length
 * - Contain HTML tags or encoded script sequences
 *
 * @param url - The URL string to validate
 * @returns An array of security error messages (empty if URL passes all checks)
 */
function validateUrlSecurity(url: string): string[] {
  const errors: string[] = []

  // Check URL length
  if (url.length > MAX_URL_LENGTH) {
    errors.push('URL rejected for security reasons: exceeds maximum length of 2048 characters')
    return errors
  }

  // Check scheme is http or https
  if (!/^https?:\/\//i.test(url)) {
    errors.push('URL rejected for security reasons: only http and https schemes are allowed')
    return errors
  }

  // Check for dangerous patterns (javascript:, data:, script tags)
  for (const pattern of DANGEROUS_URL_PATTERNS) {
    if (pattern.test(url)) {
      errors.push('URL rejected for security reasons: contains potentially dangerous content')
      return errors
    }
  }

  // Check for HTML tags
  if (HTML_TAG_PATTERN.test(url)) {
    errors.push('URL rejected for security reasons: contains HTML content')
    return errors
  }

  return errors
}

/**
 * Checks if a URL matches the allowlist of accepted video URL patterns.
 *
 * @param url - The URL to check against the allowlist
 * @returns true if the URL matches at least one allowlist pattern
 */
function matchesAllowlist(url: string): boolean {
  return URL_ALLOWLIST_PATTERNS.some((pattern) => pattern.test(url))
}

/**
 * Sanitizes a URL by stripping or rejecting URLs with embedded HTML/script content.
 *
 * Returns the sanitized URL if safe, or null if the URL contains dangerous content
 * that cannot be safely sanitized.
 *
 * @param url - The URL string to sanitize
 * @returns The sanitized URL string or null if the URL is unsafe
 */
export function sanitizeUrl(url: string): string | null {
  // Reject empty or whitespace-only URLs
  if (!url || !url.trim()) {
    return null
  }

  const trimmed = url.trim()

  // Reject if too long
  if (trimmed.length > MAX_URL_LENGTH) {
    return null
  }

  // Reject non-http/https schemes
  if (!/^https?:\/\//i.test(trimmed)) {
    return null
  }

  // Reject if contains dangerous patterns
  for (const pattern of DANGEROUS_URL_PATTERNS) {
    if (pattern.test(trimmed)) {
      return null
    }
  }

  // Reject if contains HTML tags
  if (HTML_TAG_PATTERN.test(trimmed)) {
    return null
  }

  return trimmed
}


/**
 * Extracts the audio track from a video file using the Web Audio API.
 *
 * Decodes the video file into an AudioBuffer, extracts all channels,
 * and encodes them as a WAV blob suitable for transcription.
 *
 * @param file - The video file to extract audio from
 * @returns A Blob containing the audio in WAV format
 * @throws Error if the file has no usable audio or decoding fails
 */
export async function extractAudio(file: File): Promise<Blob> {
  let audioContext: AudioContext | null = null

  try {
    audioContext = new AudioContext()
    const arrayBuffer = await file.arrayBuffer()
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)

    if (audioBuffer.numberOfChannels === 0 || audioBuffer.length === 0) {
      throw new Error(
        'File has no usable audio. Please ensure the video contains an audio track.'
      )
    }

    // Extract all channel data
    const numberOfChannels = audioBuffer.numberOfChannels
    const sampleRate = audioBuffer.sampleRate
    const channelData: Float32Array[] = []

    for (let channel = 0; channel < numberOfChannels; channel++) {
      channelData.push(audioBuffer.getChannelData(channel))
    }

    // Encode as WAV blob
    return encodeWAV(channelData, sampleRate, numberOfChannels)
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('no usable audio')
    ) {
      throw error
    }
    throw new Error(
      'File has no usable audio. Please ensure the video contains an audio track.'
    )
  } finally {
    if (audioContext) {
      await audioContext.close().catch(() => {
        // Ignore close errors
      })
    }
  }
}

/**
 * Retrieves metadata for a video input (file or URL).
 *
 * For URL inputs:
 * - Detects source from URL pattern (YouTube, Vimeo, or direct-url)
 * - Attempts to retrieve title via YouTube oEmbed API for YouTube URLs
 * - Uses a video element to determine duration when possible
 *
 * For file inputs:
 * - Uses the filename (without extension) as title
 * - Creates a video element to determine duration
 *
 * @param input - The video input (file or URL)
 * @returns VideoMetadata containing title, duration, source, and optional thumbnail
 * @throws Error if metadata cannot be retrieved
 */
export async function getMetadata(input: VideoInput): Promise<VideoMetadata> {
  if (input.type === 'url') {
    return getUrlMetadata(input.url!)
  }

  return getFileMetadata(input.file!)
}

/**
 * Retrieves metadata for a URL-based video input.
 */
async function getUrlMetadata(url: string): Promise<VideoMetadata> {
  const platform = detectPlatform(url)
  const source: VideoSource =
    platform === 'youtube'
      ? 'youtube'
      : platform === 'vimeo'
        ? 'vimeo'
        : 'direct-url'

  let title = extractTitleFromUrl(url)
  let duration = 0
  let thumbnailUrl: string | undefined

  // Metadata is a nice-to-have: a failure here must not block transcription,
  // so each lookup degrades to a URL-derived title instead of throwing.
  try {
    if (platform === 'youtube') {
      const result = await getYouTubeMetadata(url)
      title = result.title
      thumbnailUrl = result.thumbnailUrl
    } else if (platform === 'vimeo') {
      const id = parseVimeoId(url)
      if (id) {
        const config = await fetchVimeoConfig(id)
        title = config.video?.title || title
        duration = config.video?.duration ?? 0
      }
    } else if (platform === 'dailymotion') {
      const id = parseDailymotionId(url)
      if (id) {
        const metadata = await fetchDailymotionMetadata(id)
        title = metadata.title || title
        duration = metadata.duration ?? 0
      }
    } else {
      try {
        duration = await getVideoDurationFromUrl(url)
      } catch {
        duration = 0
      }
    }
  } catch (error) {
    console.warn('[metadata] lookup failed, using fallback title:', error)
  }

  return { title, duration, source, thumbnailUrl }
}

/**
 * Retrieves metadata for a file-based video input.
 */
async function getFileMetadata(file: File): Promise<VideoMetadata> {
  const title = stripFileExtension(file.name)
  let duration = 0

  try {
    duration = await getVideoDurationFromFile(file)
  } catch {
    throw new Error('Could not retrieve video metadata.')
  }

  return { title, duration, source: 'upload' }
}

/**
 * Fetches YouTube video metadata via oEmbed API.
 */
async function getYouTubeMetadata(
  url: string
): Promise<{ title: string; thumbnailUrl?: string }> {
  try {
    const oEmbedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
    const response = await fetch(oEmbedUrl)

    if (!response.ok) {
      throw new Error(`oEmbed request failed: ${response.status}`)
    }

    const data = (await response.json()) as {
      title?: string
      thumbnail_url?: string
    }

    return {
      title: data.title || extractTitleFromUrl(url),
      thumbnailUrl: data.thumbnail_url,
    }
  } catch {
    // Fallback: extract video ID or path as title
    return { title: extractTitleFromUrl(url) }
  }
}

/**
 * Extracts a fallback title from a URL path or query string.
 */
function extractTitleFromUrl(url: string): string {
  try {
    const parsed = new URL(url)
    // For YouTube: try to get video ID from the query string
    const videoId = parsed.searchParams.get('v')
    if (videoId) return videoId

    // Use the last path segment as the title
    const pathSegments = parsed.pathname.split('/').filter(Boolean)
    if (pathSegments.length > 0) {
      const lastSegment = pathSegments[pathSegments.length - 1]
      // Strip common video extensions
      return lastSegment.replace(/\.(mp4|webm|ogg)$/i, '') || parsed.hostname
    }

    return parsed.hostname
  } catch {
    return 'Untitled Video'
  }
}

/**
 * Gets video duration by loading a URL in a video element.
 */
function getVideoDurationFromUrl(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.preload = 'metadata'

    const timeoutId = setTimeout(() => {
      video.src = ''
      reject(new Error('Timeout loading video metadata'))
    }, 10000)

    video.addEventListener('loadedmetadata', () => {
      clearTimeout(timeoutId)
      const duration = isFinite(video.duration) ? video.duration : 0
      video.src = ''
      resolve(duration)
    })

    video.addEventListener('error', () => {
      clearTimeout(timeoutId)
      video.src = ''
      reject(new Error('Failed to load video metadata from URL'))
    })

    video.src = url
  })
}

/**
 * Gets video duration by loading a File in a video element with an object URL.
 */
function getVideoDurationFromFile(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    const objectUrl = URL.createObjectURL(file)

    const timeoutId = setTimeout(() => {
      URL.revokeObjectURL(objectUrl)
      video.src = ''
      reject(new Error('Timeout loading video metadata'))
    }, 10000)

    video.addEventListener('loadedmetadata', () => {
      clearTimeout(timeoutId)
      const duration = isFinite(video.duration) ? video.duration : 0
      URL.revokeObjectURL(objectUrl)
      video.src = ''
      resolve(duration)
    })

    video.addEventListener('error', () => {
      clearTimeout(timeoutId)
      URL.revokeObjectURL(objectUrl)
      video.src = ''
      reject(new Error('Could not retrieve video metadata.'))
    })

    video.src = objectUrl
  })
}

/**
 * Strips the file extension from a filename.
 */
function stripFileExtension(filename: string): string {
  const lastDotIndex = filename.lastIndexOf('.')
  if (lastDotIndex > 0) {
    return filename.substring(0, lastDotIndex)
  }
  return filename
}

/**
 * Encodes PCM audio channel data into a WAV format Blob.
 */
function encodeWAV(
  channelData: Float32Array[],
  sampleRate: number,
  numberOfChannels: number
): Blob {
  const frameCount = channelData[0].length
  const bytesPerSample = 2 // 16-bit PCM
  const blockAlign = numberOfChannels * bytesPerSample
  const dataSize = frameCount * blockAlign
  const headerSize = 44
  const buffer = new ArrayBuffer(headerSize + dataSize)
  const view = new DataView(buffer)

  // WAV header
  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(view, 8, 'WAVE')
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM format
  view.setUint16(22, numberOfChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bytesPerSample * 8, true)
  writeString(view, 36, 'data')
  view.setUint32(40, dataSize, true)

  // Interleave channel data and convert float to 16-bit PCM
  let offset = headerSize
  for (let i = 0; i < frameCount; i++) {
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const sample = Math.max(-1, Math.min(1, channelData[channel][i]))
      const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff
      view.setInt16(offset, int16, true)
      offset += bytesPerSample
    }
  }

  return new Blob([buffer], { type: 'audio/wav' })
}

/**
 * Writes an ASCII string to a DataView at the specified offset.
 */
function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i))
  }
}
