import { describe, expect, it } from 'vitest'
import { MAX_EMAIL_LENGTH, MIN_PASSWORD_LENGTH } from '../config.ts'
import { normalizeEmail, validateRegistration } from './validation.ts'

const VALID_PASSWORD = 'correct horse battery staple'

/** A password that is long enough but sits on the common-password list. */
const COMMON_LONG_PASSWORD = 'contortionist'

/** Builds a syntactically valid address of exactly `length` characters. */
function emailOfLength(length: number): string {
  const suffix = '@example.com'
  return 'a'.repeat(length - suffix.length) + suffix
}

describe('normalizeEmail', () => {
  it('trims surrounding whitespace and lowercases', () => {
    expect(normalizeEmail('  User@Example.COM \t\n')).toBe('user@example.com')
  })

  it('is idempotent', () => {
    const once = normalizeEmail(' Mixed@Case.Example ')
    expect(normalizeEmail(once)).toBe(once)
  })

  it('collapses addresses differing only in case or padding', () => {
    expect(normalizeEmail('ada@example.com')).toBe(normalizeEmail(' ADA@Example.com '))
  })

  it('leaves an all-whitespace input empty', () => {
    expect(normalizeEmail('   ')).toBe('')
  })
})

describe('validateRegistration', () => {
  it('returns no errors for a valid email and password', () => {
    expect(validateRegistration('ada@example.com', VALID_PASSWORD)).toEqual({})
  })

  it('names every missing field at once', () => {
    expect(validateRegistration('', '')).toEqual({
      email: 'Email is required',
      password: 'Password is required',
    })
  })

  it('treats undefined and null fields as missing', () => {
    expect(validateRegistration(undefined, null)).toEqual({
      email: 'Email is required',
      password: 'Password is required',
    })
  })

  it.each([
    ['no at sign', 'adaexample.com'],
    ['no domain dot', 'ada@example'],
    ['empty local part', '@example.com'],
    ['internal whitespace', 'ada smith@example.com'],
    ['leading domain dot', 'ada@.example.com'],
    ['trailing dot', 'ada@example.com.'],
    ['double dot in domain', 'ada@example..com'],
    ['two at signs', 'ada@@example.com'],
  ])('rejects a malformed email (%s)', (_label, email) => {
    expect(validateRegistration(email, VALID_PASSWORD)).toEqual({
      email: 'Enter a valid email address',
    })
  })

  it(`accepts an email of exactly ${MAX_EMAIL_LENGTH} characters`, () => {
    const email = emailOfLength(MAX_EMAIL_LENGTH)
    expect(email).toHaveLength(MAX_EMAIL_LENGTH)
    expect(validateRegistration(email, VALID_PASSWORD)).toEqual({})
  })

  it('rejects an email one character over the limit', () => {
    const email = emailOfLength(MAX_EMAIL_LENGTH + 1)
    expect(validateRegistration(email, VALID_PASSWORD)).toEqual({
      email: 'Enter a valid email address',
    })
  })

  it('rejects a password one character short of the minimum', () => {
    const password = 'x'.repeat(MIN_PASSWORD_LENGTH - 1)
    expect(validateRegistration('ada@example.com', password)).toEqual({
      password: `Use at least ${MIN_PASSWORD_LENGTH} characters`,
    })
  })

  it('accepts a password of exactly the minimum length', () => {
    // 'Vq7' prefix keeps it off the common-password list.
    const password = 'Vq7' + 'x'.repeat(MIN_PASSWORD_LENGTH - 3)
    expect(validateRegistration('ada@example.com', password)).toEqual({})
  })

  it('rejects a long-enough password from the common-password list', () => {
    expect(validateRegistration('ada@example.com', COMMON_LONG_PASSWORD)).toEqual({
      password: 'This password is too common — choose another',
    })
  })

  it('matches the common-password list case-insensitively', () => {
    const shouted = COMMON_LONG_PASSWORD.toUpperCase()
    expect(validateRegistration('ada@example.com', shouted).password).toBe(
      'This password is too common — choose another',
    )
  })

  it('reports both fields when both fail', () => {
    expect(validateRegistration('nope', 'short')).toEqual({
      email: 'Enter a valid email address',
      password: `Use at least ${MIN_PASSWORD_LENGTH} characters`,
    })
  })

  it('does not mutate its inputs or leak the password into the result', () => {
    const errors = validateRegistration('ada@example.com', COMMON_LONG_PASSWORD)
    expect(JSON.stringify(errors)).not.toContain(COMMON_LONG_PASSWORD)
  })
})
