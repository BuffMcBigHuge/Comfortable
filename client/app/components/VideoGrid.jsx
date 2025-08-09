import React, { useEffect, useState } from 'react'
import { Button } from './ui/button.jsx'
import { Card, CardContent } from './ui/card.jsx'

function VideoCard({ v, onAdd }) {
  const [url, setUrl] = useState('')

  useEffect(() => {
    let revoked = false
    ;(async () => {
      try {
        if (v.handle?.getFile) {
          const file = await v.handle.getFile()
          const blobUrl = URL.createObjectURL(file)
          if (!revoked) setUrl(blobUrl)
        }
      } catch {}
    })()
    return () => {
      revoked = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [v.handle])

  return (
    <div
      className="group rounded overflow-hidden border bg-card"
      draggable
      onDragStart={(e) => {
        try { window.__dragVideo = v } catch {}
        e.dataTransfer.effectAllowed = 'copy'
      }}
    >
      <div className="aspect-video bg-muted">
        {url ? (
          <video src={url} className="w-full h-full object-cover" muted playsInline loop preload="metadata" />
        ) : (
          <div className="w-full h-full grid place-items-center text-xs opacity-70 px-2 text-center break-words">
            {v.name}
          </div>
        )}
      </div>
      <div className="p-2 flex items-center justify-between text-xs">
        <div className="text-muted-foreground truncate max-w-[70%]" title={v.path}>{v.path}</div>
        <Button variant="secondary" size="sm" onClick={() => onAdd(v)}>Add</Button>
      </div>
    </div>
  )
}

export function VideoGrid({ videos, onAdd }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
          {videos.map(v => (
            <VideoCard key={v.path} v={v} onAdd={onAdd} />
          ))}
        </div>
        {videos.length === 0 && (
          <div className="text-sm text-muted-foreground">No videos loaded. Use Load to select files.</div>
        )}
      </CardContent>
    </Card>
  )
}


