import { randomUUID } from 'crypto'
import { promises as fs } from 'fs'
import path from 'path'
import sharp from 'sharp'
import { MAX_FILE_MB } from '@/lib/config'
import { ApiError } from './validation'

// Каталог загрузок: env UPLOADS_DIR (в Docker — /data/uploads, volume) либо
// ./data/uploads относительно рабочей директории (локальный запуск).
const UPLOAD_DIR = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(process.cwd(), 'data', 'uploads')

// Запрещённые расширения — исполняемые файлы (ФТ-5.2)
const FORBIDDEN_EXTENSIONS = new Set([
  '.exe', '.msi', '.msix', '.bat', '.cmd', '.com', '.scr', '.ps1', '.vbs', '.wsf',
  '.hta', '.sh', '.bash', '.dll', '.so', '.dylib', '.app', '.jar', '.apk', '.bin', '.reg', '.cpl',
])

export function safeExtension(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase()
  if (!ext || FORBIDDEN_EXTENSIONS.has(ext)) return ''
  if (!/^\.[a-z0-9]{1,8}$/.test(ext)) return ''
  return ext
}

async function ensureDir() {
  await fs.mkdir(UPLOAD_DIR, { recursive: true })
}

export interface StoredFile {
  storageKey: string
  previewKey: string | null
  size: number
}

/**
 * Сохранение файла: валидация размера/типа, запись, генерация превью для картинок
 * (макс. 560px, ФТ-5.2). Превью генерируется синхронно — для MVP-объёмов этого
 * достаточно, очередь — этап 4 (п. 10.7).
 */
export async function storeFile(file: File): Promise<StoredFile> {
  const size = file.size
  if (size === 0) throw new ApiError(`Файл «${file.name}» пуст`)
  if (size > MAX_FILE_MB * 1024 * 1024) {
    throw new ApiError(`Файл «${file.name}» больше ${MAX_FILE_MB} МБ`)
  }
  const ext = safeExtension(file.name)
  if (file.name && path.extname(file.name) && !ext) {
    throw new ApiError(`Тип файла «${file.name}» не разрешён (исполняемые файлы запрещены)`)
  }

  await ensureDir()
  const buffer = Buffer.from(await file.arrayBuffer())
  const storageKey = `${randomUUID()}${ext}`
  await fs.writeFile(path.join(UPLOAD_DIR, storageKey), buffer)

  let previewKey: string | null = null
  if (file.type.startsWith('image/') && file.type !== 'image/svg+xml' && size > 60 * 1024) {
    try {
      const previewBuffer = await sharp(buffer)
        .rotate()
        .resize(560, 560, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 78 })
        .toBuffer()
      previewKey = `${randomUUID()}.webp`
      await fs.writeFile(path.join(UPLOAD_DIR, previewKey), previewBuffer)
    } catch (e) {
      // не критично: превью не обязательно
      console.warn('[storage] preview failed:', e)
    }
  }

  return { storageKey, previewKey, size }
}

export async function deleteStored(key: string) {
  try {
    await fs.unlink(path.join(UPLOAD_DIR, key))
  } catch {
    // файл мог быть уже удалён
  }
}

export async function readStored(key: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(path.join(UPLOAD_DIR, key))
  } catch {
    return null
  }
}

export function storedFilePath(key: string): string {
  return path.join(UPLOAD_DIR, key)
}

export async function storedFileSize(key: string): Promise<number | null> {
  try {
    const stat = await fs.stat(storedFilePath(key))
    return stat.size
  } catch {
    return null
  }
}

/** Чтение байтового диапазона (HTTP Range для видео/аудио) */
export async function readStoredRange(key: string, start: number, end: number): Promise<Buffer | null> {
  const length = end - start + 1
  if (length <= 0) return null
  try {
    const fd = await fs.open(storedFilePath(key), 'r')
    const buffer = Buffer.alloc(length)
    await fd.read(buffer, 0, length, start)
    await fd.close()
    return buffer
  } catch {
    return null
  }
}

/** Сохранение из буфера (импорт bundle, серверные операции) */
export async function storeBuffer(buffer: Buffer, fileName: string, mime: string): Promise<StoredFile> {
  const size = buffer.length
  if (size === 0) throw new ApiError(`Файл «${fileName}» пуст`)
  if (size > MAX_FILE_MB * 1024 * 1024) {
    throw new ApiError(`Файл «${fileName}» больше ${MAX_FILE_MB} МБ`)
  }
  const ext = safeExtension(fileName)
  if (fileName && path.extname(fileName) && !ext) {
    throw new ApiError(`Тип файла «${fileName}» не разрешён`)
  }

  await ensureDir()
  const storageKey = `${randomUUID()}${ext}`
  await fs.writeFile(path.join(UPLOAD_DIR, storageKey), buffer)

  let previewKey: string | null = null
  if (mime.startsWith('image/') && mime !== 'image/svg+xml' && size > 60 * 1024) {
    try {
      const previewBuffer = await sharp(buffer)
        .rotate()
        .resize(560, 560, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 78 })
        .toBuffer()
      previewKey = `${randomUUID()}.webp`
      await fs.writeFile(path.join(UPLOAD_DIR, previewKey), previewBuffer)
    } catch (e) {
      console.warn('[storage] preview failed:', e)
    }
  }

  return { storageKey, previewKey, size }
}

export function mimeFromFileName(name: string): string {
  const ext = path.extname(name).toLowerCase()
  const map: Record<string, string> = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
    '.webp': 'image/webp', '.svg': 'image/svg+xml', '.pdf': 'application/pdf',
    '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
    '.csv': 'text/csv; charset=utf-8', '.json': 'application/json',
    '.zip': 'application/zip', '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.webm': 'video/webm',
  }
  return map[ext] ?? 'application/octet-stream'
}
