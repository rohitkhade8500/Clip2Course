import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openTestDb, type Db } from '../db/index.ts'
import {
  createUserRepository,
  defaultDisplayName,
  type UserRepository,
} from './userRepository.ts'

let db: Db
let users: UserRepository

beforeEach(() => {
  db = openTestDb()
  users = createUserRepository(db)
})

afterEach(() => {
  db.close()
})

describe('create', () => {
  it('stores the email lowercased and trimmed with a generated id', async () => {
    const user = await users.create({
      email: '  Ada@Example.COM ',
      passwordHash: '$argon2id$fake',
      displayName: 'Ada Lovelace',
    })

    expect(user.email).toBe('ada@example.com')
    expect(user.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(user.displayName).toBe('Ada Lovelace')
    expect(user.createdAt).toBeInstanceOf(Date)
    expect(Number.isNaN(user.createdAt.getTime())).toBe(false)
  })

  it('defaults the display name to the email local part', async () => {
    const omitted = await users.create({
      email: 'Grace@Example.com',
      passwordHash: 'h1',
    })
    expect(omitted.displayName).toBe('grace')

    const blank = await users.create({
      email: 'alan@example.com',
      passwordHash: 'h2',
      displayName: '   ',
    })
    expect(blank.displayName).toBe('alan')
  })

  it('rejects a duplicate email differing only by case', async () => {
    await users.create({ email: 'ada@example.com', passwordHash: 'h1' })

    await expect(
      users.create({ email: 'ADA@Example.com', passwordHash: 'h2' }),
    ).rejects.toThrow()
  })
})

describe('findByEmail', () => {
  it('matches regardless of case and surrounding whitespace', async () => {
    const created = await users.create({
      email: 'ada@example.com',
      passwordHash: 'h1',
    })

    expect((await users.findByEmail('ADA@EXAMPLE.COM'))?.id).toBe(created.id)
    expect((await users.findByEmail('  ada@example.com  '))?.id).toBe(created.id)
  })

  it('returns null for an unknown or empty email', async () => {
    expect(await users.findByEmail('nobody@example.com')).toBeNull()
    expect(await users.findByEmail('   ')).toBeNull()
  })
})

describe('findById', () => {
  it('round-trips a created user', async () => {
    const created = await users.create({
      email: 'ada@example.com',
      passwordHash: '$argon2id$fake',
      displayName: 'Ada',
    })

    const found = await users.findById(created.id)
    expect(found).toEqual(created)
  })

  it('returns null for an unknown or empty id', async () => {
    expect(await users.findById('missing')).toBeNull()
    expect(await users.findById('')).toBeNull()
  })
})

describe('defaultDisplayName', () => {
  it('takes the local part, or the whole value when there is no @', () => {
    expect(defaultDisplayName('Ada@Example.com')).toBe('ada')
    expect(defaultDisplayName('ada')).toBe('ada')
    expect(defaultDisplayName('@example.com')).toBe('@example.com')
  })
})
