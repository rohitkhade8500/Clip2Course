import { useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  AlertCircle,
  RefreshCw,
  Clipboard,
  Loader2,
  CheckCircle2,
  LayoutDashboard,
  Sparkles,
} from 'lucide-react'
import VideoInputForm from '../components/VideoInputForm'
import { useAuth } from '../context/AuthContext'
import { processVideoToCourse } from '../services/courseGenerator'
import type { ProcessingProgress } from '../services/courseGenerator'
import { saveCourse } from '../services/courseStore'
import type { VideoInput, CourseGeneratorOptions, CourseData, CourseSection } from '../types/course'

type SaveFailureAction = 'idle' | 'retrySave' | 'copied'

export default function CreateCourse() {
  const navigate = useNavigate()
  const { user } = useAuth()

  // The owning user id (Requirement 8.1). ProtectedRoute means it is normally
  // present; it is still read defensively because saving without it would put
  // the course in the shared pre-auth bucket, visible to whoever signs in next.
  const userId = user?.id

  // Core state
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<ProcessingProgress | null>(null)
  const [generatedCourse, setGeneratedCourse] = useState<CourseData | null>(null)

  // Recovery state
  const [partialSections, setPartialSections] = useState<CourseSection[]>([])
  const [startFromSection, setStartFromSection] = useState(0)
  const [retryCount, setRetryCount] = useState(0)
  const [lastInput, setLastInput] = useState<VideoInput | null>(null)
  const [lastOptions, setLastOptions] = useState<CourseGeneratorOptions | null>(null)

  // Save failure state
  const [saveFailure, setSaveFailure] = useState(false)
  const [saveAction, setSaveAction] = useState<SaveFailureAction>('idle')

  const maxRetries = 3

  /**
   * Persist a course against the signed-in owner. Refuses to save without a
   * user id so an unowned record is never created from a protected page; the
   * caller surfaces that through the existing save-failure UI, which still
   * offers a clipboard export so generated work is not lost.
   */
  const persistCourse = useCallback(
    async (course: CourseData) => {
      if (!userId) {
        throw new Error('No signed-in user to own this course')
      }
      await saveCourse(course, userId)
    },
    [userId]
  )

  const handleProgress = useCallback((p: ProcessingProgress) => {
    setProgress(p)
    // Track completed sections for recovery
    if (p.completedSections && p.completedSections.length > 0) {
      setPartialSections(p.completedSections)
    }
  }, [])

  const handleSubmit = useCallback(
    async (input: VideoInput, options: CourseGeneratorOptions) => {
      setIsLoading(true)
      setError(null)
      setSaveFailure(false)
      setSaveAction('idle')
      setProgress(null)
      setLastInput(input)
      setLastOptions(options)

      try {
        const course = await processVideoToCourse(
          input,
          options,
          handleProgress,
          partialSections.length > 0
            ? { sections: partialSections, startFromSection }
            : undefined
        )

        setGeneratedCourse(course)

        // Attempt to save to IndexedDB
        try {
          await persistCourse(course)
          navigate(`/app/course/${course.id}`)
        } catch {
          // Save failed — offer retry or clipboard export (Req 9.6)
          setSaveFailure(true)
          setIsLoading(false)
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'An unexpected error occurred'
        setError(message)
        setIsLoading(false)

        // Track retry count for max-retry logic (Req 9.5)
        const newRetryCount = retryCount + 1
        setRetryCount(newRetryCount)

        // Capture partial progress for resume
        if (progress?.completedSections) {
          setPartialSections(progress.completedSections)
          setStartFromSection(progress.completedSections.length)
        }
      }
    },
    [
      handleProgress,
      navigate,
      partialSections,
      startFromSection,
      retryCount,
      progress,
      persistCourse,
    ]
  )

  const handleRetry = useCallback(() => {
    if (!lastInput || !lastOptions) return
    handleSubmit(lastInput, lastOptions)
  }, [lastInput, lastOptions, handleSubmit])

  const handleRetrySave = useCallback(async () => {
    if (!generatedCourse) return
    setSaveAction('idle')
    try {
      await persistCourse(generatedCourse)
      setSaveFailure(false)
      navigate(`/app/course/${generatedCourse.id}`)
    } catch {
      // Still failing
      setSaveFailure(true)
    }
  }, [generatedCourse, navigate, persistCourse])

  const handleCopyToClipboard = useCallback(async () => {
    if (!generatedCourse) return
    try {
      await navigator.clipboard.writeText(JSON.stringify(generatedCourse, null, 2))
      setSaveAction('copied')
    } catch {
      // Fallback for clipboard API failure
      const textArea = document.createElement('textarea')
      textArea.value = JSON.stringify(generatedCourse, null, 2)
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      setSaveAction('copied')
    }
  }, [generatedCourse])

  const getPhaseLabel = (phase: ProcessingProgress['phase']): string => {
    switch (phase) {
      case 'validating':
        return 'Validating input...'
      case 'metadata':
        return 'Retrieving video metadata...'
      case 'transcribing': {
        // Speech recognition reports its own sub-stages. Without this the UI
        // looks frozen during the one-time ~40MB model download.
        const t = progress?.transcription
        if (t?.stage === 'loading-model') {
          return t.percent !== undefined
            ? `Loading speech recognition model... ${t.percent}%`
            : 'Loading speech recognition model (one-time download)...'
        }
        if (t?.stage === 'decoding-audio') return 'Decoding audio...'
        if (t?.stage === 'transcribing') {
          return t.message ?? 'Transcribing speech...'
        }
        return 'Extracting transcript...'
      }
      case 'generating':
        return 'Generating course content...'
      case 'saving':
        return 'Saving course...'
      default:
        return 'Processing...'
    }
  }

  const getProgressPercentage = (): number => {
    if (!progress) return 0
    switch (progress.phase) {
      case 'validating':
        return 5
      case 'metadata':
        return 15
      case 'transcribing':
        return 30
      case 'generating': {
        if (progress.totalSections && progress.currentSection !== undefined) {
          const sectionProgress =
            (progress.currentSection / progress.totalSections) * 60
          return 30 + sectionProgress
        }
        return 40
      }
      case 'saving':
        return 95
      default:
        return 0
    }
  }

  const canRetry = retryCount < maxRetries

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-50 dark:bg-surface text-slate-800 dark:text-slate-200">
      {/* Ambient backdrop, shared with the landing page */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 hero-grid" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-surface/70 backdrop-blur-xl">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 md:py-4 flex flex-wrap items-center justify-between gap-3">
          <Link to="/app/dashboard" className="flex items-center gap-2 group shrink-0">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center transition-transform group-hover:scale-110">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              Clip2Course<span className="text-primary-light">.online</span>
            </span>
          </Link>

          <nav aria-label="Create" className="flex items-center gap-2">
            <Link
              to="/app/courses"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-surface-light transition-colors"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              My Courses
            </Link>
            <Link
              to="/app/dashboard"
              className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-surface-light transition-colors"
              aria-label="Dashboard"
            >
              <LayoutDashboard className="w-5 h-5" aria-hidden="true" />
            </Link>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <div className="text-center mb-8 fade-in-up">
          <p className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary-light text-xs font-medium mb-3">
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            AI-Powered Course Generation
          </p>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight gradient-text pb-1">
            Create a Course
          </h1>
          <p className="mt-1 text-sm sm:text-base text-slate-500 dark:text-slate-400 max-w-xl mx-auto">
            Drop in a video link or upload a file. Clip2Course writes the sections,
            quizzes and flashcards for you.
          </p>
        </div>

        {/* Video Input Form */}
        <div className="glass-card rounded-2xl p-5 sm:p-7">
          <VideoInputForm onSubmit={handleSubmit} isLoading={isLoading} />
        </div>

        {/* Progress Indicator */}
        {isLoading && progress && (
          <div className="mt-6 glass-card rounded-2xl p-6">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-3 min-w-0">
                <Loader2 className="w-5 h-5 animate-spin text-primary-light shrink-0" />
                <span className="text-sm font-medium truncate">
                  {getPhaseLabel(progress.phase)}
                </span>
              </div>
              <span className="shrink-0 text-sm font-semibold text-primary-light">
                {Math.round(getProgressPercentage())}%
              </span>
            </div>

            {/* Progress Bar */}
            <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-surface-lighter overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-500 ease-out"
                style={{ width: `${getProgressPercentage()}%` }}
                role="progressbar"
                aria-valuenow={getProgressPercentage()}
                aria-valuemin={0}
                aria-valuemax={100}
              />
            </div>

            {/* Section progress during generation */}
            {progress.phase === 'generating' &&
              progress.totalSections !== undefined &&
              progress.currentSection !== undefined && (
                <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                  Generating section {progress.currentSection} of {progress.totalSections}
                </p>
              )}
          </div>
        )}

        {/* Error Display */}
        {error && !isLoading && (
          <div
            role="alert"
            className="mt-6 p-6 rounded-2xl border border-red-300/60 dark:border-red-800/70 bg-red-50 dark:bg-red-950/30 backdrop-blur-sm"
          >
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-700 dark:text-red-400">
                  Generation Failed
                </p>
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                  {error}
                </p>

                {/* Partial progress indicator (Req 9.7) */}
                {partialSections.length > 0 && (
                  <p className="mt-2 text-xs text-red-500 dark:text-red-400">
                    {partialSections.length} section{partialSections.length !== 1 ? 's' : ''} completed
                    successfully before the failure.
                  </p>
                )}

                {/* Retry or give up */}
                <div className="mt-4 flex items-center gap-3">
                  {canRetry ? (
                    <button
                      type="button"
                      onClick={handleRetry}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Retry from section {startFromSection + 1}
                    </button>
                  ) : (
                    <p className="text-sm font-medium text-red-700 dark:text-red-300">
                      Generation cannot continue. Maximum retries ({maxRetries}) reached.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Save Failure UI (Req 9.6) */}
        {saveFailure && generatedCourse && !isLoading && (
          <div
            role="alert"
            className="mt-6 p-6 rounded-2xl border border-amber-300/60 dark:border-amber-800/70 bg-amber-50 dark:bg-amber-950/30 backdrop-blur-sm"
          >
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                  Course generated but could not be saved
                </p>
                <p className="mt-1 text-sm text-amber-600 dark:text-amber-400">
                  Your course was generated successfully, but saving to local storage failed.
                  You can retry saving or copy the course data to your clipboard.
                </p>

                <div className="mt-4 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleRetrySave}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Retry Save
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyToClipboard}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 text-sm font-medium hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
                  >
                    {saveAction === 'copied' ? (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Clipboard className="w-4 h-4" />
                        Copy to Clipboard
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
