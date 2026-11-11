/* The store apps (Capacitor, `ios/` and `android/`): the same app in a webview,
   bundled from dist/. What a webview can't do the way a browser does is routed
   here, and nothing here runs on the web — the plugins load only inside the apps.

   - Files leave through the system share sheet. Android's WebView has no Web
     Share and drops `<a download>`; iOS's WKWebView has no download at all. So
     Share writes to the cache and hands files to the native sheet; Save image
     goes straight to Photos / the gallery (savePhotos).
   - The status bar follows the chrome theme, since the page runs under it. */
const platform = (globalThis as { Capacitor?: { getPlatform?: () => string } }).Capacitor?.getPlatform?.()
export const iosApp = platform === 'ios'
export const androidApp = platform === 'android'
export const storeApp = iosApp || androidApp
export const STORE = androidApp ? 'Google Play' : 'the App Store'
/* The store apps are Bookprint; the web keeps the Flyleaf Press name and rosette. */
export const BRAND = storeApp ? 'Bookprint' : 'Flyleaf Press'
/** What the account and its messages are called: the store apps never name Flyleaf. */
export const SERVICE = storeApp ? 'Bookprint' : 'Flyleaf'

if (storeApp) document.documentElement.classList.add('store-app')

const base64 = (b: Blob) =>
  new Promise<string>((ok, no) => {
    const r = new FileReader()
    r.onload = () => ok((r.result as string).split(',')[1])
    r.onerror = () => no(r.error)
    r.readAsDataURL(b)
  })

/** Hands files to the native share sheet. False when the reader closed it. */
export async function shareFiles(files: File[], title: string): Promise<boolean> {
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/share'),
  ])
  const uris = await Promise.all(files.map(async (f) =>
    (await Filesystem.writeFile({ path: f.name, data: await base64(f), directory: Directory.Cache })).uri))
  try {
    await Share.share({ title, files: uris })
    return true
  } catch {
    /* closing the sheet rejects; it is not an error */
    return false
  }
}

/** Save image in the store apps: straight into Photos (iOS) or the gallery's
    Bookprint album (Android), no sheet. A local plugin (GalleryPlugin in
    ios/App/App/SceneDelegate.swift and android/.../GalleryPlugin.java).
    'unavailable' on Android 9 and older, where the caller falls back to the
    share sheet; throws with a sentence fit to show when the phone refuses. */
export async function savePhotos(files: File[]): Promise<'saved' | 'unavailable'> {
  const { registerPlugin } = await import('@capacitor/core')
  const Gallery = registerPlugin<{ save(o: { data: string; name: string }): Promise<void> }>('Gallery')
  try {
    for (const f of files) await Gallery.save({ data: await base64(f), name: f.name.replace(/\.png$/, '') })
    return 'saved'
  } catch (e) {
    if ((e as { code?: string }).code === 'UNIMPLEMENTED' || (e as { code?: string }).code === 'UNAVAILABLE') return 'unavailable'
    throw new Error((e as Error).message || 'Could not save the image.')
  }
}

export async function statusBar(theme: 'light' | 'dark') {
  if (!storeApp) return
  const { SystemBars, SystemBarsStyle } = await import('@capacitor/core')
  await SystemBars.setStyle({ style: theme === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => {})
}

/* ── Sign-in ───────────────────────────────────────────────────────────── */

/* Google's web button cannot run in a webview, so the apps sign in natively
   (ported from Octavo). On iOS guideline 4.8 asks for Sign in with Apple beside
   it. The web client is the server client, so Google's ID token is addressed to
   the id the API already accepts. Google on iOS also needs its own iOS client
   (VITE_GOOGLE_IOS, reversed in Info.plist); without one iOS offers Apple only. */
export type Provider = 'google' | 'apple'
const GOOGLE_WEB = import.meta.env?.VITE_GOOGLE_CLIENT_ID ?? ''
const GOOGLE_IOS = import.meta.env?.VITE_GOOGLE_IOS ?? ''
export const providers: Provider[] = iosApp ? (GOOGLE_IOS ? ['apple', 'google'] : ['apple']) : ['google']

let social: Promise<typeof import('@capgo/capacitor-social-login').SocialLogin> | null = null
function login() {
  return social ??= import('@capgo/capacitor-social-login').then(async ({ SocialLogin }) => {
    await SocialLogin.initialize(iosApp
      ? { apple: {}, ...(GOOGLE_IOS && { google: { iOSClientId: GOOGLE_IOS, iOSServerClientId: GOOGLE_WEB } }) }
      : { google: { webClientId: GOOGLE_WEB } })
    return SocialLogin
  }, (e) => { social = null; throw e })
}

/** The provider's ID token, or null when the reader closed the sheet. Whatever
    else goes wrong reads as one plain line: the system's own error text (codes,
    domains) goes to the console, never to the reader. */
export async function signIn(p: Provider): Promise<string | null> {
  try {
    const s = await login()
    const r = await s.login(p === 'google' ? { provider: 'google', options: {} } : { provider: 'apple', options: { scopes: ['email', 'name'] } })
    const token = (r.result as { idToken?: string | null }).idToken
    if (token) return token
  } catch (e) {
    if ((e as { code?: string }).code === 'USER_CANCELLED') return null
    console.error('sign-in', p, e)
    // Android with no Google account on the phone: trying again cannot help, adding one does.
    if (/no credentials/i.test((e as Error)?.message ?? '')) throw new Error('Add a Google account in this phone’s Settings, then try again.')
  }
  throw new Error(`${p === 'apple' ? 'Apple' : 'Google'} sign-in did not finish. Try again.`)
}

/** A fresh Apple authorization code, so deleting an Apple account can revoke its sign-in. */
export async function appleCode(): Promise<string> {
  const s = await login()
  const r = await s.login({ provider: 'apple', options: { scopes: [] } }).catch(() => null)
  // The plugin's default (legacy) mode hands the code back as accessToken.token.
  const res = r?.result as { authorizationCode?: string; accessToken?: { token?: string } } | undefined
  const code = res?.authorizationCode || res?.accessToken?.token
  if (!code) throw new Error('Confirm with Apple to delete the account.')
  return code
}
