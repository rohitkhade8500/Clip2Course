import { useState } from 'react'
import type { Flashcard } from '../types/course'

interface FlashcardDeckProps {
  flashcards: Flashcard[]
}

export default function FlashcardDeck({ flashcards }: FlashcardDeckProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)

  if (flashcards.length === 0) return null

  const card = flashcards[currentIndex]

  function handleFlip() {
    setFlipped((prev) => !prev)
  }

  function handlePrev() {
    setFlipped(false)
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : prev))
  }

  function handleNext() {
    setFlipped(false)
    setCurrentIndex((prev) => (prev < flashcards.length - 1 ? prev + 1 : prev))
  }

  return (
    <div className="flex flex-col items-center gap-4">
      {/*
        Only one face is rendered at a time. A CSS-only 3D flip relies on
        backface-visibility working inside a preserve-3d context, which was
        painting the back face on top of the front. Conditional rendering
        removes that ambiguity entirely.
      */}
      <button
        type="button"
        onClick={handleFlip}
        aria-label={
          flipped
            ? 'Showing the answer. Activate to see the question.'
            : 'Showing the question. Activate to see the answer.'
        }
        aria-pressed={flipped}
        className={`w-full max-w-md min-h-[200px] rounded-xl border p-6 flex flex-col items-center justify-center gap-3 shadow-sm transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          flipped
            ? 'border-blue-300 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/30'
            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
        }`}
      >
        <span
          className={`text-xs font-semibold uppercase tracking-wide ${
            flipped
              ? 'text-blue-600 dark:text-blue-400'
              : 'text-slate-400 dark:text-slate-500'
          }`}
        >
          {flipped ? 'Answer' : 'Question'}
        </span>

        <p
          className={
            flipped
              ? 'text-center text-base text-slate-800 dark:text-slate-200'
              : 'text-center text-lg font-medium text-slate-900 dark:text-slate-100'
          }
        >
          {flipped ? card.back : card.front}
        </p>
      </button>

      {/* Navigation */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={handlePrev}
          disabled={currentIndex === 0}
          className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          aria-label="Previous flashcard"
        >
          ← Prev
        </button>

        <span className="text-sm text-slate-500 dark:text-slate-400 font-medium">
          {currentIndex + 1}/{flashcards.length}
        </span>

        <button
          type="button"
          onClick={handleNext}
          disabled={currentIndex === flashcards.length - 1}
          className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          aria-label="Next flashcard"
        >
          Next →
        </button>
      </div>

      <p className="text-xs text-slate-400 dark:text-slate-500">
        Click the card to {flipped ? 'see the question' : 'reveal the answer'}
      </p>
    </div>
  )
}
