'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useCreateProject, useUpdateProject } from '@/lib/api'
import { PROJECT_COLORS } from '@/lib/config'
import { suggestKeyFromName } from '@/lib/translit'
import { cn } from '@/lib/utils'
import type { ProjectSummaryDto } from '@/lib/types'

/** Модалка создания/редактирования проекта (ФТ-1.6, ФТ-1.7) */
export function ProjectDialog({
  open,
  onOpenChange,
  project,
  onCreated,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  project?: ProjectSummaryDto | null
  onCreated?: (id: string) => void
}) {
  const isEdit = !!project
  const create = useCreateProject()
  const update = useUpdateProject()

  const [name, setName] = useState('')
  const [key, setKey] = useState('')
  const [keyTouched, setKeyTouched] = useState(false)
  const [description, setDescription] = useState('')
  const [color, setColor] = useState(PROJECT_COLORS[0])
  const [prevSession, setPrevSession] = useState('')

  // сброс полей при открытии (паттерн «правка состояния при рендере» вместо эффекта)
  const session = `${open ? 'open' : 'closed'}:${project?.id ?? 'new'}`
  if (session !== prevSession) {
    setPrevSession(session)
    if (open) {
      setName(project?.name ?? '')
      setKey(project?.key ?? '')
      setKeyTouched(isEdit)
      setDescription(project?.description ?? '')
      setColor(project?.color ?? PROJECT_COLORS[0])
    }
  }

  // автогенерация ключа транслитом, пока пользователь не трогал поле (ФТ-1.6) — производное значение
  const effectiveKey = keyTouched ? key : isEdit ? key : suggestKeyFromName(name)

  const keyError = effectiveKey && !/^[A-Z]{2,5}$/.test(effectiveKey) ? '2–5 латинских букв' : null

  function submit() {
    if (!name.trim()) {
      toast.error('Введите название проекта')
      return
    }
    if (!/^[A-Z]{2,5}$/.test(effectiveKey)) {
      toast.error('Ключ проекта: 2–5 латинских букв')
      return
    }
    if (isEdit && project) {
      update.mutate(
        { id: project.id, name: name.trim(), description, color },
        {
          onSuccess: () => {
            toast.success('Проект обновлён')
            onOpenChange(false)
          },
          onError: (e) => toast.error(e.message),
        }
      )
    } else {
      create.mutate(
        { name: name.trim(), key: effectiveKey, description, color },
        {
          onSuccess: (r) => {
            toast.success('Проект создан')
            onOpenChange(false)
            onCreated?.(r.id)
          },
          onError: (e) => toast.error(e.message),
        }
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Редактировать проект' : 'Новый проект'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Изменение данных проекта.' : 'Ключ используется в номерах задач, например ' + (effectiveKey || 'VERF') + '-12.'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-1">
          <div className="grid gap-2">
            <Label htmlFor="project-name">Название *</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: Knotty — релиз 1.0"
              autoFocus
            />
          </div>
          {!isEdit && (
            <div className="grid gap-2">
              <Label htmlFor="project-key">Ключ *</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="project-key"
                  value={effectiveKey}
                  onChange={(e) => {
                    setKeyTouched(true)
                    setKey(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5))
                  }}
                  placeholder="VERF"
                  className="w-28 font-mono"
                  aria-describedby="key-hint"
                />
                <span id="key-hint" className="text-xs text-muted-foreground">
                  автогенерация из названия, можно изменить
                </span>
              </div>
              {keyError && <p className="text-xs text-destructive">{keyError}</p>}
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="project-desc">Описание</Label>
            <Textarea
              id="project-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Коротко, о чём проект"
              rows={2}
            />
          </div>
          <div className="grid gap-2">
            <Label>Цвет</Label>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Цвет проекта">
              {PROJECT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={color === c}
                  onClick={() => setColor(c)}
                  className={cn(
                    'h-7 w-7 rounded-full border-2 transition-transform hover:scale-110',
                    color === c ? 'border-foreground' : 'border-transparent'
                  )}
                  style={{ backgroundColor: c }}
                  aria-label={`Цвет ${c}`}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button onClick={submit} disabled={create.isPending || update.isPending || !name.trim() || !!keyError}>
            {isEdit ? 'Сохранить' : 'Создать проект'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
