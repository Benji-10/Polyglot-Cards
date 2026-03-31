import { fontForText } from '../../lib/utils'

/**
 * Renders a field value with its phonetic annotations.
 *
 * For ruby annotations (furigana, pinyin, romaji, etc.):
 *   The field value is split character by character and ruby text is shown above.
 *   Furigana uses "kanji:reading kanji2:reading2" format from AI.
 *   All other ruby types show the annotation above the whole word.
 *
 * For non-ruby (IPA, English gloss):
 *   IPA is shown in /brackets/ after the word.
 *   English is shown as a small label below.
 */
export default function RubyText({ value, fieldKey, cardFields, phonetics = [], className = '', style = {} }) {
  if (!value) return null

  const enabledPhonetics = phonetics || []
  if (enabledPhonetics.length === 0) {
    return (
      <span className={className} style={{ ...style, fontFamily: fontForText(value) }}>
        {value}
      </span>
    )
  }

  // Separate ruby (above) from suffix/below annotations
  const rubyKeys = enabledPhonetics.filter(pk => {
    const opt = PHONETIC_META[pk]
    return opt?.ruby
  })
  const ipaKey = enabledPhonetics.includes('ipa') ? `${fieldKey}_ipa` : null
  const englishKey = enabledPhonetics.includes('english') ? `${fieldKey}_english` : null

  const ipaValue = ipaKey ? cardFields?.[ipaKey] : null
  const englishValue = englishKey ? cardFields?.[englishKey] : null

  return (
    <span className={className} style={style}>
      {/* Ruby layer — pick first available ruby annotation */}
      {rubyKeys.length > 0
        ? <RubyLayer value={value} fieldKey={fieldKey} cardFields={cardFields} rubyKeys={rubyKeys} />
        : <span style={{ fontFamily: fontForText(value) }}>{value}</span>
      }
      {/* IPA in brackets */}
      {ipaValue && (
        <span className="ml-1.5 font-mono" style={{ fontSize: '0.85em', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
          /{ipaValue}/
        </span>
      )}
      {/* English gloss below */}
      {englishValue && (
        <span className="block text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
          {englishValue}
        </span>
      )}
    </span>
  )
}

// Which phonetics render as ruby
const PHONETIC_META = {
  furigana:     { ruby: true },
  romaji:       { ruby: true },
  pinyin:       { ruby: true },
  bopomofo:     { ruby: true },
  jyutping:     { ruby: true },
  romanisation: { ruby: true },
  diacritics:   { ruby: false },
  ipa:          { ruby: false },
  english:      { ruby: false },
}

function RubyLayer({ value, fieldKey, cardFields, rubyKeys }) {
  // Try each ruby key in order and use the first that has data
  for (const pk of rubyKeys) {
    const annotationKey = `${fieldKey}_${pk}`
    const annotation = cardFields?.[annotationKey]
    if (!annotation) continue

    if (pk === 'furigana') {
      return <FuriganaRuby base={value} furigana={annotation} />
    }

    // All other ruby types: show annotation above the whole word
    return (
      <ruby style={{ fontFamily: fontForText(value), rubyAlign: 'center' }}>
        {value}
        <rp>(</rp>
        <rt style={{ fontSize: '0.6em', color: 'var(--text-secondary)', fontFamily: fontForText(annotation) }}>
          {annotation}
        </rt>
        <rp>)</rp>
      </ruby>
    )
  }

  // No annotation found — render plain
  return <span style={{ fontFamily: fontForText(value) }}>{value}</span>
}

/**
 * FuriganaRuby — parses "kanji:reading kanji2:reading2" format
 * and renders each pair as an individual <ruby> element.
 * Falls back to whole-word ruby if format doesn't match.
 */
function FuriganaRuby({ base, furigana }) {
  // Try to parse "kanji:reading" pairs
  const pairs = furigana.split(' ').map(p => {
    const colon = p.indexOf(':')
    if (colon === -1) return null
    return { kanji: p.slice(0, colon), reading: p.slice(colon + 1) }
  }).filter(Boolean)

  if (pairs.length > 0) {
    // Check that the pairs reconstruct the base reasonably
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

  // Fallback: whole-word ruby
  return (
    <ruby style={{ rubyAlign: 'center' }}>
      <span style={{ fontFamily: fontForText(base) }}>{base}</span>
      <rp>(</rp>
      <rt style={{ fontSize: '0.6em', color: 'var(--text-secondary)' }}>{furigana}</rt>
      <rp>)</rp>
    </ruby>
  )
}
