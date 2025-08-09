import React from 'react'
import { Button } from './ui/button.jsx'
import { Card, CardContent } from './ui/card.jsx'
import { Media } from './Media.jsx'

function formatTime(t) {
  const s = Math.floor(t % 60).toString().padStart(2, '0')
  const m = Math.floor(t / 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

function buildCaptionLines(item, labelFields = []) {
  const lines = []
  try {
    const wfVals = (item && typeof item === 'object' && item.widgetValues && typeof item.widgetValues === 'object') ? item.widgetValues : {}
    if (Array.isArray(labelFields) && labelFields.length) {
      for (const key of labelFields) {
        const val = wfVals[key]
        if (val != null && val !== '') {
          lines.push(`${key}: ${typeof val === 'object' ? JSON.stringify(val) : String(val)}`)
        }
      }
    }
    if (lines.length === 0) lines.push(String(item?.name || ''))
  } catch {
    try { lines.push(String(item?.name || '')) } catch {}
  }
  return lines
}

function Row({ item, onRemove, index, showLabels, labelFields }) {
  return (
    <div className="bg-card border rounded p-2 mr-2">
      <div className="flex flex-col items-start">
        <Media source={item} width={'10rem'} />
        {showLabels && (
          <div className="mt-2 max-w-[10rem] text-[10px] leading-snug text-muted-foreground whitespace-pre-wrap break-words">
            {buildCaptionLines(item, labelFields).join('\n')}
          </div>
        )}
        <div className="mt-2 w-full flex items-center gap-2">
          <div className="min-w-0">
            <div className="text-sm truncate" title={item.path}>{item.name}</div>
            <div className="text-[11px] text-muted-foreground">{formatTime(item.durationSeconds || 0)}</div>
          </div>
          <div className="ml-auto">
            <Button variant="secondary" size="sm" onClick={() => onRemove(index)}>Remove</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function Timeline({ items, onChange, showLabels = false, labelFields = [] }) {
  function removeAt(index) {
    onChange(items.filter((_, i) => i !== index))
  }

  const totalDur = Math.floor(items.reduce((sum, it) => sum + (it.durationSeconds || 0), 0))

  return (
    <div className="space-y-3"
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}
      onDrop={(e) => {
        e.preventDefault()
        const v = window.__dragVideo
        if (v) {
          onChange([...items, v])
        }
      }}
    >
      <div className="flex items-center justify-between text-sm opacity-70">
        <span>Timeline</span>
        <span>Total: {formatTime(totalDur)}</span>
      </div>
      <Card>
        <CardContent className="space-y-2 p-3">
          {items.length === 0 ? (
            <div className="border-2 border-dashed rounded p-6 text-sm text-muted-foreground text-center">
              Drag clips here or use the library “Add” buttons to build your timeline.
            </div>
          ) : (
            items.map((item, idx) => (
              <Row key={idx} item={item} index={idx} onRemove={removeAt} showLabels={showLabels} labelFields={labelFields} />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}


