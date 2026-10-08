/**
 * Core type definitions for the Clip2Course application.
 * Defines all interfaces used across VideoManager, TranscriptExtractor,
 * CourseGenerator, CourseStore, and LLMProvider services.
 */

// --- Video Types ---

export type VideoSource = 'youtube' | 'vimeo' | 'direct-url' | 'upload'

export interface VideoInput {
  type: 'file' | 'url'
  file?: File
  url?: string
}

export interface VideoMetadata {
  title: string
  duration: number // seconds
  source: VideoSource
  thumbnailUrl?: string
}

// --- Transcript Types ---

export interface TranscriptSegment {
  text: string
  startTime: number // seconds
  endTime: number // seconds
}

export interface TranscriptResult {
  segments: TranscriptSegment[]
  fullText: string
  language: string
  confidence: number // 0-1
}

// --- Course Content Types ---

export interface QuizQuestion {
  id: string
  type: 'multiple-choice' | 'true-false' | 'fill-blank'
  question: string
  options?: string[]
  correctAnswer: string
  explanation: string
  sourceTimestamp: number
}

export interface Flashcard {
  id: string
  front: string
  back: string
  sourceTimestamp: number
}

export interface PuzzleItem {
  id: string
  content: string
  position?: number // for ordering puzzles
  matchTarget?: string // for matching puzzles
  scrambled?: string // for word-scramble puzzles
}

export interface Puzzle {
  id: string
  type: 'matching' | 'ordering' | 'word-scramble'
  instruction: string
  items: PuzzleItem[]
  solution: string[]
  sourceTimestamp: number
}

// --- Course Structure Types ---

export interface CourseSection {
  id: string
  title: string
  summary: string
  startTime: number
  endTime: number
  quizzes: QuizQuestion[]
  flashcards: Flashcard[]
  puzzles: Puzzle[]
}

export interface CourseData {
  id: string
  title: string
  description: string
  videoMetadata: VideoMetadata
  sections: CourseSection[]
  totalQuestions: number
  estimatedTime: number // minutes
  createdAt: Date
}

// --- Progress and Summary Types ---

export interface CourseProgress {
  courseId: string
  completedSections: string[]
  quizScores: Record<string, number>
  lastAccessedAt: Date
}

export interface CourseSummary {
  id: string
  title: string
  description: string
  totalSections: number
  completedSections: number
  createdAt: Date
  lastAccessedAt: Date
}

// --- Configuration Types ---

/**
 * How much course to build from one video.
 *
 * A long video merged into a handful of sections loses most of its detail, so
 * depth controls both how finely the transcript is divided and how much
 * material each section carries. Deeper means more LLM calls, so it trades
 * generation time for coverage.
 */
export type CourseDepth = 'standard' | 'extended' | 'comprehensive'

export interface CourseGeneratorOptions {
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  interactiveTypes: ('quiz' | 'flashcard' | 'puzzle')[]
  questionsPerSection: number
  language: string
  /** Defaults to 'standard' when omitted. */
  depth?: CourseDepth
  /** Overrides the depth preset's flashcard count per section. */
  flashcardsPerSection?: number
  /** Overrides the depth preset's puzzle count per section. */
  puzzlesPerSection?: number
}

export interface LLMOptions {
  maxTokens: number
  temperature: number
  systemPrompt?: string
}

// --- Quota and Validation Types ---

export interface QuotaInfo {
  remainingCalls: number
  resetTime: Date
}

export interface ValidationResult {
  isValid: boolean
  errors: string[]
}
