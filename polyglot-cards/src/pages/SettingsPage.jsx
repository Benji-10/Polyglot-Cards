import { useState } from 'react'
import { useAppStore, applyTheme, PRESET_THEMES, DEFAULT_QUICK_ADD, DEFAULT_CUSTOM_THEME, CUSTOM_THEME_KEYS } from '../store/appStore'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../components/shared/Toast'
import { LANGUAGES } from '../lib/utils'

const QUICK_ADD_RUBY_OPTIONS = [
  {key:'none',label:'None'},{key:'furigana',label:'Furigana'},{key:'romaji',label:'Rōmaji'},
  {key:'pinyin',label:'Pīnyīn'},{key:'bopomofo',label:'Bopomofo'},{key:'jyutping',label:'Jyutping'},
  {key:'hangulRomanisation',label:'Hangul romanisation'},{key:'romanisation',label:'Romanisation'},
  {key:'cyrillicTranslit',label:'Cyrillic translit'},{key:'cantoneseRomanisation',label:'Cantonese romanisation'},{key:'tones',label:'Tones'},
]
const QUICK_ADD_EXTRA_OPTIONS = [
  {key:'diacritics',label:'Diacritics'},{key:'ipa',label:'IPA'},{key:'english',label:'English gloss'},
]

function normalisePhonetics(ph) {
  if (!ph) return {ruby:'none',extras:[]}
  if (Array.isArray(ph)) {
    const ruby = ph.find(k=>QUICK_ADD_RUBY_OPTIONS.some(opt=>opt.key===k&&k!=='none'))||'none'
    const extras = ph.filter(k=>k&&k!=='none'&&k!==ruby)
    return {ruby,extras}
  }
  return {ruby:ph.ruby||'none',extras:ph.extras||[]}
}

export default function SettingsPage() {
  const { settings, updateSettings } = useAppStore()
  const { user, logout } = useAuth()
  const toast = useToast()
  const [dbStatus, setDbStatus] = useState(null)
  const [geminiStatus, setGeminiStatus] = useState(null)

  const testDb = async () => {
    setDbStatus('checking')
    try {
      const res = await fetch('/.netlify/functions/decks',{headers:{Authorization:`Bearer ${await window.netlifyIdentity.currentUser().jwt()}`}})
      if (res.ok) {setDbStatus('ok');toast.success('Database connection OK')} else {setDbStatus('error');toast.error(`DB error: ${res.status}`)}
    } catch(e) {setDbStatus('error');toast.error(e.message)}
  }
  const testGemini = async () => {
    setGeminiStatus('checking')
    try {
      const token = await window.netlifyIdentity.currentUser().jwt()
      const res = await fetch('/.netlify/functions/generate',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({vocab:{vocab:['test'],targetLanguage:'French'},blueprint:[]})})
      if (res.ok) {setGeminiStatus('ok');toast.success('Gemini API key is working')} else {const b=await res.json().catch(()=>({}));setGeminiStatus('error');toast.error(b.error||`Gemini error: ${res.status}`)}
    } catch(e) {setGeminiStatus('error');toast.error(e.message)}
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <div className="section-title mb-1">Configuration</div>
      <h1 className="font-display text-3xl font-bold mb-8" style={{ color:'var(--text-primary)' }}>Settings</h1>

      <Section title="Account">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium" style={{ color:'var(--text-primary)' }}>{user?.user_metadata?.full_name||user?.email}</div>
            <div className="text-xs mt-0.5" style={{ color:'var(--text-muted)' }}>{user?.email}</div>
          </div>
          <button className="btn-danger text-xs flex-shrink-0" onClick={logout}>Sign out</button>
        </div>
      </Section>

      <CollapsibleSection title="Appearance" defaultOpen>
        <ThemeSection settings={settings} updateSettings={updateSettings} />
      </CollapsibleSection>

      <Section title="Study Defaults">
        <SettingRow label="Default source language" desc="The language you already know">
          <select className="input w-36 text-sm py-1.5" value={settings.defaultSourceLanguage||'English'} onChange={e=>updateSettings({defaultSourceLanguage:e.target.value})}>
            {LANGUAGES.map(l=><option key={l} value={l}>{l}</option>)}
          </select>
        </SettingRow>
        <SettingRow label="Default batch size" desc="Cards loaded per session">
          <input type="number" min={5} max={500} className="input w-20 text-center text-sm" value={settings.defaultBatchSize} onChange={e=>updateSettings({defaultBatchSize:Number(e.target.value)})} />
        </SettingRow>
        <SettingRow label="SRS algorithm" desc="Powers Learn mode scheduling">
          <span className="flex items-center gap-1.5 text-xs" style={{ color:'var(--accent-secondary)' }}><span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background:'var(--accent-secondary)' }} />FSRS-5 active</span>
        </SettingRow>
        <SettingRow label="Strict accents" desc="Require correct accent marks when typing (é ≠ e)">
          <Toggle value={settings.strictAccents??true} onChange={v=>updateSettings({strictAccents:v})} />
        </SettingRow>
        <SettingRow label="Strict mode" desc="Exact spelling only — no typo tolerance">
          <Toggle value={settings.strictMode??false} onChange={v=>updateSettings({strictMode:v})} />
        </SettingRow>
        <SettingRow label="Animations" desc="Card flip and page transitions">
          <Toggle value={settings.animationsEnabled!==false} onChange={v=>updateSettings({animationsEnabled:v})} />
        </SettingRow>
      </Section>

      <CollapsibleSection title="Blueprint Quick-Add Fields" defaultOpen={false}>
        <QuickAddSection settings={settings} updateSettings={updateSettings} />
      </CollapsibleSection>

      <Section title="Connections">
        <div className="text-xs mb-4" style={{ color:'var(--text-muted)' }}>API keys live in Netlify environment variables — never exposed to the browser.</div>
        <div className="space-y-3">
          <ConnectionRow label="Neon Database" desc="PostgreSQL — stores all decks, cards, and review history" status={dbStatus} onTest={testDb} />
          <ConnectionRow label="Gemini AI" desc="Google Gemini — generates card fields from vocabulary" status={geminiStatus} onTest={testGemini} />
        </div>
        <div className="mt-4 rounded-xl p-4" style={{ background:'var(--bg-surface)',border:'1px solid var(--border)' }}>
          <div className="section-title mb-2">Required environment variables</div>
          <div className="font-mono text-xs space-y-1" style={{ color:'var(--text-secondary)' }}>
            <div><span style={{ color:'var(--accent-secondary)' }}>GEMINI_API_KEY</span> — from aistudio.google.com</div>
            <div><span style={{ color:'var(--accent-secondary)' }}>DATABASE_URL</span> — from neon.tech dashboard</div>
          </div>
        </div>
      </Section>
    </div>
  )
}

function ThemeSection({ settings, updateSettings }) {
  const [showCustom, setShowCustom] = useState(settings.theme==='custom')
  const customTheme = settings.customTheme||DEFAULT_CUSTOM_THEME
  const selectPreset = (id) => { updateSettings({theme:id}); setShowCustom(false) }
  const selectCustom = () => { updateSettings({theme:'custom'}); setShowCustom(true) }
  const updateCustomVar = (key,val) => { const next={...customTheme,[key]:val}; updateSettings({theme:'custom',customTheme:next}); setShowCustom(true) }
  return (
    <div className="space-y-4">
      <div>
        <div className="section-title mb-2">Preset themes</div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(PRESET_THEMES).map(([id,t])=>(
            <button key={id} onClick={()=>selectPreset(id)} title={t.label}
              className="flex flex-col items-center gap-1.5 p-2 rounded-xl border transition-all"
              style={{ borderColor:settings.theme===id?'var(--accent-primary)':'var(--border)',background:settings.theme===id?'var(--accent-glow)':'transparent',minWidth:'64px' }}>
              <div className="flex gap-0.5 rounded overflow-hidden" style={{ height:'20px',width:'48px' }}>
                {t.swatch.map((c,i)=><div key={i} style={{ background:c,flex:1 }}/>)}
              </div>
              <span className="text-xs" style={{ color:settings.theme===id?'var(--accent-primary)':'var(--text-muted)' }}>{t.label}</span>
            </button>
          ))}
          <button onClick={selectCustom} className="flex flex-col items-center gap-1.5 p-2 rounded-xl border transition-all"
            style={{ borderColor:settings.theme==='custom'?'var(--accent-primary)':'var(--border)',background:settings.theme==='custom'?'var(--accent-glow)':'transparent',minWidth:'64px' }}>
            <div className="flex gap-0.5 rounded overflow-hidden items-center justify-center" style={{ height:'20px',width:'48px',background:'var(--bg-elevated)',fontSize:'12px' }}>🎨</div>
            <span className="text-xs" style={{ color:settings.theme==='custom'?'var(--accent-primary)':'var(--text-muted)' }}>Custom</span>
          </button>
        </div>
      </div>
      {showCustom && (
        <div className="rounded-xl p-4 space-y-2" style={{ background:'var(--bg-surface)',border:'1px solid var(--border)' }}>
          <div className="section-title mb-3">Custom colours</div>
          <div className="grid grid-cols-1 gap-2">
            {CUSTOM_THEME_KEYS.map(({key,label})=>(
              <div key={key} className="flex items-center justify-between gap-3">
                <span className="text-xs" style={{ color:'var(--text-secondary)' }}>{label}</span>
                <div className="flex items-center gap-2">
                  <input type="color" value={customTheme[key]||'#000000'} onChange={e=>updateCustomVar(key,e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0 p-0" style={{ background:'transparent' }} />
                  <input type="text" value={customTheme[key]||''} onChange={e=>/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)&&updateCustomVar(key,e.target.value)} className="input font-mono text-xs py-1 w-24 text-center" />
                </div>
              </div>
            ))}
          </div>
          <button className="btn-secondary text-xs mt-3" onClick={()=>updateSettings({customTheme:DEFAULT_CUSTOM_THEME})}>Reset custom to defaults</button>
        </div>
      )}
    </div>
  )
}

function QuickAddSection({ settings, updateSettings }) {
  const fields = settings.quickAddFields||DEFAULT_QUICK_ADD
  const setFields = (next) => updateSettings({quickAddFields:next})
  const addField = () => setFields([...fields,{key:`field_${Date.now()}`,label:'New Field',description:'',field_type:'text',show_on_front:false,phonetics:{ruby:'none',extras:[]}}])
  const updateField = (idx,patch) => {
    if (patch.label!==undefined&&patch.key===undefined) patch={...patch,key:patch.label.trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'')||'field'}
    setFields(fields.map((f,i)=>i===idx?{...f,...patch}:f))
  }
  const removeField = (idx) => setFields(fields.filter((_,i)=>i!==idx))
  const moveField = (idx,dir) => { const next=[...fields],swap=idx+dir; if(swap<0||swap>=next.length)return;[next[idx],next[swap]]=[next[swap],next[idx]];setFields(next) }
  return (
    <div className="space-y-3">
      <p className="text-xs" style={{ color:'var(--text-muted)' }}>These fields appear as quick-add suggestions in the Blueprint editor.</p>
      <div className="space-y-2">
        {fields.map((field,idx)=>(
          <QuickAddRow key={idx} field={field} onUpdate={p=>updateField(idx,p)} onRemove={()=>removeField(idx)}
            onMoveUp={()=>moveField(idx,-1)} onMoveDown={()=>moveField(idx,1)} isFirst={idx===0} isLast={idx===fields.length-1} />
        ))}
      </div>
      <div className="flex gap-2">
        <button className="btn-secondary text-xs py-1.5 px-3" onClick={addField}>+ Add field</button>
        <button className="btn-ghost text-xs py-1.5 px-3" style={{ color:'var(--accent-danger)' }}
          onClick={()=>{if(window.confirm('Reset quick-add fields to defaults?'))setFields(DEFAULT_QUICK_ADD)}}>Reset to defaults</button>
      </div>
    </div>
  )
}

function QuickAddRow({ field, onUpdate, onRemove, onMoveUp, onMoveDown, isFirst, isLast }) {
  const ph = normalisePhonetics(field.phonetics)
  const setRuby = (ruby) => onUpdate({phonetics:{...ph,ruby}})
  const toggleExtra = (key) => { const extras=ph.extras.includes(key)?ph.extras.filter(k=>k!==key):[...ph.extras,key]; onUpdate({phonetics:{...ph,extras}}) }
  return (
    <div className="rounded-xl p-3" style={{ background:'var(--bg-surface)',border:'1px solid var(--border)' }}>
      <div className="flex items-center gap-2 mb-2">
        <div className="flex gap-0.5 flex-shrink-0">
          <button disabled={isFirst} className="btn-ghost p-1 text-xs disabled:opacity-20" onClick={onMoveUp}>▲</button>
          <button disabled={isLast} className="btn-ghost p-1 text-xs disabled:opacity-20" onClick={onMoveDown}>▼</button>
        </div>
        <input className="input text-xs py-1 min-w-0 flex-1" value={field.label} onChange={e=>onUpdate({label:e.target.value})} placeholder="Label" />
        <select className="input text-xs py-1 w-28 flex-shrink-0" value={field.field_type} onChange={e=>onUpdate({field_type:e.target.value})}>
          <option value="text">Text</option><option value="example">Example</option>
        </select>
        <label className="flex items-center gap-1.5 text-xs flex-shrink-0 cursor-pointer" style={{ color:'var(--text-muted)' }}>
          <input type="checkbox" checked={!!field.show_on_front} onChange={e=>onUpdate({show_on_front:e.target.checked})} />Front
        </label>
        <button className="btn-ghost p-1 text-xs flex-shrink-0" style={{ color:'var(--accent-danger)' }} onClick={onRemove}>✕</button>
      </div>
      <input className="input text-xs py-1.5 w-full" value={field.description||''} onChange={e=>onUpdate({description:e.target.value})} placeholder="AI hint" />
      <div className="mt-2.5 grid grid-cols-1 md:grid-cols-2 gap-2.5">
        <div>
          <label className="section-title block mb-1">Ruby</label>
          <select className="input text-xs py-1.5 w-full" value={ph.ruby} onChange={e=>setRuby(e.target.value)}>
            {QUICK_ADD_RUBY_OPTIONS.map(opt=><option key={opt.key} value={opt.key}>{opt.label}</option>)}
          </select>
        </div>
        <div>
          <label className="section-title block mb-1">Additional annotations</label>
          <div className="flex flex-wrap gap-2">
            {QUICK_ADD_EXTRA_OPTIONS.map(opt=>(
              <label key={opt.key} className="text-xs flex items-center gap-1.5 px-2 py-1 rounded-lg cursor-pointer"
                style={{ background:ph.extras.includes(opt.key)?'var(--accent-glow)':'transparent',border:'1px solid var(--border)' }}>
                <input type="checkbox" checked={ph.extras.includes(opt.key)} onChange={()=>toggleExtra(opt.key)} />{opt.label}
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="mb-8">
      <h2 className="font-display font-semibold text-lg mb-4" style={{ color:'var(--text-primary)' }}>{title}</h2>
      <div className="card p-5 space-y-5">{children}</div>
    </div>
  )
}

function CollapsibleSection({ title, children, defaultOpen=true }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="mb-8">
      <div className="card cursor-pointer select-none"
        style={{ borderRadius:open?'16px 16px 0 0':'16px',borderBottom:open?'none':undefined,transition:'border-radius 0.3s ease' }}
        onClick={()=>setOpen(o=>!o)}>
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="font-display font-semibold text-lg" style={{ color:'var(--text-primary)' }}>{title}</h2>
          <span style={{ color:'var(--text-muted)',display:'inline-block',transition:'transform 0.3s cubic-bezier(0.4,0,0.2,1)',transform:open?'rotate(180deg)':'rotate(0deg)',fontSize:'18px' }}>▾</span>
        </div>
      </div>
      <div className={`collapsible-panel ${open?'open':''}`} style={{ borderRadius:'0 0 16px 16px',overflow:'hidden' }}>
        <div className="collapsible-inner">
          <div className="card p-5 space-y-5" style={{ borderRadius:'0 0 16px 16px',borderTop:'none',marginTop:0 }}>{children}</div>
        </div>
      </div>
    </div>
  )
}

function SettingRow({ label, desc, children }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-sm font-medium" style={{ color:'var(--text-primary)' }}>{label}</div>
        {desc&&<div className="text-xs mt-0.5" style={{ color:'var(--text-muted)' }}>{desc}</div>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  )
}

function Toggle({ value, onChange }) {
  return (
    <button role="switch" aria-checked={value} className="w-11 h-6 rounded-full transition-colors relative flex-shrink-0"
      style={{ background:value?'var(--accent-primary)':'var(--bg-elevated)',border:'1px solid var(--border)' }} onClick={()=>onChange(!value)}>
      <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white" style={{ left:value?'24px':'3px',transition:'left 0.2s' }} />
    </button>
  )
}

const STATUS_STYLES = { ok:{color:'var(--accent-secondary)',label:'✓ Connected'}, error:{color:'var(--accent-danger)',label:'✕ Failed'}, checking:{color:'#fdcb6e',label:'Testing...'} }

function ConnectionRow({ label, desc, status, onTest }) {
  const s = status?STATUS_STYLES[status]:null
  return (
    <div className="flex items-center justify-between gap-4 p-3 rounded-xl" style={{ background:'var(--bg-surface)',border:'1px solid var(--border)' }}>
      <div className="min-w-0">
        <div className="text-sm font-medium" style={{ color:'var(--text-primary)' }}>{label}</div>
        <div className="text-xs mt-0.5" style={{ color:'var(--text-muted)' }}>{desc}</div>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        {s&&<span className="text-xs font-medium" style={{ color:s.color }}>{s.label}</span>}
        <button className="btn-secondary text-xs py-1.5 px-3" disabled={status==='checking'} onClick={onTest}>{status==='checking'?'...':'Test'}</button>
      </div>
    </div>
  )
}
