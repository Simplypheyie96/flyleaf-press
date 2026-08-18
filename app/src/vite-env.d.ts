/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/** package.json's version, stamped in at build time — the About card prints it
    so a bug report can say which build it came from. */
declare const __APP_VERSION__: string
declare const __APP_COMMIT__: string

interface ImportMetaEnv {
  /** Google OAuth client ID. Public by design — a client ID is not a
      credential, and there is no client secret anywhere in this app. Unset in
      a build means the Drive backup hides itself entirely. */
  readonly VITE_GOOGLE_CLIENT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
