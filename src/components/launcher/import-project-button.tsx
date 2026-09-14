'use client'

import { useRef } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useImportProject } from '@/lib/api'

export function ImportProjectButton({ onImported }: { onImported?: (projectId: string) => void }) {
  const t = useTranslations('launcher')
  const inputRef = useRef<HTMLInputElement>(null)
  const importProject = useImportProject()

  async function onFile(file: File) {
    try {
      const res = await importProject.mutateAsync(file)
      toast.success(
        t('importSuccess', {
          key: res.key,
          tasks: res.tasks,
          graphNodes: res.graphNodes,
          attachments: res.attachments ?? 0,
        })
      )
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
        {importProject.isPending ? t('importPending') : t('importButton')}
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
