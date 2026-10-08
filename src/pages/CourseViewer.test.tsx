/**
 * Ownership scoping for the course viewer at `/app/course/:id`
 * (Requirements 8.3, 8.6).
 *
 * Another user's course must be indistinguishable from one that does not
 * exist, so the page is expected to render its not-found state rather than any
 * course content — even though the record is sitting in the same database.
 */

import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '../context/AuthContext'
import { _resetDB, saveCourse } from '../services/courseStore'
import type { CourseData } from '../types/course'
import CourseViewer from './CourseViewer'

const USER_A = { id: 'user-a', email: 'ada@example.com', displayName: 'Ada' }
const USER_B = { id: 'user-b', email: 'bob@example.com', displayName: 'Bob' }

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function stubSignedInAs(user: typeof USER_A) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('/auth/me')) return jsonResponse({ user })
      return jsonResponse({})
    })
  )
}

function makeCourse(id: string, title: string): CourseData {
  return {
    id,
    title,
    description: `${title} description`,
    videoMetadata: { title, duration: 600, source: 'youtube' },
    sections: [
      {
        id: `${id}-s0`,
        title: 'Section 1',
        summary: 'Summary',
        startTime: 0,
        endTime: 60,
        quizzes: [],
        flashcards: [],
        puzzles: [],
      },
    ],
    totalQuestions: 0,
    estimatedTime: 5,
    createdAt: new Date('2024-01-01'),
  }
}

function renderViewer(courseId: string) {
  return render(
    <MemoryRouter initialEntries={[`/app/course/${courseId}`]}>
      <AuthProvider>
        <Routes>
          <Route path="/app/course/:id" element={<CourseViewer />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  )
}

beforeEach(() => {
  _resetDB()
  indexedDB = new IDBFactory()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('CourseViewer ownership', () => {
  it('opens a course the signed-in user owns', async () => {
    await saveCourse(makeCourse('mine', 'Ada course'), USER_A.id)

    stubSignedInAs(USER_A)
    renderViewer('mine')

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Ada course' })
    ).toBeInTheDocument()
  })

  it('renders not-found for a course owned by another user', async () => {
    await saveCourse(makeCourse('theirs', 'Bob course'), USER_B.id)

    stubSignedInAs(USER_A)
    renderViewer('theirs')

    expect(await screen.findByText('Course not found')).toBeInTheDocument()
    expect(screen.queryByText('Bob course')).not.toBeInTheDocument()
  })

  it('renders not-found for an id that does not exist, identically', async () => {
    stubSignedInAs(USER_A)
    renderViewer('missing')

    expect(await screen.findByText('Course not found')).toBeInTheDocument()
  })
})
