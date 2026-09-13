/** Сообщение SSE: клиенты инвалидируют кэш React Query */
export type ProjectRealtimeMessage = {
  v: 1
  at: number
  projectId: string
  /** Handshake при подключении — не триггерит refetch */
  hello?: boolean
  taskId?: string
  taskIds?: string[]
  /** full — список/канбан/граф; task — панель задачи; graph — канвас; none — без refetch */
  scope?: 'full' | 'task' | 'graph' | 'none'
}
