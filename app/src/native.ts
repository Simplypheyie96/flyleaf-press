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
