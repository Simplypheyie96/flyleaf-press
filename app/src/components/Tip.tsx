import { useEffect, useState } from 'react'

/* The tip jar — an invitation, never a gate.

   Flyleaf Press is free and stays free; there is nothing behind this row and
   nothing withheld from anyone who scrolls past it. So it asks once, in one
   sentence, at the bottom of Settings where the About card already explains
   who made this — no banner, no interstitial, no second ask on the way out
   of a review.

   And it asks with ONE control. An amount, a second amount, a third, a box to
   type a fourth, an email field and a send button is a checkout, and a
   checkout sitting open in the settings of a free app is a shop counter in
   somebody's living room. All of that machinery still exists — it just waits
   behind the button, in the same paper slip Confirm uses, where a reader who
   has decided to give something will happily meet it.

   The row is absent entirely unless the deployment has a tip jar configured
   (`VITE_TIP_JAR=1`). A support row that opens onto an error is worse than
   no support row.

   Every number here is checked again on the server, and the payment is
   confirmed by asking Paystack rather than by trusting the browser that came
   back saying it paid. The secret key lives in `api/tip.ts` and has no route
   into this file. */

const ON = import.meta.env.VITE_TIP_JAR === '1'

/* Read by SettingsPage so it can leave the whole row out rather than
   rendering an empty slot. */
export const TIP_JAR = ON

/* What the jar offers: three amounts that read as "a coffee, a good coffee,
   and more than a coffee" without being labelled with those words — a tier
   called "generous" quietly tells everyone who picked the first one what
   they are.

   WHICH currency those amounts are in is the server's call, not this file's:
   api/tip reads the reader's country off the request and answers with the
   currency it can actually charge them in, so the number on the button is
   always the number that moves. Naira is only the opening position — shown
   until the server answers, kept if it never does (offline, or a dev server
   with no api/), and always a currency the account takes. */
interface Offer {
  currency: string
  presets: number[]
  /** the least Paystack will charge — the only bound */
  floor: number
}

const NAIRA: Offer = { currency: 'NGN', presets: [2000, 5000, 10_000], floor: 200 }

/* The reader's own locale decides where the symbol goes and how thousands
   read. `narrowSymbol` because the default spells out "NGN 1,000" for anyone
   whose locale does not treat naira as local money, and a button that says
   NGN is an invoice where one that says ₦ is a coffee. The fallback is for a
   browser that knows neither the code nor the option, which must not crash a
   payment sheet. */
const money = (n: number, code: string) => {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code,
      currencyDisplay: 'narrowSymbol',
      maximumFractionDigits: 0,
    }).format(n)
  } catch {
    return `${n.toLocaleString()} ${code}`
  }
}

/** Everything api/tip ever answers with, across its three calls. */
interface Answer {
  url?: string
  error?: string
  paid?: boolean
  amount?: number
  currency?: string
  presets?: number[]
  floor?: number
}

/** What the server said, or why it could not be read. */
type Said = { got: 'offline' } | { got: 'broken' } | { got: 'reply'; ok: boolean; body: Answer }

/* A reply that is not JSON is not a connection problem. A crashed function on
   Vercel answers with a PLAIN-TEXT 500, so `response.json()` throws on the
   body — and if that throw lands in the same catch as a genuinely dead
   network, the reader is told to check a connection that was perfectly fine.
   Being told the wrong cause of a failure is worse than being told nothing.
   So the three ways this can fail are kept apart: `fetch` rejecting is the
   only one that means the device never got out to the network; a reply that
   arrives but does not parse is our end falling over; a parsed reply is the
   server talking, whatever it has to say. */
async function askServer(path: string, init?: RequestInit): Promise<Said> {
  let reply: Response
  try {
    reply = await fetch(path, init)
  } catch {
    return { got: 'offline' }
  }
  const text = await reply.text()
  try {
    return { got: 'reply', ok: reply.ok, body: JSON.parse(text) as Answer }
  } catch {
    return { got: 'broken' }
  }
}

type Stage =
  | { at: 'asking' }
  | { at: 'opening' }
  | { at: 'checking' }
  | { at: 'thanks'; amount: number; currency: string }
  | { at: 'stuck'; why: string }

export function Tip() {
  const [open, setOpen] = useState(false)
  const [stage, setStage] = useState<Stage>({ at: 'asking' })
  const [offer, setOffer] = useState<Offer>(NAIRA)
  const [amount, setAmount] = useState(NAIRA.presets[1])
  const [custom, setCustom] = useState('')
  const [email, setEmail] = useState('')

  /* Asked once, the first time the sheet opens — not on mount, because the
     settings page has no business telling the server about readers who never
     touch the jar. Any answer that is not a well-formed offer leaves the
     naira defaults standing, which the server always accepts. */
  const [asked, setAsked] = useState(false)
  useEffect(() => {
    if (!open || asked) return
    setAsked(true)
    void askServer('/api/tip').then((said) => {
      if (said.got !== 'reply' || !said.ok) return
      const b = said.body
      if (
        typeof b.currency === 'string' &&
        Array.isArray(b.presets) &&
        b.presets.length > 0 &&
        typeof b.floor === 'number'
      ) {
        setOffer({ currency: b.currency, presets: b.presets, floor: b.floor })
        setAmount(b.presets[1] ?? b.presets[0])
      }
    })
  }, [open, asked])

  /* Coming back from checkout. Paystack returns the supporter to /settings
     with its reference on the query string; the reference is worth nothing on
     its own, so it is handed to the server, swapped for a yes or a no, and
     wiped from the address bar either way — nobody wants a payment reference
     living in their history. */
  useEffect(() => {
    if (!ON) return
    const here = new URL(window.location.href)
    const reference = here.searchParams.get('reference') ?? here.searchParams.get('trxref')
    if (!reference) return

    here.searchParams.delete('reference')
    here.searchParams.delete('trxref')
    window.history.replaceState(null, '', here.pathname + here.search)

    setStage({ at: 'checking' })
    void askServer(`/api/tip?reference=${encodeURIComponent(reference)}`).then((said) => {
      /* The careful one. A reader is standing here having just typed their
         card into Paystack, so "we could not check" must never be worded as
         "it did not work" — the money may well have moved. Only Paystack
         answering a flat no is allowed to say nothing was taken. */
      if (said.got !== 'reply' || !said.ok) {
        setStage({
          at: 'stuck',
          why: 'Could not check that payment just now. If it went through, Paystack has emailed you a receipt.',
        })
        return
      }
      setStage(
        said.body.paid
          ? { at: 'thanks', amount: said.body.amount ?? 0, currency: said.body.currency ?? 'NGN' }
          : { at: 'stuck', why: 'That payment did not go through. Nothing was taken.' },
      )
    })
  }, [])

  /* A failure on the way back has no sheet to appear in — the reader arrived
     from Paystack, not from the button — so it opens one for them. */
  useEffect(() => {
    if (stage.at === 'stuck') setOpen(true)
  }, [stage.at])

  if (!ON) return null

  /* Afterwards the row stops asking. Somebody who has just given something
     should not be looking at the same invitation they answered. */
  if (stage.at === 'thanks') {
    return (
      <div className="set-row">
        <div className="set-row-txt">
          <div className="ui-lbl">Thank you</div>
          <p>That keeps Flyleaf Press free for everyone else.</p>
        </div>
        {stage.amount > 0 && (
          <span className="set-row-note">{money(stage.amount, stage.currency)}</span>
        )}
      </div>
    )
  }

  const chosen = custom ? Number(custom) : amount
  const busy = stage.at === 'opening' || stage.at === 'checking'

  async function send() {
    /* Checked here rather than by grey-ing the button out. A primary action
       that is dead on arrival reads as a broken sheet, and "why can I not
       press this" is a worse first impression than one sentence after
       pressing it. The server checks both of these again regardless. */
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
      setStage({ at: 'stuck', why: 'Paystack needs an email to send the receipt to.' })
      return
    }
    if (!Number.isInteger(chosen) || chosen < offer.floor) {
      setStage({
        at: 'stuck',
        why: `Tips start from ${money(offer.floor, offer.currency)} — any whole amount above that.`,
      })
      return
    }

    setStage({ at: 'opening' })
    /* The currency rides with the amount: what was on the button is what gets
       charged, and the server refuses any currency the account cannot take
       rather than quietly substituting one. */
    const said = await askServer('/api/tip', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amount: chosen, email: email.trim(), currency: offer.currency }),
    })

    /* Nothing has been taken in any of these — the checkout has not opened
       yet, so nobody has typed a card number. Each one says so, because the
       first thing a person wonders when a payment screen fails is whether it
       failed after taking the money. */
    if (said.got === 'offline') {
      setStage({ at: 'stuck', why: 'No connection. Nothing has been taken — try again once you are back online.' })
      return
    }
    if (said.got === 'broken') {
      setStage({
        at: 'stuck',
        why: 'The app’s own end of the tip jar is not answering. Nothing has been taken — this one is the maker’s to fix.',
      })
      return
    }
    if (!said.ok || !said.body.url) {
      setStage({ at: 'stuck', why: said.body.error ?? 'Could not open Paystack just now.' })
      return
    }
    window.location.href = said.body.url
  }

  return (
    <>
      {/* One row, and the whole checkout behind it. */}
      <div className="set-row">
        <div className="set-row-txt">
          <div className="ui-lbl">Buy the maker a coffee</div>
          <p>Free, and stays free — this is a thank-you, never a gate.</p>
        </div>
        <button
          className="btn btn--ghost btn--sm"
          onClick={() => {
            setStage({ at: 'asking' })
            setOpen(true)
          }}
        >
          Tip
        </button>
      </div>

      {open && (
        <div
          className="share-scrim"
          onClick={(e) => e.target === e.currentTarget && !busy && setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Buy the maker a coffee"
        >
          <div className="confirm-sheet">
            <div className="ui-lbl">Buy the maker a coffee</div>
            <p>Pick an amount, and Paystack takes it from there.</p>

            <div className="tip-amounts" role="group" aria-label="Amount">
              {offer.presets.map((each) => (
                <button
                  key={each}
                  type="button"
                  className="tip-amount"
                  aria-pressed={!custom && each === amount}
                  onClick={() => {
                    setCustom('')
                    setAmount(each)
                  }}
                >
                  {money(each, offer.currency)}
                </button>
              ))}
            </div>

            <div className="field">
              <label className="ui-lbl" htmlFor="tip-other">Another amount</label>
              <input
                id="tip-other"
                type="number"
                inputMode="numeric"
                value={custom}
                min={offer.floor}
                placeholder={`In ${offer.currency}`}
                onChange={(e) => setCustom(e.target.value)}
              />
            </div>

            <div className="field">
              <label className="ui-lbl" htmlFor="tip-email">Email for the receipt</label>
              <input
                id="tip-email"
                type="email"
                value={email}
                autoComplete="email"
                placeholder="you@example.com"
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            {stage.at === 'stuck' && (
              <p className="field-hint" role="status">{stage.why}</p>
            )}

            <div className="confirm-actions">
              <button className="btn" disabled={busy} onClick={() => void send()}>
                {stage.at === 'checking'
                  ? 'Checking…'
                  : stage.at === 'opening'
                    ? 'Opening Paystack…'
                    : Number.isInteger(chosen) && chosen > 0
                      ? `Send ${money(chosen, offer.currency)}`
                      : 'Send a tip'}
              </button>
              <button className="btn btn--ghost" disabled={busy} onClick={() => setOpen(false)}>
                Cancel
              </button>
            </div>

            <p className="tip-fine">
              Paystack handles the payment and the card details — this app never sees them, and
              keeps nothing about you afterwards. Your email goes to Paystack for the receipt and
              no further. Tips are a thank-you, not a purchase, and are not refundable.
            </p>
          </div>
        </div>
      )}
    </>
  )
}
