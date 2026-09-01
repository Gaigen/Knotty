'use client'

import { useState } from 'react'
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
  const del = useDeleteProject()
  const [keyInput, setKeyInput] = useState('')
  const [prevProjectId, setPrevProjectId] = useState<string | null>(project?.id ?? null)

  // сброс поля при открытии нового проекта (паттерн «правка состояния при рендере»)
  if ((project?.id ?? null) !== prevProjectId) {
    setPrevProjectId(project?.id ?? null)
    setKeyInput('')
  }

  const confirmDisabled = !project || keyInput.trim().toUpperCase() !== project.key

  return (
    <Dialog open={!!project} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-destructive">Удалить проект «{project?.name}»?</DialogTitle>
          <DialogDescription>
            Будут удалены все задачи, связи, вложения, комментарии и ноды графа. Действие необратимо.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 py-2">
          <Label htmlFor="confirm-key">
            Для подтверждения введите ключ проекта <span className="font-mono font-semibold">{project?.key}</span>
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
          <Button variant="outline" onClick={onClose}>Отмена</Button>
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
            {del.isPending ? 'Удаляем…' : 'Удалить навсегда'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
