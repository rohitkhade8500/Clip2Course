/**
 * Server entry point.
 *
 * Owns the three things a process owns and an app factory must not: the
 * database connection, the listening socket, and the housekeeping timer. That
 * split is what lets tests build a real app over a throwaway database without
 * binding a port.
 */

import { createApp } from './app.ts'
import {
  CLEANUP_INTERVAL_MS,
  IS_PRODUCTION,
  NODE_ENV,
  PORT,
  RATE_LIMIT_MAX_WINDOW_MS,
} from './config.ts'
import { createSessionStore } from './auth/sessionStore.ts'
import { closeDb, getDb } from './db/index.ts'

const db = getDb()
const sessions = createSessionStore({ db })

const app = createApp({ db, serveClient: IS_PRODUCTION })

/**
 * Periodic prune of expired sessions and stale rate-limit rows.
 *
 * Neither is required for correctness — `verify()` enforces both expiry bounds
 * and the limiter filters by window — so this only keeps the tables from
 * growing without bound. `unref` means it never holds the process open.
 */
const cleanup = setInterval(() => {
  void (async () => {
    try {
      const sessionsRemoved = await sessions.deleteExpired()
      const cutoff = new Date(Date.now() - RATE_LIMIT_MAX_WINDOW_MS).toISOString()
      const attemptsRemoved = db.loginAttempts.pruneOlderThan(cutoff)

      if (sessionsRemoved > 0 || attemptsRemoved > 0) {
        console.log(
          `[clip2course-server] pruned ${sessionsRemoved} expired sessions, ` +
            `${attemptsRemoved} old attempts`,
        )
      }
    } catch (error) {
      // Housekeeping must never take the server down with it.
      console.error('[clip2course-server] cleanup failed', error)
    }
  })()
}, CLEANUP_INTERVAL_MS)
cleanup.unref?.()

const server = app.listen(PORT, () => {
  console.log(`[clip2course-server] listening on :${PORT} (${NODE_ENV})`)
})

/** Closes the socket and the database once, however the signal arrives. */
function shutdown(signal: string): void {
  console.log(`[clip2course-server] ${signal} received, shutting down`)
  clearInterval(cleanup)

  server.close((error) => {
    if (error) console.error('[clip2course-server] error closing server', error)
    closeDb()
    process.exit(error ? 1 : 0)
  })
}

process.once('SIGINT', () => shutdown('SIGINT'))
process.once('SIGTERM', () => shutdown('SIGTERM'))
