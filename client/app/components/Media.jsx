import React, { useEffect, useMemo, useState } from 'react'

// Reusable media preview component for File or handle inputs
// Props:
// - source: object that may contain handle.getFile(), _file: File, file: File, or src string
// - className: additional classes for outer wrapper
// - style: inline styles for outer wrapper
// - width: fixed CSS width (e.g., '8rem' or number -> px)
// - controls: show player controls (default true)
// - muted: default true
// - loop: default false
// - onLoaded: callback with HTMLVideoElement when metadata loads
export function Media({
  source,
  className = '',
  style,
  width,
  minWidth,
  minHeight,
  controls = true,
  muted = true,
  loop = false,
  onLoaded,
}) {
  const [url, setUrl] = useState('')
  const [aspectRatio, setAspectRatio] = useState(16 / 9)

  const wrapperStyle = useMemo(() => {
    const w = typeof width === 'number' ? `${width}px` : width
    const mw = typeof minWidth === 'number' ? `${minWidth}px` : minWidth
    const mh = typeof minHeight === 'number' ? `${minHeight}px` : minHeight
    return { width: w, minWidth: mw, minHeight: mh, aspectRatio, ...style }
  }, [width, minWidth, minHeight, aspectRatio, style])

  useEffect(() => {
    let revoked = false
    ;(async () => {
      try {
        // Allow direct src string
        if (typeof source === 'string') {
          setUrl(source)
          return
        }
        if (source?.src && typeof source.src === 'string') {
          setUrl(source.src)
          return
        }
        // Resolve File from various shapes
        let file = null
        if (source?._file instanceof File) file = source._file
        else if (source?.file instanceof File) file = source.file
        else if (source?.handle?.getFile) file = await source.handle.getFile()

        if (file) {
          const blobUrl = URL.createObjectURL(file)
          if (!revoked) setUrl(blobUrl)
        } else {
          setUrl('')
        }
      } catch {
        setUrl('')
      }
    })()
    return () => {
      revoked = true
      if (url && url.startsWith('blob:')) {
        try { URL.revokeObjectURL(url) } catch {}
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source?._file, source?.file, source?.handle])

  return (
    <div className={`bg-muted rounded overflow-hidden ${className}`} style={wrapperStyle}>
      {url ? (
        <video
          src={url}
          className="w-full h-full object-cover"
          muted={muted}
          controls={controls}
          loop={loop}
          playsInline
          preload="metadata"
          onLoadedMetadata={(e) => {
            try {
              const v = e.currentTarget
              if (v.videoWidth && v.videoHeight) setAspectRatio(v.videoWidth / v.videoHeight)
              onLoaded?.(v)
            } catch {}
          }}
        />
      ) : (
        <div className="w-full h-full grid place-items-center text-xs opacity-70">No preview</div>
      )}
    </div>
  )
}


