/* The demo library — three months of finished books (June, July, and the
   current, still-open August), one review of real length with plates, and
   shorter entries around it. Every field is exactly what the real Add flow
   would have written, which is what makes it worth measuring layouts against.

   THIS IS A DEV FIXTURE AND NOTHING ELSE. It loads on the dev server and
   nowhere else — there is no button for it in a build, because a shipped app
   has real users and none of them want a stranger's fourteen books: the shelf,
   the month collages and the running Nº would all describe reading that never
   happened, and a "load the demo" button sitting next to their own library is
   an invitation to wreck it. Both call sites import this file dynamically from
   inside an `import.meta.env.DEV` branch, so the prose below and the 1.9MB of
   cover art it points at are dropped from the production bundle entirely
   (verified by grepping dist — see also the drop-demo-covers plugin in
   vite.config.ts, which keeps the jpgs themselves out of the deploy). */

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

/* ── FOUR HEAVY MONTHS, so the column rule can be looked at rather than argued
   about ──────────────────────────────────────────────────────────────────────
   The months above hold five, six and three books, which is a perfectly
   ordinary shelf and exactly the wrong fixture for the one thing gridCols()
   decides: February is 10, March 12, April 16 and May 20 — the count the user
   named, the other count the user named, the tall outlier the five-column cap
   leaves behind, and the cap itself. Together with the months above they also
   put 72 books in 2026, which is the only way to see the year collage at a
   realistic size. Same dev-only rule as everything else in this file.

   The reviews are one line each on purpose. A collage cell prints the cover,
   the title, the author and the stars and never the prose, so length here would
   only be noise in a fixture that exists to be measured. */
const HEAVY: [string, string, string, number][] = [
  /* February — 10 */
  ['2026-02-02', 'Piranesi', 'Susanna Clarke', 4.5],
  ['2026-02-04', 'The Vanishing Half', 'Brit Bennett', 4],
  ['2026-02-07', 'Klara and the Sun', 'Kazuo Ishiguro', 3.75],
  ['2026-02-09', 'Hamnet', 'Maggie O’Farrell', 4.75],
  ['2026-02-13', 'The Overstory', 'Richard Powers', 4.25],
  ['2026-02-16', 'Girl, Woman, Other', 'Bernardine Evaristo', 4.5],
  ['2026-02-19', 'Normal People', 'Sally Rooney', 3.5],
  ['2026-02-22', 'Small Things Like These', 'Claire Keegan', 5],
  ['2026-02-25', 'The Remains of the Day', 'Kazuo Ishiguro', 4.75],
  ['2026-02-27', 'Beloved', 'Toni Morrison', 5],
  /* March — 12 */
  ['2026-03-01', 'A Little Life', 'Hanya Yanagihara', 4.25],
  ['2026-03-03', 'The Secret History', 'Donna Tartt', 4.5],
  ['2026-03-06', 'Never Let Me Go', 'Kazuo Ishiguro', 4],
  ['2026-03-08', 'Circe', 'Madeline Miller', 4.5],
  ['2026-03-11', 'The Goldfinch', 'Donna Tartt', 3.75],
  ['2026-03-14', 'Half of a Yellow Sun', 'Chimamanda Ngozi Adichie', 5],
  ['2026-03-17', 'Homegoing', 'Yaa Gyasi', 4.75],
  ['2026-03-19', 'Transcendent Kingdom', 'Yaa Gyasi', 4.25],
  ['2026-03-22', 'On Earth We’re Briefly Gorgeous', 'Ocean Vuong', 4],
  ['2026-03-24', 'The Sympathizer', 'Viet Thanh Nguyen', 4.25],
  ['2026-03-27', 'Severance', 'Ling Ma', 3.5],
  ['2026-03-30', 'Exit West', 'Mohsin Hamid', 4],
  /* April — 16 */
  ['2026-04-01', 'Life After Life', 'Kate Atkinson', 4.25],
  ['2026-04-03', 'The Night Circus', 'Erin Morgenstern', 3.75],
  ['2026-04-05', 'Bunny', 'Mona Awad', 3.25],
  ['2026-04-07', 'The Priory of the Orange Tree', 'Samantha Shannon', 4],
  ['2026-04-09', 'Babel', 'R. F. Kuang', 4.5],
  ['2026-04-11', 'The Poppy War', 'R. F. Kuang', 4],
  ['2026-04-13', 'Gideon the Ninth', 'Tamsyn Muir', 4.5],
  ['2026-04-15', 'The Ten Thousand Doors of January', 'Alix E. Harrow', 3.75],
  ['2026-04-17', 'Spinning Silver', 'Naomi Novik', 4.25],
  ['2026-04-19', 'Uprooted', 'Naomi Novik', 4],
  ['2026-04-21', 'The Bear and the Nightingale', 'Katherine Arden', 4.25],
  ['2026-04-23', 'Jonathan Strange & Mr Norrell', 'Susanna Clarke', 4.75],
  ['2026-04-25', 'A Deadly Education', 'Naomi Novik', 3.5],
  ['2026-04-27', 'The Starless Sea', 'Erin Morgenstern', 3.25],
  ['2026-04-29', 'Ninth House', 'Leigh Bardugo', 4],
  ['2026-04-30', 'The Atlas Six', 'Olivie Blake', 3],
  /* May — 20 */
  ['2026-05-01', 'Educated', 'Tara Westover', 4.5],
  ['2026-05-02', 'Just Kids', 'Patti Smith', 4.75],
  ['2026-05-04', 'H Is for Hawk', 'Helen Macdonald', 4.25],
  ['2026-05-05', 'The Year of Magical Thinking', 'Joan Didion', 4.5],
  ['2026-05-07', 'Wolf Hall', 'Hilary Mantel', 4.75],
  ['2026-05-08', 'Bring Up the Bodies', 'Hilary Mantel', 4.5],
  ['2026-05-10', 'The Mirror and the Light', 'Hilary Mantel', 4.25],
  ['2026-05-12', 'Lincoln in the Bardo', 'George Saunders', 3.75],
  ['2026-05-13', 'The Underground Railroad', 'Colson Whitehead', 4.5],
  ['2026-05-15', 'The Nickel Boys', 'Colson Whitehead', 4.25],
  ['2026-05-16', 'Trust', 'Hernan Diaz', 4],
  ['2026-05-18', 'Demon Copperhead', 'Barbara Kingsolver', 4.75],
  ['2026-05-19', 'Tomorrow, and Tomorrow, and Tomorrow', 'Gabrielle Zevin', 4.25],
  ['2026-05-21', 'Lessons in Chemistry', 'Bonnie Garmus', 4],
  ['2026-05-22', 'The Seven Husbands of Evelyn Hugo', 'Taylor Jenkins Reid', 3.75],
  ['2026-05-24', 'Daisy Jones & The Six', 'Taylor Jenkins Reid', 3.5],
  ['2026-05-26', 'Malibu Rising', 'Taylor Jenkins Reid', 3.25],
  ['2026-05-27', 'Yellowface', 'R. F. Kuang', 3.75],
  ['2026-05-29', 'The Wager', 'David Grann', 4.25],
  ['2026-05-31', 'Killers of the Flower Moon', 'David Grann', 4.5],
]

/* The twenty jpgs in public/covers, cycled. A fixture for measuring geometry
   needs every cell to carry real art at a real aspect; whose art it is does not
   change a single measurement. */
const COVER_POOL = [
  '9780062060624', '9780062255655', '9780063021426', '9780316229241',
  '9780316229265', '9780316229296', '9780316556347', '9780525620785',
  '9780593135204', '9780593318171', '9780593321201', '9780593321447',
  '9780804172448', '9781250186430', '9781250217288', '9781250313195',
  '9781455563937', '9781534431003', '9781635570298', '9781635575637',
]
const FORMAT_POOL: Review['formats'][] = [
  ['Physical'], ['Ebook'], ['Audiobook'], ['Physical', 'Ebook'], ['Ebook', 'Audiobook'],
]
const STYLE_POOL: Review['style'][] = [
  'archive', 'masthead', 'catalogue', 'scrapbook', 'fieldnotes', 'jacket', 'airmail',
]

const HEAVY_SEED: Omit<Review, 'id'>[] = HEAVY.map(([finished, title, author, rating], i) => {
  const isbn = COVER_POOL[i % COVER_POOL.length]
  const days = 2 + (i % 9)
  const start = new Date(`${finished}T00:00:00Z`)
  start.setUTCDate(start.getUTCDate() - days)
  return {
    no: 100 + i, title, author,
    finished, started: start.toISOString().slice(0, 10),
    formats: FORMAT_POOL[i % FORMAT_POOL.length],
    rating, isbn, cover: c(isbn),
    pages: 224 + ((i * 37) % 400),
    body: `Read in ${days} days. A fixture entry — the month it sits in is the point, not the prose.`,
    plates: [], style: STYLE_POOL[i % STYLE_POOL.length], createdAt: 100 + i,
  }
})

/* A month's hopefuls, for the same reason the reviews are here: the layouts
   are worth nothing to look at empty. Keyed to THIS month and the NEXT one so
   the fixture is still about the right months whenever it is loaded, rather
   than about a week in 2026. */
const HOPE: [string, string, string][] = [
  /* Title, author and ISBN have to agree: the cover file is named for the
     ISBN, so a mismatched triple prints somebody else's jacket and reads as a
     broken cover rather than as fixture data. The first six are books the demo
     shelf has NOT read — which is what a hopeful is. */
  ['9780316229241', 'The Stone Sky', 'N. K. Jemisin'],
  ['9780316229265', 'The Obelisk Gate', 'N. K. Jemisin'],
  ['9780316556347', 'Circe', 'Madeline Miller'],
  ['9780593135204', 'Project Hail Mary', 'Andy Weir'],
  ['9780593318171', 'Klara and the Sun', 'Kazuo Ishiguro'],
  ['9781635570298', 'The Priory of the Orange Tree', 'Samantha Shannon'],
  ['9781455563937', 'Pachinko', 'Min Jin Lee'],
  ['9780804172448', 'Station Eleven', 'Emily St. John Mandel'],
  ['9780062060624', 'The Song of Achilles', 'Madeline Miller'],
  ['9780525620785', 'Mexican Gothic', 'Silvia Moreno-Garcia'],
  ['9781635575637', 'Piranesi', 'Susanna Clarke'],
  ['9780063021426', 'Babel', 'R. F. Kuang'],
]

function monthOffset(n: number): string {
  const now = new Date()
  return new Date(Date.UTC(now.getFullYear(), now.getMonth() + n, 1)).toISOString().slice(0, 7)
}

/** Install the demo books. Dev only — see the note at the top of this file. */
export async function seedIfEmpty(): Promise<void> {
  // Transaction serializes concurrent callers (StrictMode double-mounts the
  // effect in dev) so the empty-check and the write are atomic.
  await db.transaction('rw', db.reviews, async () => {
    const count = await db.reviews.count()
    if (count > 0) return
    await db.reviews.bulkAdd([...SEED, ...HEAVY_SEED] as Review[])
  })
  /* Checked on its OWN emptiness, not the shelf's. A shelf with books on it
     already returns above, and a fixture that only ever loaded onto a blank
     device would be unreachable to anyone who has been using the dev server —
     which is precisely who wants to look at a hopefuls layout. */
  await db.transaction('rw', db.hopefuls, async () => {
    if ((await db.hopefuls.count()) > 0) return
    const here = monthOffset(0)
    const next = monthOffset(1)
    await db.hopefuls.bulkAdd(
      HOPE.map(([isbn, title, author], i) => ({
        /* seven this month, five the next — two different sizes to look at,
           and neither of them a round number that flatters the grid */
        month: i < 7 ? here : next,
        title, author, isbn, cover: c(isbn),
        pages: 288 + ((i * 53) % 320),
        createdAt: 200 + i,
      }))
    )
  })
}
