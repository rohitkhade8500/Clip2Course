import { useState } from 'react'
import type { QuizQuestion } from '../types/course'

interface QuizCardProps {
  question: QuizQuestion
  onAnswer: (isCorrect: boolean) => void
}

export default function QuizCard({ question, onAnswer }: QuizCardProps) {
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null)
  const [answered, setAnswered] = useState(false)
  const [typedAnswer, setTypedAnswer] = useState('')

  /**
   * Choices to render as buttons.
   * - multiple-choice: the provided options, minus any blank entries
   * - true-false: a fixed True/False pair (the model rarely supplies options)
   * - fill-blank: none, a text input is shown instead
   */
  const choices: string[] =
    question.type === 'true-false'
      ? ['True', 'False']
      : (question.options ?? []).filter((o) => o && o.trim().length > 0)

  const isFillBlank = question.type === 'fill-blank'

  /** Loose comparison so casing/whitespace don't fail a correct answer. */
  function isMatch(a: string, b: string): boolean {
    return a.trim().toLowerCase() === b.trim().toLowerCase()
  }

  function handleSelect(option: string) {
    if (answered) return
    setSelectedAnswer(option)
    setAnswered(true)
    onAnswer(isMatch(option, question.correctAnswer))
  }

  function handleSubmitTyped() {
    if (answered || !typedAnswer.trim()) return
    setSelectedAnswer(typedAnswer)
    setAnswered(true)
    onAnswer(isMatch(typedAnswer, question.correctAnswer))
  }

  function getOptionClasses(option: string): string {
    const base =
      'w-full text-left px-4 py-3 rounded-lg border transition-colors text-sm font-medium'

    if (!answered) {
      return `${base} border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer`
    }

    if (isMatch(option, question.correctAnswer)) {
      return `${base} border-green-500 bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300`
    }

    if (option === selectedAnswer) {
      return `${base} border-red-500 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300`
    }

    return `${base} border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 opacity-50 cursor-default`
  }

  const answeredCorrectly =
    answered && selectedAnswer !== null && isMatch(selectedAnswer, question.correctAnswer)

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 p-6 shadow-sm">
      <p className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4">
        {question.question}
      </p>

      {/* Button choices: multiple-choice and true-false */}
      {!isFillBlank && choices.length > 0 && (
        <div className="flex flex-col gap-2">
          {choices.map((option, index) => (
            <button
              key={index}
              type="button"
              onClick={() => handleSelect(option)}
              disabled={answered}
              className={getOptionClasses(option)}
              aria-label={`Option ${index + 1}: ${option}`}
            >
              <span className="mr-2 inline-block w-5 h-5 rounded-full border border-current text-center text-xs leading-5">
                {String.fromCharCode(65 + index)}
              </span>
              {option}
            </button>
          ))}
        </div>
      )}

      {/* Text input: fill-in-the-blank */}
      {isFillBlank && (
        <div className="flex gap-2">
          <input
            type="text"
            value={typedAnswer}
            onChange={(e) => setTypedAnswer(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleSubmitTyped()
              }
            }}
            disabled={answered}
            placeholder="Type your answer..."
            aria-label="Your answer"
            className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
          {!answered && (
            <button
              type="button"
              onClick={handleSubmitTyped}
              disabled={!typedAnswer.trim()}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Submit
            </button>
          )}
        </div>
      )}

      {/* Result + explanation */}
      {answered && (
        <div className="mt-4 space-y-2">
          <p
            className={`text-sm font-medium ${
              answeredCorrectly
                ? 'text-green-700 dark:text-green-400'
                : 'text-red-700 dark:text-red-400'
            }`}
          >
            {answeredCorrectly
              ? '✓ Correct'
              : `✗ Incorrect — the answer is: ${question.correctAnswer}`}
          </p>
          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600">
            <p className="text-sm text-slate-700 dark:text-slate-300">
              <span className="font-semibold">Explanation: </span>
              {question.explanation}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
