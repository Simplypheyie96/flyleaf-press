/* The store apps' unlock, checked without a store: the free styles are real
   styles, the product ids match the StoreKit test file and the Android build,
   and the web build (no Capacitor) is never locked. */
import { readFileSync } from 'node:fs'
import { STYLE_IDS } from '../src/types'
import { FREE_STYLES, PRODUCTS, TIPS, styleFree } from '../src/unlock'
import { storeApp } from '../src/native'

let bad = 0
const ok = (c: unknown, m: string) => { if (!c) { bad++; console.error('✗', m) } }

ok(FREE_STYLES.length === 2, 'two free styles')
for (const s of FREE_STYLES) ok(STYLE_IDS.includes(s), `free style ${s} exists`)
ok(STYLE_IDS.filter(styleFree).length === 2, 'every other style is locked')
ok(!storeApp, 'node is not a store app, so the web build stays unlocked')

const kit = JSON.parse(readFileSync('ios/App/App/Press.storekit', 'utf8'))
const kitIds = kit.products.map((p: { productID: string }) => p.productID).sort()
const tipIds = TIPS.map((t) => `com.feyidesigns.press.${t}`)
ok(JSON.stringify(kitIds) === JSON.stringify([...Object.values(PRODUCTS), ...tipIds].sort()), 'StoreKit file holds both products and the three tips')
const prices = Object.fromEntries(kit.products.map((p: { productID: string; displayPrice: string }) => [p.productID, p.displayPrice]))
ok(prices[PRODUCTS.unlock] === '3.99' && prices[PRODUCTS.supporter] === '7.99', 'prices 3.99 and 7.99')
ok(tipIds.map((id) => prices[id]).join() === '0.99,2.99,4.99', 'tips 0.99, 2.99 and 4.99')
ok(readFileSync('android/app/build.gradle', 'utf8').includes('applicationId "com.feyidesigns.press"'), 'Android id')
ok(Object.values(PRODUCTS).every((id) => id.startsWith('com.feyidesigns.press.')), 'product ids under the bundle id')

if (bad) process.exit(1)
console.log('unlock check: ok')
