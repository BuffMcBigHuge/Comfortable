import React, { useMemo, useState } from 'react'
import { Button } from './ui/button.jsx'
import { ButtonGroup } from './ui/button-group'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card.jsx'
import { analyzeFiles } from '../lib/api.ts'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'

function TableView({ items }) {
  const headers = useMemo(() => {
    const base = ['name', 'duration', 'width', 'height', 'fps']
    const dynamic = new Set()
    for (const it of items) {
      if (it.widgetValues) {
        Object.keys(it.widgetValues).forEach(k => { if (String(k).includes('widgets_values')) dynamic.add(k) })
      }
    }
    return [...base, ...Array.from(dynamic).sort()]
  }, [items])
  return (
    <div className="overflow-auto border rounded">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            {headers.map(h => <th key={h} className="text-left p-2 border-b">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {items.map((it, idx) => (
            <tr key={idx} className="border-b hover:bg-muted/30">
              {headers.map(h => (
                <td key={h} className="p-2 align-top">
                  {h in it ? String(it[h]) : String(it.widgetValues?.[h] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DiffView({ items }) {
  const headers = useMemo(() => {
    const set = new Set()
    for (const it of items) {
      Object.keys(it.widgetValues || {}).forEach(k => { if (String(k).includes('widgets_values')) set.add(k) })
    }
    return Array.from(set).sort()
  }, [items])

  function changedCols(curr, prev) {
    const cols = new Set()
    for (const h of headers) {
      const a = curr.widgetValues?.[h]
      const b = prev?.widgetValues?.[h]
      if ((a ?? '') !== (b ?? '')) cols.add(h)
    }
    return cols
  }

  return (
    <div className="space-y-3">
      {items.map((row, i) => {
        const prev = i > 0 ? items[i-1] : null
        const changed = prev ? changedCols(row, prev) : new Set()
        return (
          <div key={i} className="p-3">
            <div className="flex items-center justify-between text-sm mb-2">
              <div className="font-medium">#{i+1} {row.name}</div>
              <div className="text-muted-foreground">{row.width}x{row.height} • {row.fps}fps • {Math.round(row.duration)}s {row.workflowFound ? '• workflow' : ''}</div>
            </div>
            {!prev ? (
              <div className="text-muted-foreground text-sm">Baseline row</div>
            ) : changed.size === 0 ? (
              <div className="text-muted-foreground text-sm">No changes vs previous</div>
            ) : (
              <div className="grid gap-2">
                {Array.from(changed).map(h => (
                  <div key={h} className="grid grid-cols-[minmax(240px,320px),1fr] gap-3 text-sm">
                    <div className="text-muted-foreground break-all">{h}</div>
                    <div className="font-mono break-all">
                      <div className="text-emerald-400">{String(row.widgetValues?.[h] ?? '')}</div>
                      <div className="text-red-400/80 text-xs">{String(prev?.widgetValues?.[h] ?? '')}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export function WorkflowCompare() {
  const [items, setItems] = useState([])
  const [view, setView] = useState('diff') // 'diff' | 'table'
  const [busy, setBusy] = useState(false)

  async function onPickDirectory() {
    try {
      const dir = await window.showDirectoryPicker()
      setBusy(true)
      const files = []
      for await (const entry of dir.values()) {
        if (entry.kind === 'file' && entry.name.toLowerCase().match(/\.(mp4|webm|mov|mkv)$/)) {
          files.push(entry)
        }
      }
      if (!files.length) return
      const picked = []
      for (const h of files) {
        const file = await h.getFile()
        picked.push(file)
      }
      const analyzed = await analyzeFiles(picked)
      setItems(prev => [...prev, ...analyzed])
    } catch {} finally { setBusy(false) }
  }

  async function onPickFiles() {
    try {
      const handle = await window.showOpenFilePicker({ multiple: true, types: [{ description: 'Video', accept: { 'video/*': ['.mp4',] } }] })
      setBusy(true)
      const picked = []
      for (const h of handle) {
        const file = await h.getFile()
        picked.push(file)
      }
      const analyzed = await analyzeFiles(picked)
      setItems(prev => [...prev, ...analyzed])
    } catch {} finally { setBusy(false) }
  }

  return (
    <Card>
      <CardHeader className="p-3">
        <CardTitle className="text-base">Workflow Compare</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-3">
        <div className="flex items-center gap-2">
          <Button variant="secondary" disabled={busy} onClick={onPickDirectory}>Load Directory</Button>
          <Button variant="secondary" disabled={busy} onClick={onPickFiles}>Load Files</Button>
          {items.length > 1 && <ClearAll items={items} setItems={setItems} />}
          <div className="ml-auto">
            <ButtonGroup>
              <Button
                variant={view === 'diff' ? 'secondary' : 'outline'}
                onClick={() => setView('diff')}
                aria-pressed={view === 'diff'}
              >
                Diff
              </Button>
              <Button
                variant={view === 'table' ? 'secondary' : 'outline'}
                onClick={() => setView('table')}
                aria-pressed={view === 'table'}
              >
                Table
              </Button>
            </ButtonGroup>
          </div>
        </div>
        {items.length === 0 ? (
          <div className="text-sm text-muted-foreground">Load videos to analyze embedded workflow tags and metadata.</div>
        ) : view === 'table' ? (
          <TableView items={items} />
        ) : (
          <DiffView items={items} />
        )}
      </CardContent>
    </Card>
  )
}

function ClearAll({ items, setItems }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="ml-2">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" disabled={items.length === 0}>Clear</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear all files?</DialogTitle>
            <DialogDescription>This will remove all loaded files from this comparison view.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <DialogClose asChild>
              <Button variant="destructive" onClick={() => setItems([])}>Clear</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}


