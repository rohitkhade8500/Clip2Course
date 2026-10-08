import { type FormEvent, useState, useCallback, useRef, type DragEvent, type ChangeEvent } from 'react'
import {
  Upload,
  Link,
  AlertCircle,
  Loader2,
  FileVideo,
  Check,
  Layers,
  ListChecks,
  Puzzle,
  Settings2,
  Sparkles,
  Gauge,
  BookOpen,
  Library,
} from 'lucide-react'
import { validateInput } from '../services/videoManager'
import type {
  VideoInput,
  CourseGeneratorOptions,
  CourseDepth,
} from '../types/course'

interface VideoInputFormProps {
  onSubmit: (input: VideoInput, options: CourseGeneratorOptions) => void
  isLoading?: boolean
}

type InputTab = 'url' | 'file'
type Difficulty = 'beginner' | 'intermediate' | 'advanced'
type InteractiveType = 'quiz' | 'flashcard' | 'puzzle'

/** The three activity kinds, with the label and icon each chip shows. */
const INTERACTIVE_OPTIONS: {
  type: InteractiveType
  label: string
  icon: typeof ListChecks
}[] = [
  { type: 'quiz', label: 'Quizzes', icon: ListChecks },
  { type: 'flashcard', label: 'Flashcards', icon: Layers },
  { type: 'puzzle', label: 'Puzzles', icon: Puzzle },
]

/**
 * Course length choices, described in terms of what the learner gets rather
 * than the section caps behind them.
 */
const DEPTH_OPTIONS: {
  depth: CourseDepth
  label: string
  description: string
  detail: string
  icon: typeof Gauge
}[] = [
  {
    depth: 'standard',
    label: 'Standard',
    description: 'Fast overview, up to 10 sections',
    detail:
      'Best for short videos. A long video is condensed into 10 sections, so finer detail is skipped.',
    icon: Gauge,
  },
  {
    depth: 'extended',
    label: 'Extended',
    description: 'Deeper pass, up to 24 sections',
    detail:
      'One section per ~4 minutes of video, with more flashcards and puzzles in each. Good for talks and lectures up to an hour.',
    icon: BookOpen,
  },
  {
    depth: 'comprehensive',
    label: 'Comprehensive',
    description: 'Full coverage, up to 48 sections',
    detail:
      'One section per ~3 minutes, covering a two-hour video end to end with the most interactive material per section.',
    icon: Library,
  },
]

export default function VideoInputForm({ onSubmit, isLoading = false }: VideoInputFormProps) {
  const [inputTab, setInputTab] = useState<InputTab>('url')
  const [url, setUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [difficulty, setDifficulty] = useState<Difficulty>('intermediate')
  const [depth, setDepth] = useState<CourseDepth>('standard')
  const [interactiveTypes, setInteractiveTypes] = useState<InteractiveType[]>([
    'quiz',
    'flashcard',
    'puzzle',
  ])
  const [questionsPerSection, setQuestionsPerSection] = useState(3)
  const [errors, setErrors] = useState<string[]>([])
  const [isDragOver, setIsDragOver] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // --- Validation ---

  const validateUrl = useCallback((value: string) => {
    if (!value.trim()) {
      setErrors([])
      return
    }
    const result = validateInput({ type: 'url', url: value })
    setErrors(result.errors)
  }, [])

  const validateFile = useCallback((selectedFile: File | null) => {
    if (!selectedFile) {
      setErrors([])
      return
    }
    const result = validateInput({ type: 'file', file: selectedFile })
    setErrors(result.errors)
  }, [])

  // --- Handlers ---

  const handleUrlChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setUrl(value)
    validateUrl(value)
  }

  const handleUrlPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text')
    // Let the onChange handle value update, but validate immediately with pasted content
    setTimeout(() => validateUrl(pasted), 0)
  }

  const handleFileSelect = (selectedFile: File | null) => {
    setFile(selectedFile)
    validateFile(selectedFile)
  }

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] || null
    handleFileSelect(selectedFile)
  }

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    const droppedFile = e.dataTransfer.files?.[0] || null
    if (droppedFile) {
      handleFileSelect(droppedFile)
    }
  }

  const handleInteractiveTypeToggle = (type: InteractiveType) => {
    setInteractiveTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    )
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()

    if (interactiveTypes.length === 0) return

    let input: VideoInput
    if (inputTab === 'url') {
      input = { type: 'url', url: url.trim() }
    } else {
      input = { type: 'file', file: file! }
    }

    // Final validation before submit
    const result = validateInput(input)
    if (!result.isValid) {
      setErrors(result.errors)
      return
    }

    const options: CourseGeneratorOptions = {
      difficulty,
      interactiveTypes,
      questionsPerSection,
      language: 'en',
      depth,
    }

    onSubmit(input, options)
  }

  // --- Derived state ---

  const hasInput = inputTab === 'url' ? url.trim().length > 0 : file !== null
  const hasValidationErrors = errors.length > 0
  const noInteractiveTypesSelected = interactiveTypes.length === 0
  const isSubmitDisabled =
    !hasInput || hasValidationErrors || noInteractiveTypesSelected || isLoading
  /** Where the slider thumb sits, as a percentage, for the filled track. */
  const sliderPercent = ((questionsPerSection - 1) / 9) * 100
  const activeDepth =
    DEPTH_OPTIONS.find((option) => option.depth === depth) ?? DEPTH_OPTIONS[0]

  // --- Render ---

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto space-y-6">
      {/* Input Type Tabs — a segmented control, so the inactive option reads as
          a sibling choice rather than a disabled button. */}
      <div className="flex gap-1 p-1 rounded-xl bg-slate-100 dark:bg-surface-light border border-slate-200 dark:border-slate-700">
        <button
          type="button"
          onClick={() => {
            setInputTab('url')
            setErrors([])
            setFile(null)
          }}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
            inputTab === 'url'
              ? 'bg-gradient-to-r from-primary to-accent text-white shadow-md shadow-primary/20'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
          aria-pressed={inputTab === 'url'}
        >
          <Link className="w-4 h-4" aria-hidden="true" />
          Paste URL
        </button>
        <button
          type="button"
          onClick={() => {
            setInputTab('file')
            setErrors([])
            setUrl('')
          }}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
            inputTab === 'file'
              ? 'bg-gradient-to-r from-primary to-accent text-white shadow-md shadow-primary/20'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
          aria-pressed={inputTab === 'file'}
        >
          <Upload className="w-4 h-4" aria-hidden="true" />
          Upload File
        </button>
      </div>

      {/* URL Input Section */}
      {inputTab === 'url' && (
        <div className="space-y-2">
          <label
            htmlFor="video-url-input"
            className="block text-sm font-medium text-slate-700 dark:text-slate-300"
          >
            Video URL
          </label>
          <div className="relative">
            <Link
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500"
              aria-hidden="true"
            />
            <input
              id="video-url-input"
              type="text"
              value={url}
              onChange={handleUrlChange}
              onPaste={handleUrlPaste}
              placeholder="https://youtube.com/watch?v=..."
              className="w-full pl-11 pr-4 py-3 rounded-xl bg-white dark:bg-surface-light border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-sm transition-colors focus:outline-none focus:border-primary"
              aria-describedby="url-hint"
            />
          </div>
          <p id="url-hint" className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            YouTube, Vimeo and Dailymotion use the video's own captions. Direct
            video files (.mp4, .webm, .ogg, .m4v, .mov) are transcribed in your
            browser.
          </p>
        </div>
      )}

      {/* File Upload Section */}
      {inputTab === 'file' && (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Video File
          </label>
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                fileInputRef.current?.click()
              }
            }}
            role="button"
            tabIndex={0}
            aria-label="Upload video file. Click or drag and drop."
            className={`relative flex flex-col items-center justify-center gap-3 p-10 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
              isDragOver
                ? 'border-primary bg-primary/5 dark:bg-primary/10'
                : file
                  ? 'border-emerald-400 dark:border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20'
                  : 'border-slate-300 dark:border-slate-600 hover:border-primary/60 bg-white dark:bg-surface-light'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,video/webm,video/ogg,video/quicktime"
              onChange={handleFileInputChange}
              className="hidden"
              aria-hidden="true"
            />

            {file ? (
              <>
                <FileVideo className="w-8 h-8 text-emerald-500" />
                <div className="text-center">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    {file.name}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {formatFileSize(file.size)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleFileSelect(null)
                    if (fileInputRef.current) fileInputRef.current.value = ''
                  }}
                  className="text-xs text-red-500 hover:text-red-600 underline"
                >
                  Remove
                </button>
              </>
            ) : (
              <>
                <span
                  aria-hidden="true"
                  className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center"
                >
                  <Upload className="w-6 h-6 text-white" />
                </span>
                <div className="text-center">
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    <span className="font-medium text-primary">Click to upload</span> or drag and
                    drop
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    MP4, WebM, OGG, or QuickTime (max 500MB)
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                    Transcribed privately in your browser — first run downloads
                    a ~40MB model
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Validation Errors */}
      {errors.length > 0 && (
        <div
          role="alert"
          className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800"
        >
          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
          <ul className="text-sm text-red-600 dark:text-red-400 space-y-1">
            {errors.map((error, idx) => (
              <li key={idx}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Course Generation Options */}
      <fieldset className="space-y-6 p-5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-surface/60">
        <legend className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200 px-2">
          <Settings2 className="w-4 h-4 text-primary-light" aria-hidden="true" />
          Course Options
        </legend>

        {/* Course length. The default merges a long video down to 10 sections,
            which loses most of a two-hour talk — so the choice is surfaced
            here rather than buried in a constant. */}
        <div className="space-y-2">
          <span id="depth-label" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Course Length
          </span>
          <div
            role="group"
            aria-labelledby="depth-label"
            className="grid gap-2 sm:grid-cols-3"
          >
            {DEPTH_OPTIONS.map((option) => {
              const active = depth === option.depth
              return (
                <button
                  key={option.depth}
                  type="button"
                  onClick={() => setDepth(option.depth)}
                  aria-pressed={active}
                  className={`text-left p-3 rounded-xl border transition-all cursor-pointer ${
                    active
                      ? 'border-primary/60 bg-primary/10'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-surface-light hover:border-primary/40'
                  }`}
                >
                  <span
                    className={`flex items-center gap-1.5 text-sm font-semibold ${
                      active
                        ? 'text-primary dark:text-primary-light'
                        : 'text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    <option.icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                    {option.label}
                  </span>
                  <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400 leading-snug">
                    {option.description}
                  </span>
                </button>
              )
            })}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            {activeDepth.detail}
          </p>
          {depth !== 'standard' && (
            <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
              Longer courses make one AI request per section, so generation takes
              several minutes and can hit free-tier rate limits. Progress is kept
              if it fails partway.
            </p>
          )}
        </div>

        {/* Difficulty — segmented, so all three levels are visible at a glance */}
        <div className="space-y-2">
          <span id="difficulty-label" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Difficulty Level
          </span>
          <div
            role="group"
            aria-labelledby="difficulty-label"
            className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-surface-light border border-slate-200 dark:border-slate-700"
          >
            {(['beginner', 'intermediate', 'advanced'] as const).map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => setDifficulty(level)}
                aria-pressed={difficulty === level}
                className={`px-3 py-2 rounded-lg text-sm font-medium capitalize transition-all cursor-pointer ${
                  difficulty === level
                    ? 'bg-white dark:bg-surface-lighter text-primary dark:text-primary-light shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {level}
              </button>
            ))}
          </div>
        </div>

        {/* Interactive Types — checkboxes styled as toggle chips */}
        <div className="space-y-2">
          <span className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Interactive Content Types
          </span>
          <div className="grid grid-cols-3 gap-2">
            {INTERACTIVE_OPTIONS.map(({ type, label, icon: Icon }) => {
              const checked = interactiveTypes.includes(type)
              return (
                <label
                  key={type}
                  className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium cursor-pointer select-none transition-all ${
                    checked
                      ? 'border-primary/60 bg-primary/10 text-primary dark:text-primary-light'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-surface-light text-slate-500 dark:text-slate-400 hover:border-primary/40'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => handleInteractiveTypeToggle(type)}
                    className="sr-only"
                  />
                  {checked ? (
                    <Check className="w-4 h-4 shrink-0" aria-hidden="true" />
                  ) : (
                    <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  )}
                  {label}
                </label>
              )
            })}
          </div>
          {noInteractiveTypesSelected && (
            <p className="text-xs text-red-500 dark:text-red-400">
              At least one interactive type must be selected
            </p>
          )}
        </div>

        {/* Questions Per Section Slider */}
        <div className="space-y-2">
          <label
            htmlFor="questions-slider"
            className="flex items-center justify-between text-sm font-medium text-slate-700 dark:text-slate-300"
          >
            <span>Questions Per Section</span>
            <span className="min-w-8 text-center px-2 py-0.5 rounded-md bg-primary/10 border border-primary/20 text-primary dark:text-primary-light font-semibold">
              {questionsPerSection}
            </span>
          </label>
          <input
            id="questions-slider"
            type="range"
            min={1}
            max={10}
            step={1}
            value={questionsPerSection}
            onChange={(e) => setQuestionsPerSection(Number(e.target.value))}
            className="w-full h-2 rounded-full appearance-none cursor-pointer accent-primary"
            // The filled portion is painted directly, so the track shows how
            // far along the range the value sits.
            style={{
              background: `linear-gradient(to right, var(--color-primary) 0%, var(--color-accent) ${sliderPercent}%, rgba(148,163,184,0.35) ${sliderPercent}%, rgba(148,163,184,0.35) 100%)`,
            }}
            aria-valuemin={1}
            aria-valuemax={10}
            aria-valuenow={questionsPerSection}
          />
          <div className="flex justify-between text-xs text-slate-400 dark:text-slate-500">
            <span>1</span>
            <span>10</span>
          </div>
        </div>
      </fieldset>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isSubmitDisabled}
        className="glow-btn w-full px-6 py-3.5 rounded-xl bg-primary-dark text-white font-semibold text-sm flex items-center justify-center gap-2 hover:bg-primary transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Generating Course...
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4" aria-hidden="true" />
            Generate Course
          </>
        )}
      </button>
    </form>
  )
}

/**
 * Formats a file size in bytes to a human-readable string.
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
