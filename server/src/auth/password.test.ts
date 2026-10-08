import { describe, expect, it } from 'vitest'
import { needsRehash } from 'argon2'
import { ARGON2_OPTIONS, MAX_PASSWORD_LENGTH } from '../config.ts'
import { DUMMY_ARGON2_HASH, hashPassword, verifyPassword } from './password.ts'

const PASSWORD = 'correct horse battery staple'

describe('hashPassword', () => {
  it('produces an argon2id hash carrying the configured parameters', async () => {
    const encoded = await hashPassword(PASSWORD)

    expect(encoded.startsWith('$argon2id$')).toBe(true)
    expect(encoded).toContain(`m=${ARGON2_OPTIONS.memoryCost}`)
    expect(encoded).toContain(`t=${ARGON2_OPTIONS.timeCost}`)
    expect(encoded).toContain(`p=${ARGON2_OPTIONS.parallelism}`)
    expect(needsRehash(encoded, ARGON2_OPTIONS)).toBe(false)
  })

  it('never leaks the plaintext into the encoded hash', async () => {
    const encoded = await hashPassword(PASSWORD)

    expect(encoded).not.toContain(PASSWORD)
    expect(encoded).not.toBe(PASSWORD)
  })

  it('salts every hash, so the same password hashes differently', async () => {
    const [first, second] = await Promise.all([
      hashPassword(PASSWORD),
      hashPassword(PASSWORD),
    ])

    expect(first).not.toBe(second)
    await expect(verifyPassword(first, PASSWORD)).resolves.toBe(true)
    await expect(verifyPassword(second, PASSWORD)).resolves.toBe(true)
  })

  it('rejects a password past the length limit instead of hashing it', async () => {
    const oversized = 'a'.repeat(MAX_PASSWORD_LENGTH + 1)

    await expect(hashPassword(oversized)).rejects.toThrow(RangeError)
  })
})

describe('verifyPassword', () => {
  it('accepts the matching password and rejects anything else', async () => {
    const encoded = await hashPassword(PASSWORD)

    await expect(verifyPassword(encoded, PASSWORD)).resolves.toBe(true)
    await expect(verifyPassword(encoded, `${PASSWORD} `)).resolves.toBe(false)
    await expect(verifyPassword(encoded, 'Correct Horse Battery Staple'))
      .resolves.toBe(false)
    await expect(verifyPassword(encoded, '')).resolves.toBe(false)
  })

  it('returns false for a malformed hash rather than throwing', async () => {
    await expect(verifyPassword('not-a-hash', PASSWORD)).resolves.toBe(false)
    await expect(verifyPassword('', PASSWORD)).resolves.toBe(false)
  })
})

describe('DUMMY_ARGON2_HASH', () => {
  it('uses the same parameters as a real hash', async () => {
    const real = await hashPassword(PASSWORD)

    expect(DUMMY_ARGON2_HASH.startsWith('$argon2id$')).toBe(true)
    // Same prefix means same id, version and cost parameters — only the salt
    // and digest differ, so verification does equal work either way.
    expect(prefixOf(DUMMY_ARGON2_HASH)).toBe(prefixOf(real))
    expect(needsRehash(DUMMY_ARGON2_HASH, ARGON2_OPTIONS)).toBe(false)
  })

  it('has no known preimage', async () => {
    await expect(verifyPassword(DUMMY_ARGON2_HASH, PASSWORD)).resolves.toBe(false)
    await expect(verifyPassword(DUMMY_ARGON2_HASH, '')).resolves.toBe(false)
  })
})

/** `$argon2id$v=19$m=...,t=...,p=...` — everything before the salt. */
function prefixOf(encoded: string): string {
  return encoded.split('$').slice(0, 4).join('$')
}
