/**
 * Request body limit (Requirement 5.6).
 *
 * Auth payloads are three short strings; anything approaching 100KB is either a
 * bug or an attempt to make the server allocate on demand. `express.json`
 * enforces the cap while parsing and raises a 413-shaped error, which the route
 * error handler (task 5.2) maps onto the uniform response shape.
 */

import express from 'express'
import type { RequestHandler } from 'express'
import { BODY_LIMIT } from '../config.ts'

/** JSON body parser capped at the configured limit. */
export function createJsonBodyParser(limit: string = BODY_LIMIT): RequestHandler {
  return express.json({ limit })
}

/** The parser used by route code. */
export const jsonBodyParser: RequestHandler = createJsonBodyParser()
