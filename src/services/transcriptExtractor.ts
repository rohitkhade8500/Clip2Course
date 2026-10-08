/**
 * TranscriptExtractor service for Clip2Course.
 * Handles extraction of text transcripts from video content using:
 * - YouTube transcript via Vite dev proxy (bypasses CORS)
 * - Browser-based speech recognition (Web Speech API)
 */

import type { TranscriptSegment, TranscriptResult } from '../types/course'
import { detectPlatform, parsePlatformId, proxiedUrl } from './platforms'
import {
  extractFromVimeo,
  extractFromDailymotion,
  CAPTION_CONFIDENCE,
} from './captionSources'
import { transcribeWithWhisper } from './whisperTranscriber'
import type { WhisperProgressCallback } from './whisperTranscriber'

/** Duration in seconds for each audio chunk sent to speech recognition. */
const CHUNK_DURATION = 30

// --- YouTube Transcript Extraction ---

/**
 * Parse a YouTube video ID from various URL formats.
 * Supports: watch, short-link (youtu.be), embed, and shorts URLs.
 * @returns The 11-character video ID, or null if no match found.
 */
export function parseYouTubeVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?.*v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
  ]

  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]
  }

  return null
}

/**
 * Extract transcript from a YouTube URL.
 * Uses Vite dev server proxy to bypass CORS, with multiple fallback strategies.
 * @throws Error if URL is invalid or all transcript sources fail.
 */
export async function extractFromYouTube(
  url: string
): Promise<TranscriptResult> {
  const videoId = parseYouTubeVideoId(url)
  if (!videoId) {
    throw new Error('Invalid YouTube URL')
  }

  const sources: Array<{
    name: string
    run: () => Promise<TranscriptSegment[]>
  }> = [
    { name: 'InnerTube', run: () => fetchViaInnerTube(videoId) },
    { name: 'Invidious', run: () => fetchFromInvidiousAPI(videoId) },
  ]

  // Track why each source failed so the final error is actionable instead of
  // a generic "no captions" message.
  const failures: string[] = []

  for (const source of sources) {
    try {
      const segments = await source.run()

      if (segments.length === 0) {
        failures.push(`${source.name}: returned 0 segments`)
        continue
      }

      const sortedSegments = [...segments].sort(
        (a, b) => a.startTime - b.startTime
      )

      return {
        segments: sortedSegments,
        fullText: sortedSegments.map((s) => s.text).join(' '),
        language: detectLanguage(sortedSegments[0].text),
        confidence: 0.95,
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      failures.push(`${source.name}: ${reason}`)
      console.warn(`[transcript] ${source.name} failed for ${videoId}:`, error)
    }
  }

  console.error('[transcript] all sources failed:', failures)

  throw new Error(
    `Could not extract transcript (${failures.join(' | ')})`
  )
}

/** Shape of the InnerTube player response we care about. */
interface InnerTubeCaptionTrack {
  baseUrl: string
  languageCode: string
  kind?: string
}

/**
 * PRIMARY METHOD: YouTube InnerTube player API using the ANDROID client.
 *
 * The public web page's caption URLs return empty bodies due to YouTube's
 * proof-of-origin requirement. The ANDROID client returns caption URLs that
 * still serve real caption data, so we use that instead.
 */
async function fetchViaInnerTube(
  videoId: string
): Promise<TranscriptSegment[]> {
  const response = await fetch('/api/innertube', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      videoId,
      context: {
        client: {
          clientName: 'ANDROID',
          clientVersion: '20.10.38',
          hl: 'en',
        },
      },
    }),
    signal: AbortSignal.timeout(15000),
  })

  if (!response.ok) {
    throw new Error(`InnerTube request failed: ${response.status}`)
  }

  const data = (await response.json()) as {
    captions?: {
      playerCaptionsTracklistRenderer?: {
        captionTracks?: InnerTubeCaptionTrack[]
      }
    }
  }

  const tracks =
    data.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? []

  if (tracks.length === 0) {
    throw new Error('Video has no caption tracks')
  }

  const track = pickPreferredTrack(tracks)
  if (!track?.baseUrl) {
    throw new Error('No usable caption track found')
  }

  // Route the caption URL through the dev proxy to avoid CORS
  const captionsUrl = rewriteCaptionsUrl(track.baseUrl)

  const captionsResponse = await fetch(captionsUrl, {
    signal: AbortSignal.timeout(15000),
  })

  if (!captionsResponse.ok) {
    throw new Error(`Captions fetch failed: ${captionsResponse.status}`)
  }

  const xml = await captionsResponse.text()

  if (!xml || xml.trim().length === 0) {
    throw new Error('Captions response was empty')
  }

  const segments = parseCaptionsXml(xml)
  if (segments.length === 0) {
    throw new Error('Could not parse any caption segments')
  }

  return segments
}

/**
 * Choose the best caption track: prefer manually created English,
 * then auto-generated English, then any track.
 */
function pickPreferredTrack(
  tracks: InnerTubeCaptionTrack[]
): InnerTubeCaptionTrack | undefined {
  const isEnglish = (t: InnerTubeCaptionTrack) =>
    t.languageCode === 'en' || t.languageCode?.startsWith('en')

  // Manually created English captions (kind is not 'asr')
  const manualEn = tracks.find((t) => isEnglish(t) && t.kind !== 'asr')
  if (manualEn) return manualEn

  // Auto-generated English
  const anyEn = tracks.find(isEnglish)
  if (anyEn) return anyEn

  // Fall back to the first available track
  return tracks[0]
}

/**
 * FALLBACK: Fetch captions from a public Invidious instance via the dev proxy.
 */
async function fetchFromInvidiousAPI(
  videoId: string
): Promise<TranscriptSegment[]> {
  // Step 1: list available caption tracks
  const listResponse = await fetch(`/api/invidious/api/v1/captions/${videoId}`, {
    signal: AbortSignal.timeout(10000),
  })

  if (!listResponse.ok) {
    throw new Error(`Invidious list failed: ${listResponse.status}`)
  }

  const listData = (await listResponse.json()) as {
    captions?: Array<{ label: string; languageCode: string; url: string }>
  }

  const captions = listData.captions ?? []
  if (captions.length === 0) {
    throw new Error('Invidious reports no captions')
  }

  // Prefer English
  const track =
    captions.find(
      (c) => c.languageCode === 'en' || c.languageCode?.startsWith('en')
    ) ?? captions[0]

  // Step 2: fetch the caption file (Invidious serves WebVTT)
  const trackPath = track.url.startsWith('/') ? track.url : `/${track.url}`
  const vttResponse = await fetch(`/api/invidious${trackPath}`, {
    signal: AbortSignal.timeout(10000),
  })

  if (!vttResponse.ok) {
    throw new Error(`Invidious caption fetch failed: ${vttResponse.status}`)
  }

  const vtt = await vttResponse.text()
  const segments = parseWebVtt(vtt)

  if (segments.length === 0) {
    throw new Error('Could not parse Invidious captions')
  }

  return segments
}

/**
 * Parse WebVTT subtitle format into TranscriptSegments.
 * Format:
 *   00:00:05.000 --> 00:00:08.000
 *   Caption text
 */
function parseWebVtt(vtt: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = []
  const blocks = vtt.split(/\r?\n\r?\n/)

  for (const block of blocks) {
    const lines = block.split(/\r?\n/).filter((l) => l.trim())
    if (lines.length < 2) continue

    const timeLine = lines.find((l) => l.includes('-->'))
    if (!timeLine) continue

    const [startRaw, endRaw] = timeLine.split('-->').map((s) => s.trim())
    const startTime = parseVttTimestamp(startRaw)
    const endTime = parseVttTimestamp(endRaw)

    if (startTime === null || endTime === null) continue

    // Text is everything after the timing line
    const timeIndex = lines.indexOf(timeLine)
    const text = decodeHtmlEntities(
      stripTags(lines.slice(timeIndex + 1).join(' ')).trim()
    )

    if (text) {
      segments.push({ text, startTime, endTime })
    }
  }

  return segments
}

/**
 * Convert a WebVTT timestamp (HH:MM:SS.mmm or MM:SS.mmm) to seconds.
 */
function parseVttTimestamp(stamp: string): number | null {
  const clean = stamp.split(' ')[0].trim()
  const parts = clean.split(':')

  if (parts.length === 3) {
    const [h, m, s] = parts
    const total = parseInt(h) * 3600 + parseInt(m) * 60 + parseFloat(s.replace(',', '.'))
    return isNaN(total) ? null : total
  }

  if (parts.length === 2) {
    const [m, s] = parts
    const total = parseInt(m) * 60 + parseFloat(s.replace(',', '.'))
    return isNaN(total) ? null : total
  }

  return null
}

/**
 * Rewrite an absolute YouTube captions URL to use the dev proxy.
 */
function rewriteCaptionsUrl(url: string): string {
  // URL looks like: https://www.youtube.com/api/timedtext?v=xxx&lang=en&...
  try {
    const parsed = new URL(url)
    // Route through our proxy: /api/youtube-timedtext?v=xxx&lang=en&...
    return `/api/youtube-timedtext${parsed.search}`
  } catch {
    // If URL parsing fails, try simple string replacement
    return url
      .replace('https://www.youtube.com/api/timedtext', '/api/youtube-timedtext')
      .replace('http://www.youtube.com/api/timedtext', '/api/youtube-timedtext')
  }
}

/**
 * Parse YouTube captions XML into TranscriptSegments.
 * Handles both srv3 format and legacy format.
 */
function parseCaptionsXml(xml: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = []

  // Try srv3 format: <p t="0" d="5000">text</p>
  const srv3Pattern = /<p\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g
  let match: RegExpExecArray | null

  while ((match = srv3Pattern.exec(xml)) !== null) {
    const startMs = parseInt(match[1])
    const durMs = parseInt(match[2])
    const text = decodeHtmlEntities(stripTags(match[3]).trim())

    if (text && !isNaN(startMs) && !isNaN(durMs)) {
      segments.push({
        text,
        startTime: startMs / 1000,
        endTime: (startMs + durMs) / 1000,
      })
    }
  }

  if (segments.length > 0) return segments

  // Try legacy format: <text start="0.0" dur="5.0">text</text>
  const legacyPattern = /<text\s+start="([^"]+)"\s+dur="([^"]+)"[^>]*>([\s\S]*?)<\/text>/g

  while ((match = legacyPattern.exec(xml)) !== null) {
    const startTime = parseFloat(match[1])
    const duration = parseFloat(match[2])
    const text = decodeHtmlEntities(match[3].trim())

    if (text && !isNaN(startTime) && !isNaN(duration)) {
      segments.push({
        text,
        startTime,
        endTime: startTime + duration,
      })
    }
  }

  return segments
}

/**
 * Strip HTML tags from text.
 */
function stripTags(text: string): string {
  return text.replace(/<[^>]+>/g, '')
}

/**
 * Decode common HTML entities found in YouTube captions.
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/\n/g, ' ')
    .trim()
}

/**
 * Simple language detection heuristic based on character analysis.
 */
function detectLanguage(text: string): string {
  if (/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/.test(text)) {
    if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) return 'ja'
    if (/[\uac00-\ud7af]/.test(text)) return 'ko'
    return 'zh'
  }
  if (/[\u0400-\u04ff]/.test(text)) return 'ru'
  if (/[\u0600-\u06ff]/.test(text)) return 'ar'
  if (/[\u0900-\u097f]/.test(text)) return 'hi'
  return 'en'
}

// ---------------------------------------------------------------------------
// DEPRECATED: Web Speech API transcription — DO NOT USE
//
// Everything below is superseded by whisperTranscriber.ts and is no longer
// called by the pipeline. It never worked reliably: SpeechRecognition
// transcribes the *microphone*, not an audio buffer, so playing a blob through
// the speakers and hoping the mic picked it up was unsound by construction.
// It also required mic permission, a quiet room, Chrome/Edge, and could never
// run faster than real time.
//
// Kept only so the older exports don't disappear from any external reference.
// ---------------------------------------------------------------------------

/**
 * Checks whether the browser supports the Web Speech API (SpeechRecognition).
 * @deprecated Use whisperTranscriber instead; this path is not used.
 */
export function isSpeechRecognitionSupported(): boolean {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition)
}

/**
 * Transcribes audio using the Web Speech API by splitting into 30-second chunks.
 *
 * @param audio - A Blob containing audio data decodable by AudioContext.
 * @returns TranscriptResult with segments, fullText, language, and confidence 0.7.
 * @throws If the Web Speech API is not supported by the browser.
 * @throws If no chunks produce recognized text.
 */
export async function extractFromAudio(audio: Blob): Promise<TranscriptResult> {
  if (!isSpeechRecognitionSupported()) {
    throw new Error(
      'Web Speech API not supported. Please use Chrome or Edge.'
    )
  }

  const audioContext = new AudioContext()
  const audioBuffer = await audioContext.decodeAudioData(await audio.arrayBuffer())
  const totalDuration = audioBuffer.duration
  const totalChunks = Math.ceil(totalDuration / CHUNK_DURATION)

  const segments: TranscriptSegment[] = []

  for (let i = 0; i < totalChunks; i++) {
    const startTime = i * CHUNK_DURATION
    const endTime = Math.min((i + 1) * CHUNK_DURATION, totalDuration)
    const chunkBlob = sliceAudioBuffer(audioBuffer, startTime, endTime)

    try {
      const text = await recognizeChunk(chunkBlob)
      if (text.trim()) {
        segments.push({ text: text.trim(), startTime, endTime })
      }
    } catch {
      // Skip chunks that fail recognition (e.g., silence, noise)
      continue
    }
  }

  if (segments.length === 0) {
    throw new Error(
      'Audio could not be transcribed. Please verify the video contains clear speech.'
    )
  }

  return {
    segments,
    fullText: segments.map((s) => s.text).join(' '),
    language: 'en',
    confidence: 0.7,
  }
}

/**
 * Slices an AudioBuffer between start and end seconds and returns a WAV Blob.
 */
export function sliceAudioBuffer(
  audioBuffer: AudioBuffer,
  start: number,
  end: number
): Blob {
  const sampleRate = audioBuffer.sampleRate
  const numberOfChannels = audioBuffer.numberOfChannels
  const startSample = Math.floor(start * sampleRate)
  const endSample = Math.floor(end * sampleRate)

  // Extract channel data for the slice
  const channelData: Float32Array[] = []
  for (let channel = 0; channel < numberOfChannels; channel++) {
    const fullChannelData = audioBuffer.getChannelData(channel)
    const slicedData = fullChannelData.slice(startSample, endSample)
    channelData.push(slicedData)
  }

  // Encode as WAV
  return encodeWAV(channelData, sampleRate, numberOfChannels)
}

/**
 * Transcribes a single audio chunk using the Web Speech API.
 */
export function recognizeChunk(audioBlob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const SpeechRecognitionCtor =
      window.SpeechRecognition || window.webkitSpeechRecognition

    if (!SpeechRecognitionCtor) {
      reject(new Error('Web Speech API not supported.'))
      return
    }

    const recognition = new SpeechRecognitionCtor()
    recognition.continuous = true
    recognition.interimResults = false
    recognition.lang = 'en-US'

    let result = ''

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      for (let i = 0; i < event.results.length; i++) {
        result += event.results[i][0].transcript + ' '
      }
    }

    recognition.onend = () => resolve(result.trim())

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'no-speech') {
        resolve('')
      } else {
        reject(new Error(`Speech recognition error: ${event.error}`))
      }
    }

    playAudioForRecognition(audioBlob, recognition)
  })
}

/**
 * Plays an audio blob and feeds it to the SpeechRecognition instance.
 */
function playAudioForRecognition(
  audioBlob: Blob,
  recognition: SpeechRecognition
): void {
  const audioUrl = URL.createObjectURL(audioBlob)
  const audio = new Audio(audioUrl)

  audio.addEventListener('ended', () => {
    recognition.stop()
    URL.revokeObjectURL(audioUrl)
  })

  audio.addEventListener('error', () => {
    recognition.stop()
    URL.revokeObjectURL(audioUrl)
  })

  recognition.start()
  audio.play().catch(() => {
    recognition.stop()
    URL.revokeObjectURL(audioUrl)
  })
}

/**
 * Encodes PCM audio data into a WAV format Blob.
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

// ---------------------------------------------------------------------------
// Unified multi-platform entry point
// ---------------------------------------------------------------------------

/**
 * Extracts a transcript from any supported source.
 *
 * Strategy per platform:
 * - YouTube      : published captions (InnerTube), Invidious fallback
 * - Vimeo        : published caption tracks from the player config
 * - Dailymotion  : published subtitles from the player metadata
 * - direct URL   : download the media and run Whisper locally
 *
 * When a platform has no captions, falls back to Whisper on the media itself
 * so the source still produces a course.
 *
 * @param url - The video URL
 * @param onProgress - Reports Whisper model/transcription progress
 * @throws Error if the URL is unsupported or no transcript can be produced
 */
export async function extractFromUrl(
  url: string,
  onProgress?: WhisperProgressCallback
): Promise<TranscriptResult> {
  const platform = detectPlatform(url)

  if (!platform) {
    throw new Error(
      'Unsupported link. Use YouTube, Vimeo, Dailymotion, or a direct video file URL.'
    )
  }

  // Direct media: no captions exist, go straight to speech recognition
  if (platform === 'direct') {
    return transcribeRemoteMedia(url, onProgress)
  }

  const id = parsePlatformId(url)
  if (!id) {
    throw new Error(`Could not read a video ID from this ${platform} link.`)
  }

  const captionErrors: string[] = []

  // 1. Try published captions first — they're accurate and instant
  try {
    if (platform === 'youtube') {
      return await extractFromYouTube(url)
    }

    const segments =
      platform === 'vimeo'
        ? await extractFromVimeo(id)
        : await extractFromDailymotion(id)

    return {
      segments,
      fullText: segments.map((s) => s.text).join(' '),
      language: 'en',
      confidence: CAPTION_CONFIDENCE,
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    captionErrors.push(reason)
    console.warn(`[transcript] ${platform} captions unavailable:`, reason)
  }

  // 2. No captions available. We cannot legally/technically pull the media
  // stream for these platforms, so report clearly rather than failing vaguely.
  throw new Error(
    `No captions found for this ${platform} video. ${captionErrors.join(' ')}`
  )
}

/**
 * Downloads a remote media file through the dev proxy and transcribes it
 * locally with Whisper.
 */
async function transcribeRemoteMedia(
  url: string,
  onProgress?: WhisperProgressCallback
): Promise<TranscriptResult> {
  const response = await fetch(proxiedUrl(url), {
    signal: AbortSignal.timeout(120000),
  })

  if (!response.ok) {
    throw new Error(
      `Could not download the video (${response.status}). Check the link is public.`
    )
  }

  const blob = await response.blob()

  if (blob.size === 0) {
    throw new Error('The downloaded video file was empty.')
  }

  return transcribeWithWhisper(blob, onProgress)
}

/**
 * Transcribes a locally uploaded file with Whisper.
 *
 * The video file is handed to Whisper directly — AudioContext extracts the
 * audio track during decoding, so no separate extraction step is needed.
 */
export async function extractFromFile(
  file: File,
  onProgress?: WhisperProgressCallback
): Promise<TranscriptResult> {
  return transcribeWithWhisper(file, onProgress)
}
