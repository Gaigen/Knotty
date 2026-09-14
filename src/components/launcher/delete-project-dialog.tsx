'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useDeleteProject } from '@/lib/api'
import type { ProjectSummaryDto } from '@/lib/types'

/** Удаление проекта с вводом ключа (п. 4.2-5) */
export function DeleteProjectDialog({
  project,
  onClose,
  onDeleted,
}: {
  project: ProjectSummaryDto | null
  onClose: () => void
  onDeleted: () => void
}) {
  const t = useTranslations('dialogs')
  const tc = useTranslations('common')
  const del = useDeleteProject()
  const [keyInput, setKeyInput] = useState('')
  const [prevProjectId, setPrevProjectId] = useState<string | null>(project?.id ?? null)

  if ((project?.id ?? null) !== prevProjectId) {
    setPrevProjectId(project?.id ?? null)
    setKeyInput('')
  }

  const confirmDisabled = !project || keyInput.trim().toUpperCase() !== project.key

  return (
    <Dialog open={!!project} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-destructive">
            {project ? t('deleteTitle', { name: project.name }) : ''}
          </DialogTitle>
          <DialogDescription>{t('deleteDesc')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 py-2">
          <Label htmlFor="confirm-key">
            {t('confirmKeyLabel')}{' '}
            <span className="font-mono font-semibold">{project?.key}</span>
          </Label>
          <Input
            id="confirm-key"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value.toUpperCase())}
            placeholder={project?.key}
            className="w-32 font-mono"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{tc('cancel')}</Button>
          <Button
            variant="destructive"
            disabled={confirmDisabled || del.isPending}
            onClick={() =>
              project &&
              del.mutate(
                { id: project.id, key: keyInput.trim().toUpperCase() },
                {
                  onSuccess: onDeleted,
                  onError: (e) => {
                    toast.error(e.message)
                    onClose()
                  },
                }
              )
            }
          >
            {del.isPending ? t('deleting') : t('deleteForever')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
