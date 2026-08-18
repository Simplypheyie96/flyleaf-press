/* The user's own Drive, used as the shelf between their devices.

   Everything here talks to ONE hidden folder — `appDataFolder` — which Google
   gives every app that asks for the `drive.appdata` scope. It does not appear
   in the Drive listing, no other app can read it, and we cannot see a single
   file outside it. From this side there is no storage bill and no ceiling,
   because none of it is ours.

   ONE FILE, WRITTEN WHOLE. The library goes up as the same single JSON
   document Settings already exports, rather than a file per review. That is
   the honest trade and it is worth naming: a shelf full of uploaded covers
   re-uploads whole each time it changes, where a per-review store would send
   only the new one. In exchange there is exactly one format in this app, one
   merge routine, and no way for a half-finished upload to leave a library
   referring to a cover that never arrived. Sync only runs when something
   actually changed, so the re-upload is per writing session, not per
   keystroke. */

const FILE_NAME = 'library.json'
const FILES = 'https://www.googleapis.com/drive/v3/files'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'

export interface DriveFile {
  id: string
  modifiedTime: string
  /** Who last wrote it — "iPhone", "Mac". Rides as Drive's own file metadata
      rather than inside the document, so "where was the last change made" is
      answered by the one metadata call `findLibrary` already makes, instead of
      by downloading the whole library, covers and all, to render a sentence.
      Absent on any file written before this existed. */
  device?: string
}

/** Drive returns custom metadata under `appProperties`, one flat string map. */
function unpack(file: DriveFile & { appProperties?: Record<string, string> }): DriveFile {
  return { id: file.id, modifiedTime: file.modifiedTime, device: file.appProperties?.device }
}

/** Turn Drive's refusal into a sentence somebody can act on. Google puts a
    machine-readable `reason` in the body of every error it returns; this reads
    it and says the corresponding human thing, falling back to the status only
    when the body is something unexpected. */
async function explain(response: Response): Promise<string> {
  let reason = ''
  try {
    const body = (await response.json()) as {
      error?: { errors?: { reason?: string }[]; message?: string }
    }
    reason = body.error?.errors?.[0]?.reason ?? ''
  } catch {
    /* An error page rather than an error object. The status still says
       something, and that is what the last line falls back to. */
  }

  if (reason === 'insufficientPermissions' || reason === 'insufficientFilePermissions')
    return 'Flyleaf Press was not given permission to use your Drive. Sign in again and leave the box ticked on Google’s screen.'
  if (reason === 'storageQuotaExceeded') return 'Your Google Drive is full, so nothing could be saved to it.'
  if (reason === 'rateLimitExceeded' || reason === 'userRateLimitExceeded')
    return 'Google asked us to slow down. The backup will try again shortly.'
  if (response.status === 403)
    return 'Google would not let Flyleaf Press into your Drive. Sign in again and leave the box ticked.'
  if (response.status >= 500) return 'Google Drive is having trouble. The backup will try again shortly.'
  return 'Your library could not reach Google Drive. Check your connection and try again.'
}

async function ask(token: string, url: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(url, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${token}` },
  })
  if (!response.ok) {
    /* 401 is the one worth naming to the CALLER: it means the hour is up, and
       it can fetch a fresh token and come back rather than reporting a break.

       Everything else is named to the READER, and "Drive said no (403)" is not
       that. A number is not something anybody can act on, and the two things a
       403 actually means here have completely different answers: either the
       Drive box was left unticked on Google's consent screen, or the Drive is
       full. Both are fixable in ten seconds by somebody told which it is. */
    if (response.status === 401) throw new Error('expired')
    throw new Error(await explain(response))
  }
  return response
}

/** The library already in this Drive, or null the first time. */
export async function findLibrary(token: string): Promise<DriveFile | null> {
  const url = `${FILES}?spaces=appDataFolder&pageSize=1&orderBy=modifiedTime desc&fields=${encodeURIComponent(
    'files(id,modifiedTime,appProperties)',
  )}&q=${encodeURIComponent(`name = '${FILE_NAME}'`)}`
  const { files } = (await (await ask(token, url)).json()) as {
    files?: (DriveFile & { appProperties?: Record<string, string> })[]
  }
  return files?.[0] ? unpack(files[0]) : null
}

export async function readLibrary(token: string, id: string): Promise<string> {
  return (await ask(token, `${FILES}/${id}?alt=media`)).text()
}

/** Write the library up, creating the file the first time and overwriting it
    after that. Overwriting is safe here in a way it would not be for most
    apps, because what goes up is always the MERGE of both sides — see sync.ts.
    Nothing is ever replaced by less than itself. */
export async function writeLibrary(
  token: string,
  body: Blob,
  device: string,
  id?: string,
): Promise<DriveFile> {
  /* Multipart both ways. The metadata half carries `appProperties.device`, and
     a media-only upload has nowhere to put it — so an update would leave
     whichever device created the file named on it forever. The create half
     additionally carries the name and, crucially, `parents: ['appDataFolder']`,
     which is what puts the file in the hidden folder rather than loose among
     somebody's own documents. A file cannot be re-parented on update, so that
     goes on the create only. */
  const meta = id
    ? { appProperties: { device } }
    : { name: FILE_NAME, parents: ['appDataFolder'], appProperties: { device } }

  const boundary = `flyleaf-press-${crypto.randomUUID()}`
  const head =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(meta)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n`
  const multipart = new Blob([head, body, `\r\n--${boundary}--`])

  const fields = 'fields=id,modifiedTime,appProperties'
  const response = await ask(
    token,
    id ? `${UPLOAD}/${id}?uploadType=multipart&${fields}` : `${UPLOAD}?uploadType=multipart&${fields}`,
    {
      method: id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body: multipart,
    },
  )
  return unpack((await response.json()) as DriveFile & { appProperties?: Record<string, string> })
}

/** Take the library back out of Drive — every file in the folder, not just the
    one we expect, so an old name or a half-written upload cannot be left
    behind claiming to be a backup.

    This exists because it could not be done by hand. `appDataFolder` is hidden
    — that is the point of it, and it is why this app can back up without
    leaving files loose among somebody's documents — but hidden also means
    Drive's own interface offers no row to delete. An app that can put a copy
    of somebody's library somewhere has to be able to take it away again, from
    inside itself, in one press.

    The library on the device is untouched. This deletes the copy. */
export async function dropLibraries(token: string): Promise<number> {
  const url = `${FILES}?spaces=appDataFolder&pageSize=100&fields=${encodeURIComponent('files(id,name)')}`
  const { files } = (await (await ask(token, url)).json()) as {
    files?: { id: string; name: string }[]
  }
  if (!files?.length) return 0
  for (const file of files) await ask(token, `${FILES}/${file.id}`, { method: 'DELETE' })
  return files.length
}
