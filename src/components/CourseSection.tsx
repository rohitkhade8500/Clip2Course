import { useState } from 'react'
import { CheckCircle2, Clock, Layers, ListChecks, Puzzle } from 'lucide-react'
import type { CourseSection as CourseSectionType } from '../types/course'
import QuizCard from './QuizCard'
import FlashcardDeck from './FlashcardDeck'
import PuzzleBoard from './PuzzleBoard'

interface CourseSectionProps {
  section: CourseSectionType
  /** Zero-based position, shown as a numbered badge. Optional so the card
   *  still renders standalone. */
  index?: number
  onSectionComplete: (sectionId: string) => void
  onQuizScore: (quizId: string, score: number) => void
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export default function CourseSection({
  section,
  index,
  onSectionComplete,
  onQuizScore,
}: CourseSectionProps) {
  const [completedQuizzes, setCompletedQuizzes] = useState<Set<string>>(new Set())
  const [completedPuzzles, setCompletedPuzzles] = useState<Set<string>>(new Set())
  const [flashcardsViewed, setFlashcardsViewed] = useState(false)

  const totalElements =
    section.quizzes.length +
    section.puzzles.length +
    (section.flashcards.length > 0 ? 1 : 0)

  const completedElements =
    completedQuizzes.size +
    completedPuzzles.size +
    (flashcardsViewed ? 1 : 0)

  const sectionDone = totalElements > 0 && completedElements >= totalElements
  const percent = totalElements > 0 ? (completedElements / totalElements) * 100 : 0

  function checkSectionComplete(
    quizzes: Set<string>,
    puzzles: Set<string>,
    flashcards: boolean
  ) {
    const total =
      section.quizzes.length +
      section.puzzles.length +
      (section.flashcards.length > 0 ? 1 : 0)
    const completed =
      quizzes.size + puzzles.size + (flashcards ? 1 : 0)

    if (completed >= total && total > 0) {
      onSectionComplete(section.id)
    }
  }

  function handleQuizAnswer(quizId: string, isCorrect: boolean) {
    const score = isCorrect ? 1 : 0
    onQuizScore(quizId, score)
    const newCompleted = new Set(completedQuizzes).add(quizId)
    setCompletedQuizzes(newCompleted)
    checkSectionComplete(newCompleted, completedPuzzles, flashcardsViewed)
  }

  function handlePuzzleComplete(puzzleId: string, _success: boolean) {
    const newCompleted = new Set(completedPuzzles).add(puzzleId)
    setCompletedPuzzles(newCompleted)
    checkSectionComplete(completedQuizzes, newCompleted, flashcardsViewed)
  }

  function handleFlashcardsInteracted() {
    if (!flashcardsViewed) {
      setFlashcardsViewed(true)
      checkSectionComplete(completedQuizzes, completedPuzzles, true)
    }
  }

  return (
    <div className="glass-card rounded-2xl p-6">
      {/* Section Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-start gap-3 min-w-0">
            {index !== undefined && (
              <span
                aria-hidden="true"
                className={`shrink-0 mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold text-white ${
                  sectionDone
                    ? 'bg-gradient-to-br from-emerald-500 to-teal-400'
                    : 'bg-gradient-to-br from-primary to-accent'
                }`}
              >
                {sectionDone ? <CheckCircle2 className="w-4 h-4" /> : index + 1}
              </span>
            )}
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              {section.title}
            </h2>
          </div>
          <span className="shrink-0 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-300 bg-slate-100 dark:bg-surface-light border border-slate-200 dark:border-slate-700 px-2.5 py-1 rounded-full">
            <Clock className="w-3.5 h-3.5" aria-hidden="true" />
            {formatTime(section.startTime)} – {formatTime(section.endTime)}
          </span>
        </div>

        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
          {section.summary}
        </p>

        {/* Progress indicator */}
        {totalElements > 0 && (
          <div className="mt-4 flex items-center gap-3">
            <div
              className="flex-1 h-1.5 bg-slate-200 dark:bg-surface-lighter rounded-full overflow-hidden"
              role="progressbar"
              aria-valuenow={Math.round(percent)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${section.title} activities completed`}
            >
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  sectionDone
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                    : 'bg-gradient-to-r from-primary to-accent'
                }`}
                style={{ width: `${percent}%` }}
              />
            </div>
            <span className="shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">
              {completedElements}/{totalElements}
            </span>
          </div>
        )}
      </div>

      {/* Quizzes */}
      {section.quizzes.length > 0 && (
        <div className="mb-6">
          <GroupLabel icon={ListChecks}>Quizzes</GroupLabel>
          <div className="flex flex-col gap-4">
            {section.quizzes.map((quiz) => (
              <QuizCard
                key={quiz.id}
                question={quiz}
                onAnswer={(isCorrect) => handleQuizAnswer(quiz.id, isCorrect)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Flashcards */}
      {section.flashcards.length > 0 && (
        <div className="mb-6" onClick={handleFlashcardsInteracted}>
          <GroupLabel icon={Layers}>Flashcards</GroupLabel>
          <FlashcardDeck flashcards={section.flashcards} />
        </div>
      )}

      {/* Puzzles */}
      {section.puzzles.length > 0 && (
        <div className="mb-2">
          <GroupLabel icon={Puzzle}>Puzzles</GroupLabel>
          <div className="flex flex-col gap-4">
            {section.puzzles.map((puzzle) => (
              <PuzzleBoard
                key={puzzle.id}
                puzzle={puzzle}
                onComplete={(success) => handlePuzzleComplete(puzzle.id, success)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/** Activity group heading, e.g. QUIZZES, with a hairline rule alongside it. */
function GroupLabel({
  icon: Icon,
  children,
}: {
  icon: typeof ListChecks
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <h3 className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
        <Icon className="w-4 h-4 text-primary-light" aria-hidden="true" />
        {children}
      </h3>
      <span
        aria-hidden="true"
        className="flex-1 h-px bg-gradient-to-r from-slate-200 dark:from-slate-700 to-transparent"
      />
    </div>
  )
}
