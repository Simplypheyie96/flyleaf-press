/* First-run demo library — so the app opens looking lived-in: three months of
   finished books (June, July, and the current, still-open August), one review
   of real length with plates, and shorter entries around it. Clearable from
   Settings; every field is exactly what the real Add flow would have written. */

import { db } from './db'
import type { Review } from './types'

const c = (isbn: string) => `/covers/${isbn}.jpg`

const SEED: Omit<Review, 'id'>[] = [
  /* ── June 2026 ── */
  {
    no: 32, title: 'Pachinko', author: 'Min Jin Lee',
    finished: '2026-06-06', started: '2026-05-18',
    formats: ['Physical', 'Ebook'], rating: 4.5, isbn: '9781455563937', cover: c('9781455563937'),
    body: 'Four generations and not one of them handled carelessly. The kind of family saga that makes the century feel personal instead of historical.\n\nI read the last hundred pages in one sitting at the kitchen table and let my tea go cold.',
    plates: [], style: 'masthead', createdAt: 1,
  },
  {
    no: 33, title: 'Station Eleven', author: 'Emily St. John Mandel',
    finished: '2026-06-11', started: '2026-06-02',
    formats: ['Ebook'], rating: 4.25, isbn: '9780804172448', cover: c('9780804172448'),
    body: 'Survival is insufficient — the comic-book epigraph carries the whole novel, and the novel earns it. The airport chapters are the best thing Mandel has written.',
    plates: [], style: 'fieldnotes', createdAt: 2,
  },
  {
    no: 34, title: 'The Song of Achilles', author: 'Madeline Miller',
    series: 'Greek Retellings', seriesNo: 'Book 1',
    finished: '2026-06-17', started: '2026-06-08',
    formats: ['Physical'], rating: 4.5, isbn: '9780062060624', cover: c('9780062060624'),
    body: 'I knew how it ended. Everyone knows how it ends. It still wrecked me, which is the entire argument for retellings in one book.',
    plates: [], style: 'scrapbook', createdAt: 3,
  },
  {
    no: 35, title: 'Mexican Gothic', author: 'Silvia Moreno-Garcia',
    finished: '2026-06-24', started: '2026-06-15',
    formats: ['Ebook'], rating: 3.25, isbn: '9780525620785', cover: c('9780525620785'),
    body: 'The house is the best character and it knows it. Slower than I wanted for the first half, then the last quarter goes off like a flare.',
    plates: [], style: 'catalogue', createdAt: 4,
  },
  {
    no: 36, title: 'The Ocean at the End of the Lane', author: 'Neil Gaiman',
    finished: '2026-06-29', started: '2026-06-26',
    formats: ['Audiobook'], rating: 3.5, isbn: '9780062255655', cover: c('9780062255655'),
    body: 'A small book that remembers what being seven actually felt like — the powerlessness, not the wonder. Gaiman reading it himself is the right format.',
    plates: [], style: 'archive', createdAt: 5,
  },

  /* ── July 2026 ── */
  {
    no: 37, title: 'Piranesi', author: 'Susanna Clarke',
    finished: '2026-07-05', started: '2026-06-30',
    formats: ['Physical'], rating: 5, isbn: '9781635575637', cover: c('9781635575637'),
    body: 'The beauty of the House was immeasurable; its kindness infinite. I have not stopped thinking about this sentence since I closed the book.\n\nA perfect object. I will not be elaborating, I will simply be rereading it every winter.',
    plates: [], style: 'fieldnotes', createdAt: 6,
  },
  {
    no: 38, title: 'A Memory Called Empire', author: 'Arkady Martine',
    series: 'Teixcalaan', seriesNo: 'Book 1',
    finished: '2026-07-12', started: '2026-07-01',
    formats: ['Ebook'], rating: 4, isbn: '9781250186430', cover: c('9781250186430'),
    body: 'Space opera where the deadliest weapon is poetry and the scariest technology is memory. The imperial court politics out-plot most thrillers.',
    plates: [], style: 'catalogue', createdAt: 7,
  },
  {
    no: 39, title: 'Gideon the Ninth', author: 'Tamsyn Muir',
    series: 'The Locked Tomb', seriesNo: 'Book 1',
    finished: '2026-07-18', started: '2026-07-08',
    formats: ['Physical'], rating: 4.75, isbn: '9781250313195', cover: c('9781250313195'),
    body: 'Lesbian necromancers in a haunted palace and the funniest narrator in modern SFF. The last act reveal recontextualizes every joke that came before it.',
    plates: [], style: 'scrapbook', createdAt: 8,
  },
  {
    no: 40, title: 'The House in the Cerulean Sea', author: 'TJ Klune',
    finished: '2026-07-22', started: '2026-07-14',
    formats: ['Audiobook'], rating: 4.25, isbn: '9781250217288', cover: c('9781250217288'),
    body: 'A warm bath of a book. Sometimes that is exactly the assignment, and this one executes it without ever going saccharine. Lucy is a perfect creation.',
    plates: [], style: 'masthead', createdAt: 9,
  },
  {
    no: 41, title: 'The Fifth Season', author: 'N. K. Jemisin',
    series: 'The Broken Earth', seriesNo: 'Book 1',
    finished: '2026-07-29', started: '2026-07-04',
    formats: ['Audiobook', 'Physical'], rating: 4.75, isbn: '9780316229296', cover: c('9780316229296'),
    body: 'I put this down twice in the first fifty pages and both times it was because I did not trust it yet. The second person opening felt like a trick, the kind of formal move a book makes when it has nothing underneath. I was wrong about that, and being wrong about it turned out to be the whole point.\n\nWhat Jemisin does with structure here is the thing I keep circling back to weeks later. Three timelines you are certain are converging, and they are, but the convergence is not the reveal. The reveal is what it costs, and she makes you complicit in wanting it before she shows you the bill.\n\nThe geology is not set dressing. Every plate boundary is a political one. I listened to the back third on audio while walking and had to stop on the pavement near the end of chapter nineteen, which has happened maybe four times in my reading life.\n\nDocked a quarter because the interludes lost me twice on the page in a way they never did in my ear. A small complaint against a book that rearranged what I want out of a fantasy series.',
    plates: [
      { art: 'spread', caption: 'ch. 19, on the pavement' },
      { art: 'shelf', caption: 'the map I drew wrong' },
      { art: 'window', caption: 'my copy, mid-July' },
    ],
    style: 'archive', createdAt: 10,
  },
  {
    no: 42, title: 'Tomorrow, and Tomorrow, and Tomorrow', author: 'Gabrielle Zevin',
    finished: '2026-07-31', started: '2026-07-23',
    formats: ['Physical'], rating: 2.75, isbn: '9780593321201', cover: c('9780593321201'),
    body: 'Everyone I trust loved this and I wanted to. The game-design material sings; the people kept making choices I could not believe from the people I had been shown. Docked hard for the tragedy lever it pulls in act three.',
    plates: [], style: 'archive', createdAt: 11,
  },

  /* ── August 2026 — the current, still-open month ── */
  {
    no: 43, title: 'Babel', author: 'R. F. Kuang',
    finished: '2026-08-04', started: '2026-07-25',
    formats: ['Physical'], rating: 4, isbn: '9780063021426', cover: c('9780063021426'),
    body: 'The footnotes are load-bearing. An academic novel that is actually angry about what academies are for, and the silver-working conceit is the best magic system metaphor for extraction I have read.',
    plates: [], style: 'catalogue', createdAt: 12,
  },
  {
    no: 44, title: 'Sea of Tranquility', author: 'Emily St. John Mandel',
    finished: '2026-08-10', started: '2026-08-05',
    formats: ['Ebook', 'Audiobook'], rating: 4, isbn: '9780593321447', cover: c('9780593321447'),
    body: 'Time travel handled like chamber music — a small number of instruments, every one of them audible. The airship terminal images will stay with me.',
    plates: [], style: 'fieldnotes', createdAt: 13,
  },
  {
    no: 45, title: 'This Is How You Lose the Time War', author: 'Amal El-Mohtar & Max Gladstone',
    finished: '2026-08-15', started: '2026-08-12',
    formats: ['Physical'], rating: 5, isbn: '9781534431003', cover: c('9781534431003'),
    body: 'A love story told in taunts. I read it twice back to back, once for Red and once for Blue, and I am prepared to argue that is the intended way to read it.',
    plates: [], style: 'scrapbook', createdAt: 14,
  },
]

export async function seedIfEmpty(): Promise<void> {
  // Transaction serializes concurrent callers (StrictMode double-mounts the
  // effect in dev) so the empty-check and the write are atomic.
  await db.transaction('rw', db.reviews, async () => {
    const count = await db.reviews.count()
    if (count > 0) return
    await db.reviews.bulkAdd(SEED as Review[])
  })
}
