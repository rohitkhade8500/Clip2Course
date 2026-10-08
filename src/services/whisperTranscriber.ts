/**
 * Whisper-based speech-to-text running fully in the browser via
 * transformers.js (ONNX Runtime + WASM/WebGPU).
 *
 * This replaces the Web Speech API approach, which could not work:
 * SpeechRecognition transcribes the microphone, not an audio buffer, so
 * playing a blob through the speakers and hoping the mic caught it was
 * unreliable by construction and capped at real-time speed.
 *
 * Whisper takes raw audio samples directly, returns timestamped chunks,
 * needs no API key, and runs faster than real time.
 */

import type { TranscriptSegment, TranscriptResult } from '../types/course'

/** Sample rate Whisper expects. */
const WHISPER_SAMPLE_RATE = 16000

/** Model is small enough for a quick first-load and decent accuracy. */
const DEFAULT_MODEL = 'Xenova/whisper-tiny.en'

/** Reported confidence for Whisper output (higher than browser STT, below real captions). */
const WHISPER_CONFIDENCE = 0.85

/** Stages reported while transcribing so the UI can explain the wait. */
export type WhisperStage =
  | 'loading-model'
  | 'decoding-audio'
  | 'transcribing'
  | 'done'

export interface WhisperProgress {
  stage: WhisperStage
  /** 0-100 when known (model download percentage). */
  percent?: number
  message?: string
}

export type WhisperProgressCallback = (progress: WhisperProgress) => void

/**
 * Minimal shape of the transformers.js ASR pipeline we rely on.
 */
type AsrPipeline = (
  audio: Float32Array,
  options: Record<string, unknown>
) => Promise<{
  text?: string
  chunks?: Array<{ timestamp: [number, number | null]; text: string }>
}>

/** Cached pipeline so the model is only downloaded/instantiated once. */
let pipelinePromise: Promise<AsrPipeline> | null = null

/**
 * Loads (and caches) the Whisper pipeline.
 * The model is fetched from the Hugging Face CDN on first use and then
 * served from the browser cache.
 */
async function getPipeline(
  onProgress?: WhisperProgressCallback
): Promise<AsrPipeline> {
  if (pipelinePromise) return pipelinePromise

  pipelinePromise = (async () => {
    onProgress?.({
      stage: 'loading-model',
      message: 'Loading speech recognition model (first run downloads ~40MB)',
    })

    // Imported lazily so the large wasm/onnx runtime is only pulled in when
    // a user actually transcribes audio.
    const { pipeline, env } = await import('@huggingface/transformers')

    // Allow remote model download and browser caching
    env.allowLocalModels = false

    const asr = await pipeline('automatic-speech-recognition', DEFAULT_MODEL, {
      progress_callback: (info: unknown) => {
        const p = info as { status?: string; progress?: number }
        if (p?.status === 'progress' && typeof p.progress === 'number') {
          onProgress?.({
            stage: 'loading-model',
            percent: Math.round(p.progress),
            message: `Downloading model ${Math.round(p.progress)}%`,
          })
        }
      },
    })

    return asr as unknown as AsrPipeline
  })().catch((error) => {
    // Don't cache a failed load — let the next attempt retry
    pipelinePromise = null
    throw error
  })

  return pipelinePromise
}

/**
 * Decodes an audio/video blob into mono Float32 samples at 16 kHz.
 *
 * @throws Error if the blob has no decodable audio track
 */
export async function decodeToMono16k(blob: Blob): Promise<Float32Array> {
  const arrayBuffer = await blob.arrayBuffer()

  const AudioCtx: typeof AudioContext =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext

  if (!AudioCtx) {
    throw new Error('This browser cannot decode audio (no AudioContext).')
  }

  const context = new AudioCtx({ sampleRate: WHISPER_SAMPLE_RATE })

  let buffer: AudioBuffer
  try {
    buffer = await context.decodeAudioData(arrayBuffer)
  } catch {
    throw new Error(
      'Could not decode audio from this file. Make sure it contains an audio track.'
    )
  } finally {
    await context.close().catch(() => {})
  }

  if (buffer.numberOfChannels === 0 || buffer.length === 0) {
    throw new Error('This file has no usable audio track.')
  }

  // Downmix to mono by averaging channels
  if (buffer.numberOfChannels === 1) {
    return buffer.getChannelData(0)
  }

  const left = buffer.getChannelData(0)
  const right = buffer.getChannelData(1)
  const mono = new Float32Array(left.length)
  for (let i = 0; i < left.length; i++) {
    mono[i] = (left[i] + right[i]) / 2
  }
  return mono
}

/**
 * Transcribes an audio/video blob using Whisper.
 *
 * @param blob - Audio or video data with a decodable audio track
 * @param onProgress - Optional stage/percentage reporter
 * @returns A TranscriptResult with timestamped segments
 * @throws Error if the audio cannot be decoded or yields no speech
 */
export async function transcribeWithWhisper(
  blob: Blob,
  onProgress?: WhisperProgressCallback
): Promise<TranscriptResult> {
  const transcriber = await getPipeline(onProgress)

  onProgress?.({ stage: 'decoding-audio', message: 'Decoding audio' })
  const audio = await decodeToMono16k(blob)

  const durationSeconds = audio.length / WHISPER_SAMPLE_RATE

  onProgress?.({
    stage: 'transcribing',
    message: `Transcribing ${Math.round(durationSeconds)}s of audio`,
  })

  const output = await transcriber(audio, {
    chunk_length_s: 30,
    stride_length_s: 5,
    return_timestamps: true,
  })

  const segments = toSegments(output.chunks ?? [], durationSeconds)

  if (segments.length === 0) {
    throw new Error(
      `No speech was found in this ${Math.round(durationSeconds)}s video. ` +
        'It may be silent, or contain only music or background noise. ' +
        'A course needs spoken narration to work from.'
    )
  }

  onProgress?.({ stage: 'done' })

  return {
    segments,
    fullText: output.text?.trim() || segments.map((s) => s.text).join(' '),
    language: 'en',
    confidence: WHISPER_CONFIDENCE,
  }
}

/**
 * Converts Whisper's timestamped chunks into TranscriptSegments.
 * Whisper can emit a null end timestamp on the final chunk, so that is
 * backfilled from the known audio duration.
 */
function toSegments(
  chunks: Array<{ timestamp: [number, number | null]; text: string }>,
  durationSeconds: number
): TranscriptSegment[] {
  const segments: TranscriptSegment[] = []

  for (const chunk of chunks) {
    const text = chunk.text?.trim()
    if (!text) continue

    const startTime = chunk.timestamp?.[0] ?? 0
    const rawEnd = chunk.timestamp?.[1]
    const endTime = rawEnd ?? durationSeconds

    // Keep the invariant startTime < endTime that CourseSection relies on
    if (!isFinite(startTime) || !isFinite(endTime) || endTime <= startTime) {
      continue
    }

    segments.push({ text, startTime, endTime })
  }

  return segments.sort((a, b) => a.startTime - b.startTime)
}

/** Test/debug helper: forget the cached pipeline. */
export function _resetWhisper(): void {
  pipelinePromise = null
}
