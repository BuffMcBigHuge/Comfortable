import React, { useEffect, useMemo, useState } from 'react'
import { Timeline } from './components/Timeline.jsx'
import { VideoTable } from './components/VideoTable.jsx'
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card.jsx'
import { analyzeFiles, exportClips, probeClip } from './lib/api.ts'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer'
import { Button } from './components/ui/button.jsx'
import { Input } from './components/ui/input.jsx'
import { toast } from 'sonner'
import { ButtonGroup } from '@/components/ui/button-group'
import { ModeToggle } from '@/components/ModeToggle'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'

// Recursively walk a directory and collect .mp4 files
async function* walkDirectory(handle, currentPath = '') {
  for await (const entry of handle.values()) {
    try {
      if (entry.kind === 'file') {
        if (entry.name.toLowerCase().endsWith('.mp4')) {
          yield { handle: entry, name: entry.name, path: `${currentPath}${entry.name}` }
        }
      } else if (entry.kind === 'directory') {
        yield* walkDirectory(entry, `${currentPath}${entry.name}/`)
      }
    } catch {}
  }
}

export default function App() {
  const [timeline, setTimeline] = useState([])    // array of selected videos
  const [tableRows, setTableRows] = useState([])  // analyzer rows for VideoTable
  const [labelSourceHeaders, setLabelSourceHeaders] = useState([]) // headers visible in table
  // Library-only sorting
  const [sortKey, setSortKey] = useState('ctime') // name | duration | fps | size | ctime
  const [sortDir, setSortDir] = useState('desc')  // asc | desc
  const [busy, setBusy] = useState(false)
  const [libraryBusy, setLibraryBusy] = useState(false)
  const [resolution, setResolution] = useState('1920x1080')
  const [fps, setFps] = useState(30)
  const [mode, setMode] = useState('sequential') // sequential | grid
  const [gridColumns, setGridColumns] = useState(2)
  const [showBlackBars, setShowBlackBars] = useState(true)
  const [showFilename, setShowFilename] = useState(false)
  const [labelFields, setLabelFields] = useState([])
  const [isTimelineOpen, setIsTimelineOpen] = useState(false)

  async function analyzeAndSet(files) {
    const items = await analyzeFiles(files)
    setTableRows(prev => {
      const base = Array.isArray(prev) ? prev.length : 0
      const next = items.map((it, i) => ({ id: base + i, _file: files[i], ...it }))
      return [...(prev || []), ...next]
    })
  }

  async function onPickDirectory() {
    try {
      setLibraryBusy(true)
      const dir = await window.showDirectoryPicker()
      const handles = []
      for await (const entry of dir.values()) {
        if (entry.kind === 'file' && entry.name.toLowerCase().match(/\.(mp4|webm|mov|mkv)$/)) handles.push(entry)
      }
      if (!handles.length) return
      const files = []
      for (const h of handles) {
        try { files.push(await h.getFile()) } catch {}
      }
      await analyzeAndSet(files)
    } catch (e) {
      // user canceled
    } finally { setLibraryBusy(false) }
  }

  async function onPickFiles() {
    try {
      setLibraryBusy(true)
      const handles = await window.showOpenFilePicker({ multiple: true, types: [{ description: 'Video', accept: { 'video/*': ['.mp4'] } }] })
      const files = []
      for (const h of handles) {
        try { files.push(await h.getFile()) } catch {}
      }
      await analyzeAndSet(files)
    } catch {} finally { setLibraryBusy(false) }
  }

  function acceptVideoFile(name = '') {
    return /\.(mp4|webm|mov|mkv)$/i.test(String(name))
  }

  async function onDropToLibrary(e) {
    e.preventDefault()
    try {
      const list = Array.from(e.dataTransfer?.files || []).filter(f => acceptVideoFile(f.name))
      if (!list.length) return
      setLibraryBusy(true)
      await analyzeAndSet(list)
    } finally { setLibraryBusy(false) }
  }

  const sortedLibraryRows = useMemo(() => {
    const list = [...tableRows]
    const dir = sortDir === 'asc' ? 1 : -1
    list.sort((a, b) => {
      if (sortKey === 'name') return String(a.name||'').localeCompare(String(b.name||'')) * dir
      if (sortKey === 'duration') return ((Number(a.duration)||0) - (Number(b.duration)||0)) * dir
      if (sortKey === 'fps') return ((Number(a.fps)||0) - (Number(b.fps)||0)) * dir
      if (sortKey === 'size') return ((Number(a.size)||0) - (Number(b.size)||0)) * dir
      if (sortKey === 'ctime') return ((Number(a.__file_ctime_epoch)||0) - (Number(b.__file_ctime_epoch)||0)) * dir
      return 0
    })
    return list
  }, [tableRows, sortKey, sortDir])

  // Preferred: adhere to currently visible table columns. Fallback to timeline if none.
  const availableLabelKeys = useMemo(() => {
    const BASE = new Set(['file_path','__file_ctime_epoch','__file_ctime_iso','name','size','duration','width','height','fps'])
    const tableDerived = (labelSourceHeaders || []).filter(h => !BASE.has(String(h)))
    if (tableDerived.length) return tableDerived.sort()
    const set = new Set()
    for (const item of timeline) {
      const vals = item?.widgetValues || {}
      Object.keys(vals).forEach(k => set.add(k))
    }
    return Array.from(set).sort()
  }, [labelSourceHeaders, timeline])

  async function onExport() {
    try {
      if (!timeline.length) return
      setBusy(true)
      const clips = []
      for (let i = 0; i < timeline.length; i++) {
        try {
          if (timeline[i]?.handle?.getFile) {
            clips.push(await timeline[i].handle.getFile())
          } else if (timeline[i]?._file instanceof File) {
            clips.push(timeline[i]._file)
          } else if (timeline[i]?.file instanceof File) {
            clips.push(timeline[i].file)
          }
        } catch {}
      }
      // Treat resolution as per-cell; expand to full canvas for grid mode
      let resolutionToSend = resolution
      try {
        const [wStr, hStr] = String(resolution).split('x')
        const baseW = parseInt(wStr, 10)
        const baseH = parseInt(hStr, 10)
        if (mode === 'grid' && Number.isFinite(baseW) && Number.isFinite(baseH) && baseW > 0 && baseH > 0) {
          const cols = Math.max(1, Number(gridColumns) || 1)
          const rows = Math.max(1, Math.ceil(clips.length / cols))
          resolutionToSend = `${baseW * cols}x${baseH * rows}`
        }
      } catch {}
      // Prepare parallel workflows array containing just widgetValues per clip
      const workflows = timeline.map(it => ({ widgetValues: it?.widgetValues || {} }))

      const blob = await exportClips({
        mode,
        gridColumns,
        showBlackBars: Boolean(showBlackBars),
        showFilename: Boolean(showFilename),
        resolution: resolutionToSend,
        fps,
        labelFields,
      }, clips, workflows)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `export-${Date.now()}.mp4`
      document.body.appendChild(a)
      a.click()
      URL.revokeObjectURL(url)
      a.remove()
    } catch (e) {
      alert(e?.message || 'Export failed')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    // Clean drag helper on unmount
    return () => { try { delete window.__dragVideo } catch {} }
  }, [])

  useEffect(() => {
    // When the first item is added to the timeline, probe it to set default resolution and fps
    (async () => {
      if (timeline.length !== 1) return
      try {
        const first = timeline[0]
        let file = null
        if (first?._file instanceof File) file = first._file
        else if (first?.file instanceof File) file = first.file
        else if (first?.handle?.getFile) file = await first.handle.getFile()
        if (!file) return
        const meta = await probeClip(file)
        const w = Number(meta.width || 0)
        const h = Number(meta.height || 0)
        const f = Number(meta.fps || 0)
        if (w > 0 && h > 0) setResolution(`${w}x${h}`)
        if (f > 0) setFps(Math.round(f))
      } catch {}
    })()
  }, [timeline.length])

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto p-4 space-y-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-start gap-3">
              <CardTitle className="flex items-center gap-3">
                <ModeToggle />
                <span><b>COMF</b>ORTABLE</span>
              </CardTitle>
              <Drawer open={isTimelineOpen} onOpenChange={setIsTimelineOpen} direction="right">
                <DrawerTrigger asChild>
                  <Button variant="outline" size="sm">Timeline <span className="ml-1 text-xs opacity-70">({timeline.length})</span></Button>
                </DrawerTrigger>
                <DrawerContent>
                  <div className="flex h-full min-h-[300px] flex-col">
                    <DrawerHeader className="text-left">
                      <DrawerTitle>Timeline</DrawerTitle>
                      <DrawerDescription>Arrange clips and configure export settings.</DrawerDescription>
                    </DrawerHeader>
                    <div className="px-4 pb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <label className="text-sm text-muted-foreground">Mode</label>
                        <ButtonGroup>
                          <Button
                            variant={mode==='sequential' ? 'secondary' : 'outline'}
                            size="sm"
                            onClick={()=>setMode('sequential')}
                            aria-pressed={mode==='sequential'}
                          >
                            Sequential
                          </Button>
                          <Button
                            variant={mode==='grid' ? 'secondary' : 'outline'}
                            size="sm"
                            onClick={()=>setMode('grid')}
                            aria-pressed={mode==='grid'}
                          >
                            Grid
                          </Button>
                        </ButtonGroup>
                        {mode === 'grid' && (
                          <>
                            <label className="text-sm text-muted-foreground">Cols</label>
                            <Input type="number" min={2} max={6} value={gridColumns} onChange={e=>setGridColumns(Number(e.target.value)||2)} className="w-20" />
                          </>
                        )}
                        <label className="inline-flex items-center gap-2 text-sm text-muted-foreground"><input type="checkbox" checked={showBlackBars} onChange={e=>setShowBlackBars(e.target.checked)} /> Black Bars</label>
                        <label className="inline-flex items-center gap-2 text-sm text-muted-foreground"><input type="checkbox" checked={showFilename} onChange={e=>setShowFilename(e.target.checked)} /> Labels</label>
                        {showFilename && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="sm">Select label fields ({labelFields.length})</Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="w-[520px] max-h-80 overflow-auto">
                              {availableLabelKeys.length === 0 ? (
                                <div className="text-xs text-muted-foreground px-2 py-1.5">No workflow fields detected in timeline</div>
                              ) : (
                                availableLabelKeys.map((key) => (
                                  <DropdownMenuCheckboxItem
                                    key={key}
                                    checked={labelFields.includes(key)}
                                    onCheckedChange={(checked) => {
                                      setLabelFields(prev => {
                                        const set = new Set(prev)
                                        if (checked) set.add(key)
                                        else set.delete(key)
                                        return Array.from(set)
                                      })
                                    }}
                                  >
                                    <span className="font-mono text-[11px] leading-tight break-all">{key}</span>
                                  </DropdownMenuCheckboxItem>
                                ))
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                        <label className="text-sm text-muted-foreground ml-2">Res</label>
                        <Input value={resolution} onChange={e=>setResolution(e.target.value)} className="w-32" />
                        <label className="text-sm text-muted-foreground">FPS</label>
                        <Input type="number" min={1} max={120} value={fps} onChange={e=>setFps(Number(e.target.value)||30)} className="w-24" />
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto px-4">
                      <Timeline items={timeline} showLabels={showFilename} labelFields={labelFields} onChange={(next) => {
                        if (next.length > timeline.length) {
                          const added = next[next.length - 1]
                          try { toast.success('Added to timeline', { description: added?.name || 'Clip' }) } catch {}
                        }
                        setTimeline(next)
                      }} />
                    </div>
                    <DrawerFooter className="pt-2">
                      <Button disabled={busy || timeline.length===0} onClick={() => { onExport(); }}>
                        {busy ? 'Exporting...' : 'Export'}
                      </Button>
                      <DrawerClose asChild>
                        <Button variant="outline">Close</Button>
                      </DrawerClose>
                    </DrawerFooter>
                  </div>
                </DrawerContent>
              </Drawer>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {sortedLibraryRows.length === 0 ? (
              <div
                className="mt-4 border-2 border-dashed rounded-lg p-10 grid place-items-center text-center"
                onDragOver={(e)=>{ e.preventDefault(); e.dataTransfer.dropEffect='copy' }}
                onDrop={onDropToLibrary}
              >
                <div className="space-y-3 max-w-xl">
                  <div className="text-2xl font-semibold">No videos loaded</div>
                  <div className="text-sm text-muted-foreground">
                    Load a folder or select ComfyUI video files to analyze metadata and build your timeline. You can also drag and drop video files here.
                  </div>
                  <div className="flex items-center justify-center gap-2">
                    <Button variant="secondary" disabled={libraryBusy} onClick={onPickDirectory}>{libraryBusy ? 'Loading…' : 'Load Directory'}</Button>
                    <Button variant="secondary" disabled={libraryBusy} onClick={onPickFiles}>{libraryBusy ? 'Loading…' : 'Load Files'}</Button>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Supported: .mp4
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-2">
                <div className="flex items-center gap-2 mb-3">
                  <Button variant="secondary" disabled={libraryBusy} onClick={onPickDirectory}>{libraryBusy ? 'Loading…' : 'Load Directory'}</Button>
                  <Button variant="secondary" disabled={libraryBusy} onClick={onPickFiles}>{libraryBusy ? 'Loading…' : 'Load Files'}</Button>
                  {sortedLibraryRows.length > 1 && (
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="outline">Clear</Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Clear all files?</DialogTitle>
                          <DialogDescription>This will remove all loaded files from the library. This does not affect the timeline.</DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                          <DialogClose asChild>
                            <Button variant="outline">Cancel</Button>
                          </DialogClose>
                          <DialogClose asChild>
                            <Button variant="destructive" onClick={() => setTableRows([])}>Clear</Button>
                          </DialogClose>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  )}
                  <div className="ml-auto flex items-center gap-2">
                    <label className="text-sm text-muted-foreground">Sort</label>
                    <select value={sortKey} onChange={(e)=>setSortKey(e.target.value)} className="bg-background border rounded px-2 py-1">
                      <option value="name">Name</option>
                      <option value="duration">Duration</option>
                      <option value="fps">FPS</option>
                      <option value="size">Size</option>
                      <option value="ctime">Creation</option>
                    </select>
                    <select value={sortDir} onChange={(e)=>setSortDir(e.target.value)} className="bg-background border rounded px-2 py-1">
                      <option value="asc">Asc</option>
                      <option value="desc">Desc</option>
                    </select>
                  </div>
                </div>
                <VideoTable
                  rows={sortedLibraryRows}
                  setRows={setTableRows}
                  onHeadersChange={(hdrs) => setLabelSourceHeaders(Array.isArray(hdrs) ? hdrs : [])}
                  onAdd={(row) => {
                    setTimeline(t => [...t, { name: row.name, path: row.file_path || row.name, _file: row._file || row.file || null, widgetValues: row.widgetValues || {} }])
                    try { toast.success('Added to timeline', { description: row.name }) } catch {}
                  }}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}


