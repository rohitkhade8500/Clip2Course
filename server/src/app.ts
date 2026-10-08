/**
 * Express application assembly.
 *
 * A factory rather than a module-level app, so an integration test can build
 * an app over `openTestDb()` and the real request pipeline at the same time
 * (task 5.3). Nothing here opens a database or binds a port — that is
 * `index.ts`'s job — which keeps the wiring testable in isolation.
 *
 * Middleware order is load-bearing:
 *
 *   1. cookie parsing, because auth and CSRF both read cookies
 *   2. the capped JSON parser, scoped to `/api`, so an oversized body is
 *      refused before any handler allocates for it (Requirement 5.6)
 *   3. the auth router
 *   4. a uniform 404 for unclaimed API paths
 *   5. the client build, in production only
 *   6. the terminal error handler, which every earlier failure funnels into
 *
 * In production the client bundle is served from this same process, so the app
 * and the API share an origin and `SameSite=Lax` cookies work with no CORS
 * exception (design.md, "Deployment shape").
 */

import express from 'express'
import type { Express, RequestHandler } from 'express'
import cookieParser from 'cookie-parser'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { createAuthService, type AuthService } from './auth/authService.ts'
import { IS_PRODUCTION } from './config.ts'
import type { Db } from './db/index.ts'
import { createJsonBodyParser } from './middleware/bodyLimit.ts'
import {
  apiNotFoundHandler,
  createErrorHandler,
  type Logger,
} from './middleware/errorHandler.ts'
import { createRequireAuth } from './middleware/requireAuth.ts'
import { createAuthRouter } from './routes/auth.ts'

export interface AppDependencies {
  /** Database for the auth service and session verification. */
  db?: Db
  authService?: AuthService
  requireAuth?: RequestHandler
  /** Serve the client build. Defaults to true in production only. */
  serveClient?: boolean
  /** Where the client build lives. Defaults to the repo's `dist/`. */
  clientDir?: string
  /** Sink for unexpected-fault detail. Defaults to `console.error`. */
  logger?: Logger
}

/** Repo-root `dist/`, which sits two levels above both `src` and `dist`. */
export const DEFAULT_CLIENT_DIR = fileURLToPath(new URL('../../dist/', import.meta.url))

export function createApp(dependencies: AppDependencies = {}): Express {
  const {
    db,
    serveClient = IS_PRODUCTION,
    clientDir = DEFAULT_CLIENT_DIR,
    logger,
  } = dependencies

  const app = express()

  // The version banner is free reconnaissance; nothing needs it.
  app.disable('x-powered-by')

  // `trust proxy` stays off deliberately: with it on, a client-supplied
  // `X-Forwarded-For` would become the identity the rate limiter counts
  // against. Enable it only behind a proxy that overwrites that header.

  app.use(cookieParser())

  // Requirement 5.6. Scoped to `/api` so static asset requests skip it.
  app.use('/api', createJsonBodyParser())

  app.use(
    '/api/auth',
    createAuthRouter({
      db,
      authService: dependencies.authService ?? (db ? createAuthService({ db }) : undefined),
      requireAuth: dependencies.requireAuth ?? (db ? createRequireAuth({ db }) : undefined),
    }),
  )

  // Any other `/api` path is not found — in the same shape as every other
  // failure, rather than Express's HTML default.
  app.use('/api', apiNotFoundHandler)

  if (serveClient) {
    mountClient(app, clientDir)
  }

  // Last, so everything above can funnel into it (Requirement 10.5).
  app.use(createErrorHandler({ logger }))

  return app
}

/**
 * Serves the built client and falls back to `index.html` for app routes.
 *
 * The fallback is what makes a deep link like `/app/dashboard` work on a cold
 * load: the router lives in the bundle, so the server has to hand the same
 * document to every non-asset GET. Express 5 no longer accepts `'*'` as a
 * path, hence a plain middleware instead of a wildcard route.
 */
function mountClient(app: Express, clientDir: string): void {
  const indexHtml = join(clientDir, 'index.html')

  if (!existsSync(indexHtml)) {
    console.warn(
      `[clip2course-server] no client build at ${clientDir}; ` +
        'serving the API only. Run the client build first.',
    )
    return
  }

  app.use(express.static(clientDir))

  app.use((req, res, next) => {
    // Only ever a document response: a missing asset must stay a 404, and a
    // POST to an unknown path must not be answered with HTML.
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      next()
      return
    }
    res.sendFile(indexHtml, (error) => {
      if (error) next(error)
    })
  })
}
