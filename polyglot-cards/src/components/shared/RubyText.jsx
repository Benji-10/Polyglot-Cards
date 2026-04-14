import { fontForText } from '../../lib/utils'

/**
 * RubyText — renders a field value with phonetic annotations.
 *
 * Field values are now objects:  { text: "...", furigana: "...", english: "..." }
 * Old flat string values are handled transparently for backward compat.
 */
export default function RubyText({ fieldValue, phonetics, className = '', style = {} }) {
  const { text, annotations } = resolveField(fieldValue)
  if (!text) return null

  const ph = normalise(phonetics)

  if (ph.ruby === 'none' && ph.extras.length === 0) {
    return <span className={className} style={{ ...style, fontFamily: fontForText(text) }}>{text}</span>
  }

  const rubyAnnotation = ph.ruby !== 'none' ? annotations[ph.ruby] : null
  const extras = ph.extras.map(k => ({ key: k, value: annotations[k] })).filter(e => e.value)

  return (
    <span className={className} style={style}>
      {rubyAnnotation
        ? ph.ruby === 'furigana'
          ? <FuriganaRuby base={text} furigana={rubyAnnotation} />
          : <SimpleRuby base={text} annotation={rubyAnnotation} />
        : <span style={{ fontFamily: fontForText(text) }}>{text}</span>
      }
      {extras.filter(e => e.key !== 'english').map(e => (
        <span key={e.key} className="ml-1" style={{ fontSize: '0.82em', color: 'var(--text-secondary)', fontFamily: e.key === 'ipa' ? 'monospace' : fontForText(e.value) }}>
          {e.key === 'ipa' ? `/${e.value}/` : `(${e.value})`}
        </span>
      ))}
      {extras.filter(e => e.key === 'english').map(e => (
        <span key="english" className="block text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
          {e.value}
        </span>
      ))}
    </span>
  )
}

/**
 * Resolve a field value into { text, annotations }.
 * New shape: { text: "...", annotationType: "..." }
 * Old shape: "plain string"
 */
export function resolveField(fieldValue) {
  if (!fieldValue) return { text: '', annotations: {} }
  if (typeof fieldValue === 'string') return { text: fieldValue, annotations: {} }
  if (typeof fieldValue === 'object') {
    const { text = '', ...annotations } = fieldValue
    return { text, annotations }
  }
  return { text: String(fieldValue), annotations: {} }
}

/** Get just the plain text from a field value — for search, cloze, etc. */
export function fieldText(fieldValue) {
  return resolveField(fieldValue).text
}

function normalise(phonetics) {
  if (!phonetics) return { ruby: 'none', extras: [] }
  if (Array.isArray(phonetics)) {
    const RUBY_KEYS = ['furigana','romaji','pinyin','bopomofo','jyutping','romanisation','tones','cantoneseRomanisation','hangulRomanisation','cyrillicTranslit']
    const ruby = phonetics.find(k => RUBY_KEYS.includes(k)) || 'none'
    const extras = phonetics.filter(k => !RUBY_KEYS.includes(k) || k !== ruby)
    return { ruby, extras }
  }
  return { ruby: phonetics.ruby || 'none', extras: phonetics.extras || [] }
}

function SimpleRuby({ base, annotation }) {
  return (
    <ruby style={{ fontFamily: fontForText(base), rubyAlign: 'center' }}>
      {base}
      <rp>(</rp>
      <rt style={{ fontSize: '0.6em', color: 'var(--text-secondary)', fontFamily: fontForText(annotation) }}>{annotation}</rt>
      <rp>)</rp>
    </ruby>
  )
}

function FuriganaRuby({ base, furigana }) {
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
