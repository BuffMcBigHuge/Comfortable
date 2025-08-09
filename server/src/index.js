import express from 'express'
import cors from 'cors'
import multer from 'multer'
import { v4 as uuidv4 } from 'uuid'
import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegStatic from 'ffmpeg-static'
import ffprobeStatic from 'ffprobe-static'

// Configure ffmpeg binary
ffmpeg.setFfmpegPath(ffmpegStatic)
ffmpeg.setFfprobePath(ffprobeStatic.path)

const app = express()
app.use(cors())

// Simple verbose request/response logger
app.use((req, res, next) => {
  const startMs = Date.now()
  const ip = req.ip || req.connection?.remoteAddress || ''
  const ct = req.headers['content-type']
  const cl = req.headers['content-length']
  console.log(`[req] ${req.method} ${req.url}`, { ip, contentType: ct, contentLength: cl })
  res.on('finish', () => {
    const dur = Date.now() - startMs
    console.log(`[res] ${req.method} ${req.url} -> ${res.statusCode} (${dur}ms)`)
  })
  next()
})

app.get('/health', (req, res) => res.json({ ok: true }))

// Storage to temp uploads
const TMP = path.resolve(process.cwd(), 'tmp')
fs.mkdirSync(TMP, { recursive: true })
const upload = multer({ dest: TMP, limits: { fileSize: 1024 * 1024 * 1024 }})

function parseFps(stream) {
  const rate = stream?.avg_frame_rate || stream?.r_frame_rate || ''
  if (typeof rate === 'string' && rate.includes('/')) {
    const [n, d] = rate.split('/')
    const num = Number(n)
    const den = Number(d)
    if (num > 0 && den > 0) return num / den
  }
  if (typeof rate === 'number') return Number(rate)
  return 0
}

function extractWorkflowFromTags(tags) {
  // Normalize keys to lowercase for case-insensitive lookup
  const lower = {}
  try {
    if (tags && typeof tags === 'object') {
      for (const [k, v] of Object.entries(tags)) lower[String(k).toLowerCase()] = v
    }
  } catch {}

  // Helper: parse JSON if string; return object or null
  const parseMaybeJson = (val) => {
    try {
      if (val == null) return null
      if (typeof val === 'object') return val
      if (typeof val === 'string') {
        const trimmed = val.trim()
        if (!trimmed) return null
        return JSON.parse(trimmed)
      }
    } catch {}
    return null
  }

  // 1) Direct workflow fields used by various tools/variants
  const directKeys = [
    'comfyui_workflow',
    'comfy_workflow',
    'workflow',
    'workflowjson',
    'workflow_json',
  ]
  for (const key of directKeys) {
    if (key in lower) {
      const parsed = parseMaybeJson(lower[key])
      // Some encoders put workflow as a JSON string inside a JSON object
      if (parsed && (parsed.nodes || parsed.links)) return { found: true, workflowObj: parsed }
      if (parsed && parsed.workflow) {
        const nested = parseMaybeJson(parsed.workflow)
        if (nested && (nested.nodes || nested.links)) return { found: true, workflowObj: nested }
      }
      // If value itself is a JSON string of the workflow
      const nested = parseMaybeJson(lower[key])
      if (nested && (nested.nodes || nested.links)) return { found: true, workflowObj: nested }
    }
  }

  // 2) Comment/description fields containing a JSON blob with `workflow` or a workflow-shaped object
  const hintKeys = ['comment', 'description']
  for (const key of hintKeys) {
    if (key in lower && typeof lower[key] === 'string') {
      const parsed = parseMaybeJson(lower[key])
      if (parsed) {
        if (parsed.workflow) {
          const nested = parseMaybeJson(parsed.workflow)
          if (nested && (nested.nodes || nested.links)) return { found: true, workflowObj: nested }
        }
        if (parsed.nodes || parsed.links) return { found: true, workflowObj: parsed }
      }
    }
  }

  return { found: false, workflowObj: null }
}

// Flatten minimal widget values similar to Python version (limited scope)
function extractWidgetValuesMap(workflowObj) {
  const result = {}
  if (!workflowObj || typeof workflowObj !== 'object') return result
  const nodes = Array.isArray(workflowObj.nodes) ? workflowObj.nodes : []
  const links = new Map()
  if (Array.isArray(workflowObj.links)) {
    for (const row of workflowObj.links) {
      if (Array.isArray(row) && row.length >= 5) {
        const linkId = row[0]
        const fromNode = row[1]
        if (Number.isInteger(linkId)) links.set(linkId, { fromNode })
      }
    }
  }
  const nodeById = new Map(nodes.filter(n => Number.isInteger(n?.id)).map(n => [n.id, n]))
  const getNodeIdent = (node) => {
    const t = node?.type || node?.class_type || 'UnknownType'
    const id = node?.id ?? 'UnknownID'
    const title = node?.title
    return title && title !== t ? `${title} (${t} #${id})` : `${t} #${id}`
  }
  const resolveLinkValue = (linkId) => {
    if (!Number.isInteger(linkId)) return null
    const lk = links.get(linkId)
    if (!lk) return null
    const src = nodeById.get(lk.fromNode)
    if (!src) return null
    const wv = Array.isArray(src.widgets_values) ? src.widgets_values : []
    if (wv.length) return typeof wv[0] === 'object' ? JSON.stringify(wv[0]) : wv[0]
    return getNodeIdent(src)
  }
  for (const node of nodes.slice().sort((a, b) => (a.id||0) - (b.id||0))) {
    const ident = getNodeIdent(node)
    const ins = Array.isArray(node.inputs) ? node.inputs : []
    for (const inp of ins) {
      if (!inp || typeof inp !== 'object') continue
      const name = inp.name || 'input'
      let val = null
      if ('link' in inp && inp.link != null) {
        val = resolveLinkValue(inp.link)
      } else if ('value' in inp) {
        val = inp.value
      }
      const key = `${ident}.inputs.${name}`
      result[key] = typeof val === 'object' ? JSON.stringify(val) : val
    }
    const wv = Array.isArray(node.widgets_values) ? node.widgets_values : []
    for (let i = 0; i < wv.length; i++) {
      const key = `${ident}.widgets_values[${i}]`
      const v = wv[i]
      result[key] = typeof v === 'object' ? JSON.stringify(v) : v
    }
  }
  return result
}

// Analyze uploaded files for video metadata and ComfyUI workflow tags
app.post('/analyze', upload.array('files', 200), async (req, res) => {
  try {
    console.log('[analyze] request received')
    const files = req.files || []
    console.log('[analyze] file count', files.length)
    if (!files.length) {
      console.log('[analyze] no files in request')
      return res.json({ items: [] })
    }
    const items = []
    for (const f of files) {
      console.log('[analyze] probing', { name: f.originalname, path: f.path, size: f.size })
      // probe
      const meta = await new Promise(resolve => {
        ffmpeg.ffprobe(f.path, (err, data) => {
          if (err) {
            console.warn('[analyze] ffprobe error for', f.originalname, err?.message || err)
            return resolve(null)
          }
          resolve(data)
        })
      })
      const vStream = meta?.streams?.find(s => s.codec_type === 'video') || {}
      const duration = Number(meta?.format?.duration || vStream?.duration || 0) || 0
      const width = Number(vStream?.width || 0) || 0
      const height = Number(vStream?.height || 0) || 0
      const fps = parseFps(vStream)
      // Try format-level tags, then stream-level tags to detect embedded workflow JSON
      const tagSources = []
      try { if (meta?.format?.tags) tagSources.push(meta.format.tags) } catch {}
      try {
        for (const s of (meta?.streams || [])) if (s?.tags) tagSources.push(s.tags)
      } catch {}
      let workflowObj = null
      let workflowNorm = null
      let widgetValues = {}
      for (const t of tagSources) {
        const { found, workflowObj: wfObj } = extractWorkflowFromTags(t || {})
        if (found && wfObj && typeof wfObj === 'object') {
          workflowObj = wfObj
          break
        }
      }
      if (workflowObj) {
        try {
          workflowNorm = JSON.stringify(workflowObj)
          widgetValues = extractWidgetValuesMap(workflowObj)
        } catch {}
      }
      // ctime
      let ctimeEpoch = 0
      let ctimeIso = ''
      try {
        const stat = await fs.promises.stat(f.path)
        ctimeEpoch = stat.ctimeMs ? stat.ctimeMs/1000 : Math.floor(stat.ctime?.getTime?.()/1000)||0
        ctimeIso = new Date(ctimeEpoch*1000).toISOString()
      } catch {}

      items.push({
        file_path: f.originalname,
        name: f.originalname,
        size: f.size,
        duration,
        width,
        height,
        fps: fps ? Math.round(fps) : 0,
        __file_ctime_epoch: Number.isFinite(ctimeEpoch) ? Number(ctimeEpoch.toFixed(6)) : 0,
        __file_ctime_iso: ctimeIso,
        workflowNorm,
        widgetValues
      })
    }
    console.log('[analyze] responding with items', items.length)
    res.json({ items })
  } catch (e) {
    console.error('[analyze] error', e)
    res.status(500).json({ error: 'analyze_failed' })
  } finally {
    // cleanup temp uploads
    try {
      for (const f of req.files || []) fs.unlink(f.path, () => {})
    } catch {}
  }
})

// Probe endpoint to extract width/height/fps from a single clip
app.post('/probe', upload.single('clip'), async (req, res) => {
  try {
    console.log('[probe] request received')
    const filePath = req.file?.path
    if (!filePath) {
      console.log('[probe] no file in request')
      return res.status(400).json({ error: 'No clip uploaded' })
    }
    console.log('[probe] probing', { name: req.file?.originalname, path: filePath, size: req.file?.size })
    await new Promise((resolve) => {
      ffmpeg.ffprobe(filePath, (err, data) => {
        if (err) {
          console.warn('[probe] ffprobe error', err?.message || err)
          return resolve(res.json({ width: 0, height: 0, fps: 0 }))
        }
        const stream = (data.streams || []).find(s => s.codec_type === 'video') || {}
        const width = Number(stream.width || 0) || 0
        const height = Number(stream.height || 0) || 0
        let fps = 0
        const rate = stream.avg_frame_rate || stream.r_frame_rate || ''
        if (typeof rate === 'string' && rate.includes('/')) {
          const [n, d] = rate.split('/')
          const num = Number(n)
          const den = Number(d)
          if (num > 0 && den > 0) fps = num / den
        } else if (typeof rate === 'number') {
          fps = Number(rate)
        }
        console.log('[probe] result', { width, height, fps })
        resolve(res.json({ width, height, fps }))
      })
    })
  } catch (e) {
    console.error('[probe] error', e)
    res.json({ width: 0, height: 0, fps: 0 })
  } finally {
    try { if (req.file?.path) fs.unlink(req.file.path, () => {}) } catch {}
  }
})

// Utility to probe duration
function probeDuration(filePath) {
  return new Promise((resolve) => {
    try {
      ffmpeg.ffprobe(filePath, (err, data) => {
        if (err) return resolve(0)
        const stream = (data.streams || []).find(s => s.codec_type === 'video')
        const d = data.format?.duration || stream?.duration || 0
        resolve(Number(d) || 0)
      })
    } catch {
      resolve(0)
    }
  })
}

// Export endpoint
// Accepts multipart fields:
// - clips: multiple .mp4 files (order defines timeline)
// - workflows: optional json files mapped 1:1 to clips
// - mode: 'sequential' | 'grid'
// - gridColumns, showBlackBars, showFilename, resolution, fps
app.post('/export', upload.fields([{ name: 'clips', maxCount: 200 }, { name: 'workflows', maxCount: 200 }]), async (req, res) => {
  try {
    console.log('[export] request received')
    const mode = req.body.mode || 'sequential'
    const gridColumns = Number(req.body.gridColumns || 2)
    const showBlackBars = String(req.body.showBlackBars) === 'true'
    const showFilename = String(req.body.showFilename) === 'true'
    const resolution = (req.body.resolution || '1920x1080')
    const fps = Number(req.body.fps || 30)
    // Optional multi-select label fields from client
    let labelFields = []
    try {
      if (req.body.labelFields) {
        const parsed = JSON.parse(String(req.body.labelFields))
        if (Array.isArray(parsed)) labelFields = parsed.map(v => String(v))
      }
    } catch {}

    const width = Number(resolution.split('x')[0])
    const height = Number(resolution.split('x')[1])

    const clips = (req.files?.clips || [])
    // Optional: per-clip workflow jsons containing widgetValues
    const workflowFiles = (req.files?.workflows || [])
    const workflows = []
    for (const wf of workflowFiles) {
      try {
        const text = await fs.promises.readFile(wf.path, 'utf8')
        const obj = JSON.parse(text)
        workflows.push(obj || {})
      } catch {
        workflows.push({})
      }
    }
    while (workflows.length < clips.length) workflows.push({})

    console.log('[export] options', { mode, gridColumns, showBlackBars, showFilename, resolution, fps, labelFieldsCount: labelFields.length, workflows: workflowFiles.length })
    console.log('[export] clip count', clips.length)
    clips.forEach((c, i) => console.log(`[export] clip[${i}]`, { name: c.originalname, path: c.path, size: c.size }))
    if (!clips.length) {
      return res.status(400).send('No clips uploaded')
    }

    // Prepare normalized temporary copies and optional overlays for filename
    const workDir = path.join(TMP, uuidv4())
    fs.mkdirSync(workDir, { recursive: true })

    // Grid layout parameters (also used to determine normalization target size for grid mode)
    const gridCols = mode === 'grid' ? Math.max(2, gridColumns) : 1
    const gridRows = mode === 'grid' ? Math.ceil(clips.length / gridCols) : 1
    const targetW = mode === 'grid' ? Math.floor(width / gridCols) : width
    const targetH = mode === 'grid' ? Math.floor(height / gridRows) : height

    const normalized = []
    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i]
      const inputPath = clip.path
      const baseName = clip.originalname
      const outPath = path.join(workDir, `${i.toString().padStart(3,'0')}.mp4`)

      // scale and pad/crop
      const vf = showBlackBars
        ? `scale=w=${targetW}:h=${targetH}:force_original_aspect_ratio=decrease,pad=${targetW}:${targetH}:(ow-iw)/2:(oh-ih)/2`
        : `scale=w=${targetW}:h=${targetH}:force_original_aspect_ratio=increase,crop=${targetW}:${targetH}`

      await new Promise(async (resolve, reject) => {
        try {
          if (showFilename) {
            // Build multiline label from selected workflow fields, or fallback to filename
            function xmlEscape(str) {
              return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/\"/g, '&quot;')
                .replace(/'/g, '&apos;')
            }
            const wfObj = workflows[i] || {}
            const wfVals = (wfObj && typeof wfObj === 'object' && wfObj.widgetValues && typeof wfObj.widgetValues === 'object') ? wfObj.widgetValues : {}
            const lines = []
            if (Array.isArray(labelFields) && labelFields.length) {
              for (const key of labelFields) {
                const val = wfVals[key]
                if (val != null && val !== '') {
                  lines.push(`${key}: ${typeof val === 'object' ? JSON.stringify(val) : String(val)}`)
                }
              }
            }
            if (lines.length === 0) {
              lines.push(baseName.replace(/:/g, '_'))
            }
            const lineHeight = 22
            const padding = 8
            const textYStart = padding + lineHeight
            const labelH = padding * 2 + lineHeight * lines.length
            // Ensure XML-safe content: strip control chars that XML does not allow
            function stripInvalidXmlChars(str) {
              return String(str).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ')
            }
            const textSpans = lines
              .map((t, idx) => {
                const safe = xmlEscape(stripInvalidXmlChars(t))
                return `<text x="10" y="${textYStart + idx * lineHeight}" font-size="18" fill="#fff" font-family="Arial, Helvetica, sans-serif">${safe}</text>`
              })
              .join('\n')
            // Use real newlines and SVG-compatible fill + opacity attributes
            const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${targetW}" height="${labelH}" viewBox="0 0 ${targetW} ${labelH}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="${targetW}" height="${labelH}" fill="black" fill-opacity="0.55"/>
  ${textSpans}
</svg>`
            const labelPath = path.join(workDir, `label-${i}.png`)
            await sharp(Buffer.from(svg)).png().toFile(labelPath)

            // Compose: scale+pad/crop then overlay label at bottom
            const cmd = ffmpeg()
              .input(inputPath)
              .input(labelPath)
              .complexFilter([
                {
                  filter: 'scale',
                  options: { w: targetW, h: targetH, force_original_aspect_ratio: showBlackBars ? 'decrease' : 'increase' },
                  inputs: '0:v',
                  outputs: 'scaled'
                },
                showBlackBars
                  ? {
                      filter: 'pad', options: { w: targetW, h: targetH, x: '(ow-iw)/2', y: '(oh-ih)/2' }, inputs: 'scaled', outputs: 'fitted'
                    }
                  : {
                      filter: 'crop', options: { w: targetW, h: targetH }, inputs: 'scaled', outputs: 'fitted'
                    },
                { filter: 'overlay', options: { x: 0, y: targetH - labelH }, inputs: ['fitted', '1:v'], outputs: 'outv' }
              ])
              .outputOptions([
                '-map', '[outv]',
                '-r', String(fps),
                '-pix_fmt', 'yuv420p',
                '-preset', 'veryfast',
                '-crf', '20',
                '-an',
                '-map_metadata', '-1',
                '-map_chapters', '-1',
                '-metadata', 'title=',
                '-metadata', 'comment=',
                '-metadata', 'description=',
                '-metadata', 'creation_time=',
                '-metadata', 'handler_name=',
                '-metadata', 'encoder=',
                '-metadata:s:v:0', 'title=',
                '-metadata:s:v:0', 'comment=',
                '-metadata:s:v:0', 'description=',
                '-metadata:s:v:0', 'creation_time=',
                '-metadata:s:v:0', 'handler_name=',
                '-metadata:s:v:0', 'encoder='
              ])
              .videoCodec('libx264')
              .save(outPath)
              .on('start', (cmd) => console.log('[ffmpeg normalize+label start]', cmd))
              .on('stderr', (line) => console.log('[ffmpeg normalize+label stderr]', line))
              .on('end', resolve)
              .on('error', reject)
          } else {
            ffmpeg(inputPath)
              .videoFilters(vf)
              .outputOptions([
                '-r', String(fps),
                '-pix_fmt', 'yuv420p',
                '-preset', 'veryfast',
                '-crf', '20',
                '-an',
                '-map_metadata', '-1',
                '-map_chapters', '-1',
                '-metadata', 'title=',
                '-metadata', 'comment=',
                '-metadata', 'description=',
                '-metadata', 'creation_time=',
                '-metadata', 'handler_name=',
                '-metadata', 'encoder=',
                '-metadata:s:v:0', 'title=',
                '-metadata:s:v:0', 'comment=',
                '-metadata:s:v:0', 'description=',
                '-metadata:s:v:0', 'creation_time=',
                '-metadata:s:v:0', 'handler_name=',
                '-metadata:s:v:0', 'encoder='
              ])
              .videoCodec('libx264')
              .output(outPath)
              .on('start', (cmd) => console.log('[ffmpeg normalize start]', cmd))
              .on('stderr', (line) => console.log('[ffmpeg normalize stderr]', line))
              .on('end', resolve)
              .on('error', reject)
              .run()
          }
        } catch (e) {
          reject(e)
        }
      })
      normalized.push({ path: outPath, name: baseName })
    }

    // Compose outputs
    const outFile = path.join(workDir, `export-${Date.now()}.mp4`)

    if (mode === 'sequential') {
      // Use concat demuxer for reliable sequential join
      const listPath = path.join(workDir, 'concat.txt')
      const listContent = normalized.map(n => `file '${n.path.replace(/\\/g, '\\\\')}'`).join('\n')
      await fs.promises.writeFile(listPath, listContent)
      console.log('[export] concat list file at', listPath)
      await new Promise((resolve, reject) => {
        ffmpeg()
          .input(listPath)
          .inputOptions(['-f', 'concat', '-safe', '0'])
          .outputOptions([
            '-r', String(fps),
            '-pix_fmt', 'yuv420p',
            '-preset', 'veryfast',
            '-crf', '20',
            '-an',
            '-map_metadata', '-1',
            '-map_chapters', '-1',
            '-metadata', 'title=',
            '-metadata', 'comment=',
            '-metadata', 'description=',
            '-metadata', 'creation_time=',
            '-metadata', 'handler_name=',
            '-metadata', 'encoder=',
            '-metadata:s:v:0', 'title=',
            '-metadata:s:v:0', 'comment=',
            '-metadata:s:v:0', 'description=',
            '-metadata:s:v:0', 'creation_time=',
            '-metadata:s:v:0', 'handler_name=',
            '-metadata:s:v:0', 'encoder='
          ])
          .videoCodec('libx264')
          .save(outFile)
          .on('start', (cmd) => console.log('[ffmpeg concat start]', cmd))
          .on('stderr', (line) => console.log('[ffmpeg concat stderr]', line))
          .on('end', resolve)
          .on('error', reject)
      })
    } else if (mode === 'grid') {
      // Build grid using xstack filter. Inputs are already normalized to cell size.
      const cols = gridCols
      const rows = gridRows
      const cellW = targetW
      const cellH = targetH

      const inputs = normalized.map(n => n.path)
      const n = inputs.length
      const layout = []
      for (let i = 0; i < n; i++) {
        const r = Math.floor(i / cols)
        const c = i % cols
        layout.push(`${c * cellW}_${r * cellH}`)
      }
      const xstack = `xstack=inputs=${n}:layout=${layout.join('|')}:fill=black`

      await new Promise((resolve, reject) => {
        const cmd = ffmpeg()
        inputs.forEach(inp => cmd.input(inp))
        cmd
          .complexFilter([`${xstack},scale=${width}:${height}`])
          .videoCodec('libx264')
          .outputOptions([
            '-pix_fmt', 'yuv420p',
            '-r', String(fps),
            '-preset', 'veryfast',
            '-crf', '20',
            '-an',
            '-map_metadata', '-1',
            '-map_chapters', '-1',
            '-metadata', 'title=',
            '-metadata', 'comment=',
            '-metadata', 'description=',
            '-metadata', 'creation_time=',
            '-metadata', 'handler_name=',
            '-metadata', 'encoder=',
            '-metadata:s:v:0', 'title=',
            '-metadata:s:v:0', 'comment=',
            '-metadata:s:v:0', 'description=',
            '-metadata:s:v:0', 'creation_time=',
            '-metadata:s:v:0', 'handler_name=',
            '-metadata:s:v:0', 'encoder='
          ])
          .save(outFile)
          .on('start', (cmd) => console.log('[ffmpeg xstack start]', cmd))
          .on('stderr', (line) => console.log('[ffmpeg xstack stderr]', line))
          .on('end', resolve)
          .on('error', reject)
      })
    } else {
      return res.status(400).send('Invalid mode')
    }

    // stream the output
    res.setHeader('Content-Type', 'video/mp4')
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(outFile)}"`)
    fs.createReadStream(outFile).pipe(res)
  } catch (e) {
    console.error('[export] error', e)
    res.status(500).send(e?.message || 'Export failed')
  }
})

const PORT = Number(process.env.PORT || 5180)
app.listen(PORT, () => {
  console.log(`[server] listening on http://127.0.0.1:${PORT}`)
  try {
    console.log('[server] ffmpeg path', ffmpegStatic)
    console.log('[server] ffprobe path', ffprobeStatic.path)
  } catch {}
})


