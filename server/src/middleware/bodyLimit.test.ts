import { describe, expect, it } from 'vitest'
import express, { type Express } from 'express'
import request from 'supertest'
import { createJsonBodyParser } from './bodyLimit.ts'

function buildApp(): Express {
  const app = express()
  app.use(createJsonBodyParser())
  app.post('/echo', (req, res) => res.json({ size: JSON.stringify(req.body).length }))
  // Minimal stand-in for the error handler task 5.2 owns.
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = (error as { status?: number }).status ?? 500
    res.status(status).json({ error: 'Request body is too large' })
  })
  return app
}

describe('json body limit', () => {
  it('accepts a body under the limit', async () => {
    const response = await request(buildApp())
      .post('/echo')
      .send({ password: 'a'.repeat(1000) })

    expect(response.status).toBe(200)
  })

  it('rejects a body over 100KB (Requirement 5.6)', async () => {
    const response = await request(buildApp())
      .post('/echo')
      .send({ password: 'a'.repeat(120 * 1024) })

    expect(response.status).toBe(413)
  })
})
