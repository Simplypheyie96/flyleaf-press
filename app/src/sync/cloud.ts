/* The Flyleaf account: signed in once per device, and then left alone.

   WHY THIS REPLACED DRIVE. Drive sync ran on Google access tokens, which live
   an hour and can only be renewed through a popup that iOS and the installed
   app refuse to open by themselves. So every phone fell out of sync about an
   hour after it was last touched, and showed "Paused" until somebody signed in
   to Google again.

   Now Google is asked one thing, once: who is this. Its ID token goes to the
   Flyleaf Worker (api.flyleaf.cc, shared with Flyleaf Journal), which checks it
   and hands back a session of its own. That session is kept here, slides
   forward every day it is used, and lasts 400 days past the last use. Only two
   things end it: "Sign out", or the server answering 401. A dropped
   connection, a closed app, a week away: none of them signs anybody out.

   The library itself is kept on Flyleaf's servers (Cloudflare D1 and R2), one
   document per reader, merged on the devices, never read on the server. */

import { loadScript } from './google'

const API = import.meta.env.VITE_FLYLEAF_API || 'https://api.flyleaf.cc'
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''
const APP = 'press'
const KEY = 'flyleaf-press-cloud'

/** Fired whenever anything a Settings row displays has moved. */
export const SYNC_EVENT = 'flyleaf-press-sync'

/** No client ID built in means no working sign-in, so the feature hides itself
    rather than offering a button that opens onto an error. */
export const SYNC_AVAILABLE = CLIENT_ID.length > 0

interface Session {
  token: string
  email: string
  name: string
}

function session(): Session | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

function keep(s: Session | null) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s))
    else localStorage.removeItem(KEY)
  } catch {
    /* Private mode: signed in for as long as this page is open, and no longer. */
  }
  window.dispatchEvent(new Event(SYNC_EVENT))
}

/** Is this device signed in to a Flyleaf account? */
export function optedIn(): boolean {
  return session() !== null
}

/** The address it is signed in as, so two devices can be seen to match. */
export function account(): string {
  return session()?.email ?? ''
}

/** Thrown when the server no longer knows the session. The only way out. */
export const SIGNED_OUT = 'signed-out'

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const s = session()
  if (!s) throw new Error(SIGNED_OUT)
  let res: Response
  try {
    res = await fetch(API + path, {
      ...init,
      headers: { ...init.headers, authorization: `Bearer ${s.token}` },
    })
  } catch {
    throw new Error('Could not reach Flyleaf. Check your connection and it will catch up by itself.')
  }
  if (res.status === 401) {
    keep(null)
    throw new Error(SIGNED_OUT)
  }
  if (res.status >= 500) throw new Error('Flyleaf could not sync just now. It will try again by itself.')
  return res
}

/* ── Signing in ─────────────────────────────────────────────────────────── */

/** Google's own button, drawn into `el`. Its press opens Google's chooser; the
    answer is exchanged for a Flyleaf session before `done` hears about it. */
export async function googleButton(el: HTMLElement, done: (email: string) => void, fail: (message: string) => void) {
  await loadScript()
  const gis = window.google?.accounts?.id
  if (!gis) throw new Error('Could not reach Google. Check your connection and try again.')
  gis.initialize({
    client_id: CLIENT_ID,
    ux_mode: 'popup',
    auto_select: false,
    itp_support: true,
    callback: ({ credential }) => {
      if (!credential) return fail('Google did not say who you are. Try again.')
      void exchange(credential).then(done, (error: Error) => fail(error.message))
    },
  })
  const dark = document.documentElement.dataset.theme === 'dark'
    || (document.documentElement.dataset.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches)
  el.replaceChildren()
  gis.renderButton(el, {
    theme: dark ? 'filled_black' : 'outline',
    size: 'large',
    shape: 'pill',
    text: 'continue_with',
    logo_alignment: 'center',
    width: Math.min(400, Math.max(200, Math.round(el.clientWidth))),
  })
}

async function exchange(credential: string): Promise<string> {
  let res: Response
  try {
    res = await fetch(`${API}/auth/google`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ credential, app: APP }),
    })
  } catch {
    throw new Error('Could not reach Flyleaf. Check your connection and try again.')
  }
  if (!res.ok) throw new Error('Google signed you in, but Flyleaf could not. Try again.')
  const { token, user } = (await res.json()) as { token: string; user: { email: string; name: string } }
  keep({ token, email: user.email, name: user.name })
  return user.email
}

export async function signOut() {
  try {
    await call('/auth/out', { method: 'POST' })
  } catch {
    /* Offline, or already gone. Either way this device forgets it now. */
  }
  window.google?.accounts?.id?.disableAutoSelect()
  keep(null)
}

/* ── The library ────────────────────────────────────────────────────────── */

export interface Remote {
  rev: number
  at: number
  device: string
  /** Missing when it is the revision this device already holds. */
  text?: string
}

function meta(res: Response): Omit<Remote, 'text'> {
  return {
    rev: Number(res.headers.get('x-rev')) || 0,
    at: Number(res.headers.get('x-at')) || 0,
    device: res.headers.get('x-device') ?? '',
  }
}

/** The library in the account, or only its stamp when it is still `known`.
    Null when the account has none. */
export async function pull(known: number): Promise<Remote | null> {
  const res = await call(`/doc/${APP}`, { headers: { 'x-rev': String(known) } })
  if (res.status === 404) return null
  if (res.status === 204) return meta(res)
  return { ...meta(res), text: await res.text() }
}

/** When and where the account's library was last written, without its rows. */
export async function peek(): Promise<Omit<Remote, 'text'> | null> {
  const res = await call(`/doc/${APP}`, { method: 'HEAD' })
  return res.status === 404 ? null : meta(res)
}

/** Write a revision on top of `base`. Null when another device got there first. */
export async function push(body: Blob, base: number, device: string): Promise<{ rev: number; at: number } | null> {
  const res = await call(`/doc/${APP}`, {
    method: 'PUT',
    body,
    headers: { 'content-type': 'application/json', 'x-rev': String(base), 'x-device': device },
  })
  if (res.status === 409) return null
  if (res.status === 413) throw new Error('This library has grown past what one sync can carry.')
  if (!res.ok) throw new Error('Flyleaf could not sync just now. It will try again by itself.')
  return (await res.json()) as { rev: number; at: number }
}

/** Send whichever of these images the account does not hold yet. */
export async function sendMedia(media: Map<string, Blob>) {
  const all = [...media.keys()]
  for (let i = 0; i < all.length; i += 2000) {
    const res = await call('/media/missing', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hashes: all.slice(i, i + 2000) }),
    })
    const { missing } = (await res.json()) as { missing: string[] }
    for (const hash of missing) {
      const blob = media.get(hash)!
      const up = await call(`/media/${hash}?app=${APP}`, {
        method: 'PUT',
        body: blob,
        headers: { 'content-type': blob.type || 'application/octet-stream' },
      })
      if (up.status === 413) throw new Error('Your covers have filled the 1 GB Flyleaf keeps for each reader.')
      if (!up.ok) throw new Error('A cover did not upload. Flyleaf will try again by itself.')
    }
  }
}

export async function fetchMedia(hash: string): Promise<Blob> {
  const res = await call(`/media/${hash}`)
  if (!res.ok) throw new Error('A cover did not come down. Flyleaf will try again by itself.')
  return res.blob()
}

/** Close the Flyleaf account: every app's copy, its media, the purchase records
    (the store keeps the purchase, so Restore brings it back), every session. */
export async function deleteAccount() {
  const res = await call('/me', { method: 'DELETE' })
  if (!res.ok) throw new Error('That could not be deleted. Try again.')
  window.google?.accounts?.id?.disableAutoSelect()
  keep(null)
}

/** Delete the library and every cover from the account. */
export async function drop() {
  const res = await call(`/doc/${APP}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('That could not be removed. Try again.')
}
