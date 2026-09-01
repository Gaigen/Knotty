'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Launcher } from '@/components/launcher/launcher'
import { ProjectView } from '@/components/project/project-view'
import { AuthGate } from '@/components/auth/auth-gate'
import { Skeleton } from '@/components/ui/skeleton'

function AppShell() {
  const sp = useSearchParams()
  const projectId = sp.get('project')
  const tab = (sp.get('tab') ?? 'tasks') as 'tasks' | 'board' | 'graph'
  const taskId = sp.get('task')

  return (
    <AuthGate>
      {projectId ? (
        <ProjectView projectId={projectId} initialTab={tab} taskId={taskId} />
      ) : (
        <Launcher />
      )}
    </AuthGate>
  )
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <div className="flex w-full max-w-md flex-col gap-3 p-8">
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
      }
    >
      <AppShell />
    </Suspense>
  )
}
