import { useState, useMemo, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useToast } from '../components/shared/Toast'
import Modal from '../components/shared/Modal'
import RubyText from '../components/shared/RubyText'
import { formatDueDate } from '../lib/utils'

const PAGE_SIZE = 50
const STATE_STYLE = {
  new:{color:'var(--text-muted)',label:'New'}, learning:{color:'#fdcb6e',label:'Learning'},
  review:{color:'var(--accent-secondary)',label:'Review'}, relearning:{color:'var(--accent-danger)',label:'Relearning'},
}

export default function CollectionPage() {
  const { deckId } = useParams()
  const qc = useQueryClient()
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState(new Set())
  const [editCard, setEditCard] = useState(null)
  const [sortBy, setSortBy] = useState('created')
  const [sortDir, setSortDir] = useState('asc')

  const { data: cards = [], isLoading } = useQuery({ queryKey:['cards',deckId], queryFn:()=>api.getCards(deckId) })
  const { data: blueprint = [] } = useQuery({ queryKey:['blueprint',deckId], queryFn:()=>api.getBlueprintFields(deckId) })

  const deleteMutation = useMutation({
    mutationFn: api.deleteCard,
    onSuccess: (_,id) => qc.setQueryData(['cards',deckId],old=>old?.filter(c=>c.id!==id)),
  })
  const updateMutation = useMutation({
    mutationFn: ({id,data})=>api.updateCard(id,data),
    onSuccess: updated => { qc.setQueryData(['cards',deckId],old=>old?.map(c=>c.id===updated.id?updated:c)); setEditCard(null); toast.success('Card updated.') },
    onError: e=>toast.error(e.message),
  })

  const bulkDelete = useCallback(async () => {
    if (!selected.size) return
    if (!window.confirm(`Delete ${selected.size} card${selected.size!==1?'s':''}?`)) return
    let deleted = 0
    for (const id of selected) { try { await api.deleteCard(id); deleted++ } catch {} }
    qc.setQueryData(['cards',deckId],old=>old?.filter(c=>!selected.has(c.id)))
    setSelected(new Set())
    toast.success(`${deleted} card${deleted!==1?'s':''} deleted.`)
  }, [selected,deckId,qc,toast])

  const bulkResetSRS = useCallback(async () => {
    if (!selected.size) return
    if (!window.confirm(`Reset SRS for ${selected.size} card${selected.size!==1?'s':''}?`)) return
    const resetData = {stability:0,difficulty:5,repetitions:0,interval:0,srs_state:'new',seen:false}
    for (const id of selected) { try { await api.updateCard(id,resetData) } catch {} }
    qc.invalidateQueries({queryKey:['cards',deckId]})
    setSelected(new Set())
    toast.success('SRS progress reset.')
  }, [selected,deckId,qc,toast])

  const exportCards = useCallback((cardSubset) => {
    if (!cardSubset.length) return
    const bpKeys = blueprint.map(f=>f.key)
    const allFieldKeys = [...new Set([...bpKeys,...cardSubset.flatMap(c=>Object.keys(c.fields||{}))])]
    const SRS_COLS = ['srs_state','last_reviewed','interval','stability','difficulty','repetitions']
    const headers = ['word',...allFieldKeys,...SRS_COLS]
    const bpByKey = {}
    for (const f of blueprint) bpByKey[f.key]=f
    const escape = v => { const s=String(v??''); return s.includes(',')||s.includes('"')||s.includes('\n')?`"${s.replace(/"/g,'""')}"`:s }
    const metaRow = headers.map(h=>{const f=bpByKey[h];if(!f)return '';return escape(JSON.stringify({label:f.label,description:f.description||'',field_type:f.field_type||'text',show_on_front:f.show_on_front||false,phonetics:f.phonetics||{ruby:'none',extras:[]}}))})
    const dataRows = cardSubset.map(card=>{
      const row={word:card.word}
      for (const k of allFieldKeys) { const v=card.fields?.[k]; row[k]=v==null?'':(typeof v==='object'?JSON.stringify(v):v) }
      row.srs_state=card.srs_state??''; row.last_reviewed=card.last_reviewed??''; row.interval=card.interval??''; row.stability=card.stability??''; row.difficulty=card.difficulty??''; row.repetitions=card.repetitions??''
      return headers.map(h=>escape(row[h])).join(',')
    })
    const csv=[headers.map(escape).join(','),metaRow.join(','),...dataRows].join('\n')
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`cards-export-${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url)
    toast.success(`Exported ${cardSubset.length} card${cardSubset.length!==1?'s':''}.`)
  }, [blueprint,toast])

  const now = new Date()
  const filtered = useMemo(()=>{
    let c=[...cards]
    if (search) {
      const q=search.toLowerCase()
      c=c.filter(card=>card.word.toLowerCase().includes(q)||Object.values(card.fields||{}).some(v=>{const text=v&&typeof v==='object'?(v.text||''):String(v||'');return text.toLowerCase().includes(q)}))
    }
    if (filter==='new') c=c.filter(x=>x.srs_state==='new'||!x.seen)
    if (filter==='learning') c=c.filter(x=>x.srs_state==='learning')
    if (filter==='review') c=c.filter(x=>x.srs_state==='review')
    if (filter==='due') c=c.filter(x=>x.due&&new Date(x.due)<=now)
    c.sort((a,b)=>{
      let va,vb
      if (sortBy==='word'){va=a.word;vb=b.word} else if(sortBy==='due'){va=a.due||'9999';vb=b.due||'9999'} else if(sortBy==='state'){va=a.srs_state||'';vb=b.srs_state||''} else{va=a.created_at||'';vb=b.created_at||''}
      const cmp=va<vb?-1:va>vb?1:0; return sortDir==='asc'?cmp:-cmp
    })
    return c
  },[cards,search,filter,sortBy,sortDir])

  const totalPages=Math.ceil(filtered.length/PAGE_SIZE)
  const pageCards=filtered.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE)
  const allPageSelected=pageCards.length>0&&pageCards.every(c=>selected.has(c.id))
  const toggleAll=()=>{if(allPageSelected)setSelected(s=>{const n=new Set(s);pageCards.forEach(c=>n.delete(c.id));return n});else setSelected(s=>{const n=new Set(s);pageCards.forEach(c=>n.add(c.id));return n})}
  const toggleOne=id=>setSelected(s=>{const n=new Set(s);n.has(id)?n.delete(id):n.add(id);return n})
  const handleSort=col=>{if(sortBy===col)setSortDir(d=>d==='asc'?'desc':'asc');else{setSortBy(col);setSortDir('asc')}}
  const goPage=p=>{setPage(p);setSelected(new Set())}
  const previewFields=blueprint.slice(0,2)

  return (
    <div className="flex flex-col" style={{ minHeight:'100%' }}>
      <div className="flex-shrink-0 px-6 pt-8 pb-4" style={{ background:'var(--bg-primary)' }}>
        <div className="flex items-end justify-between mb-4">
          <div>
            <div className="section-title mb-1">Collection</div>
            <h1 className="font-display text-3xl font-bold" style={{ color:'var(--text-primary)' }}>
              Cards<span className="ml-2 text-lg font-normal" style={{ color:'var(--text-muted)' }}>({filtered.length}{filtered.length!==cards.length?` of ${cards.length}`:''})</span>
            </h1>
          </div>
          <button className="btn-secondary text-xs py-1.5 px-3" onClick={()=>exportCards(filtered)} disabled={!filtered.length}>Export {filtered.length!==cards.length?'filtered':'all'}</button>
        </div>
        <div className="flex gap-2 flex-wrap">
          <input className="input flex-1 min-w-40" placeholder="Search word, reading, example..." value={search} onChange={e=>{setSearch(e.target.value);goPage(0)}} />
          <div className="flex gap-1 flex-wrap">
            {[['all','All'],['new','New'],['learning','Learning'],['review','Review'],['due','Due']].map(([v,l])=>(
              <button key={v} className="text-xs px-3 py-2 rounded-lg border transition-all"
                style={{ borderColor:filter===v?'var(--accent-primary)':'var(--border)',color:filter===v?'var(--accent-primary)':'var(--text-secondary)',background:filter===v?'var(--accent-glow)':'transparent' }}
                onClick={()=>{setFilter(v);goPage(0)}}>{l}</button>
            ))}
          </div>
        </div>
        {selected.size>0&&(
          <div className="flex items-center gap-3 mt-3 px-4 py-2.5 rounded-xl animate-slide-up" style={{ background:'var(--accent-glow)',border:'1px solid rgba(124,106,240,.3)' }}>
            <span className="text-sm font-medium" style={{ color:'var(--accent-primary)' }}>{selected.size} selected</span>
            <div className="flex gap-2 ml-auto">
              <button className="btn-ghost text-xs py-1 px-2.5" onClick={()=>setSelected(new Set())}>Clear</button>
              <button className="btn-secondary text-xs py-1 px-2.5" onClick={()=>exportCards(cards.filter(c=>selected.has(c.id)))}>Export</button>
              <button className="btn-secondary text-xs py-1 px-2.5" onClick={bulkResetSRS}>Reset SRS</button>
              <button className="btn-danger text-xs py-1 px-2.5" onClick={bulkDelete}>Delete {selected.size}</button>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto px-6 min-h-0">
        {isLoading ? (
          <div className="space-y-2 pb-6">{[1,2,3,4,5].map(i=><div key={i} className="h-11 rounded-xl shimmer"/>)}</div>
        ) : pageCards.length===0 ? (
          <div className="text-center py-16" style={{ color:'var(--text-muted)' }}>{search||filter!=='all'?'No cards match this filter.':'No cards in this deck yet.'}</div>
        ) : (
          <div className="card rounded-2xl overflow-hidden mb-4">
            <table className="w-full text-sm" style={{ tableLayout:'fixed' }}>
              <colgroup>
                <col style={{ width:'36px' }}/><col style={{ width:'140px' }}/>
                {previewFields.map(f=><col key={f.key} style={{ width:'160px' }}/>)}
                <col style={{ width:'90px' }}/><col style={{ width:'80px' }}/><col style={{ width:'72px' }}/>
              </colgroup>
              <thead>
                <tr style={{ borderBottom:'1px solid var(--border)',background:'var(--bg-surface)',position:'sticky',top:0,zIndex:2 }}>
                  <th className="px-3 py-3"><input type="checkbox" checked={allPageSelected} onChange={toggleAll}/></th>
                  <SortTh label="Word" col="word" sortBy={sortBy} sortDir={sortDir} onSort={handleSort}/>
                  {previewFields.map(f=><th key={f.key} className="px-3 py-3 text-left section-title truncate">{f.label}</th>)}
                  <SortTh label="State" col="state" sortBy={sortBy} sortDir={sortDir} onSort={handleSort}/>
                  <SortTh label="Due" col="due" sortBy={sortBy} sortDir={sortDir} onSort={handleSort}/>
                  <th className="px-3 py-3"/>
                </tr>
              </thead>
              <tbody>
                {pageCards.map((card,i)=>{
                  const ss=STATE_STYLE[card.srs_state]||STATE_STYLE.new
                  const isSelected=selected.has(card.id)
                  return (
                    <tr key={card.id} style={{ borderTop:i>0?'1px solid var(--border-sub)':undefined, background:isSelected?'rgba(124,106,240,.05)':undefined }} className="group transition-colors hover:bg-white/[0.02]">
                      <td className="px-3 py-2.5 text-center"><input type="checkbox" checked={isSelected} onChange={()=>toggleOne(card.id)}/></td>
                      <td className="px-3 py-2.5 font-medium truncate" style={{ color:'var(--text-primary)' }}>{card.word}</td>
                      {previewFields.map(f=>(
                        <td key={f.key} className="px-3 py-2.5 truncate" style={{ color:'var(--text-secondary)' }}>
                          {(()=>{const fv=card.fields?.[f.key];const hasContent=fv&&(typeof fv==='string'?fv:fv.text);return hasContent?<RubyText fieldValue={fv} phonetics={f.phonetics||[]}/>:<span style={{ color:'var(--text-muted)' }}>—</span>})()}
                        </td>
                      ))}
                      <td className="px-3 py-2.5"><span className="text-xs font-medium" style={{ color:ss.color }}>{ss.label}</span></td>
                      <td className="px-3 py-2.5 text-xs" style={{ color:'var(--text-muted)' }}>{card.due?formatDueDate(card.due):'—'}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex gap-0.5 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                          <button className="btn-ghost p-1.5 text-xs" onClick={()=>setEditCard(card)}>✏</button>
                          <button className="btn-ghost p-1.5 text-xs" style={{ color:'var(--accent-danger)' }} onClick={()=>{if(window.confirm('Delete card?'))deleteMutation.mutate(card.id)}}>✕</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {totalPages>1&&(
        <div className="flex-shrink-0 px-6 py-3 flex items-center justify-between border-t" style={{ background:'var(--bg-primary)',borderColor:'var(--border)' }}>
          <span className="text-xs" style={{ color:'var(--text-muted)' }}>{page*PAGE_SIZE+1}–{Math.min((page+1)*PAGE_SIZE,filtered.length)} of {filtered.length}</span>
          <div className="flex items-center gap-1">
            <button className="btn-ghost text-xs py-1.5 px-3" disabled={page===0} onClick={()=>goPage(0)}>«</button>
            <button className="btn-ghost text-xs py-1.5 px-3" disabled={page===0} onClick={()=>goPage(page-1)}>‹ Prev</button>
            {Array.from({length:totalPages},(_,i)=>i).filter(i=>Math.abs(i-page)<=2).map(i=>(
              <button key={i} className="text-xs py-1.5 px-3 rounded-lg transition-all"
                style={{ borderColor:i===page?'var(--accent-primary)':'var(--border)',color:i===page?'var(--accent-primary)':'var(--text-secondary)',background:i===page?'var(--accent-glow)':'transparent',border:'1px solid' }}
                onClick={()=>goPage(i)}>{i+1}</button>
            ))}
            <button className="btn-ghost text-xs py-1.5 px-3" disabled={page>=totalPages-1} onClick={()=>goPage(page+1)}>Next ›</button>
            <button className="btn-ghost text-xs py-1.5 px-3" disabled={page>=totalPages-1} onClick={()=>goPage(totalPages-1)}>»</button>
          </div>
        </div>
      )}

      {editCard&&<EditCardModal card={editCard} blueprint={blueprint} onClose={()=>setEditCard(null)} onSave={data=>updateMutation.mutate({id:editCard.id,data})} saving={updateMutation.isPending}/>}
    </div>
  )
}

function SortTh({ label, col, sortBy, sortDir, onSort }) {
  const active=sortBy===col
  return (
    <th className="px-3 py-3 text-left cursor-pointer select-none" onClick={()=>onSort(col)}>
      <span className="flex items-center gap-1 section-title">{label}<span style={{ color:active?'var(--accent-primary)':'var(--text-muted)',fontSize:'10px' }}>{active?(sortDir==='asc'?'▲':'▼'):'⇅'}</span></span>
    </th>
  )
}

function EditCardModal({ card, blueprint, onClose, onSave, saving }) {
  const [word, setWord] = useState(card.word)
  const [fields, setFields] = useState(()=>({...card.fields}))

  const getAnnotationKeys=(ph)=>{if(!ph)return [];if(Array.isArray(ph))return ph.filter(k=>k&&k!=='none');const keys=[];if(ph.ruby&&ph.ruby!=='none')keys.push(ph.ruby);if(Array.isArray(ph.extras))keys.push(...ph.extras);return keys}
  const getText=(fk)=>{const v=fields[fk];if(!v)return '';return typeof v==='object'?(v.text||''):v}
  const getAnnotation=(fk,ak)=>{const v=fields[fk];if(!v||typeof v!=='object')return '';return v[ak]||''}
  const setText=(fk,text,annotationKeys)=>setFields(prev=>{const existing=prev[fk];if(annotationKeys.length===0)return {...prev,[fk]:text};const obj=(existing&&typeof existing==='object')?{...existing}:{};return {...prev,[fk]:{...obj,text}}})
  const setAnnotation=(fk,ak,value)=>setFields(prev=>{const existing=prev[fk];const obj=(existing&&typeof existing==='object')?{...existing}:{text:''};return {...prev,[fk]:{...obj,[ak]:value}}})

  return (
    <Modal title="Edit Card" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="section-title block mb-1.5">Word</label>
          <input className="input" value={word} onChange={e=>setWord(e.target.value)} autoFocus/>
        </div>
        {blueprint.map(f=>{
          const annotationKeys=getAnnotationKeys(f.phonetics)
          const isExample=f.field_type==='example'
          return (
            <div key={f.key}>
              <label className="section-title block mb-1.5">{f.label}</label>
              {isExample?(
                <>
                  <textarea className="input text-sm resize-none" rows={3} value={getText(f.key)} onChange={e=>setText(f.key,e.target.value,annotationKeys)}/>
                  <div className="text-xs mt-1" style={{ color:'var(--text-muted)' }}>Use {'{{word}}'} to mark cloze · Separate sentences with {' ;;; '}</div>
                  {annotationKeys.map(ak=>(
                    <div key={ak} className="mt-1.5">
                      <label className="section-title block mb-1">{ak}</label>
                      <textarea className="input text-xs resize-none" rows={2} value={getAnnotation(f.key,ak)} onChange={e=>setAnnotation(f.key,ak,e.target.value)} placeholder={`${ak} version, same order, separated by  ;;; `}/>
                    </div>
                  ))}
                </>
              ):(
                <>
                  <input className="input text-sm" value={getText(f.key)} onChange={e=>setText(f.key,e.target.value,annotationKeys)}/>
                  {annotationKeys.map(ak=>(
                    <div key={ak} className="mt-1.5">
                      <label className="section-title block mb-1">{ak}</label>
                      <input className="input text-xs" value={getAnnotation(f.key,ak)} onChange={e=>setAnnotation(f.key,ak,e.target.value)}/>
                    </div>
                  ))}
                </>
              )}
            </div>
          )
        })}
        <div className="flex gap-3 pt-2">
          <button className="btn-secondary flex-1" onClick={onClose}>Cancel</button>
          <button className="btn-primary flex-1" disabled={saving} onClick={()=>onSave({word,fields})}>{saving?'Saving…':'Save'}</button>
        </div>
      </div>
    </Modal>
  )
}
