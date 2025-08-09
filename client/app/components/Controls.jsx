import React, { useState } from 'react'
import { Button } from './ui/button.jsx'
import { Input } from './ui/input.jsx'
import { Select } from './ui/select.jsx'

export function Controls({ onPickDirectory, onPickFiles, sortKey, setSortKey, sortDir, setSortDir, query, setQuery, onExport, busy, resolution, setResolution, fps, setFps }) {
  const [mode, setMode] = useState('sequential') // sequential | grid
  const [gridColumns, setGridColumns] = useState(2)
  const [showBlackBars, setShowBlackBars] = useState(true)
  const [showFilename, setShowFilename] = useState(false)

  return (
    <div className="grid gap-3">
      {(onPickDirectory || onPickFiles) && (
        <div className="flex items-center gap-2">
          {onPickDirectory && <Button variant="secondary" onClick={onPickDirectory}>Load Directory</Button>}
          {onPickFiles && <Button variant="secondary" onClick={onPickFiles}>Load Files</Button>}
        </div>
      )}
      <div className="flex items-center gap-2">
        <label className="text-sm text-muted-foreground">Sort</label>
        <Select value={sortKey} onChange={e => setSortKey(e.target.value)}>
          <option value="name">Name</option>
          <option value="size">Size</option>
          <option value="lastModified">Modified</option>
        </Select>
        <Select value={sortDir} onChange={e => setSortDir(e.target.value)}>
          <option value="asc">Asc</option>
          <option value="desc">Desc</option>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <label className="text-sm text-muted-foreground">Search</label>
        <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Filter videos" />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-sm text-muted-foreground">Mode</label>
        <Select value={mode} onChange={e => setMode(e.target.value)}>
          <option value="sequential">Sequential</option>
          <option value="grid">Grid</option>
        </Select>
        {mode === 'grid' && (
          <>
            <label className="text-sm text-muted-foreground">Cols</label>
            <Input type="number" min={2} max={6} value={gridColumns} onChange={e => setGridColumns(Number(e.target.value)||2)} className="w-20" />
          </>
        )}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <label className="text-sm text-muted-foreground">Res</label>
        <Input value={resolution} onChange={e => setResolution(e.target.value)} className="w-32" />
        <label className="text-sm text-muted-foreground">FPS</label>
        <Input type="number" min={1} max={120} value={fps} onChange={e => setFps(Number(e.target.value)||30)} className="w-24" />
        <label className="inline-flex items-center gap-2 text-sm text-muted-foreground"><input type="checkbox" checked={showBlackBars} onChange={e => setShowBlackBars(e.target.checked)} /> Black Bars</label>
        <label className="inline-flex items-center gap-2 text-sm text-muted-foreground"><input type="checkbox" checked={showFilename} onChange={e => setShowFilename(e.target.checked)} /> Filename</label>
        <Button disabled={busy} onClick={() => onExport({ mode, gridColumns, showBlackBars, showFilename })}>{busy ? 'Exporting...' : 'Export'}</Button>
      </div>
    </div>
  )
}


