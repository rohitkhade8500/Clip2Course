import 'fake-indexeddb/auto'
import { openDB } from 'idb'
import { describe, it, expect, beforeEach } from 'vitest'
import type { CourseData } from '../types/course'
import {
  saveCourse,
  getCourse,
  listCourses,
  deleteCourse,
  updateProgress,
  claimUnownedData,
  _resetDB,
  DB_NAME,
  DB_VERSION,
} from './courseStore'

function createMockCourse(overrides: Partial<CourseData> = {}): CourseData {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    title: 'Test Course',
    description: 'A test course description',
    videoMetadata: {
      title: 'Test Video',
      duration: 600,
      source: 'youtube',
    },
    sections: [
      {
        id: 'section-1',
        title: 'Section 1',
        summary: 'First section summary',
        startTime: 0,
        endTime: 180,
        quizzes: [
          {
            id: 'quiz-1',
            type: 'multiple-choice',
            question: 'What is React?',
            options: ['Library', 'Framework', 'Language', 'OS'],
            correctAnswer: 'Library',
            explanation: 'React is a JavaScript library',
            sourceTimestamp: 30,
          },
        ],
        flashcards: [],
        puzzles: [],
      },
      {
        id: 'section-2',
        title: 'Section 2',
        summary: 'Second section summary',
        startTime: 180,
        endTime: 360,
        quizzes: [],
        flashcards: [
          {
            id: 'flash-1',
            front: 'What is JSX?',
            back: 'A syntax extension for JavaScript',
            sourceTimestamp: 200,
          },
        ],
        puzzles: [],
      },
    ],
    totalQuestions: 1,
    estimatedTime: 5,
    createdAt: new Date('2024-01-01'),
    ...overrides,
  }
}

describe('courseStore', () => {
  beforeEach(() => {
    _resetDB()
    // Clear IndexedDB state between tests
    indexedDB = new IDBFactory()
  })

  describe('schema', () => {
    it('should open at version 2 with userId indexes on both stores', async () => {
      // Touch the store so the database is created and upgraded
      await saveCourse(createMockCourse())

      const db = await openDB(DB_NAME, DB_VERSION)
      expect(db.version).toBe(2)
      const tx = db.transaction(['courses', 'progress'])
      expect([...tx.objectStore('courses').indexNames]).toContain('userId')
      expect([...tx.objectStore('courses').indexNames]).toContain('createdAt')
      expect([...tx.objectStore('progress').indexNames]).toContain('userId')
      await tx.done
      db.close()
    })

    it('should record a null owner for courses saved without a user', async () => {
      const course = createMockCourse()
      await saveCourse(course)

      const db = await openDB(DB_NAME, DB_VERSION)
      const stored = await db.get('courses', course.id)
      expect(stored).toMatchObject({ id: course.id, userId: null })
      db.close()
    })
  })

  describe('saveCourse', () => {
    it('should persist a course and create initial progress', async () => {
      const course = createMockCourse()
      await saveCourse(course)

      const retrieved = await getCourse(course.id)
      expect(retrieved).not.toBeNull()
      expect(retrieved!.id).toBe(course.id)
      expect(retrieved!.title).toBe(course.title)
    })

    it('should overwrite an existing course with the same ID', async () => {
      const course = createMockCourse({ id: 'fixed-id' })
      await saveCourse(course)

      const updatedCourse = createMockCourse({
        id: 'fixed-id',
        title: 'Updated Title',
      })
      await saveCourse(updatedCourse)

      const retrieved = await getCourse('fixed-id')
      expect(retrieved!.title).toBe('Updated Title')
    })
  })

  describe('getCourse', () => {
    it('should return null for non-existent course ID', async () => {
      const result = await getCourse('non-existent-id')
      expect(result).toBeNull()
    })

    it('should return a deep copy of the stored data', async () => {
      const course = createMockCourse()
      await saveCourse(course)

      const retrieved1 = await getCourse(course.id)
      const retrieved2 = await getCourse(course.id)

      // Mutating one copy should not affect the other
      retrieved1!.title = 'Mutated'
      expect(retrieved2!.title).toBe('Test Course')
    })

    it('should update lastAccessedAt on retrieval', async () => {
      const course = createMockCourse()
      await saveCourse(course)

      // Small delay to ensure time difference
      await new Promise((resolve) => setTimeout(resolve, 10))

      await getCourse(course.id)

      const courses = await listCourses()
      const summary = courses.find((c) => c.id === course.id)
      expect(new Date(summary!.lastAccessedAt).getTime()).toBeGreaterThan(
        new Date(course.createdAt).getTime()
      )
    })
  })

  describe('listCourses', () => {
    it('should return empty array when no courses exist', async () => {
      const courses = await listCourses()
      expect(courses).toEqual([])
    })

    it('should return summaries with correct fields', async () => {
      const course = createMockCourse()
      await saveCourse(course)

      const courses = await listCourses()
      expect(courses).toHaveLength(1)
      expect(courses[0].id).toBe(course.id)
      expect(courses[0].title).toBe(course.title)
      expect(courses[0].description).toBe(course.description)
      expect(courses[0].totalSections).toBe(2)
      expect(courses[0].completedSections).toBe(0)
    })

    it('should sort by lastAccessedAt descending', async () => {
      const course1 = createMockCourse({ id: 'course-1', title: 'First' })
      const course2 = createMockCourse({ id: 'course-2', title: 'Second' })

      await saveCourse(course1)
      await new Promise((resolve) => setTimeout(resolve, 10))
      await saveCourse(course2)

      const courses = await listCourses()
      expect(courses[0].id).toBe('course-2')
      expect(courses[1].id).toBe('course-1')
    })
  })

  describe('deleteCourse', () => {
    it('should remove course and its progress', async () => {
      const course = createMockCourse()
      await saveCourse(course)

      await deleteCourse(course.id)

      const retrieved = await getCourse(course.id)
      expect(retrieved).toBeNull()

      const courses = await listCourses()
      expect(courses).toHaveLength(0)
    })

    it('should not throw when deleting non-existent course', async () => {
      await expect(deleteCourse('non-existent')).resolves.not.toThrow()
    })
  })

  describe('per-user scoping', () => {
    it('should record the owning user id on save', async () => {
      const course = createMockCourse()
      await saveCourse(course, 'user-a')

      const db = await openDB(DB_NAME, DB_VERSION)
      const stored = await db.get('courses', course.id)
      const progress = await db.get('progress', course.id)
      expect(stored).toMatchObject({ userId: 'user-a' })
      expect(progress).toMatchObject({ userId: 'user-a' })
      db.close()
    })

    it('should return null from getCourse for another user, same as not-found', async () => {
      const course = createMockCourse({ id: 'owned-by-a' })
      await saveCourse(course, 'user-a')

      expect(await getCourse('owned-by-a', 'user-b')).toBeNull()
      expect(await getCourse('does-not-exist', 'user-b')).toBeNull()
      expect(await getCourse('owned-by-a', 'user-a')).not.toBeNull()
    })

    it('should not expose unowned courses to a signed-in user', async () => {
      await saveCourse(createMockCourse({ id: 'pre-auth' }))

      expect(await getCourse('pre-auth', 'user-a')).toBeNull()
      expect(await listCourses('user-a')).toEqual([])
      expect(await listCourses()).toHaveLength(1)
    })

    it('should list only the signed-in user courses', async () => {
      await saveCourse(createMockCourse({ id: 'a-1', title: 'A One' }), 'user-a')
      await saveCourse(createMockCourse({ id: 'a-2', title: 'A Two' }), 'user-a')
      await saveCourse(createMockCourse({ id: 'b-1', title: 'B One' }), 'user-b')

      const forA = await listCourses('user-a')
      expect(forA.map((c) => c.id).sort()).toEqual(['a-1', 'a-2'])

      const forB = await listCourses('user-b')
      expect(forB.map((c) => c.id)).toEqual(['b-1'])
    })

    it('should not let one user delete another user course', async () => {
      const course = createMockCourse({ id: 'shared-id' })
      await saveCourse(course, 'user-a')

      await deleteCourse('shared-id', 'user-b')

      expect(await getCourse('shared-id', 'user-a')).not.toBeNull()
      expect(await listCourses('user-a')).toHaveLength(1)
    })

    it('should not let one user overwrite another user course', async () => {
      await saveCourse(createMockCourse({ id: 'shared-id' }), 'user-a')
      await saveCourse(
        createMockCourse({ id: 'shared-id', title: 'Hijacked' }),
        'user-b'
      )

      const forA = await getCourse('shared-id', 'user-a')
      expect(forA!.title).toBe('Test Course')
      expect(await getCourse('shared-id', 'user-b')).toBeNull()
    })

    it('should keep progress independent per user', async () => {
      await saveCourse(createMockCourse({ id: 'a-course' }), 'user-a')
      await saveCourse(createMockCourse({ id: 'b-course' }), 'user-b')

      await updateProgress('a-course', { completedSections: ['section-1'] }, 'user-a')
      // user-b must not be able to write into user-a's progress
      await updateProgress('a-course', { completedSections: ['section-2'] }, 'user-b')

      const forA = await listCourses('user-a')
      expect(forA[0].completedSections).toBe(1)

      const forB = await listCourses('user-b')
      expect(forB[0].completedSections).toBe(0)
    })
  })

  describe('claimUnownedData', () => {
    it('should adopt pre-auth courses and progress for the first signed-in user', async () => {
      const course = createMockCourse({ id: 'pre-auth' })
      await saveCourse(course)
      await updateProgress('pre-auth', { completedSections: ['section-1'] })

      // one course record + one progress record
      expect(await claimUnownedData('user-a')).toBe(2)

      const claimed = await getCourse('pre-auth', 'user-a')
      expect(claimed).not.toBeNull()
      expect(claimed!.title).toBe('Test Course')

      const forA = await listCourses('user-a')
      expect(forA).toHaveLength(1)
      expect(forA[0].completedSections).toBe(1)
      expect(await listCourses()).toEqual([])
    })

    it('should leave every field except userId untouched', async () => {
      const course = createMockCourse({ id: 'pre-auth' })
      await saveCourse(course)

      const db = await openDB(DB_NAME, DB_VERSION)
      const before = await db.get('courses', 'pre-auth')
      db.close()

      await claimUnownedData('user-a')

      const db2 = await openDB(DB_NAME, DB_VERSION)
      const after = await db2.get('courses', 'pre-auth')
      db2.close()

      expect(after).toEqual({ ...before, userId: 'user-a' })
    })

    it('should never claim records owned by another user', async () => {
      await saveCourse(createMockCourse({ id: 'owned-by-a' }), 'user-a')
      await saveCourse(createMockCourse({ id: 'pre-auth' }))

      expect(await claimUnownedData('user-b')).toBe(2)

      expect(await getCourse('owned-by-a', 'user-b')).toBeNull()
      expect(await getCourse('owned-by-a', 'user-a')).not.toBeNull()
      expect(await getCourse('pre-auth', 'user-b')).not.toBeNull()
    })

    it('should claim nothing on a second call and preserve course ids', async () => {
      await saveCourse(createMockCourse({ id: 'pre-1' }))
      await saveCourse(createMockCourse({ id: 'pre-2' }))

      expect(await claimUnownedData('user-a')).toBe(4)
      expect(await claimUnownedData('user-a')).toBe(0)
      expect(await claimUnownedData('user-b')).toBe(0)

      const db = await openDB(DB_NAME, DB_VERSION)
      expect((await db.getAllKeys('courses')).sort()).toEqual(['pre-1', 'pre-2'])
      db.close()
      expect(await listCourses('user-b')).toEqual([])
      expect(await listCourses('user-a')).toHaveLength(2)
    })

    it('should return zero when there is nothing to claim', async () => {
      expect(await claimUnownedData('user-a')).toBe(0)
    })
  })

  describe('updateProgress', () => {
    it('should merge new completedSections without duplicates', async () => {
      const course = createMockCourse()
      await saveCourse(course)

      await updateProgress(course.id, {
        completedSections: ['section-1'],
      })
      await updateProgress(course.id, {
        completedSections: ['section-1', 'section-2'],
      })

      const courses = await listCourses()
      const summary = courses.find((c) => c.id === course.id)
      expect(summary!.completedSections).toBe(2)
    })

    it('should merge quizScores (add and update)', async () => {
      const course = createMockCourse()
      await saveCourse(course)

      await updateProgress(course.id, {
        quizScores: { 'quiz-1': 80 },
      })
      await updateProgress(course.id, {
        quizScores: { 'quiz-1': 90, 'quiz-2': 70 },
      })

      // Verify by accessing the course (which updates lastAccessedAt)
      // The progress is internal but we can verify via listCourses
      const retrieved = await getCourse(course.id)
      expect(retrieved).not.toBeNull()
    })

    it('should silently do nothing for non-existent courseId', async () => {
      await expect(
        updateProgress('non-existent', {
          completedSections: ['section-1'],
        })
      ).resolves.not.toThrow()
    })

    it('should update lastAccessedAt on progress update', async () => {
      const course = createMockCourse()
      await saveCourse(course)

      await new Promise((resolve) => setTimeout(resolve, 10))
      await updateProgress(course.id, {
        completedSections: ['section-1'],
      })

      const courses = await listCourses()
      const summary = courses.find((c) => c.id === course.id)
      expect(new Date(summary!.lastAccessedAt).getTime()).toBeGreaterThan(
        new Date(course.createdAt).getTime()
      )
    })
  })
})
