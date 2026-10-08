import { describe, it, expect } from 'vitest'
import { parseWebVtt } from './captionSources'

describe('parseWebVtt', () => {
  // Real payload shape captured from captions.vimeo.com
  it('parses a Vimeo WebVTT payload', () => {
    const vtt = `WEBVTT

1
00:00:05.237 --> 00:00:08.043
Here at Vimeo, there's always one thing
on our minds:

2
00:00:08.043 --> 00:00:11.022
How to make your videos look great.`

    const segments = parseWebVtt(vtt)

    expect(segments).toHaveLength(2)
    expect(segments[0].startTime).toBeCloseTo(5.237)
    expect(segments[0].endTime).toBeCloseTo(8.043)
    // Multi-line cues are joined into one segment
    expect(segments[0].text).toBe(
      "Here at Vimeo, there's always one thing on our minds:"
    )
    expect(segments[1].text).toBe('How to make your videos look great.')
  })

  it('parses MM:SS timestamps as well as HH:MM:SS', () => {
    const vtt = `WEBVTT

00:05.000 --> 00:09.500
Short form timestamp`

    const segments = parseWebVtt(vtt)
    expect(segments).toHaveLength(1)
    expect(segments[0].startTime).toBeCloseTo(5)
    expect(segments[0].endTime).toBeCloseTo(9.5)
  })

  it('accepts SRT-style comma decimals', () => {
    const vtt = `1
00:00:01,500 --> 00:00:04,000
Comma decimals`

    const segments = parseWebVtt(vtt)
    expect(segments).toHaveLength(1)
    expect(segments[0].startTime).toBeCloseTo(1.5)
  })

  it('strips markup and decodes entities', () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:03.000
<v Speaker>Tom &amp; Jerry &#39;n&#39; friends</v>`

    const segments = parseWebVtt(vtt)
    expect(segments[0].text).toBe("Tom & Jerry 'n' friends")
  })

  it('returns segments sorted by start time', () => {
    const vtt = `WEBVTT

00:00:10.000 --> 00:00:12.000
Third

00:00:01.000 --> 00:00:03.000
First

00:00:05.000 --> 00:00:07.000
Second`

    const segments = parseWebVtt(vtt)
    expect(segments.map((s) => s.text)).toEqual(['First', 'Second', 'Third'])
  })

  it('skips cues with non-positive duration', () => {
    const vtt = `WEBVTT

00:00:05.000 --> 00:00:05.000
Zero length

00:00:09.000 --> 00:00:08.000
Reversed

00:00:01.000 --> 00:00:02.000
Valid`

    const segments = parseWebVtt(vtt)
    expect(segments).toHaveLength(1)
    expect(segments[0].text).toBe('Valid')
  })

  it('returns an empty array for a payload with no cues', () => {
    expect(parseWebVtt('WEBVTT\n\nNOTE nothing here')).toEqual([])
    expect(parseWebVtt('')).toEqual([])
  })
})
