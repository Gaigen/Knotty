'use client'

import { useRef } from 'react'
import { toast } from 'sonner'
import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useImportProject } from '@/lib/api'

export function ImportProjectButton({ onImported }: { onImported?: (projectId: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const importProject = useImportProject()

  async function onFile(file: File) {
    try {
      const res = await importProject.mutateAsync(file)
      toast.success(`Импорт «${res.key}»: ${res.tasks} задач, ${res.graphNodes} нод, ${res.attachments ?? 0} файлов`)
      onImported?.(res.projectId)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <>
      <Button
        variant="outline"
        className="gap-1.5"
        disabled={importProject.isPending}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="h-4 w-4" />
        {importProject.isPending ? 'Импорт…' : 'Импорт JSON/ZIP'}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json,application/zip,.zip"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onFile(f)
          e.target.value = ''
        }}
      />
    </>
  )
}
