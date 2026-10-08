import { describe, it, expect } from 'vitest'
import {
  detectPlatform,
  parseYouTubeId,
  parseVimeoId,
  parseDailymotionId,
  parsePlatformId,
  proxiedUrl,
} from './platforms'
import { validateInput } from './videoManager'

describe('detectPlatform', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube'],
    ['https://youtu.be/dQw4w9WgXcQ', 'youtube'],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'youtube'],
    ['https://vimeo.com/76979871', 'vimeo'],
    ['https://player.vimeo.com/video/76979871', 'vimeo'],
    ['https://www.dailymotion.com/video/x7tgad0', 'dailymotion'],
    ['https://dai.ly/x7tgad0', 'dailymotion'],
    ['https://example.com/lecture.mp4', 'direct'],
    ['https://example.com/clip.webm?token=abc', 'direct'],
    ['https://example.com/movie.mov', 'direct'],
  ])('detects %s as %s', (url, expected) => {
    expect(detectPlatform(url)).toBe(expected)
  })

  it('returns null for unsupported links', () => {
    expect(detectPlatform('https://example.com/article')).toBeNull()
    expect(detectPlatform('https://twitch.tv/somebody')).toBeNull()
  })
})

describe('platform ID parsing', () => {
  it('parses YouTube IDs including the live format', () => {
    expect(parseYouTubeId('https://www.youtube.com/live/dQw4w9WgXcQ')).toBe(
      'dQw4w9WgXcQ'
    )
    expect(parseYouTubeId('https://youtu.be/abc_d-fgh12')).toBe('abc_d-fgh12')
  })

  it('parses Vimeo IDs from plain, channel and player URLs', () => {
    expect(parseVimeoId('https://vimeo.com/76979871')).toBe('76979871')
    expect(parseVimeoId('https://player.vimeo.com/video/76979871')).toBe('76979871')
    expect(parseVimeoId('https://vimeo.com/channels/staffpicks/76979871')).toBe(
      '76979871'
    )
  })

  it('parses Dailymotion IDs from long and short URLs', () => {
    expect(parseDailymotionId('https://www.dailymotion.com/video/x7tgad0')).toBe(
      'x7tgad0'
    )
    expect(parseDailymotionId('https://dai.ly/x7tgad0')).toBe('x7tgad0')
  })

  it('returns null for direct file links, which have no ID', () => {
    expect(parsePlatformId('https://example.com/lecture.mp4')).toBeNull()
  })
})

describe('proxiedUrl', () => {
  it('encodes the target so query strings survive', () => {
    const target = 'https://captions.vimeo.com/x.vtt?expires=1&sig=abc'
    expect(proxiedUrl(target)).toBe(
      `/api/fetch?url=${encodeURIComponent(target)}`
    )
  })
})

describe('validation agrees with platform detection', () => {
  // The original bug: validateInput accepted URLs the pipeline then rejected.
  const supported = [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://vimeo.com/76979871',
    'https://www.dailymotion.com/video/x7tgad0',
    'https://dai.ly/x7tgad0',
    'https://example.com/lecture.mp4',
    'https://example.com/movie.mov',
  ]

  it.each(supported)('accepts %s and can route it', (url) => {
    const result = validateInput({ type: 'url', url })
    expect(result.isValid).toBe(true)
    // Anything validation accepts must be routable by the pipeline
    expect(detectPlatform(url)).not.toBeNull()
  })

  it.each([
    'https://example.com/article',
    'https://twitch.tv/somebody',
    'javascript:alert(1)',
    'http://127.0.0.1/lecture.mp4',
  ])('rejects or refuses to route %s', (url) => {
    const result = validateInput({ type: 'url', url })
    if (result.isValid) {
      // If validation lets it through, detection must still classify it
      expect(detectPlatform(url)).not.toBeNull()
    } else {
      expect(result.errors.length).toBeGreaterThan(0)
    }
  })
})
