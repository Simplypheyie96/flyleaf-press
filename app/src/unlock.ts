import { useSyncExternalStore } from 'react'
import { androidApp, storeApp } from './native'
import type { StyleId } from './types'

/* The store apps' one purchase. Free: write and share reviews in two card
   styles. The unlock adds every style, month and year collages, PDF and image
   plates — bought once, kept for good, restored on a new phone. Supporter, an
   older second price for the same unlock, still counts for whoever owns it but
   is no longer sold: after the unlock, thanks come as tips instead.

   The web app sells nothing (its tip jar stays), so off the store apps
   everything is open and none of this is consulted.

   There is no account and no server, so ownership is checked on the device:
   StoreKit 2 hands over only transactions it has verified, and Play Billing
   reports purchaseState. The answer is cached so the app opens unlocked
   offline, and asked again at every launch so a refund locks it. When the app
   signs in to the Flyleaf account (api.flyleaf.cc, which the eReader uses),
   the receipt can go there instead and one unlock can open all three apps. */

export const FREE_STYLES: readonly StyleId[] = ['archive', 'masthead']
export const PRODUCTS = {
  unlock: 'com.feyidesigns.press.unlock',
  supporter: 'com.feyidesigns.press.supporter',
} as const
export type Product = keyof typeof PRODUCTS
const OURS: string[] = Object.values(PRODUCTS)

const KEY = 'press.unlocked'
const read = () => {
  try { return localStorage.getItem(KEY) === '1' } catch { return false }
}
let unlocked = !storeApp || read()
const listeners = new Set<() => void>()
function set(v: boolean) {
  if (!storeApp || v === unlocked) return
  unlocked = v
  try { localStorage.setItem(KEY, v ? '1' : '0') } catch { /* private mode: holds for this launch */ }
  listeners.forEach((f) => f())
}

export function useUnlocked(): boolean {
  return useSyncExternalStore(
    (f) => { listeners.add(f); return () => listeners.delete(f) },
    () => unlocked,
  )
}

export const styleFree = (id: StyleId) => FREE_STYLES.includes(id)

const plugin = () => import('@capgo/native-purchases')

type Tx = { productIdentifier: string; purchaseState?: string; isAcknowledged?: boolean; purchaseToken?: string; revocationDate?: string }
/* Android: "1" is PURCHASED (a pending cash payment is "2" and unlocks nothing
   yet). iOS: the plugin returns only verified transactions; a refund sets the
   revocation date. */
const counts = (t: Tx) =>
  OURS.includes(t.productIdentifier) && (androidApp ? t.purchaseState === '1' : !t.revocationDate)

/* Play refunds an unacknowledged purchase after three days. */
async function acknowledge(t: Tx) {
  if (!androidApp || t.isAcknowledged || !t.purchaseToken) return
  const { NativePurchases } = await plugin()
  await NativePurchases.acknowledgePurchase({ purchaseToken: t.purchaseToken }).catch(() => {})
}

async function owned(): Promise<boolean> {
  const { NativePurchases, PURCHASE_TYPE } = await plugin()
  const { purchases } = await NativePurchases.getPurchases(
    androidApp ? { productType: PURCHASE_TYPE.INAPP } : { onlyCurrentEntitlements: true })
  const ours = purchases.filter(counts)
  await Promise.all(ours.map(acknowledge))
  return ours.length > 0
}

/** At launch: ask the store again, and listen for purchases it settles later
    (Ask to Buy, a slow bank, cash at a shop). Offline keeps the cached answer. */
export async function checkUnlock() {
  if (!storeApp) return
  try { set(await owned()) } catch { /* offline or no store account */ }
  const { NativePurchases } = await plugin()
  await NativePurchases.addListener('transactionUpdated', (t) => {
    if (counts(t)) { set(true); void acknowledge(t) }
  })
}

/** Prices as the reader's storefront writes them. Empty until the store answers. */
export async function prices(): Promise<Partial<Record<Product, string>>> {
  const { NativePurchases, PURCHASE_TYPE } = await plugin()
  const { products } = await NativePurchases.getProducts({ productIdentifiers: OURS, productType: PURCHASE_TYPE.INAPP })
  const out: Partial<Record<Product, string>> = {}
  for (const p of products) {
    const k = (Object.keys(PRODUCTS) as Product[]).find((k) => PRODUCTS[k] === p.identifier)
    if (k) out[k] = p.priceString
  }
  return out
}

/** True once the purchase has gone through. A cancelled sheet throws; the
    caller tells that apart from a failure by `cancelled()`. */
export async function buy(p: Product): Promise<boolean> {
  const { NativePurchases, PURCHASE_TYPE } = await plugin()
  let t
  try {
    t = await NativePurchases.purchaseProduct({
      productIdentifier: PRODUCTS[p], productType: PURCHASE_TYPE.INAPP, quantity: 1,
    })
  } catch (e) {
    // Already owned, or bought despite the error: the store's own record decides.
    if (cancelled(e)) throw e
    const { purchases } = await NativePurchases.getPurchases(
      androidApp ? { productType: PURCHASE_TYPE.INAPP } : {}).catch(() => ({ purchases: [] as Tx[] }))
    t = purchases.find((x) => x.productIdentifier === PRODUCTS[p] && counts(x))
    if (!t) throw e
  }
  const ok = counts(t)
  if (ok) set(true)
  return ok
}

/* Tips: consumables that open nothing. The store charges, the app says thank
   you, and the purchase is finished on the spot so it can be given again. */
export const TIPS = ['tip1', 'tip2', 'tip3'] as const
export type Tip = (typeof TIPS)[number]
const tipId = (t: Tip) => `com.feyidesigns.press.${t}`

/** Tip prices as the reader's storefront writes them. Empty if the store can't answer. */
export async function tipPrices(): Promise<Partial<Record<Tip, string>>> {
  const { NativePurchases, PURCHASE_TYPE } = await plugin()
  const { products } = await NativePurchases.getProducts({ productIdentifiers: TIPS.map(tipId), productType: PURCHASE_TYPE.INAPP })
  const out: Partial<Record<Tip, string>> = {}
  for (const p of products) {
    const t = TIPS.find((t) => tipId(t) === p.identifier)
    if (t) out[t] = p.priceString
  }
  return out
}

/** True once paid, false if the reader backed out. */
export async function giveTip(t: Tip): Promise<boolean> {
  const { NativePurchases, PURCHASE_TYPE } = await plugin()
  try {
    await NativePurchases.purchaseProduct({ productIdentifier: tipId(t), productType: PURCHASE_TYPE.INAPP, quantity: 1, isConsumable: true })
    return true
  } catch (e) {
    if (cancelled(e)) return false
    throw e
  }
}

export const cancelled = (e: unknown) => /cancel/i.test(String((e as { message?: string; code?: string })?.code ?? '') + String((e as Error)?.message ?? ''))

/** Restore purchases: syncs with the store, then reads ownership again. */
export async function restore(): Promise<boolean> {
  const { NativePurchases } = await plugin()
  // The sync can fail on its own (TestFlight's AppStore.sync throws), but what
  // this phone already holds still reads, so the failure only counts when nothing turns up.
  const failed = await NativePurchases.restorePurchases().then(() => null, (e: unknown) => e)
  const has = await owned()
  if (!has && failed) throw failed
  set(has)
  return has
}
