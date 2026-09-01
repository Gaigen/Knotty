import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate'
import { buildProjectExport, stripBundleInternals } from '@/lib/server/project-export'
import { readStored } from '@/lib/server/storage'
import type { ProjectExportV1 } from '@/lib/server/project-import'

export async function buildProjectExportZip(projectId: string): Promise<{ filename: string; bytes: Uint8Array }> {
  const raw = await buildProjectExport(projectId)
  const exportJson = stripBundleInternals(raw)
  const files: Record<string, Uint8Array> = {
    'export.json': strToU8(JSON.stringify(exportJson, null, 2)),
  }

  for (const t of raw.tasks) {
    for (const a of t.attachments ?? []) {
      const bundlePath = (a as { bundlePath?: string }).bundlePath
      const storageKey = (a as { storageKey?: string }).storageKey
      if (!bundlePath || !storageKey) continue
      const buf = await readStored(storageKey)
      if (!buf) continue
      files[bundlePath] = new Uint8Array(buf)
    }
  }

  const bytes = zipSync(files, { level: 6 })
  const filename = `${raw.project.key}-export.zip`
  return { filename, bytes }
}

export function parseProjectImportBundle(zipBytes: Uint8Array): {
  data: ProjectExportV1
  bundleFiles: Map<string, Buffer>
} {
  const entries = unzipSync(zipBytes)
  const jsonRaw = entries['export.json']
  if (!jsonRaw) throw new Error('В архиве нет export.json')
  const data = JSON.parse(strFromU8(jsonRaw)) as ProjectExportV1
  const bundleFiles = new Map<string, Buffer>()
  for (const [path, bytes] of Object.entries(entries)) {
    if (path === 'export.json' || path.endsWith('/')) continue
    bundleFiles.set(path, Buffer.from(bytes))
  }
  return { data, bundleFiles }
}
