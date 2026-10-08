/**
 * The courses list at `/app/courses`.
 *
 * Every store call is scoped to the signed-in user's id (Requirements 8.2,
 * 8.4). The id is never optional here: omitting it would read and write the
 * pre-auth bucket of unowned records, which is shared by definition, so with
 * no user the page reads nothing at all rather than falling back to it.
 *
 * Styling follows the landing page and dashboard: Clip2Course wordmark, grid
 * backdrop, glass cards and gradient progress.
 */

import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  LayoutDashboard,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { listCourses, deleteCourse } from '../services/courseStore'
import type { CourseSummary } from '../types/course'

export default function Dashboard() {
  const [courses, setCourses] = useState<CourseSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState<CourseSummary | null>(null)
  const navigate = useNavigate()
  const { status, user } = useAuth()

  // ProtectedRoute means a user is normally present, but the id is read
  // defensively: `undefined` must never reach the store.
  const userId = user?.id

  const loadCourses = useCallback(async () => {
    // Who is asking isn't known yet; stay on the loading state rather than
    // flashing an empty library at a signed-in user (Requirement 6.7).
    if (status === 'checking') return

    if (!userId) {
      setCourses([])
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      const result = await listCourses(userId)
      setCourses(result)
    } catch {
      // listCourses handles errors internally; show empty state
      setCourses([])
    } finally {
      setLoading(false)
    }
  }, [userId, status])

  useEffect(() => {
    void loadCourses()
  }, [loadCourses])

  async function handleDelete(course: CourseSummary) {
    setDeleteTarget(course)
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    if (!userId) {
      setDeleteTarget(null)
      return
    }
    try {
      await deleteCourse(deleteTarget.id, userId)
      setCourses((prev) => prev.filter((c) => c.id !== deleteTarget.id))
    } catch {
      // Silently handle delete failure
    } finally {
      setDeleteTarget(null)
    }
  }

  function cancelDelete() {
    setDeleteTarget(null)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-surface text-slate-800 dark:text-slate-200">
        <div className="text-center" role="status">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-slate-600 dark:text-slate-400">Loading courses...</p>
        </div>
      </div>
    )
  }

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
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 md:py-4 flex flex-wrap items-center justify-between gap-3">
          <Link to="/app/dashboard" className="flex items-center gap-2 group shrink-0">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center transition-transform group-hover:scale-110">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              Clip2Course<span className="text-primary-light">.online</span>
            </span>
          </Link>

          <nav aria-label="Courses" className="flex items-center gap-2">
            <Link
              to="/app/dashboard"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-surface-light transition-colors"
            >
              <LayoutDashboard className="w-4 h-4" aria-hidden="true" />
              Dashboard
            </Link>
            <Link
              to="/app/create"
              className="glow-btn inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary-dark text-white text-sm font-semibold hover:bg-primary transition-all"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              New Course
            </Link>
          </nav>
        </div>
      </header>

      {/* Content */}
      <main className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-8 fade-in-up">
          <div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight gradient-text pb-1">
              My Courses
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Everything you have turned into a course, newest first.
            </p>
          </div>
          {courses.length > 0 && (
            <span className="text-sm text-slate-500 dark:text-slate-400">
              {courses.length} {courses.length === 1 ? 'course' : 'courses'}
            </span>
          )}
        </div>

        {courses.length === 0 ? (
          /* Empty State */
          <div className="glass-card rounded-2xl text-center px-6 py-16">
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Sparkles className="w-7 h-7 text-white" aria-hidden="true" />
            </div>
            <h2 className="text-xl font-semibold mb-2 text-slate-900 dark:text-white">
              No courses yet
            </h2>
            <p className="text-slate-600 dark:text-slate-400 mb-6 max-w-md mx-auto">
              Create your first course from a video to get started.
            </p>
            <Link
              to="/app/create"
              className="glow-btn pulse-glow inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary-dark text-white font-semibold hover:bg-primary transition-all"
            >
              Create a Course
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>
          </div>
        ) : (
          /* Course Grid */
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((course) => {
              const progress = getProgressPercentage(course)
              const complete = progress === 100
              return (
                <div
                  key={course.id}
                  className="glass-card rounded-2xl p-5 flex flex-col"
                >
                  {/* Title — kept a direct child so the card stays the
                      nearest container for everything below it. */}
                  <h3 className="font-semibold text-lg mb-2 line-clamp-2 text-slate-900 dark:text-white">
                    {course.title}
                  </h3>

                  {/* Meta info */}
                  <div className="flex flex-wrap items-center gap-2 mb-4">
                    {complete && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                        Done
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
                      <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                      Created {formatDate(course.createdAt)} · Last opened{' '}
                      {formatRelativeTime(course.lastAccessedAt)}
                    </span>
                  </div>

                  {/* Progress */}
                  <div className="mb-5">
                    <div className="flex items-center justify-between text-sm mb-1.5">
                      <span className="text-slate-600 dark:text-slate-400">
                        {course.completedSections}/{course.totalSections} sections completed
                      </span>
                      <span className="font-semibold text-slate-700 dark:text-slate-200">
                        {progress}%
                      </span>
                    </div>
                    <div
                      className="w-full h-2 bg-slate-200 dark:bg-surface-lighter rounded-full overflow-hidden"
                      role="progressbar"
                      aria-valuenow={progress}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${course.title} progress`}
                    >
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-500"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="mt-auto flex items-center gap-2">
                    <button
                      onClick={() => navigate(`/app/course/${course.id}`)}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-primary-dark hover:bg-primary text-white text-sm font-semibold transition-colors cursor-pointer"
                    >
                      Open
                      <ArrowRight className="w-4 h-4" aria-hidden="true" />
                    </button>
                    <button
                      onClick={() => handleDelete(course)}
                      className="p-2.5 text-slate-400 hover:text-red-500 dark:hover:text-red-400 border border-slate-200 dark:border-slate-700 hover:border-red-300 dark:hover:border-red-800 rounded-lg transition-colors cursor-pointer"
                      aria-label={`Delete ${course.title}`}
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4">
          <div className="modal-content bg-white dark:bg-surface-light border border-slate-200 dark:border-slate-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <div className="w-11 h-11 mb-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
              <Trash2 className="w-5 h-5 text-red-500" aria-hidden="true" />
            </div>
            <h2 className="text-lg font-semibold mb-2 text-slate-900 dark:text-white">
              Delete Course
            </h2>
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              Are you sure you want to delete{' '}
              <span className="font-medium text-slate-800 dark:text-slate-200">
                "{deleteTarget.title}"
              </span>
              ? This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={cancelDelete}
                className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-surface-lighter rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function getProgressPercentage(course: CourseSummary): number {
  if (course.totalSections === 0) return 0
  return Math.round((course.completedSections / course.totalSections) * 100)
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - new Date(date).getTime()
  const diffMinutes = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMinutes < 1) return 'Just now'
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return formatDate(date)
}
