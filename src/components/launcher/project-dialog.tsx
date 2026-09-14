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
  const t = useTranslations('dialogs')
  const tc = useTranslations('common')
  const isEdit = !!project
  const create = useCreateProject()
  const update = useUpdateProject()

  const [name, setName] = useState('')
  const [key, setKey] = useState('')
  const [keyTouched, setKeyTouched] = useState(false)
  const [description, setDescription] = useState('')
  const [color, setColor] = useState(PROJECT_COLORS[0])
  const [prevSession, setPrevSession] = useState('')

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

  const effectiveKey = keyTouched ? key : isEdit ? key : suggestKeyFromName(name)
  const keyError = effectiveKey && !/^[A-Z]{2,5}$/.test(effectiveKey) ? t('keyValidationError') : null

  function submit() {
    if (!name.trim()) {
      toast.error(t('projectNameRequired'))
      return
    }
    if (!/^[A-Z]{2,5}$/.test(effectiveKey)) {
      toast.error(t('projectKeyRequired'))
      return
    }
    if (isEdit && project) {
      update.mutate(
        { id: project.id, name: name.trim(), description, color },
        {
          onSuccess: () => {
            toast.success(t('projectUpdated'))
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
            toast.success(t('projectCreated'))
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
          <DialogTitle>{isEdit ? t('projectEditTitle') : t('projectCreateTitle')}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? t('projectEditDesc')
              : t('projectCreateDesc', { key: effectiveKey || 'VERF' })}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-1">
          <div className="grid gap-2">
            <Label htmlFor="project-name">{t('projectName')}</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('projectNamePlaceholder')}
              autoFocus
            />
          </div>
          {!isEdit && (
            <div className="grid gap-2">
              <Label htmlFor="project-key">{t('projectKey')}</Label>
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
                  {t('projectKeyHint')}
                </span>
              </div>
              {keyError && <p className="text-xs text-destructive">{keyError}</p>}
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="project-desc">{t('projectDesc')}</Label>
            <Textarea
              id="project-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('projectDescPlaceholder')}
              rows={2}
            />
          </div>
          <div className="grid gap-2">
            <Label>{t('color')}</Label>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('color')}>
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
                  aria-label={t('colorAria', { color: c })}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{tc('cancel')}</Button>
          <Button onClick={submit} disabled={create.isPending || update.isPending || !name.trim() || !!keyError}>
            {isEdit ? tc('save') : t('createProject')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
