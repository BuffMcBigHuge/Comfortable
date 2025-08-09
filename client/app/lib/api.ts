const BASE_URL = 'http://127.0.0.1:5180'

export type AnalyzeItem = Record<string, unknown>

export async function analyzeFiles(files: File[]): Promise<AnalyzeItem[]> {
  const form = new FormData()
  for (const file of files) {
    form.append('files', file, file.name)
  }
  console.log('[client] POST /analyze', { count: files.length })
  const res = await fetch(`${BASE_URL}/analyze`, { method: 'POST', body: form })
  console.log('[client] /analyze response', res.status)
  if (!res.ok) throw new Error(`Analyze failed (${res.status})`)
  const data = await res.json()
  return Array.isArray(data?.items) ? data.items : []
}

export interface ExportOptions {
  mode: string
  gridColumns: number
  showBlackBars: boolean
  showFilename: boolean
  resolution: string
  fps: number
  // Optional: which workflow widget keys to include in per-clip overlay labels
  labelFields?: string[]
}

// Optionally pass a parallel array of JSON-able objects (e.g., widgetValues) mapped 1:1 to clips.
export async function exportClips(options: ExportOptions, clips: File[], workflows?: unknown[]): Promise<Blob> {
  const form = new FormData()
  form.append('mode', options.mode)
  form.append('gridColumns', String(options.gridColumns))
  form.append('showBlackBars', String(Boolean(options.showBlackBars)))
  form.append('showFilename', String(Boolean(options.showFilename)))
  form.append('resolution', options.resolution)
  form.append('fps', String(options.fps))
  if (options.labelFields && options.labelFields.length) {
    try { form.append('labelFields', JSON.stringify(options.labelFields)) } catch {}
  }
  for (const file of clips) {
    form.append('clips', file, file.name)
  }
  if (Array.isArray(workflows) && workflows.length) {
    workflows.forEach((wf, i) => {
      try {
        const json = JSON.stringify(wf ?? {})
        const blob = new Blob([json], { type: 'application/json' })
        form.append('workflows', blob, `workflow-${String(i).padStart(3,'0')}.json`)
      } catch {}
    })
  }
  console.log('[client] POST /export', { options, clipCount: clips.length })
  const res = await fetch(`${BASE_URL}/export`, { method: 'POST', body: form })
  console.log('[client] /export response', res.status)
  if (!res.ok) throw new Error(`Export failed (${res.status})`)
  return res.blob()
}

export async function probeClip(file: File): Promise<Record<string, unknown>> {
  const form = new FormData()
  form.append('clip', file, file.name)
  console.log('[client] POST /probe', { name: file.name, size: file.size })
  const res = await fetch(`${BASE_URL}/probe`, { method: 'POST', body: form })
  console.log('[client] /probe response', res.status)
  if (!res.ok) throw new Error(`Probe failed (${res.status})`)
  return res.json()
}


