import { fontForText } from '../../lib/utils'

/**
 * RubyText renders a field value with phonetic annotations.
 *
 * phonetics shape (new):  { ruby: 'furigana'|'romaji'|'pinyin'|...|'none', extras: ['ipa','english','diacritics',...] }
 * phonetics shape (old):  string[] — legacy flat array, handled for backwards compat
 *
 * Ruby annotation: shown above the word using <ruby>/<rt>
 * Extras:
 *   diacritics / tones / vowel marks — shown in (parentheses) after the word
 *   ipa                              — shown in /slashes/ after the word
 *   english                          — shown on a new line below in muted text
 *   transliteration (catch-all)      — shown in (parentheses) after
 */
export default function RubyText({ value, fieldKey, cardFields, phonetics, className = '', style = {} }) {
  if (!value) return null

  // Normalise phonetics to new shape
  const ph = normalise(phonetics)

  // No annotations at all
  if (ph.ruby === 'none' && ph.extras.length === 0) {
    return <span className={className} style={{ ...style, fontFamily: fontForText(value) }}>{value}</span>
  }

  const rubyAnnotation = ph.ruby !== 'none' ? cardFields?.[`${fieldKey}_${ph.ruby}`] : null
  const extras = ph.extras.map(k => ({ key: k, value: cardFields?.[`${fieldKey}_${k}`] })).filter(e => e.value)

  return (
    <span className={className} style={style}>
      {/* Ruby layer */}
      {rubyAnnotation
        ? ph.ruby === 'furigana'
          ? <FuriganaRuby base={value} furigana={rubyAnnotation} />
          : <SimpleRuby base={value} annotation={rubyAnnotation} />
        : <span style={{ fontFamily: fontForText(value) }}>{value}</span>
      }

      {/* Inline extras (diacritics, ipa, transliterations) */}
      {extras.filter(e => e.key !== 'english').map(e => (
        <span key={e.key} className="ml-1" style={{ fontSize: '0.82em', color: 'var(--text-secondary)', fontFamily: e.key === 'ipa' ? 'monospace' : fontForText(e.value) }}>
          {e.key === 'ipa' ? `/${e.value}/` : `(${e.value})`}
        </span>
      ))}

      {/* English gloss below */}
      {extras.filter(e => e.key === 'english').map(e => (
        <span key="english" className="block text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
          {e.value}
        </span>
      ))}
    </span>
  )
}

// Normalise legacy flat-array or new object shape
function normalise(phonetics) {
  if (!phonetics) return { ruby: 'none', extras: [] }
  if (Array.isArray(phonetics)) {
    // Legacy: first ruby-capable item becomes ruby, rest become extras
    const RUBY_KEYS = ['furigana','romaji','pinyin','bopomofo','jyutping','romanisation','tones','cantoneseRomanisation','hangulRomanisation','cyrillicTranslit']
    const ruby = phonetics.find(k => RUBY_KEYS.includes(k)) || 'none'
    const extras = phonetics.filter(k => !RUBY_KEYS.includes(k) || k !== ruby)
    return { ruby, extras }
  }
  return {
    ruby: phonetics.ruby || 'none',
    extras: phonetics.extras || [],
  }
}

function SimpleRuby({ base, annotation }) {
  return (
    <ruby style={{ fontFamily: fontForText(base), rubyAlign: 'center' }}>
      {base}
      <rp>(</rp>
      <rt style={{ fontSize: '0.6em', color: 'var(--text-secondary)', fontFamily: fontForText(annotation) }}>
        {annotation}
      </rt>
      <rp>)</rp>
    </ruby>
  )
}

function FuriganaRuby({ base, furigana }) {
  // Try "kanji:reading kanji2:reading2" format
  const pairs = furigana.split(' ').map(p => {
    const c = p.indexOf(':')
    return c === -1 ? null : { kanji: p.slice(0, c), reading: p.slice(c + 1) }
  }).filter(Boolean)

  if (pairs.length > 0) {
    const reconstructed = pairs.map(p => p.kanji).join('')
    if (reconstructed === base || base.includes(reconstructed)) {
      return (
        <span>
          {pairs.map((p, i) => (
            <ruby key={i} style={{ rubyAlign: 'center' }}>
              <span style={{ fontFamily: fontForText(p.kanji) }}>{p.kanji}</span>
              <rp>(</rp>
              <rt style={{ fontSize: '0.6em', color: 'var(--text-secondary)' }}>{p.reading}</rt>
              <rp>)</rp>
            </ruby>
          ))}
        </span>
      )
    }
  }

  return <SimpleRuby base={base} annotation={furigana} />
}
