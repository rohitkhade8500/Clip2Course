import { describe, it, expect, vi } from 'vitest'
import {
  generateSectionContent,
  buildCoursePrompt,
  capSectionCount,
  splitIntoSections,
  resolveDepthPreset,
  estimateCourseSize,
  COURSE_DEPTH_PRESETS,
} from './courseGenerator'
import type { LLMProviderChain } from './llmProvider'
import type { CourseGeneratorOptions, TranscriptSegment } from '../types/course'

const segments: TranscriptSegment[] = [
  { text: 'Commitment matters in relationships.', startTime: 0, endTime: 10 },
  { text: 'Honesty builds trust over time.', startTime: 10, endTime: 20 },
]

const options: CourseGeneratorOptions = {
  difficulty: 'beginner',
  interactiveTypes: ['quiz', 'flashcard', 'puzzle'],
  questionsPerSection: 5,
  language: 'en',
}

/** Builds a stub chain that returns a fixed payload, like the real one does. */
function chainReturning(payload: unknown): LLMProviderChain {
  return {
    providers: [],
    complete: vi.fn().mockResolvedValue(JSON.stringify(payload)),
    getCache: vi.fn(),
  } as unknown as LLMProviderChain
}

describe('generateSectionContent resilience to malformed LLM output', () => {
  // This is the exact shape that crashed generation:
  // "q.correctAnswer.trim is not a function"
  it('handles a boolean correctAnswer on a true-false question', async () => {
    const chain = chainReturning({
      title: 'Commitment',
      summary: 'About commitment.',
      quizzes: [
        {
          type: 'true-false',
          question: 'The speaker values honesty.',
          correctAnswer: true, // boolean, not a string
          explanation: 'Stated directly.',
        },
      ],
      flashcards: [],
      puzzles: [],
    })

    const section = await generateSectionContent(segments, options, chain)

    expect(section.quizzes).toHaveLength(1)
    expect(section.quizzes[0].correctAnswer).toBe('True')
    expect(section.quizzes[0].options).toEqual(['True', 'False'])
  })

  it('resolves a numeric index correctAnswer against the options', async () => {
    const chain = chainReturning({
      quizzes: [
        {
          type: 'multiple-choice',
          question: 'Pick one',
          options: ['Alpha', 'Beta', 'Gamma', 'Delta'],
          correctAnswer: 1, // index, not text
          explanation: 'because',
        },
      ],
    })

    const section = await generateSectionContent(segments, options, chain)
    expect(section.quizzes[0].correctAnswer).toBe('Beta')
  })

  it('resolves a letter correctAnswer against the options', async () => {
    const chain = chainReturning({
      quizzes: [
        {
          type: 'multiple-choice',
          question: 'Pick one',
          options: ['Alpha', 'Beta', 'Gamma', 'Delta'],
          correctAnswer: 'C',
          explanation: 'because',
        },
      ],
    })

    const section = await generateSectionContent(segments, options, chain)
    expect(section.quizzes[0].correctAnswer).toBe('Gamma')
  })

  it('drops questions whose answer cannot be matched, without throwing', async () => {
    const chain = chainReturning({
      quizzes: [
        {
          type: 'multiple-choice',
          question: 'Unmatchable',
          options: ['A', 'B', 'C', 'D'],
          correctAnswer: 'Z',
          explanation: 'x',
        },
        {
          type: 'multiple-choice',
          question: 'Valid one',
          options: ['A', 'B', 'C', 'D'],
          correctAnswer: 'B',
          explanation: 'x',
        },
      ],
    })

    const section = await generateSectionContent(segments, options, chain)
    expect(section.quizzes).toHaveLength(1)
    expect(section.quizzes[0].question).toBe('Valid one')
  })

  it('survives nulls, numbers and objects in every field', async () => {
    const chain = chainReturning({
      title: 42,
      summary: null,
      quizzes: [
        null,
        'not an object',
        { question: null, correctAnswer: 'x' },
        { question: 'No answer given', correctAnswer: null },
        {
          type: 'multiple-choice',
          question: 'Numbers as options',
          options: [1, 2, 3, 4],
          correctAnswer: 3,
          explanation: null,
        },
      ],
      flashcards: [null, { front: 'F' }, { front: 'Q', back: 'A' }],
      puzzles: [null, { instruction: 'no items' }],
    })

    const section = await generateSectionContent(segments, options, chain)

    // Title coerced from a number, summary fell back to the default
    expect(section.title).toBe('42')
    expect(section.summary).toBe('Review key concepts from this section.')
    // Only the repairable question survived
    expect(section.quizzes).toHaveLength(1)
    expect(section.quizzes[0].correctAnswer).toBe('3')
    // Only the complete flashcard survived
    expect(section.flashcards).toHaveLength(1)
    expect(section.flashcards[0].front).toBe('Q')
    // Puzzle with no items was dropped
    expect(section.puzzles).toHaveLength(0)
  })

  it('accepts alternate flashcard key names', async () => {
    const chain = chainReturning({
      flashcards: [
        { term: 'Trust', definition: 'Confidence in someone' },
        { question: 'What is loyalty?', answer: 'Staying committed' },
      ],
    })

    const section = await generateSectionContent(segments, options, chain)
    expect(section.flashcards).toHaveLength(2)
    expect(section.flashcards[0].front).toBe('Trust')
    expect(section.flashcards[1].back).toBe('Staying committed')
  })

  it('keeps startTime strictly less than endTime (Property 4)', async () => {
    const chain = chainReturning({ quizzes: [] })
    const section = await generateSectionContent(segments, options, chain)
    expect(section.startTime).toBeLessThan(section.endTime)
  })

  it('caps questions at questionsPerSection (Requirement 7.3)', async () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      type: 'multiple-choice',
      question: `Q${i}`,
      options: ['A', 'B', 'C', 'D'],
      correctAnswer: 'A',
      explanation: 'x',
    }))

    const section = await generateSectionContent(
      segments,
      { ...options, questionsPerSection: 3 },
      chainReturning({ quizzes: many })
    )

    expect(section.quizzes).toHaveLength(3)
  })

  it('omits interactive types the user did not select (Requirement 7.2)', async () => {
    const chain = chainReturning({
      quizzes: [
        {
          type: 'multiple-choice',
          question: 'Q',
          options: ['A', 'B', 'C', 'D'],
          correctAnswer: 'A',
          explanation: 'x',
        },
      ],
      flashcards: [{ front: 'F', back: 'B' }],
      puzzles: [
        {
          type: 'ordering',
          instruction: 'Order these',
          items: ['one', 'two'],
          solution: ['one', 'two'],
        },
      ],
    })

    const section = await generateSectionContent(
      segments,
      { ...options, interactiveTypes: ['quiz'] },
      chain
    )

    expect(section.quizzes.length).toBeGreaterThan(0)
    expect(section.flashcards).toHaveLength(0)
    expect(section.puzzles).toHaveLength(0)
  })
})

describe('course depth', () => {
  /** A transcript of `minutes` minutes, one 10-second segment at a time. */
  function transcriptOfMinutes(minutes: number): TranscriptSegment[] {
    const count = (minutes * 60) / 10
    return Array.from({ length: count }, (_, i) => ({
      text: `Segment ${i}.`,
      startTime: i * 10,
      endTime: (i + 1) * 10,
    }))
  }

  it('defaults to the standard preset when depth is omitted', () => {
    expect(resolveDepthPreset(options)).toEqual(COURSE_DEPTH_PRESETS.standard)
  })

  it('grows the section cap, prompt size and token budget with depth', () => {
    const standard = COURSE_DEPTH_PRESETS.standard
    const extended = COURSE_DEPTH_PRESETS.extended
    const comprehensive = COURSE_DEPTH_PRESETS.comprehensive

    expect(extended.maxSections).toBeGreaterThan(standard.maxSections)
    expect(comprehensive.maxSections).toBeGreaterThan(extended.maxSections)
    expect(comprehensive.promptChars).toBeGreaterThan(standard.promptChars)
    expect(comprehensive.maxTokens).toBeGreaterThan(standard.maxTokens)
    expect(comprehensive.flashcardsPerSection).toBeGreaterThan(
      standard.flashcardsPerSection
    )
  })

  it('honours explicit per-field overrides', () => {
    const preset = resolveDepthPreset({
      ...options,
      depth: 'comprehensive',
      flashcardsPerSection: 2,
      puzzlesPerSection: 1,
    })

    expect(preset.flashcardsPerSection).toBe(2)
    expect(preset.puzzlesPerSection).toBe(1)
    // Everything not overridden still comes from the preset
    expect(preset.maxSections).toBe(COURSE_DEPTH_PRESETS.comprehensive.maxSections)
  })

  it('keeps far more of a two-hour video at comprehensive depth', () => {
    const segments = transcriptOfMinutes(120)

    const standard = capSectionCount(
      splitIntoSections(segments, COURSE_DEPTH_PRESETS.standard.targetSectionDuration),
      COURSE_DEPTH_PRESETS.standard.maxSections
    )
    const comprehensive = capSectionCount(
      splitIntoSections(
        segments,
        COURSE_DEPTH_PRESETS.comprehensive.targetSectionDuration
      ),
      COURSE_DEPTH_PRESETS.comprehensive.maxSections
    )

    expect(standard).toHaveLength(10)
    expect(comprehensive.length).toBeGreaterThan(35)

    // Neither loses a segment, and both stay in order
    for (const sections of [standard, comprehensive]) {
      const flat = sections.flat()
      expect(flat).toHaveLength(segments.length)
      expect(flat.map((s) => s.startTime)).toEqual(segments.map((s) => s.startTime))
    }
  })

  it('splits on the requested target duration', () => {
    const segments = transcriptOfMinutes(10)

    // 600s of speech at a 240s target yields 3 sections (240/240/120)
    expect(splitIntoSections(segments, 240)).toHaveLength(3)
    // The default target is 180s
    expect(splitIntoSections(segments)).toHaveLength(
      splitIntoSections(segments, 180).length
    )
  })

  it('estimates a bigger course for a long video at deeper settings', () => {
    const twoHours = 2 * 60 * 60

    const standard = estimateCourseSize(twoHours, { ...options, depth: 'standard' })
    const deep = estimateCourseSize(twoHours, { ...options, depth: 'comprehensive' })

    // Standard hits its cap; comprehensive is roomy enough that the natural
    // count (120 min / 3 min) wins instead of the cap.
    expect(standard.sections).toBe(COURSE_DEPTH_PRESETS.standard.maxSections)
    expect(deep.sections).toBe(40)
    expect(deep.sections).toBeLessThanOrEqual(
      COURSE_DEPTH_PRESETS.comprehensive.maxSections
    )
    expect(deep.questions).toBeGreaterThan(standard.questions)
    expect(deep.minutesToGenerate).toBeGreaterThan(standard.minutesToGenerate)
  })

  it('reports no questions when quizzes are switched off', () => {
    const estimate = estimateCourseSize(600, {
      ...options,
      interactiveTypes: ['flashcard'],
    })

    expect(estimate.questions).toBe(0)
    expect(estimate.sections).toBeGreaterThan(0)
  })

  it('caps flashcards and puzzles per section at the depth preset', async () => {
    const chain = chainReturning({
      flashcards: Array.from({ length: 12 }, (_, i) => ({
        front: `Front ${i}`,
        back: `Back ${i}`,
      })),
      puzzles: Array.from({ length: 6 }, (_, i) => ({
        type: 'ordering',
        instruction: `Order set ${i}`,
        items: ['a', 'b'],
        solution: ['a', 'b'],
      })),
    })

    const standard = await generateSectionContent(segments, options, chain)
    expect(standard.flashcards).toHaveLength(
      COURSE_DEPTH_PRESETS.standard.flashcardsPerSection
    )
    expect(standard.puzzles).toHaveLength(
      COURSE_DEPTH_PRESETS.standard.puzzlesPerSection
    )

    const deep = await generateSectionContent(
      segments,
      { ...options, depth: 'comprehensive' },
      chain
    )
    expect(deep.flashcards.length).toBeGreaterThan(standard.flashcards.length)
    expect(deep.puzzles.length).toBeGreaterThan(standard.puzzles.length)
  })

  it('asks the model for the deeper counts and sends more transcript', () => {
    const longText = 'x'.repeat(9000)

    const standardPrompt = buildCoursePrompt(longText, options)
    const deepPrompt = buildCoursePrompt(longText, {
      ...options,
      depth: 'comprehensive',
    })

    expect(deepPrompt.length).toBeGreaterThan(standardPrompt.length)
    expect(deepPrompt).toContain(
      `Array of ${COURSE_DEPTH_PRESETS.comprehensive.flashcardsPerSection} flashcards`
    )
  })
})
