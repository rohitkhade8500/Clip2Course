import { defineConfig } from 'vitest/config'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Browsers automatically attach Origin / Referer / Sec-Fetch-* headers to
 * fetch requests. Forwarding them to a proxy target makes the request look
 * like cross-origin browser traffic, and Google in particular answers with a
 * 403 anti-bot page. These are stripped on every proxied request.
 */
const BROWSER_HEADERS_TO_STRIP = [
  'origin',
  'referer',
  'sec-fetch-site',
  'sec-fetch-mode',
  'sec-fetch-dest',
  'sec-ch-ua',
  'sec-ch-ua-mobile',
  'sec-ch-ua-platform',
  'cookie',
]

function makeStripBrowserHeaders(userAgent: string) {
  return (proxy: {
    on: (
      event: string,
      cb: (proxyReq: {
        removeHeader: (name: string) => void
        setHeader: (name: string, value: string) => void
      }) => void
    ) => void
  }) => {
    proxy.on('proxyReq', (proxyReq) => {
      for (const header of BROWSER_HEADERS_TO_STRIP) {
        proxyReq.removeHeader(header)
      }
      proxyReq.setHeader('user-agent', userAgent)
    })
  }
}

/**
 * Express backend that owns `/api/auth/*`. Matches the default in
 * `server/src/config.ts`; override with SERVER_PORT if that server runs
 * elsewhere.
 */
const AUTH_SERVER_TARGET = `http://localhost:${process.env.SERVER_PORT ?? 3001}`

const ANDROID_UA =
  'com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip'
const GENERIC_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

/**
 * Rejects targets that could be used to reach the machine's own network.
 * The generic fetch endpoint takes an arbitrary URL, so it needs an SSRF guard.
 */
function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase()

  if (
    h === 'localhost' ||
    h === '::1' ||
    h.endsWith('.localhost') ||
    h.endsWith('.internal') ||
    h.endsWith('.local')
  ) {
    return true
  }

  // IPv4 private / loopback / link-local ranges
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])]
    if (a === 127 || a === 0 || a === 10) return true
    if (a === 169 && b === 254) return true // link-local (cloud metadata)
    if (a === 192 && b === 168) return true
    if (a === 172 && b >= 16 && b <= 31) return true
  }

  return false
}

/**
 * Dev-only passthrough that fetches an arbitrary media/caption URL server-side.
 *
 * Needed because direct video files and Vimeo/Dailymotion caption URLs are
 * signed, live on hosts we can't know ahead of time, and mostly lack CORS
 * headers. Range requests are forwarded so large media stays streamable.
 *
 * Usage: /api/fetch?url=<encoded absolute https url>
 */
function mediaFetchPlugin(): Plugin {
  return {
    name: 'clip2course-media-fetch',
    configureServer(server) {
      server.middlewares.use('/api/fetch', async (req, res) => {
        try {
          const requestUrl = new URL(req.url ?? '', 'http://internal')
          const target = requestUrl.searchParams.get('url')

          if (!target) {
            res.statusCode = 400
            res.end('Missing "url" query parameter')
            return
          }

          let parsed: URL
          try {
            parsed = new URL(target)
          } catch {
            res.statusCode = 400
            res.end('Malformed target URL')
            return
          }

          if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
            res.statusCode = 400
            res.end('Only http and https targets are allowed')
            return
          }

          if (isBlockedHost(parsed.hostname)) {
            res.statusCode = 403
            res.end('Target host is not allowed')
            return
          }

          const headers: Record<string, string> = { 'user-agent': GENERIC_UA }
          // Forward Range so the browser can stream/seek large video files
          const range = req.headers['range']
          if (typeof range === 'string') headers['range'] = range

          const upstream = await fetch(parsed.toString(), {
            headers,
            redirect: 'follow',
          })

          res.statusCode = upstream.status
          const contentType = upstream.headers.get('content-type')
          const contentLength = upstream.headers.get('content-length')
          const acceptRanges = upstream.headers.get('accept-ranges')
          const contentRange = upstream.headers.get('content-range')

          if (contentType) res.setHeader('content-type', contentType)
          if (contentLength) res.setHeader('content-length', contentLength)
          if (acceptRanges) res.setHeader('accept-ranges', acceptRanges)
          if (contentRange) res.setHeader('content-range', contentRange)
          res.setHeader('access-control-allow-origin', '*')

          const body = Buffer.from(await upstream.arrayBuffer())
          res.end(body)
        } catch (error) {
          res.statusCode = 502
          res.end(
            `Upstream fetch failed: ${
              error instanceof Error ? error.message : String(error)
            }`
          )
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), mediaFetchPlugin()],
  // transformers.js ships large wasm/onnx assets; keep them out of the dep scan
  optimizeDeps: {
    exclude: ['@huggingface/transformers'],
  },
  server: {
    proxy: {
      // --- YouTube ---
      // InnerTube player API. The ANDROID client is used because WEB-client
      // caption URLs return empty bodies.
      '/api/innertube': {
        target: 'https://www.youtube.com',
        changeOrigin: true,
        rewrite: () =>
          '/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8',
        configure: makeStripBrowserHeaders(ANDROID_UA),
      },
      '/api/youtube-timedtext': {
        target: 'https://www.youtube.com',
        changeOrigin: true,
        rewrite: (path) =>
          path.replace(/^\/api\/youtube-timedtext/, '/api/timedtext'),
        configure: makeStripBrowserHeaders(ANDROID_UA),
      },

      // --- Vimeo ---
      // /video/{id}/config exposes title, duration and caption tracks with no token
      '/api/vimeo': {
        target: 'https://player.vimeo.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/vimeo/, ''),
        configure: makeStripBrowserHeaders(GENERIC_UA),
      },

      // --- Dailymotion ---
      // /player/metadata/video/{id} exposes title, duration and subtitles
      '/api/dailymotion': {
        target: 'https://www.dailymotion.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/dailymotion/, ''),
        configure: makeStripBrowserHeaders(GENERIC_UA),
      },

      // --- Invidious (YouTube fallback) ---
      '/api/invidious': {
        target: 'https://inv.nadeko.net',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/invidious/, ''),
        configure: makeStripBrowserHeaders(GENERIC_UA),
      },

      // --- Auth backend (Express) ---
      // Deliberately plain: no path rewrite (the server already serves
      // /api/auth/*), no header stripping, and changeOrigin left off. The
      // caption proxies above strip Cookie and Origin to look less like a
      // browser; doing that here would drop the session and CSRF cookies the
      // whole feature depends on. Serving auth through the dev origin also
      // keeps the cookies same-site (Requirement 6).
      '/api/auth': {
        target: AUTH_SERVER_TARGET,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // The server workspace has its own Node-environment Vitest project; its
    // tests must not be collected by the client (jsdom) run.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
})
