/* A date field that says what shape it wants, and looks like it can be opened.

   A bare <input type="date"> is a blank box on WebKit: no placeholder, and a
   calendar button that is a small grey glyph in Chrome and nothing at all in
   Safari. So an empty one reads as a text field somebody forgot to label, and
   the only way to learn it takes a date is to tap it.

   Two additions, both scoped to where they are actually missing:

   · the format hint (dd/mm/yyyy, or mm/dd/yyyy — read off the reader's own
     locale rather than assumed) is drawn over the empty control, and the
     native digit boxes are hidden underneath it. Only under
     `@supports selector(::-webkit-datetime-edit)`, because that pseudo-element
     is how the hiding is done and Firefox prints a hint of its own anyway —
     without the guard it would stack two.

   · a calendar glyph on the right, ours, with the native indicator made
     transparent and stretched across it so the tap target is the picker's own
     rather than something we have to wire up. It covers the glyph only, not
     the whole control, so typing a date still works on a desktop keyboard. */

const hint = (() => {
  const parts = new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(2000, 0, 2))
  return parts
    .map((p) =>
      p.type === 'day' ? 'dd' : p.type === 'month' ? 'mm' : p.type === 'year' ? 'yyyy' : p.value
    )
    .join('')
})()

export function DateField({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="field">
      <label className="ui-lbl" htmlFor={id}>{label}</label>
      <div className={'date-wrap' + (value ? '' : ' is-empty')}>
        <input id={id} type="date" value={value} onChange={(e) => onChange(e.target.value)} />
        <span className="date-ph" aria-hidden="true">{hint}</span>
        <svg className="date-ico" viewBox="0 0 16 16" aria-hidden="true">
          <rect x="1.5" y="3" width="13" height="11.5" rx="1.5" />
          <path d="M1.5 6.5h13M5 1.5v3M11 1.5v3" />
        </svg>
      </div>
    </div>
  )
}
