/**
 * Password hashing (Requirements 1.7, 2.3, 4.5).
 *
 * Argon2id with the memory-hard parameters from `config.ts`. Only the encoded
 * hash ever leaves this module: the plaintext is not stored, logged or
 * returned anywhere, and the encoded string records the parameters used so
 * hashes written under older settings keep verifying.
 */

import { randomBytes } from 'node:crypto'
import { hash as argon2Hash, verify as argon2Verify } from 'argon2'
import { ARGON2_OPTIONS, MAX_PASSWORD_LENGTH } from '../config.ts'

/**
 * Hashes a plaintext password with Argon2id.
 *
 * Each call uses a fresh random salt, so the same password hashes to a
 * different string every time.
 *
 * @throws RangeError when the password exceeds `MAX_PASSWORD_LENGTH`. Callers
 * reach this only if validation was skipped; hashing unbounded input is a
 * cheap way to burn server memory.
 */
export async function hashPassword(password: string): Promise<string> {
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new RangeError(
      `Password exceeds the ${MAX_PASSWORD_LENGTH}-character limit`,
    )
  }

  return argon2Hash(password, ARGON2_OPTIONS)
}

/**
 * Checks a plaintext password against an encoded Argon2 hash.
 *
 * Returns false rather than throwing for a malformed or foreign hash, so a
 * corrupt row cannot turn a failed login into a 500 — and so the unknown-email
 * path in `login()` behaves identically to a wrong password.
 */
export async function verifyPassword(
  encodedHash: string,
  password: string,
): Promise<boolean> {
  if (password.length > MAX_PASSWORD_LENGTH) return false

  try {
    return await argon2Verify(encodedHash, password)
  } catch {
    return false
  }
}

/**
 * A real Argon2id hash of a random secret nobody holds, produced with exactly
 * the parameters in `ARGON2_OPTIONS`.
 *
 * `login()` verifies against this when the submitted email is unknown, so the
 * response takes the same time as a wrong-password reply and cannot be used to
 * discover which addresses are registered (Requirement 2.3).
 *
 * The preimage is discarded, so `verifyPassword(DUMMY_ARGON2_HASH, anything)`
 * is false for every practical input.
 */
export const DUMMY_ARGON2_HASH: string = await hashPassword(
  randomBytes(32).toString('hex'),
)
