import { openDB } from 'idb'
import type { IDBPDatabase, DBSchema } from 'idb'
import type { CourseData, CourseProgress, CourseSummary } from '../types/course'

export const DB_NAME = 'clip2course-db'
export const DB_VERSION = 2

/**
 * A course as stored on disk. `userId` identifies the owning user;
 * `null` (or a missing field on version 1 records) means the record was
 * created before accounts existed and is still claimable.
 */
export type StoredCourse = CourseData & { userId: string | null }

/** A progress record with its owning user, using the same `null` convention. */
export type StoredProgress = CourseProgress & { userId: string | null }

interface Clip2CourseDB extends DBSchema {
  courses: {
    key: string
    value: StoredCourse
    indexes: { createdAt: Date; userId: string }
  }
  progress: {
    key: string
    value: StoredProgress
    indexes: { userId: string }
  }
}

let dbPromise: Promise<IDBPDatabase<Clip2CourseDB>> | null = null

function getDB(): Promise<IDBPDatabase<Clip2CourseDB>> {
  if (!dbPromise) {
    dbPromise = openDB<Clip2CourseDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, _newVersion, tx) {
        if (oldVersion < 1) {
          const courseStore = db.createObjectStore('courses', {
            keyPath: 'id',
          })
          courseStore.createIndex('createdAt', 'createdAt')

          db.createObjectStore('progress', { keyPath: 'courseId' })
        }

        if (oldVersion < 2) {
          // Version 1 -> 2 is purely additive: it creates the userId indexes
          // and nothing else. Existing records are neither deleted nor
          // rewritten — a record without a userId is treated as unowned and
          // stays claimable by the first user who signs in.
          const courses = tx.objectStore('courses')
          if (!courses.indexNames.contains('userId')) {
            courses.createIndex('userId', 'userId')
          }

          const progress = tx.objectStore('progress')
          if (!progress.indexNames.contains('userId')) {
            progress.createIndex('userId', 'userId')
          }
        }
      },
    }).catch((error: unknown) => {
      // Let a later call retry a failed upgrade rather than caching the failure.
      dbPromise = null
      throw new Error(
        'Failed to upgrade the course database. Your saved courses have not been changed. Please reload and try again.',
        { cause: error }
      )
    })
  }
  return dbPromise
}

/**
 * Persist a complete CourseData to IndexedDB, owned by `userId`.
 * Also creates an initial CourseProgress entry with empty completedSections and quizScores.
 *
 * Passing no user id (or null) stores the course as unowned, which is what
 * happens before anyone signs in. An existing course owned by a different user
 * is never overwritten.
 */
export async function saveCourse(
  course: CourseData,
  userId?: string | null
): Promise<void> {
  const owner = normalizeOwner(userId)
  try {
    const db = await getDB()
    const tx = db.transaction(['courses', 'progress'], 'readwrite')
    const coursesStore = tx.objectStore('courses')
    const progressStore = tx.objectStore('progress')

    const existing = await coursesStore.get(course.id)
    if (existing && ownerOf(existing) !== owner) {
      // Owner isolation (Requirement 8.2/8.3): leave another user's record alone.
      await tx.done
      return
    }

    await coursesStore.put({ ...course, userId: owner })

    const initialProgress: StoredProgress = {
      courseId: course.id,
      completedSections: [],
      quizScores: {},
      lastAccessedAt: new Date(),
      userId: owner,
    }
    await progressStore.put(initialProgress)

    await tx.done
  } catch (error) {
    if (isQuotaExceededError(error)) {
      throw new Error(
        'Storage quota exceeded. Please delete some saved courses to free up space.'
      )
    }
    throw error
  }
}

/**
 * Retrieve a course by ID from IndexedDB for the given owner.
 * Returns null if not found, or if the course belongs to another user —
 * the two cases are indistinguishable to the caller (Requirement 8.3).
 * Updates lastAccessedAt in the progress record.
 */
export async function getCourse(
  id: string,
  userId?: string | null
): Promise<CourseData | null> {
  const owner = normalizeOwner(userId)
  const db = await getDB()
  const course = await db.get('courses', id)

  if (!course || ownerOf(course) !== owner) {
    return null
  }

  // Update lastAccessedAt in progress, but only on this user's record
  const progress = await db.get('progress', id)
  if (progress && ownerOf(progress) === owner) {
    progress.lastAccessedAt = new Date()
    await db.put('progress', progress)
  }

  // Return a deep copy to prevent external mutation of stored data
  return stripOwner(structuredClone(course))
}

/**
 * List the given user's saved courses ordered by lastAccessedAt descending.
 * Returns CourseSummary[] with title, total section count, completed section count, etc.
 * Courses owned by anyone else are never returned (Requirement 8.2).
 */
export async function listCourses(
  userId?: string | null
): Promise<CourseSummary[]> {
  const owner = normalizeOwner(userId)
  const db = await getDB()
  // Unowned records carry a null key, which IndexedDB indexes skip, so the
  // userId index is only usable for a real user id.
  const courses =
    owner === null
      ? (await db.getAll('courses')).filter((c) => ownerOf(c) === null)
      : await db.getAllFromIndex('courses', 'userId', owner)
  const allProgress = (await db.getAll('progress')).filter(
    (p) => ownerOf(p) === owner
  )

  const progressMap = new Map<string, CourseProgress>()
  for (const p of allProgress) {
    progressMap.set(p.courseId, p)
  }

  const summaries: CourseSummary[] = courses.map((course) => {
    const progress = progressMap.get(course.id)
    return {
      id: course.id,
      title: course.title,
      description: course.description,
      totalSections: course.sections.length,
      completedSections: progress?.completedSections.length ?? 0,
      createdAt: course.createdAt,
      lastAccessedAt: progress?.lastAccessedAt ?? course.createdAt,
    }
  })

  // Sort by lastAccessedAt descending (most recent first)
  summaries.sort(
    (a, b) =>
      new Date(b.lastAccessedAt).getTime() -
      new Date(a.lastAccessedAt).getTime()
  )

  return summaries
}

/**
 * Remove a course and its associated progress from IndexedDB atomically.
 * A course owned by another user is left untouched, exactly as a missing one is.
 */
export async function deleteCourse(
  id: string,
  userId?: string | null
): Promise<void> {
  const owner = normalizeOwner(userId)
  const db = await getDB()
  const tx = db.transaction(['courses', 'progress'], 'readwrite')
  const coursesStore = tx.objectStore('courses')
  const progressStore = tx.objectStore('progress')

  const course = await coursesStore.get(id)
  if (course && ownerOf(course) === owner) {
    await coursesStore.delete(id)
  }

  const progress = await progressStore.get(id)
  if (progress && ownerOf(progress) === owner) {
    await progressStore.delete(id)
  }

  await tx.done
}

/**
 * Update the progress record for a course.
 * Merges completedSections (adds new section IDs) and quizScores (adds/updates scores).
 * Updates lastAccessedAt to current time.
 */
export async function updateProgress(
  courseId: string,
  progress: Partial<CourseProgress>,
  userId?: string | null
): Promise<void> {
  const owner = normalizeOwner(userId)
  try {
    const db = await getDB()
    const existing = await db.get('progress', courseId)

    // Progress belonging to another user is never touched (Requirement 8.6)
    if (!existing || ownerOf(existing) !== owner) {
      return
    }

    // Merge completedSections — add new section IDs without duplicates
    if (progress.completedSections) {
      const sectionSet = new Set(existing.completedSections)
      for (const sectionId of progress.completedSections) {
        sectionSet.add(sectionId)
      }
      existing.completedSections = [...sectionSet]
    }

    // Merge quizScores — add or update quiz scores
    if (progress.quizScores) {
      existing.quizScores = {
        ...existing.quizScores,
        ...progress.quizScores,
      }
    }

    // Always update lastAccessedAt
    existing.lastAccessedAt = new Date()

    await db.put('progress', existing)
  } catch (error) {
    if (isQuotaExceededError(error)) {
      throw new Error(
        'Storage quota exceeded. Please delete some saved courses to free up space.'
      )
    }
    throw error
  }
}

/**
 * Adopt every unowned (pre-auth) course and progress record for `userId`.
 *
 * Called once after the first successful sign-in so work created before
 * accounts existed is not orphaned (Requirement 8.5). Both stores are walked
 * inside a single transaction, so either every claimable record is adopted or
 * none is — a failure leaves the store exactly as it was (Requirement 8.7).
 * Records already owned by anyone (including `userId` itself) are never
 * rewritten, and only the `userId` field ever changes.
 *
 * @returns the number of records claimed across both stores
 */
export async function claimUnownedData(userId: string): Promise<number> {
  if (!userId) {
    // Claiming for "nobody" would be a no-op that only risks rewriting records.
    return 0
  }

  const db = await getDB()
  const tx = db.transaction(['courses', 'progress'], 'readwrite')

  let claimed = 0

  for (const storeName of ['courses', 'progress'] as const) {
    const store = tx.objectStore(storeName)
    let cursor = await store.openCursor()

    while (cursor) {
      const record = cursor.value
      if (ownerOf(record) === null) {
        // Spread keeps every other field byte-identical: only ownership moves.
        await cursor.update({ ...record, userId })
        claimed++
      }
      cursor = await cursor.continue()
    }
  }

  await tx.done
  return claimed
}

/**
 * Read the owner already carried by a record, if any.
 * Records without an owner stay unowned (claimable) rather than being dropped.
 */
function ownerOf(record: { userId?: string | null }): string | null {
  return record.userId ?? null
}

/**
 * Normalize a caller-supplied owner. A missing user id means "not signed in",
 * which reads and writes the unowned (pre-auth) records.
 */
function normalizeOwner(userId?: string | null): string | null {
  return userId ?? null
}

/** Drop the storage-only ownership field before handing data to callers. */
function stripOwner(course: StoredCourse): CourseData {
  const { userId: _owner, ...data } = course
  return data
}

/**
 * Check if an error is a QuotaExceededError from IndexedDB.
 */
function isQuotaExceededError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    return true
  }
  return false
}

/**
 * Reset the database connection (useful for testing).
 */
export function _resetDB(): void {
  dbPromise = null
}
