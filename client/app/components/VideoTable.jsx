import React, { useEffect, useMemo, useRef, useState } from 'react'
import { analyzeFiles } from '../lib/api.ts'
import { Media } from './Media.jsx'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Input } from '@/components/ui/input.jsx'
import { Checkbox } from '@/components/ui/checkbox.jsx'
import { Label } from '@/components/ui/label.jsx'
import { Badge } from '@/components/ui/badge.jsx'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog'

export function VideoTable({ onAdd, rows: controlledRows, setRows: setControlledRows, onHeadersChange }) {
  const [rows, setRows] = useState([])
  const [search, setSearch] = useState('')
  const [hidePaths, setHidePaths] = useState(true)
  const [keyHideInput, setKeyHideInput] = useState('seed,widgets_values[0],Set_SEED')
  // Diff view: always show only changed values compared to previous row
  const [view, setView] = useState('table') // table | diff
  const [busy, setBusy] = useState(false)
  // Whitelist: when enabled, only include mapped values from a node-type list
  const [useWhitelist, setUseWhitelist] = useState(true)
  const [whitelistOpen, setWhitelistOpen] = useState(false)
  const [whitelistSet, setWhitelistSet] = useState(() => getSpecialNodeTypeSet())
  const [nodeSearch, setNodeSearch] = useState('')

  async function loadAny() {
    try {
      // Prefer directory picker for batch; fall back to files if denied
      setBusy(true)
      let picked = []
      try {
        const dir = await window.showDirectoryPicker()
        for await (const entry of dir.values()) {
          if (entry.kind === 'file' && entry.name.toLowerCase().match(/\.(mp4|webm|mov|mkv)$/)) picked.push(entry)
        }
      } catch {
        const handles = await window.showOpenFilePicker({ multiple: true, types: [{ description: 'Video', accept: { 'video/*': ['.mp4',] } }] })
        picked = handles
      }
      if (!picked.length) return
      const files = []
      for (const h of picked) {
        const file = await (h.getFile ? h.getFile() : h)
        files.push(file)
      }
      const items = await analyzeFiles(files)
      // attach id and retain File reference for export
      const newRows = items.map((it, i) => ({ id: i, _file: files[i], ...it }))
      if (setControlledRows) setControlledRows(newRows)
      else setRows(newRows)
    } finally { setBusy(false) }
  }

  const data = controlledRows !== undefined ? controlledRows : rows
  const spec = useMemo(() => parseKeyHideSpec(keyHideInput), [keyHideInput])
  // Always build derived mapping for display based on whitelist toggle
  const displayRows = useMemo(() => {
    return (data || []).map((r) => {
      try {
        const map = extractSpecialWidgetValues(r?.workflowNorm, useWhitelist)
        return { ...r, widgetValues: map }
      } catch {
        return { ...r, widgetValues: {} }
      }
    })
  }, [data, useWhitelist])
  const headers = useMemo(() => buildHeaders(displayRows, hidePaths, spec), [displayRows, hidePaths, spec])
  const filtered = useMemo(() => filterRows(displayRows, headers, search), [displayRows, headers, search])
  const visibleHeaders = useMemo(() => headers.filter(h => !fieldIsHidden(h, spec, hidePaths)), [headers, spec, hidePaths])

  useEffect(() => {
    try { if (typeof onHeadersChange === 'function') onHeadersChange(visibleHeaders) } catch {}
  }, [onHeadersChange, visibleHeaders])

  // Collect unique node types from all loaded workflows with counts and example outputs
  const uniqueNodeTypes = useMemo(() => {
    const acc = new Map()
    const rows = Array.isArray(data) ? data : []
    for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
      const r = rows[rowIdx]
      const rowKey = r?.file_path || r?.name || String(rowIdx)
      try {
        if (!r?.workflowNorm) continue
        const wf = JSON.parse(String(r.workflowNorm))
        const nodes = Array.isArray(wf?.nodes) ? wf.nodes : []
        const seenInRow = new Set()
        for (const n of nodes) {
          const t = String(n?.type || n?.class_type || 'UnknownType')
          const rec = acc.get(t) || { type: t, files: new Set(), outputs: new Set() }
          if (!seenInRow.has(t)) {
            rec.files.add(rowKey)
            seenInRow.add(t)
          }
          const outs = Array.isArray(n?.outputs) ? n.outputs : []
          outs.forEach(o => { if (o && typeof o === 'object' && o.name) rec.outputs.add(String(o.name)) })
          acc.set(t, rec)
        }
      } catch {}
    }
    const list = Array.from(acc.values()).map(v => ({ type: v.type, files: v.files.size, outputs: Array.from(v.outputs).sort() }))
    const term = nodeSearch.trim().toLowerCase()
    const filtered = term ? list.filter(x => x.type.toLowerCase().includes(term)) : list
    filtered.sort((a, b) => a.type.localeCompare(b.type))
    return filtered
  }, [data, nodeSearch])

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        {!setControlledRows && (
          <Button disabled={busy} onClick={loadAny} size="sm">
            {busy ? 'Loading…' : 'Load'}
          </Button>
        )}
        <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox id="hidePaths" checked={hidePaths} onCheckedChange={(v)=>setHidePaths(Boolean(v))} />
          <Label htmlFor="hidePaths" className="cursor-pointer">Hide file_path and ctime</Label>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Label className="text-muted-foreground">Hide keys</Label>
          <Input
            value={keyHideInput}
            onChange={(e)=>setKeyHideInput(e.target.value)}
            placeholder="seed, widgets_values[0], /regex/i"
            className="h-8 w-[320px]"
          />
        </div>
        <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox id="useWhitelist" checked={useWhitelist} onCheckedChange={(v)=>setUseWhitelist(Boolean(v))} />
          <Label htmlFor="useWhitelist" className="cursor-pointer">Node whitelist</Label>
          <Dialog open={whitelistOpen} onOpenChange={setWhitelistOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">Edit</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[560px]">
              <DialogHeader>
                <DialogTitle>Node whitelist</DialogTitle>
                <DialogDescription>
                  Manage which node types are included in the mapping. Uses a compact data table for quick toggling.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-3">
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Filter node types..."
                    value={nodeSearch}
                    onChange={(e)=>setNodeSearch(e.target.value)}
                    className="h-8"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      // Toggle all visible
                      const next = new Set(whitelistSet)
                      const allVisibleSelected = uniqueNodeTypes.every(n => next.has(n.type))
                      if (allVisibleSelected) uniqueNodeTypes.forEach(n => next.delete(n.type))
                      else uniqueNodeTypes.forEach(n => next.add(n.type))
                      setWhitelistSet(next)
                    }}
                  >
                    Toggle visible
                  </Button>
                </div>
                <div className="overflow-auto max-h-[50vh] border rounded">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr>
                        <th className="px-2 py-1 text-left whitespace-nowrap">Enable</th>
                        <th className="px-2 py-1 text-left whitespace-nowrap">Node Type</th>
                        <th className="px-2 py-1 text-left whitespace-nowrap">Files</th>
                        <th className="px-2 py-1 text-left whitespace-nowrap">Outputs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {uniqueNodeTypes.length === 0 ? (
                        <tr><td colSpan={4} className="px-2 py-3 text-muted-foreground">No nodes found in loaded files</td></tr>
                      ) : uniqueNodeTypes.map((n) => (
                        <tr key={n.type} className="border-b">
                          <td className="px-2 py-1 align-top">
                            <input
                              type="checkbox"
                              className="accent-foreground"
                              checked={whitelistSet.has(n.type)}
                              onChange={(e)=>{
                                const next = new Set(whitelistSet)
                                if (e.target.checked) next.add(n.type)
                                else next.delete(n.type)
                                setWhitelistSet(next)
                              }}
                            />
                          </td>
                          <td className="px-2 py-1 align-top font-mono">{n.type}</td>
                          <td className="px-2 py-1 align-top">{n.files}</td>
                          <td className="px-2 py-1 align-top text-muted-foreground">
                            {n.outputs.slice(0, 4).join(', ')}{n.outputs.length > 4 ? '…' : ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    const next = new Set(DEFAULT_SPECIAL_NODE_TYPES)
                    setWhitelistSet(next)
                    try { window.localStorage.setItem('special_node_types', JSON.stringify(Array.from(next))) } catch {}
                  }}
                >
                  Reset to defaults
                </Button>
                <DialogClose asChild>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      try {
                        window.localStorage.setItem('special_node_types', JSON.stringify(Array.from(whitelistSet)))
                      } catch {}
                    }}
                  >
                    Save
                  </Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        <Badge variant="secondary" className="ml-auto">
          {filtered.length}
        </Badge>
        <div>
          <ButtonGroup>
            <Button
              variant={view==='diff' ? 'secondary' : 'outline'}
              size="sm"
              onClick={()=>setView('diff')}
              aria-pressed={view==='diff'}
            >
              Diff
            </Button>
            <Button
              variant={view==='table' ? 'secondary' : 'outline'}
              size="sm"
              onClick={()=>setView('table')}
              aria-pressed={view==='table'}
            >
              Table
            </Button>
          </ButtonGroup>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Filter rows by text..." className="w-80 h-8" />
      </div>

      {busy ? (
        <SkeletonList />
      ) : data.length === 0 ? (
        <div className="text-sm text-muted-foreground">Load videos to analyze workflow metadata.</div>
      ) : view === 'table' ? (
        <Table headers={headers} rows={filtered} onAdd={onAdd} spec={spec} hidePaths={hidePaths} />
      ) : (
        <Diff rows={filtered} headers={headers} spec={spec} hidePaths={hidePaths} />
      )}
    </div>
  )
}

function Table({ headers, rows, onAdd, spec, hidePaths }) {
  const visibleHeaders = headers.filter(h => !fieldIsHidden(h, spec, hidePaths))
  const topScrollRef = useRef(null)
  const mainScrollRef = useRef(null)
  const spacerRef = useRef(null)

  // Keep a synchronized top scrollbar and measure content width
  useEffect(() => {
    const main = mainScrollRef.current
    const top = topScrollRef.current
    const spacer = spacerRef.current
    if (!main || !top || !spacer) return
    const syncFromMain = () => { if (top.scrollLeft !== main.scrollLeft) top.scrollLeft = main.scrollLeft }
    const syncFromTop = () => { if (main.scrollLeft !== top.scrollLeft) main.scrollLeft = top.scrollLeft }
    const resize = () => { spacer.style.width = `${main.scrollWidth}px` }
    main.addEventListener('scroll', syncFromMain)
    top.addEventListener('scroll', syncFromTop)
    const ro = new ResizeObserver(resize)
    ro.observe(main)
    resize()
    return () => {
      main.removeEventListener('scroll', syncFromMain)
      top.removeEventListener('scroll', syncFromTop)
      ro.disconnect()
    }
  }, [rows.length, visibleHeaders.length])

  return (
    <div className="border rounded">
      {/* Top horizontal scrollbar */}
      <div ref={topScrollRef} className="overflow-x-auto overflow-y-hidden h-4 border-b rounded-t">
        <div ref={spacerRef} className="h-4" />
      </div>
      {/* Main scroll area with sticky header */}
      <div ref={mainScrollRef} className="overflow-auto max-h-[60vh]">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 sticky top-0 z-10">
            <tr>
              <th className="px-2 py-1 text-left whitespace-nowrap">#</th>
              <th className="px-2 py-1 text-left whitespace-nowrap">Preview</th>
              <th className="px-2 py-1 text-left whitespace-nowrap">Add</th>
              {visibleHeaders.map(h => <th key={h} className="px-2 py-1 text-left whitespace-nowrap">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={r.id ?? idx} className="border-b hover:bg-muted/30">
                <td className="px-2 py-1 whitespace-nowrap align-top">{idx+1}</td>
                <td className="px-2 py-1 align-top whitespace-nowrap">
                  <RowPreview row={r} />
                </td>
                <td className="px-2 py-1 whitespace-nowrap"><button className="px-2 py-1 rounded bg-secondary hover:bg-secondary/80" onClick={()=>onAdd && onAdd(r)}>Add</button></td>
                {visibleHeaders.map(h => (
                  <td key={h} className="px-2 py-1 align-top whitespace-nowrap">{valueFor(r, h) ?? ''}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function RowPreview({ row }) {
  return (
    <div className="w-20">
      <Media source={row} />
    </div>
  )
}

function SkeletonList() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-6 w-6" />
          <Skeleton className="h-16 w-28" />
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-6 flex-1" />
        </div>
      ))}
    </div>
  )
}

function Diff({ rows, headers, spec, hidePaths }) {
  const visibleHeaders = headers.filter(h => !fieldIsHidden(h, spec, hidePaths))
  function changedSet(curr, prev) {
    const set = new Set()
    for (const h of visibleHeaders) {
      const a = valueFor(curr, h)
      const b = valueFor(prev, h)
      if ((a ?? '') !== (b ?? '')) set.add(h)
    }
    return set
  }
  return (
    <div className="space-y-3">
      {rows.map((row, i) => {
        const prev = i>0 ? rows[i-1] : null
        const changed = prev ? changedSet(row, prev) : new Set()
        const headersToShow = prev ? visibleHeaders.filter(h => changed.has(h)) : []
        return (
          <div key={row.id ?? i} className="border rounded p-2">
            <div className="grid grid-cols-[minmax(180px,220px)_1fr] gap-3">
              {/* Sticky left column with preview and summary */}
              <div className="sticky top-2 self-start bg-card border rounded p-2">
                <div className="text-xs text-muted-foreground mb-2 whitespace-nowrap">#{i+1} {row.name}</div>
                <Media source={row} width={180} />
                <div className="mt-2 text-[11px] text-muted-foreground whitespace-nowrap">
                  {row.width}×{row.height} • {row.fps}fps • {Math.round(Number(row.duration)||0)}s
                </div>
              </div>
              {/* Scrollable right column with diffs */}
              <div className="overflow-auto max-h-[60vh] pr-2">
                {!prev ? (
                  <div className="text-sm text-muted-foreground">Baseline row</div>
                ) : headersToShow.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No changes vs previous</div>
                ) : (
                  <div className="grid gap-2">
                    {headersToShow.map(h => (
                      <div key={h} className="grid grid-cols-[minmax(200px,280px)_1fr] gap-3 text-xs">
                        <div className="text-muted-foreground whitespace-nowrap">{h}</div>
                        <div className="font-mono">
                          <div className="text-emerald-400 whitespace-pre-wrap break-words">{valueFor(row, h) ?? ''}</div>
                          <div className="text-red-400/80 text-[11px] whitespace-pre-wrap break-words">{valueFor(prev, h) ?? ''}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Helpers (keep minimal)
function buildHeaders(rows, hidePaths, spec) {
  const base = ['file_path','__file_ctime_epoch','__file_ctime_iso','name','size','duration','width','height','fps']
  const dyn = new Set()
  for (const r of rows) {
    const wv = r.widgetValues || {}
    for (const k of Object.keys(wv)) {
      dyn.add(k)
    }
  }
  const all = [...base, ...Array.from(dyn).sort()]
  // visibility handled later, return all
  return all
}
function parseKeyHideSpec(spec) {
  const s = (spec||'').trim()
  if (!s) return { substrings: [], regexes: [] }
  const parts = s.split(',').map(p=>p.trim()).filter(Boolean)
  const substrings = []
  const regexes = []
  for (const p of parts) {
    const m = p.match(/^\/(.+)\/([a-z]*)$/i)
    if (m) {
      try { regexes.push(new RegExp(m[1], m[2])); continue } catch {}
    }
    substrings.push(p.toLowerCase())
  }
  return { substrings, regexes }
}
function fieldIsHidden(header, spec, hidePaths) {
  const h = String(header||'')
  if (hidePaths) {
    const low = h.toLowerCase()
    if (low === 'file_path' || low === '__file_ctime_epoch' || low === '__file_ctime_iso') return true
  }
  const low = h.toLowerCase()
  for (const sub of spec.substrings) if (low.includes(sub)) return true
  for (const re of spec.regexes) { try { if (re.test(h)) return true } catch {} }
  return false
}
function filterRows(rows, headers, term) {
  const t = (term||'').toLowerCase().trim()
  if (!t) return rows
  return rows.filter(r => {
    try { return JSON.stringify([headers.map(h=>valueFor(r,h))]).toLowerCase().includes(t) } catch { return false }
  })
}
function valueFor(row, h) {
  if (h in row) return normalizeDisplay(h, row[h])
  return row.widgetValues?.[h]
}
function normalizeDisplay(header, value) {
  return value == null ? '' : String(value)
}

// Special mode extraction: map targeted node widgets to labeled values
const DEFAULT_SPECIAL_NODE_TYPES = [
  'KSampler',
  'KSamplerAdvanced',
  'LoraLoaderModelOnly',
  'CR Apply LoRA Stack',
  'Power Lora Loader (rgthree)',
  'ClownsharKSampler_Beta',
  'CheckpointLoaderSimple',
  'WanVideoLoraSelect',
  'WanVideoSampler',
  'WanVideoTextEncode',
]

function getSpecialNodeTypeSet() {
  try {
    // Allow extension via window hook (legacy)
    const fromWindow = (typeof window !== 'undefined' && Array.isArray(window.__SPECIAL_NODE_TYPES__)) ? window.__SPECIAL_NODE_TYPES__ : null
    if (Array.isArray(fromWindow) && fromWindow.length) return new Set(fromWindow.map(String))
  } catch {}
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem('special_node_types') : null
    if (raw) {
      const arr = JSON.parse(raw)
      if (Array.isArray(arr) && arr.length) return new Set(arr.map(String))
    }
  } catch {}
  return new Set(DEFAULT_SPECIAL_NODE_TYPES)
}

function extractSpecialWidgetValues(workflowNorm, whitelistEnabled) {
  const out = {}
  if (!workflowNorm) return out
  let wf = null
  try { wf = JSON.parse(String(workflowNorm)) } catch { return out }
  if (!wf || typeof wf !== 'object') return out
  const nodes = Array.isArray(wf.nodes) ? wf.nodes : []
  const special = getSpecialNodeTypeSet()
  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue
    const type = node.type || node.class_type || 'UnknownType'
    if (whitelistEnabled && !special.has(String(type))) continue
    const id = node.id != null ? node.id : 'UnknownID'
    const title = node.title
    const nodeIdent = title && title !== type ? `${title} (${type} #${id})` : `${type} #${id}`
    const outs = Array.isArray(node.outputs) ? node.outputs : []
    if (!outs.length) continue
    const wv = Array.isArray(node.widgets_values) ? node.widgets_values : []
    if (!wv.length) continue
    // Use the first widget value as the representative value for all outputs
    const firstVal = wv.find(v => v !== undefined && v !== null && String(v) !== '')
    const val = firstVal !== undefined ? firstVal : wv[0]
    const norm = typeof val === 'object' ? JSON.stringify(val) : val
    for (const o of outs) {
      if (!o || typeof o !== 'object') continue
      const outName = o.name || `out_${o.slot_index ?? ''}`
      out[`${nodeIdent}.${outName}`] = norm
    }
  }
  return out
}


