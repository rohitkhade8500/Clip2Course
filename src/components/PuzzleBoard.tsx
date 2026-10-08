import { useState } from 'react'
import type { Puzzle, PuzzleItem } from '../types/course'

interface PuzzleBoardProps {
  puzzle: Puzzle
  onComplete: (success: boolean) => void
}

export default function PuzzleBoard({ puzzle, onComplete }: PuzzleBoardProps) {
  switch (puzzle.type) {
    case 'matching':
      return <MatchingPuzzle puzzle={puzzle} onComplete={onComplete} />
    case 'ordering':
      return <OrderingPuzzle puzzle={puzzle} onComplete={onComplete} />
    case 'word-scramble':
      return <WordScramblePuzzle puzzle={puzzle} onComplete={onComplete} />
    default:
      return null
  }
}

// --- Matching Puzzle ---

function MatchingPuzzle({ puzzle, onComplete }: PuzzleBoardProps) {
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null)
  const [matches, setMatches] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)
  const [isCorrect, setIsCorrect] = useState(false)

  const leftItems = puzzle.items
  const rightTargets = puzzle.items
    .map((item) => item.matchTarget)
    .filter((t): t is string => t != null)
    .sort(() => Math.random() - 0.5)

  function handleLeftClick(itemId: string) {
    if (submitted) return
    setSelectedLeft(itemId === selectedLeft ? null : itemId)
  }

  function handleRightClick(target: string) {
    if (submitted || !selectedLeft) return
    setMatches((prev) => ({ ...prev, [selectedLeft]: target }))
    setSelectedLeft(null)
  }

  function handleSubmit() {
    const correct = leftItems.every(
      (item) => matches[item.id] === item.matchTarget
    )
    setIsCorrect(correct)
    setSubmitted(true)
    onComplete(correct)
  }

  const allMatched = Object.keys(matches).length === leftItems.length

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 p-6 shadow-sm">
      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">
        {puzzle.instruction}
      </p>

      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* Left column: items */}
        <div className="flex flex-col gap-2">
          {leftItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleLeftClick(item.id)}
              disabled={submitted}
              className={`px-3 py-2 rounded-lg border text-sm text-left transition-colors ${
                selectedLeft === item.id
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300'
                  : matches[item.id]
                    ? 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-blue-300'
              } disabled:cursor-default`}
            >
              {item.content}
              {matches[item.id] && (
                <span className="ml-2 text-xs opacity-70">→ {matches[item.id]}</span>
              )}
            </button>
          ))}
        </div>

        {/* Right column: targets */}
        <div className="flex flex-col gap-2">
          {rightTargets.map((target, idx) => {
            const isUsed = Object.values(matches).includes(target)
            return (
              <button
                key={idx}
                type="button"
                onClick={() => handleRightClick(target)}
                disabled={submitted || !selectedLeft || isUsed}
                className={`px-3 py-2 rounded-lg border text-sm text-left transition-colors ${
                  isUsed
                    ? 'border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-700 opacity-50 cursor-default'
                    : selectedLeft
                      ? 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-blue-300 cursor-pointer'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-default'
                } disabled:cursor-default`}
              >
                {target}
              </button>
            )
          })}
        </div>
      </div>

      {!submitted && (
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!allMatched}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Check Answers
        </button>
      )}

      {submitted && (
        <div
          className={`mt-3 p-3 rounded-lg text-sm font-medium ${
            isCorrect
              ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300 border border-green-300 dark:border-green-700'
              : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300 border border-red-300 dark:border-red-700'
          }`}
        >
          {isCorrect ? '✓ All matches are correct!' : '✗ Some matches are incorrect. Try again!'}
        </div>
      )}
    </div>
  )
}

// --- Ordering Puzzle ---

function OrderingPuzzle({ puzzle, onComplete }: PuzzleBoardProps) {
  const [items, setItems] = useState<PuzzleItem[]>(() =>
    [...puzzle.items].sort(() => Math.random() - 0.5)
  )
  const [submitted, setSubmitted] = useState(false)
  const [isCorrect, setIsCorrect] = useState(false)

  function handleMoveUp(index: number) {
    if (submitted || index === 0) return
    const newItems = [...items]
    ;[newItems[index - 1], newItems[index]] = [newItems[index], newItems[index - 1]]
    setItems(newItems)
  }

  function handleMoveDown(index: number) {
    if (submitted || index === items.length - 1) return
    const newItems = [...items]
    ;[newItems[index], newItems[index + 1]] = [newItems[index + 1], newItems[index]]
    setItems(newItems)
  }

  function handleSubmit() {
    const currentOrder = items.map((item) => item.content)
    const correct =
      currentOrder.length === puzzle.solution.length &&
      currentOrder.every((val, idx) => val === puzzle.solution[idx])
    setIsCorrect(correct)
    setSubmitted(true)
    onComplete(correct)
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 p-6 shadow-sm">
      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">
        {puzzle.instruction}
      </p>

      <div className="flex flex-col gap-2 mb-4">
        {items.map((item, index) => (
          <div
            key={item.id}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
          >
            <span className="text-xs text-slate-400 dark:text-slate-500 w-5">
              {index + 1}.
            </span>
            <span className="flex-1 text-sm text-slate-700 dark:text-slate-300">
              {item.content}
            </span>
            {!submitted && (
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => handleMoveUp(index)}
                  disabled={index === 0}
                  className="px-1.5 py-0.5 text-xs rounded border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label={`Move ${item.content} up`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => handleMoveDown(index)}
                  disabled={index === items.length - 1}
                  className="px-1.5 py-0.5 text-xs rounded border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label={`Move ${item.content} down`}
                >
                  ↓
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {!submitted && (
        <button
          type="button"
          onClick={handleSubmit}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          Check Order
        </button>
      )}

      {submitted && (
        <div
          className={`mt-3 p-3 rounded-lg text-sm font-medium ${
            isCorrect
              ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300 border border-green-300 dark:border-green-700'
              : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300 border border-red-300 dark:border-red-700'
          }`}
        >
          {isCorrect ? '✓ Correct order!' : '✗ Not quite right. Try again!'}
        </div>
      )}
    </div>
  )
}

// --- Word Scramble Puzzle ---

function WordScramblePuzzle({ puzzle, onComplete }: PuzzleBoardProps) {
  const [userInput, setUserInput] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [isCorrect, setIsCorrect] = useState(false)

  const scrambledWord = puzzle.items[0]?.scrambled ?? ''
  const correctAnswer = puzzle.solution[0] ?? ''

  function handleSubmit() {
    const correct =
      userInput.trim().toLowerCase() === correctAnswer.toLowerCase()
    setIsCorrect(correct)
    setSubmitted(true)
    onComplete(correct)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && userInput.trim()) {
      handleSubmit()
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 p-6 shadow-sm">
      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">
        {puzzle.instruction}
      </p>

      <div className="mb-4">
        <p className="text-2xl font-mono font-bold text-center text-slate-800 dark:text-slate-200 tracking-widest p-4 rounded-lg bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600">
          {scrambledWord}
        </p>
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={submitted}
          placeholder="Type your answer..."
          className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 disabled:opacity-50"
          aria-label="Word scramble answer"
        />
        {!submitted && (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!userInput.trim()}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Submit
          </button>
        )}
      </div>

      {submitted && (
        <div
          className={`mt-3 p-3 rounded-lg text-sm font-medium ${
            isCorrect
              ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300 border border-green-300 dark:border-green-700'
              : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300 border border-red-300 dark:border-red-700'
          }`}
        >
          {isCorrect
            ? '✓ Correct!'
            : `✗ The answer was: ${correctAnswer}`}
        </div>
      )}
    </div>
  )
}
