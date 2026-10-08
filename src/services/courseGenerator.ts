import type {
  TranscriptSegment,
  TranscriptResult,
  CourseSection,
  CourseData,
  CourseGeneratorOptions,
  VideoInput,
  VideoMetadata,
  QuizQuestion,
  Flashcard,
  Puzzle,
  PuzzleItem,
  CourseDepth,
} from '../types/course'
import {
  LLMProviderChain,
  HuggingFaceProvider,
  GroqProvider,
  fallbackLocalGeneration,
} from './llmProvider'
import { validateInput, getMetadata } from './videoManager'
import { extractFromUrl, extractFromFile } from './transcriptExtractor'
import type { WhisperProgress } from './whisperTranscriber'

const TARGET_SECTION_DURATION = 180 // 3 minutes per section

/**
 * Maximum number of sections generated for a single course.
 * Each section costs one LLM call, so this bounds generation time and
 * keeps usage inside free-tier rate limits. Matches the design's
 * "3-10 sections per course" guidance.
 */
const MAX_SECTIONS = 10

// ---------------------------------------------------------------------------
// Course Depth
// ---------------------------------------------------------------------------

/**
 * What a depth level actually changes.
 *
 * The problem this solves: a two-hour video split at 3-minute boundaries
 * produces ~40 raw sections, which the standard preset merges down to 10. Each
 * merged section then covers ~12 minutes of speech but only the first
 * `promptChars` of it reach the model, so most of the video never influences
 * the course. Raising the section cap keeps sections close to their natural
 * length, and raising `promptChars` means the model sees the whole section.
 */
export interface CourseDepthPreset {
  /** Upper bound on sections, and therefore on sequential LLM calls. */
  maxSections: number
  /** Seconds of speech a raw section accumulates before it is cut. */
  targetSectionDuration: number
  /** Transcript characters sent to the model per section. */
  promptChars: number
  /** Flashcards requested and kept per section. */
  flashcardsPerSection: number
  /** Puzzles requested and kept per section. */
  puzzlesPerSection: number
  /** Completion token budget, which has to grow with the material. */
  maxTokens: number
}

export const COURSE_DEPTH_PRESETS: Record<CourseDepth, CourseDepthPreset> = {
  // Quick pass: fastest, and what every course generated before depth existed
  // effectively used.
  standard: {
    maxSections: MAX_SECTIONS,
    targetSectionDuration: TARGET_SECTION_DURATION,
    promptChars: 3000,
    flashcardsPerSection: 5,
    puzzlesPerSection: 2,
    maxTokens: 2000,
  },
  // Roughly one section per 5 minutes of a long video, with more per section.
  extended: {
    maxSections: 24,
    targetSectionDuration: 240,
    promptChars: 5000,
    flashcardsPerSection: 8,
    puzzlesPerSection: 3,
    maxTokens: 3000,
  },
  // Full coverage: a 2-hour video keeps ~40 sections at their natural length.
  comprehensive: {
    maxSections: 48,
    targetSectionDuration: 180,
    promptChars: 7000,
    flashcardsPerSection: 10,
    puzzlesPerSection: 4,
    maxTokens: 4000,
  },
}

/**
 * Resolves the preset for a set of options, applying any per-field overrides.
 * Omitting `depth` keeps the original behaviour exactly.
 */
export function resolveDepthPreset(
  options: CourseGeneratorOptions
): CourseDepthPreset {
  const preset = COURSE_DEPTH_PRESETS[options.depth ?? 'standard']

  return {
    ...preset,
    flashcardsPerSection:
      options.flashcardsPerSection ?? preset.flashcardsPerSection,
    puzzlesPerSection: options.puzzlesPerSection ?? preset.puzzlesPerSection,
  }
}

/**
 * Estimates what a depth level will produce for a video of `durationSeconds`,
 * so the UI can set expectations before a long generation run starts.
 *
 * Returns section and question counts plus a rough wall-clock estimate, based
 * on one sequential LLM call per section.
 */
export function estimateCourseSize(
  durationSeconds: number,
  options: CourseGeneratorOptions
): { sections: number; questions: number; minutesToGenerate: number } {
  const preset = resolveDepthPreset(options)

  const natural =
    durationSeconds > 0
      ? Math.max(1, Math.round(durationSeconds / preset.targetSectionDuration))
      : preset.maxSections
  const sections = Math.min(natural, preset.maxSections)

  const questions = options.interactiveTypes.includes('quiz')
    ? sections * Math.max(1, options.questionsPerSection)
    : 0

  // ~8s per section call at these token budgets, rounded up to whole minutes.
  return {
    sections,
    questions,
    minutesToGenerate: Math.max(1, Math.ceil((sections * 8) / 60)),
  }
}

// ---------------------------------------------------------------------------
// Parsed LLM Response Type
// ---------------------------------------------------------------------------

/**
 * Represents the structured content parsed from an LLM response.
 */
export interface ParsedSectionContent {
  title?: string
  summary?: string
  quizzes?: Array<{
    type: string
    question: string
    options?: string[]
    correctAnswer: string
    explanation: string
  }>
  flashcards?: Array<{ front: string; back: string }>
  puzzles?: Array<{
    type: string
    instruction: string
    items: unknown[]
    solution: string[]
  }>
}

// ---------------------------------------------------------------------------
// Course Content Generation
// ---------------------------------------------------------------------------

/**
 * System prompt for course generation LLM calls.
 */
const COURSE_GENERATION_SYSTEM_PROMPT =
  'You are an educational content generator. Given transcript text, produce structured interactive learning materials as JSON. Respond with ONLY valid JSON — no markdown, no explanation, no extra text.'

/**
 * Builds an LLM prompt to generate course content from section text.
 *
 * Includes the difficulty level, requested interactive types, and
 * questionsPerSection in the prompt to guide the LLM output.
 *
 * @param text - The transcript text for the section
 * @param options - Course generation options (difficulty, types, etc.)
 * @returns The formatted prompt string
 */
export function buildCoursePrompt(
  text: string,
  options: CourseGeneratorOptions
): string {
  const preset = resolveDepthPreset(options)

  const typesRequested = options.interactiveTypes
    .map(t => {
      if (t === 'quiz') return `"quizzes": Array of exactly ${options.questionsPerSection} quiz questions, each covering a different idea from the content`
      if (t === 'flashcard') return `"flashcards": Array of ${preset.flashcardsPerSection} flashcards with "front" and "back"`
      if (t === 'puzzle') return `"puzzles": Array of ${preset.puzzlesPerSection} puzzles, varying the type between them`
      return ''
    })
    .filter(Boolean)
    .join('\n- ')

  return `Based on the following educational content, generate interactive learning materials.

Content: "${text.slice(0, preset.promptChars)}"

Generate a JSON object with:
- "title": A short section title (max 60 chars)
- "summary": 2-3 sentence summary of key concepts
- ${typesRequested}

${options.interactiveTypes.includes('quiz') ? `Each quiz question should have:
  - "type": "multiple-choice" | "true-false" | "fill-blank"
  - "question": The question text
  - "options": Array of 4 choices (for multiple-choice)
  - "correctAnswer": The correct answer (must be one of the options for multiple-choice)
  - "explanation": Why this answer is correct
` : ''}${options.interactiveTypes.includes('flashcard') ? `Each flashcard should have:
  - "front": The question or term
  - "back": The answer or definition
` : ''}${options.interactiveTypes.includes('puzzle') ? `Each puzzle should have:
  - "type": "matching" | "ordering" | "word-scramble"
  - "instruction": What to do
  - "items": Array of items
  - "solution": Correct order/matches
` : ''}
Difficulty level: ${options.difficulty}
Respond with ONLY valid JSON, no markdown.`
}

/**
 * Parses an LLM response string into structured course section content.
 *
 * Attempts to parse directly as JSON first. If that fails, strips markdown
 * code fencing (```json ... ```) and trailing text, then retries parsing.
 * Returns null if parsing fails entirely.
 *
 * @param response - The raw LLM response string
 * @returns Parsed content or null if unparseable
 */
export function parseLLMResponse(response: string): ParsedSectionContent | null {
  // First attempt: try direct JSON parsing
  try {
    const parsed = JSON.parse(response)
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as ParsedSectionContent
    }
  } catch {
    // Direct parse failed, try stripping markdown fencing
  }

  // Second attempt: strip markdown code fencing
  try {
    // Match ```json ... ``` or ``` ... ``` patterns
    const fencePattern = /```(?:json)?\s*\n?([\s\S]*?)```/
    const match = response.match(fencePattern)
    if (match && match[1]) {
      const stripped = match[1].trim()
      const parsed = JSON.parse(stripped)
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed as ParsedSectionContent
      }
    }
  } catch {
    // Fencing strip + parse also failed
  }

  // Third attempt: try to find JSON object in the response
  try {
    const jsonStart = response.indexOf('{')
    const jsonEnd = response.lastIndexOf('}')
    if (jsonStart !== -1 && jsonEnd > jsonStart) {
      const jsonStr = response.slice(jsonStart, jsonEnd + 1)
      const parsed = JSON.parse(jsonStr)
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed as ParsedSectionContent
      }
    }
  } catch {
    // All attempts failed
  }

  return null
}

/**
 * Generates course section content from transcript segments using an LLM chain.
 *
 * Calls the LLM with a crafted prompt and parses the response. If parsing fails,
 * falls back to local heuristic generation. Filters interactive types based on
 * options.interactiveTypes and validates quiz questions.
 *
 * @param sectionSegments - The transcript segments for this section
 * @param options - Course generation options
 * @param llmChain - The LLM provider chain for text completion
 * @returns A complete CourseSection
 */
export async function generateSectionContent(
  sectionSegments: TranscriptSegment[],
  options: CourseGeneratorOptions,
  llmChain: LLMProviderChain
): Promise<CourseSection> {
  const sectionText = sectionSegments.map(s => s.text).join(' ')
  const startTime = sectionSegments[0].startTime
  const endTime = sectionSegments[sectionSegments.length - 1].endTime

  const preset = resolveDepthPreset(options)

  // Build prompt and call LLM
  const prompt = buildCoursePrompt(sectionText, options)

  const response = await llmChain.complete(prompt, {
    // A deeper course asks for more material per section, so the completion
    // budget has to grow with it or the JSON gets truncated mid-array.
    maxTokens: preset.maxTokens,
    temperature: 0.7,
    systemPrompt: COURSE_GENERATION_SYSTEM_PROMPT,
  })

  // Parse the response
  let parsed = parseLLMResponse(response)

  // If parsing fails, fall back to local heuristic generation
  if (!parsed) {
    const fallbackResponse = fallbackLocalGeneration(prompt)
    parsed = parseLLMResponse(fallbackResponse)
  }

  // Build the CourseSection
  const title =
    toText(parsed?.title) || sectionText.slice(0, 60).trim() || 'Section Review'
  const summary =
    toText(parsed?.summary) || 'Review key concepts from this section.'

  // Filter interactive types based on options.
  // Requirement 7.3: include returned questions *up to* the requested count —
  // models often return more than asked, which bloats the section.
  const quizzes: QuizQuestion[] = options.interactiveTypes.includes('quiz')
    ? buildQuizQuestions(parsed?.quizzes || [], startTime).slice(
        0,
        Math.max(1, options.questionsPerSection)
      )
    : []

  const flashcards: Flashcard[] = options.interactiveTypes.includes('flashcard')
    ? buildFlashcards(parsed?.flashcards || [], startTime).slice(
        0,
        Math.max(1, preset.flashcardsPerSection)
      )
    : []

  const puzzles: Puzzle[] = options.interactiveTypes.includes('puzzle')
    ? buildPuzzles(parsed?.puzzles || [], startTime).slice(
        0,
        Math.max(1, preset.puzzlesPerSection)
      )
    : []

  // Ensure startTime < endTime
  const validEndTime = endTime > startTime ? endTime : startTime + 1

  return {
    id: crypto.randomUUID(),
    title,
    summary,
    startTime,
    endTime: validEndTime,
    quizzes,
    flashcards,
    puzzles,
  }
}

// ---------------------------------------------------------------------------
// Helper functions for building typed course content
// ---------------------------------------------------------------------------

/**
 * Coerces an arbitrary LLM-supplied value to a trimmed string.
 *
 * LLM JSON is untyped in practice: `correctAnswer` comes back as a boolean for
 * true/false questions, sometimes as a number for option indexes, and options
 * can contain numbers. Anything object-like is rejected rather than turned
 * into "[object Object]".
 */
function toText(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'boolean') return value ? 'True' : 'False'
  if (typeof value === 'number' && isFinite(value)) return String(value)
  return ''
}

/**
 * Resolves the correct answer for a multiple-choice question.
 * Handles models that answer with the option text, a 0/1-based index,
 * or a letter such as "B".
 */
function resolveCorrectAnswer(
  rawAnswer: unknown,
  options: string[]
): string | null {
  const answer = toText(rawAnswer)
  if (!answer) return null

  // Exact (case-insensitive) match against an option
  const direct = options.find(
    (o) => o.toLowerCase() === answer.toLowerCase()
  )
  if (direct) return direct

  // Letter answer: "B" / "b)" / "(C)"
  const letter = answer.replace(/[^a-zA-Z]/g, '')
  if (letter.length === 1) {
    const index = letter.toUpperCase().charCodeAt(0) - 65
    if (index >= 0 && index < options.length) return options[index]
  }

  // Numeric answer: treat as an index, tolerating 0- and 1-based
  const numeric = Number(answer)
  if (Number.isInteger(numeric)) {
    if (numeric >= 0 && numeric < options.length) return options[numeric]
    if (numeric >= 1 && numeric <= options.length) return options[numeric - 1]
  }

  return null
}

/**
 * Converts raw parsed quiz data into validated QuizQuestion objects.
 *
 * Every field is treated as untrusted: the model's JSON shape varies between
 * runs, and one bad value used to abort the whole course generation.
 * Questions that cannot be repaired are dropped instead of throwing.
 */
function buildQuizQuestions(
  raw: unknown[],
  sourceTimestamp: number
): QuizQuestion[] {
  if (!Array.isArray(raw)) return []

  const built: QuizQuestion[] = []

  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue

    const q = entry as Record<string, unknown>

    const question = toText(q.question)
    if (!question) continue

    const type = normalizeQuizType(toText(q.type))
    const explanation =
      toText(q.explanation) || 'This is the correct answer based on the content.'

    let options: string[] | undefined
    let correctAnswer: string

    if (type === 'multiple-choice') {
      // Coerce, trim, drop blanks, de-duplicate
      const cleaned = Array.from(
        new Set(
          (Array.isArray(q.options) ? q.options : [])
            .map(toText)
            .filter((o) => o.length > 0)
        )
      )

      // Requirement 4.4: exactly 4 distinct options
      if (cleaned.length !== 4) continue

      // Requirement 4.4: the answer must be one of those options
      const resolved = resolveCorrectAnswer(q.correctAnswer, cleaned)
      if (!resolved) continue

      options = cleaned
      correctAnswer = resolved
    } else if (type === 'true-false') {
      // Give true/false questions real choices so they're answerable
      options = ['True', 'False']

      const answer = toText(q.correctAnswer).toLowerCase()
      if (['true', 'yes', 't', '1'].includes(answer)) {
        correctAnswer = 'True'
      } else if (['false', 'no', 'f', '0'].includes(answer)) {
        correctAnswer = 'False'
      } else {
        continue
      }
    } else {
      // fill-blank
      correctAnswer = toText(q.correctAnswer)
      if (!correctAnswer) continue
    }

    built.push({
      id: crypto.randomUUID(),
      type,
      question,
      options,
      correctAnswer,
      explanation,
      sourceTimestamp,
    })
  }

  return built
}

/**
 * Normalizes quiz type strings to valid QuizQuestion types.
 */
function normalizeQuizType(type: string): 'multiple-choice' | 'true-false' | 'fill-blank' {
  const normalized = type?.toLowerCase().replace(/\s+/g, '-')
  if (normalized === 'multiple-choice') return 'multiple-choice'
  if (normalized === 'true-false') return 'true-false'
  if (normalized === 'fill-blank' || normalized === 'fill-in-the-blank') return 'fill-blank'
  return 'multiple-choice' // default
}

/**
 * Converts raw parsed flashcard data into typed Flashcard objects.
 * Values are coerced because the model sometimes returns non-strings.
 */
function buildFlashcards(
  raw: unknown[],
  sourceTimestamp: number
): Flashcard[] {
  if (!Array.isArray(raw)) return []

  const cards: Flashcard[] = []

  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue

    const f = entry as Record<string, unknown>
    // Accept common alternate key names the model produces
    const front = toText(f.front) || toText(f.term) || toText(f.question)
    const back = toText(f.back) || toText(f.definition) || toText(f.answer)

    if (!front || !back) continue

    cards.push({ id: crypto.randomUUID(), front, back, sourceTimestamp })
  }

  return cards
}

/**
 * Converts raw parsed puzzle data into typed Puzzle objects.
 * Malformed puzzles are skipped rather than allowed to break generation.
 */
function buildPuzzles(
  raw: unknown[],
  sourceTimestamp: number
): Puzzle[] {
  if (!Array.isArray(raw)) return []

  const puzzles: Puzzle[] = []

  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue

    const p = entry as Record<string, unknown>
    const instruction = toText(p.instruction)
    if (!instruction) continue

    if (!Array.isArray(p.items) || !Array.isArray(p.solution)) continue

    const type = normalizePuzzleType(toText(p.type))

    const items: PuzzleItem[] = []
    p.items.forEach((item, index) => {
      const source: Record<string, unknown> =
        item && typeof item === 'object'
          ? (item as Record<string, unknown>)
          : { content: item }

      const content =
        toText(source.content) || toText(source.text) || toText(item)
      if (!content) return

      items.push({
        id: crypto.randomUUID(),
        content,
        position: type === 'ordering' ? index : undefined,
        matchTarget:
          type === 'matching'
            ? toText(source.matchTarget) || toText(source.match) || undefined
            : undefined,
        scrambled:
          type === 'word-scramble' ? toText(source.scrambled) || undefined : undefined,
      })
    })

    const solution = p.solution.map(toText).filter((s) => s.length > 0)

    // A puzzle with nothing to interact with, or no answer, isn't usable
    if (items.length === 0 || solution.length === 0) continue

    puzzles.push({
      id: crypto.randomUUID(),
      type,
      instruction,
      items,
      solution,
      sourceTimestamp,
    })
  }

  return puzzles
}

/**
 * Normalizes puzzle type strings to valid Puzzle types.
 */
function normalizePuzzleType(type: string): 'matching' | 'ordering' | 'word-scramble' {
  const normalized = type?.toLowerCase().replace(/\s+/g, '-')
  if (normalized === 'matching') return 'matching'
  if (normalized === 'ordering') return 'ordering'
  if (normalized === 'word-scramble') return 'word-scramble'
  return 'matching' // default
}

/**
 * Merges a list of sections down to at most `maxSections` by evenly
 * distributing the original sections into that many buckets.
 *
 * Every input segment is preserved and stays in chronological order —
 * this only reduces how many groups the segments are divided into.
 *
 * @param sections - Sections produced by splitIntoSections
 * @param maxSections - Upper bound on the returned section count
 * @returns At most `maxSections` section arrays
 */
export function capSectionCount(
  sections: TranscriptSegment[][],
  maxSections: number
): TranscriptSegment[][] {
  if (maxSections < 1) return sections
  if (sections.length <= maxSections) return sections

  const merged: TranscriptSegment[][] = []
  // How many original sections go into each output bucket
  const groupSize = Math.ceil(sections.length / maxSections)

  for (let i = 0; i < sections.length; i += groupSize) {
    const bucket = sections.slice(i, i + groupSize).flat()
    if (bucket.length > 0) merged.push(bucket)
  }

  return merged
}

/**
 * Splits transcript segments into logical sections for course generation.
 *
 * Accumulates segments until section duration reaches or exceeds 180 seconds.
 * If the remaining segments after the last complete section are fewer than 3,
 * they are merged into the preceding section to avoid tiny orphan sections.
 *
 * Guarantees no data loss: all input segments appear in exactly one output section.
 *
 * @param segments - Array of transcript segments ordered by startTime
 * @returns Array of section arrays, each containing consecutive segments
 */
export function splitIntoSections(
  segments: TranscriptSegment[],
  targetDuration: number = TARGET_SECTION_DURATION
): TranscriptSegment[][] {
  if (segments.length === 0) return []

  const sections: TranscriptSegment[][] = []
  let currentSection: TranscriptSegment[] = []

  for (const segment of segments) {
    currentSection.push(segment)

    const sectionDuration =
      segment.endTime - currentSection[0].startTime

    if (sectionDuration >= targetDuration) {
      sections.push([...currentSection])
      currentSection = []
    }
  }

  // Don't lose remaining segments
  if (currentSection.length > 0) {
    if (sections.length > 0 && currentSection.length < 3) {
      // Merge tiny remainder into last section
      sections[sections.length - 1].push(...currentSection)
    } else {
      sections.push(currentSection)
    }
  }

  return sections
}


// ---------------------------------------------------------------------------
// Processing Progress Types
// ---------------------------------------------------------------------------

/**
 * Represents the current progress state during course processing.
 */
export interface ProcessingProgress {
  phase: 'validating' | 'metadata' | 'transcribing' | 'generating' | 'saving'
  currentSection?: number
  totalSections?: number
  completedSections?: CourseSection[]
  error?: string
  /** Set during the transcribing phase when Whisper is loading/running. */
  transcription?: WhisperProgress
}

/**
 * Callback type for reporting processing progress.
 */
export type ProgressCallback = (progress: ProcessingProgress) => void

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Checks if a URL matches YouTube URL patterns.
 */
export function isYouTubeUrl(url: string): boolean {
  return /(?:youtube\.com|youtu\.be)/i.test(url)
}

/**
 * Creates an LLMProviderChain with HuggingFace and Groq providers
 * using environment variables for API keys.
 */
export function createLLMChain(): LLMProviderChain {
  const hfKey = import.meta.env.VITE_HF_API_KEY || ''
  const groqKey = import.meta.env.VITE_GROQ_API_KEY || ''

  return new LLMProviderChain([
    new HuggingFaceProvider(hfKey),
    new GroqProvider(groqKey),
  ])
}

/**
 * Generates a 1-2 sentence course description from the full transcript text.
 */
export function generateCourseDescription(fullText: string): string {
  // Extract first meaningful sentences for description
  const sentences = fullText
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 15)

  if (sentences.length === 0) {
    return 'An interactive course generated from video content.'
  }

  // Use first 1-2 sentences, capped at ~200 characters
  let description = sentences[0]
  if (sentences.length > 1 && (description.length + sentences[1].length) < 180) {
    description += '. ' + sentences[1]
  }

  if (description.length > 200) {
    description = description.slice(0, 197) + '...'
  }

  return description + '.'
}

// ---------------------------------------------------------------------------
// Main Orchestration Function
// ---------------------------------------------------------------------------

/**
 * Main orchestration function that converts a video input to a complete course.
 *
 * Steps:
 * 1. Validate at least one interactive type is selected
 * 2. Validate input (file/URL)
 * 3. Get video metadata
 * 4. Extract transcript (YouTube captions or browser speech recognition)
 * 5. Split transcript into sections
 * 6. Generate course content for each section (with progress tracking and retries)
 * 7. Assemble final CourseData with computed totalQuestions and estimatedTime
 * 8. Save to IndexedDB (when CourseStore is available)
 *
 * Error recovery:
 * - Saves partial progress (completed sections) on failure via progress callback
 * - Supports resume from first incomplete section via partialCourse parameter
 * - Max 3 retries per section on network failure with exponential backoff
 *
 * @param input - Video input (file or URL)
 * @param options - Course generation options (difficulty, types, etc.)
 * @param onProgress - Optional callback for progress updates
 * @param partialCourse - Optional partial course to resume from
 * @returns Complete CourseData
 *
 * @throws Error if no interactive type is selected (Requirement 7.4)
 * @throws Error if input validation fails (Requirement 9.4)
 * @throws Error if transcript is empty (Requirement 4.9)
 * @throws Error if generation fails after max retries (Requirement 9.5)
 *
 * Validates: Requirements 4.6, 4.7, 4.9, 7.4, 9.1, 9.2, 9.5, 9.7
 */
export async function processVideoToCourse(
  input: VideoInput,
  options: CourseGeneratorOptions,
  onProgress?: ProgressCallback,
  partialCourse?: { sections: CourseSection[]; startFromSection: number }
): Promise<CourseData> {
  // Step 1: Validate at least one interactive type is selected (Req 7.4)
  if (!options.interactiveTypes || options.interactiveTypes.length === 0) {
    throw new Error('At least one interactive type must be selected')
  }

  // Step 2: Validate input
  onProgress?.({ phase: 'validating' })
  const validation = validateInput(input)
  if (!validation.isValid) {
    throw new Error(`Validation failed: ${validation.errors.join(', ')}`)
  }

  // Step 3: Get metadata
  onProgress?.({ phase: 'metadata' })
  const metadata: VideoMetadata = await getMetadata(input)

  // Step 4: Extract transcript.
  // Uploaded files run through Whisper locally; URLs are routed by platform
  // (published captions where available, Whisper for direct media files).
  onProgress?.({ phase: 'transcribing' })

  const reportWhisper = (p: WhisperProgress) => {
    onProgress?.({ phase: 'transcribing', transcription: p })
  }

  const transcript: TranscriptResult =
    input.type === 'file'
      ? await extractFromFile(input.file!, reportWhisper)
      : await extractFromUrl(input.url!, reportWhisper)

  // Step 5: Verify transcript has segments (Req 4.9)
  if (transcript.segments.length === 0) {
    throw new Error('Transcript is empty. Cannot generate course.')
  }

  // Step 6: Split into sections, then cap to a practical count.
  // Each section is one sequential LLM call, so the cap bounds generation time
  // and keeps usage inside free-tier rate limits. Depth decides both numbers:
  // 'standard' merges a long video down to 10 sections, while 'comprehensive'
  // keeps ~40 so a two-hour video is actually covered end to end. Merging
  // never drops segments — it only reduces how many groups they fall into.
  const depthPreset = resolveDepthPreset(options)
  const sectionSegments = capSectionCount(
    splitIntoSections(transcript.segments, depthPreset.targetSectionDuration),
    depthPreset.maxSections
  )

  // Step 7: Generate course content for each section with error recovery
  const llmChain = createLLMChain()
  const courseSections: CourseSection[] = partialCourse?.sections
    ? [...partialCourse.sections]
    : []
  const startIdx = partialCourse?.startFromSection || 0

  onProgress?.({
    phase: 'generating',
    currentSection: startIdx,
    totalSections: sectionSegments.length,
  })

  for (let i = startIdx; i < sectionSegments.length; i++) {
    let retries = 0
    const MAX_RETRIES = 3
    let sectionGenerated = false

    while (retries < MAX_RETRIES && !sectionGenerated) {
      try {
        const section = await generateSectionContent(
          sectionSegments[i],
          options,
          llmChain
        )
        courseSections.push(section)
        sectionGenerated = true
        onProgress?.({
          phase: 'generating',
          currentSection: i + 1,
          totalSections: sectionSegments.length,
          completedSections: courseSections,
        })
      } catch (error) {
        retries++
        const reason = error instanceof Error ? error.message : String(error)
        // Log every attempt: without this the real cause is invisible and the
        // user only sees a generic "generation failed" message.
        console.error(
          `[course] section ${i + 1} attempt ${retries}/${MAX_RETRIES} failed:`,
          error
        )
        if (retries >= MAX_RETRIES) {
          // Save partial progress and report error (Req 9.1, 9.5, 9.7)
          onProgress?.({
            phase: 'generating',
            currentSection: i,
            totalSections: sectionSegments.length,
            completedSections: courseSections,
            error: `Failed to generate section ${i + 1} after ${MAX_RETRIES} attempts: ${reason}`,
          })
          throw new Error(
            `Generation failed at section ${i + 1}/${sectionSegments.length} (${reason}). ` +
            `${courseSections.length} sections completed successfully.`
          )
        }
        // Exponential backoff before retry
        await new Promise(resolve => setTimeout(resolve, 1000 * retries))
      }
    }
  }

  // Step 8: Assemble final course (Req 4.6, 4.7)
  const totalQuestions = courseSections.reduce(
    (sum, section) => sum + section.quizzes.length,
    0
  )
  // Flashcards and puzzles are study time too, and a deep course is mostly
  // made of them, so a quiz-only estimate would understate it badly.
  const totalFlashcards = courseSections.reduce(
    (sum, section) => sum + section.flashcards.length,
    0
  )
  const totalPuzzles = courseSections.reduce(
    (sum, section) => sum + section.puzzles.length,
    0
  )
  const estimatedTime =
    totalQuestions * 1.5 +
    courseSections.length * 2 +
    totalFlashcards * 0.5 +
    totalPuzzles * 2

  const course: CourseData = {
    id: crypto.randomUUID(),
    title: metadata.title,
    description: generateCourseDescription(transcript.fullText),
    videoMetadata: metadata,
    sections: courseSections,
    totalQuestions,
    estimatedTime,
    createdAt: new Date(),
  }

  // Step 9: Save to IndexedDB (placeholder for CourseStore integration - task 8.1)
  onProgress?.({ phase: 'saving' })
  // await courseStore.saveCourse(course)

  return course
}
