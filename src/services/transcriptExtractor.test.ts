import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parseYouTubeVideoId, extractFromYouTube } from './transcriptExtractor'

describe('parseYouTubeVideoId', () => {
  it('parses standard watch URL', () => {
    expect(
      parseYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    ).toBe('dQw4w9WgXcQ')
  })

  it('parses watch URL with additional query params', () => {
    expect(
      parseYouTubeVideoId(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=120'
      )
    ).toBe('dQw4w9WgXcQ')
  })

  it('parses watch URL with param before v', () => {
    expect(
      parseYouTubeVideoId(
        'https://www.youtube.com/watch?list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf&v=dQw4w9WgXcQ'
      )
    ).toBe('dQw4w9WgXcQ')
  })

  it('parses short-link URL (youtu.be)', () => {
    expect(parseYouTubeVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe(
      'dQw4w9WgXcQ'
    )
  })

  it('parses embed URL', () => {
    expect(
      parseYouTubeVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ')
    ).toBe('dQw4w9WgXcQ')
  })

  it('parses shorts URL', () => {
    expect(
      parseYouTubeVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ')
    ).toBe('dQw4w9WgXcQ')
  })

  it('parses URL with hyphens and underscores in video ID', () => {
    expect(
      parseYouTubeVideoId('https://www.youtube.com/watch?v=abc_d-fgh12')
    ).toBe('abc_d-fgh12')
  })

  it('returns null for invalid URL', () => {
    expect(parseYouTubeVideoId('https://example.com/video')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseYouTubeVideoId('')).toBeNull()
  })

  it('returns null for non-YouTube URL', () => {
    expect(parseYouTubeVideoId('https://vimeo.com/123456789')).toBeNull()
  })

  it('returns null for YouTube URL without valid video ID', () => {
    expect(
      parseYouTubeVideoId('https://www.youtube.com/watch?v=short')
    ).toBeNull()
  })
})

describe('extractFromYouTube', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('throws Error for invalid YouTube URL', async () => {
    await expect(
      extractFromYouTube('https://example.com/not-youtube')
    ).rejects.toThrow('Invalid YouTube URL')
  })

  it('throws Error for empty string', async () => {
    await expect(extractFromYouTube('')).rejects.toThrow('Invalid YouTube URL')
  })

  /**
   * Builds a fetch mock for the InnerTube flow:
   *   call 1 -> POST /api/innertube (JSON with caption tracks)
   *   call 2 -> GET  captions URL   (timedtext XML)
   */
  function mockInnerTubeFlow(captionsXml: string) {
    const innerTubeResponse = {
      captions: {
        playerCaptionsTracklistRenderer: {
          captionTracks: [
            {
              baseUrl: 'https://www.youtube.com/api/timedtext?v=test&lang=en',
              languageCode: 'en',
            },
          ],
        },
      },
    }

    return vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(innerTubeResponse),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(captionsXml),
      })
  }

  it('returns TranscriptResult with correct structure (srv3 format)', async () => {
    // srv3 is what YouTube actually returns: <p t="ms" d="ms">
    const captionsXml = `<?xml version="1.0" encoding="utf-8" ?><timedtext format="3">
<body>
<p t="0" d="5000">Hello world</p>
<p t="5000" d="4000">This is a test</p>
<p t="9000" d="3000">Final segment</p>
</body>
</timedtext>`

    vi.stubGlobal('fetch', mockInnerTubeFlow(captionsXml))

    const result = await extractFromYouTube(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    )

    expect(result.segments).toHaveLength(3)
    expect(result.segments[0]).toEqual({
      text: 'Hello world',
      startTime: 0,
      endTime: 5,
    })
    expect(result.segments[1]).toEqual({
      text: 'This is a test',
      startTime: 5,
      endTime: 9,
    })
    expect(result.fullText).toBe('Hello world This is a test Final segment')
    expect(result.language).toBe('en')
    expect(result.confidence).toBe(0.95)
  })

  it('parses the legacy caption format as a fallback', async () => {
    const captionsXml = `<?xml version="1.0" encoding="utf-8"?>
<transcript>
<text start="0" dur="5">Hello world</text>
<text start="5" dur="4">This is a test</text>
</transcript>`

    vi.stubGlobal('fetch', mockInnerTubeFlow(captionsXml))

    const result = await extractFromYouTube(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    )

    expect(result.segments).toHaveLength(2)
    expect(result.segments[0].text).toBe('Hello world')
    expect(result.segments[0].endTime).toBe(5)
  })

  it('segments are ordered by startTime ascending', async () => {
    const captionsXml = `<?xml version="1.0" encoding="utf-8" ?><timedtext format="3">
<body>
<p t="5000" d="3000">Second</p>
<p t="0" d="4000">First</p>
<p t="10000" d="2000">Third</p>
</body>
</timedtext>`

    vi.stubGlobal('fetch', mockInnerTubeFlow(captionsXml))

    const result = await extractFromYouTube(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    )

    expect(result.segments[0].startTime).toBe(0)
    expect(result.segments[1].startTime).toBe(5)
    expect(result.segments[2].startTime).toBe(10)
  })

  it('throws when the video has no caption tracks', async () => {
    const mockFetch = vi.fn()
      // InnerTube returns no captions
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
      // Invidious fallback also fails
      .mockRejectedValue(new Error('Network error'))

    vi.stubGlobal('fetch', mockFetch)

    await expect(
      extractFromYouTube('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    ).rejects.toThrow(/Could not extract transcript/)
  })

  it('throws when all sources fail', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'))
    vi.stubGlobal('fetch', mockFetch)

    await expect(
      extractFromYouTube('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    ).rejects.toThrow(/Could not extract transcript/)
  })

  it('includes the underlying failure reason in the error message', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('boom-xyz'))
    vi.stubGlobal('fetch', mockFetch)

    // The error should name each source and its reason, so failures are debuggable
    await expect(
      extractFromYouTube('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    ).rejects.toThrow(/InnerTube.*boom-xyz/)
  })
})
