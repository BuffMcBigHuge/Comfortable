import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from './ui/select.jsx'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu'
import { Checkbox } from '@/components/ui/checkbox'

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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              {(() => { const map = { name: 'Name', size: 'Size', lastModified: 'Modified' }; return `By: ${map[sortKey] || 'Name'}` })()}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            <DropdownMenuLabel>Sort By</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup value={sortKey} onValueChange={setSortKey}>
              <DropdownMenuRadioItem value="name">Name</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="size">Size</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="lastModified">Modified</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">{sortDir === 'asc' ? 'Asc' : 'Desc'}</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-32">
            <DropdownMenuLabel>Direction</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup value={sortDir} onValueChange={setSortDir}>
              <DropdownMenuRadioItem value="asc">Asc</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="desc">Desc</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
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
        <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox id="ctrl-black-bars" checked={showBlackBars} onCheckedChange={(v)=>setShowBlackBars(Boolean(v))} />
          <label htmlFor="ctrl-black-bars" className="cursor-pointer">Black Bars</label>
        </div>
        <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox id="ctrl-filename" checked={showFilename} onCheckedChange={(v)=>setShowFilename(Boolean(v))} />
          <label htmlFor="ctrl-filename" className="cursor-pointer">Filename</label>
        </div>
        <Button disabled={busy} onClick={() => onExport({ mode, gridColumns, showBlackBars, showFilename })}>{busy ? 'Exporting...' : 'Export'}</Button>
      </div>
    </div>
  )
}


