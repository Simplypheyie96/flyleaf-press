import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

import { execSync } from 'node:child_process'
import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'

/* Which build this is. package.json's version is bumped by hand and so says
   nothing about most deploys — two different builds both call themselves
   0.2.0, and then there is no way to look at a running app and tell whether
   it picked up the last push. The commit is the thing that changes every
   time. Vercel puts it in the environment; locally we ask git; a tarball with
   neither gets an honest 'local'. */
const COMMIT =
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ??
  (() => {
    try {
      return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
        .toString().trim()
    } catch {
      return 'local'
    }
  })()

import pkg from './package.json'

/* The demo covers live in public/ so the dev server can serve them at the
   /covers/ paths the fixture stores. Nothing in a build ever asks for them —
   the fixture itself is gone from the bundle — so shipping 1.9MB of jpgs to
   the edge would be dead weight on every deploy. Dropped after the bundle is
   written, which is also after the service worker has been generated, so the
   precache manifest is unaffected. */
function dropDemoCovers() {
  return {
    name: 'drop-demo-covers',
    apply: 'build' as const,
    enforce: 'post' as const,
    async closeBundle() {
      await rm(resolve(__dirname, 'dist/covers'), { recursive: true, force: true })
    },
  }
}

export default defineConfig({
  /* one source of truth for the version — package.json — so the About card
     can't drift from what was actually released */
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify(COMMIT),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      /* src/pwa.ts registers the worker instead of the plugin's injected
         snippet — holding the registration is the only way to offer a
         "Check for updates" button, since without it there is nothing to
         call .update() on. */
      injectRegister: null,
      /* No includeAssets: globPatterns below already sweeps everything
         copied out of public/, so listing the icons here as well put each
         one into the precache manifest twice. */
      manifest: {
        id: '/',
        name: 'Flyleaf Press',
        short_name: 'Flyleaf',
        description: 'Write long book reviews and share them whole, as printed cards — and every month as a collage.',
        lang: 'en',
        dir: 'ltr',
        categories: ['books', 'lifestyle', 'productivity'],
        theme_color: '#F4F2ED',
        background_color: '#F4F2ED',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-256.png', sizes: '256x256', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-384.png', sizes: '384x384', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          /* the mark sits small in these two so Android's circle crop can't
             clip a petal off */
          { src: 'icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Add a book', short_name: 'Add', url: '/add' },
          { name: 'This month’s collage', short_name: 'Collage', url: '/collage' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,jpg,woff2}'],
        /* the iOS launch images are a megabyte the app never reads — Safari
           fetches them itself at install time, so they stay out of precache.
           The demo covers are not in the deploy at all (see dropDemoCovers
           below); this keeps them out of the manifest on the dev-adjacent
           builds too, so the two can never disagree. */
        /* og.png is the link-preview card — it is fetched by other people's
           servers, never by the app, so precaching it would be 47KB of
           offline storage for an image no client will ever ask for. */
        globIgnores: ['**/splash/**', '**/covers/**', '**/og-*.png'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-css' },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-files',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
    dropDemoCovers(),
  ],
})
