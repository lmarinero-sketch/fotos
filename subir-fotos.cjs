#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
//  SUBIR-FOTOS.JS — Carga masiva ultra-rápida a Supabase Storage
//  
//  Uso:  node subir-fotos.js <carpeta> <slug-evento>
//  Ej:   node subir-fotos.js "C:\fotos\ironman" ironman-70-3-san-juan
//
//  ✅ Resume automático (si se corta, retoma donde quedó)
//  ✅ 10 subidas en paralelo
//  ✅ Progreso en tiempo real en la terminal
// ═══════════════════════════════════════════════════════════════

const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

// ── Config ──
const SUPABASE_URL = 'https://pxvhovctyewwppwkldaq.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4dmhvdmN0eWV3d3Bwd2tsZGFxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjcxNjc0NCwiZXhwIjoyMDgyMjkyNzQ0fQ.nQhpJ6t4KSn-uLlD1vTL_UzFVfgwal3yS4bN7WJpg3w'
const BUCKET = 'photos'
const CONCURRENT = 10        // subidas simultáneas
const VALID_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff'])

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// ── Argumentos ──
const args = process.argv.slice(2)
if (args.length < 2) {
  console.log(`
  ╔══════════════════════════════════════════════════╗
  ║  SUBIR FOTOS — Carga masiva a Supabase Storage  ║
  ╠══════════════════════════════════════════════════╣
  ║                                                  ║
  ║  Uso:                                            ║
  ║    node subir-fotos.js <carpeta> <slug-evento>   ║
  ║                                                  ║
  ║  Ejemplo:                                        ║
  ║    node subir-fotos.js "C:\\fotos" ironman-sj     ║
  ║                                                  ║
  ╚══════════════════════════════════════════════════╝
  `)
  process.exit(1)
}

const FOLDER = path.resolve(args[0])
const EVENT_SLUG = args[1]
const PROGRESS_FILE = path.join(FOLDER, `.upload-progress-${EVENT_SLUG}.json`)

// ── Helpers ──
function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'))
    }
  } catch (_) {}
  return { uploaded: [], errors: [], startedAt: new Date().toISOString() }
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2))
}

function getImageFiles(folder) {
  return fs.readdirSync(folder)
    .filter(f => {
      const ext = path.extname(f).toLowerCase()
      return VALID_EXTENSIONS.has(ext)
    })
    .sort()
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB'
  return (bytes / 1073741824).toFixed(2) + ' GB'
}

function formatTime(seconds) {
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
}

// ── Semáforo de concurrencia ──
function createSemaphore(max) {
  let current = 0
  const queue = []
  
  return {
    async acquire() {
      if (current < max) {
        current++
        return
      }
      await new Promise(resolve => queue.push(resolve))
      current++
    },
    release() {
      current--
      if (queue.length > 0) {
        queue.shift()()
      }
    }
  }
}

// ── Upload individual ──
async function uploadFile(filePath, fileName, storagePath) {
  const fileBuffer = fs.readFileSync(filePath)
  
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, fileBuffer, {
      cacheControl: '3600',
      upsert: true,
      contentType: getContentType(fileName)
    })
  
  if (error) throw error
}

function getContentType(fileName) {
  const ext = path.extname(fileName).toLowerCase()
  const types = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.png': 'image/png', '.webp': 'image/webp',
    '.tif': 'image/tiff', '.tiff': 'image/tiff'
  }
  return types[ext] || 'application/octet-stream'
}

// ── MAIN ──
async function main() {
  console.log(`
  ╔══════════════════════════════════════════════════╗
  ║       🚀 SUBIDA MASIVA DE FOTOS — JerPro        ║
  ╚══════════════════════════════════════════════════╝
  `)

  // Validar carpeta
  if (!fs.existsSync(FOLDER)) {
    console.error(`  ❌ La carpeta no existe: ${FOLDER}`)
    process.exit(1)
  }

  // Listar archivos
  const allFiles = getImageFiles(FOLDER)
  if (allFiles.length === 0) {
    console.error(`  ❌ No se encontraron imágenes en: ${FOLDER}`)
    process.exit(1)
  }

  // Calcular tamaño total
  let totalBytes = 0
  for (const f of allFiles) {
    totalBytes += fs.statSync(path.join(FOLDER, f)).size
  }

  // Cargar progreso
  const progress = loadProgress()
  const uploadedSet = new Set(progress.uploaded)
  const pending = allFiles.filter(f => !uploadedSet.has(f))

  console.log(`  📂 Carpeta:    ${FOLDER}`)
  console.log(`  🏷️  Evento:     ${EVENT_SLUG}`)
  console.log(`  📸 Total:      ${allFiles.length} fotos (${formatBytes(totalBytes)})`)
  console.log(`  ✅ Ya subidas: ${progress.uploaded.length}`)
  console.log(`  ⏳ Pendientes: ${pending.length}`)
  console.log(`  ⚡ Paralelo:   ${CONCURRENT} simultáneas`)
  console.log(`  💾 Progreso:   ${PROGRESS_FILE}`)
  console.log(`  ──────────────────────────────────────────`)

  if (pending.length === 0) {
    console.log(`\n  🎉 ¡Todas las fotos ya están subidas!`)
    return
  }

  const sem = createSemaphore(CONCURRENT)
  let done = 0
  let errors = 0
  let bytesUploaded = 0
  const startTime = Date.now()

  // Lanzar todas las subidas
  const tasks = pending.map(fileName => {
    return (async () => {
      await sem.acquire()
      const filePath = path.join(FOLDER, fileName)
      const storagePath = `events/${EVENT_SLUG}/${fileName}`
      const fileSize = fs.statSync(filePath).size

      try {
        await uploadFile(filePath, fileName, storagePath)
        
        progress.uploaded.push(fileName)
        done++
        bytesUploaded += fileSize

        // Guardar progreso cada 5 archivos
        if (done % 5 === 0) {
          saveProgress(progress)
        }
      } catch (err) {
        errors++
        progress.errors.push({ file: fileName, error: err.message })
        
        // Guardar progreso del error
        if (errors % 5 === 0) {
          saveProgress(progress)
        }
      } finally {
        sem.release()
      }

      // Mostrar progreso
      const elapsed = (Date.now() - startTime) / 1000
      const speed = bytesUploaded / elapsed
      const remaining = pending.length - done - errors
      const eta = remaining > 0 ? (remaining / (done / elapsed)) : 0
      const pct = Math.round(((done + errors) / pending.length) * 100)

      process.stdout.write(
        `\r  [${pct}%] ✅ ${done} subidas | ❌ ${errors} errores | ⏱️  ${formatTime(elapsed)} | 🚀 ${formatBytes(speed)}/s | ETA: ${formatTime(eta)}   `
      )
    })()
  })

  await Promise.all(tasks)

  // Guardar progreso final
  saveProgress(progress)

  const totalElapsed = (Date.now() - startTime) / 1000

  console.log(`\n\n  ══════════════════════════════════════════`)
  console.log(`  ✅ Subidas exitosas:  ${done}`)
  console.log(`  ❌ Errores:           ${errors}`)
  console.log(`  ⏱️  Tiempo total:      ${formatTime(totalElapsed)}`)
  console.log(`  🚀 Velocidad media:   ${formatBytes(bytesUploaded / totalElapsed)}/s`)

  if (errors > 0) {
    console.log(`\n  ⚠️  Hubo ${errors} errores. Volvé a correr el mismo comando para reintentar.`)
  }

  // Actualizar contador del evento en la DB
  try {
    const { data: eventData } = await supabase
      .from('events')
      .select('id, photo_count')
      .eq('slug', EVENT_SLUG)
      .single()

    if (eventData) {
      await supabase
        .from('events')
        .update({ photo_count: progress.uploaded.length })
        .eq('id', eventData.id)
      
      console.log(`\n  📊 Contador de fotos del evento actualizado: ${progress.uploaded.length}`)
    }
  } catch (_) {
    console.log(`\n  ⚠️  No se pudo actualizar el contador del evento (no afecta las fotos).`)
  }

  console.log(`\n  🎉 ¡Listo! Las fotos están en: ${BUCKET}/events/${EVENT_SLUG}/\n`)
}

main().catch(err => {
  console.error('\n  ❌ Error fatal:', err.message)
  process.exit(1)
})
