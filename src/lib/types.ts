// Общие типы API-контрактов (клиент + сервер)

export type TaskType = 'epic' | 'story' | 'task' | 'bug'
export type Priority = 'low' | 'mid' | 'high' | 'crit'
export type LinkType = 'blocks' | 'relates'
export type GraphRefType = 'task' | 'attachment' | 'note' | 'group'
export type GraphCanvasEdgeType = LinkType | 'canvas'

export interface UserDto {
  id: string
  name: string
  email: string
  avatarUrl?: string | null
  // административные поля — возвращаются GET /api/users, игнорируются остальными потребителями
  createdAt?: string
  assignedTasksCount?: number
  isAdmin?: boolean
  hasPassword?: boolean
}

/** Ответ GET /api/auth/session */
export interface SessionUserDto {
  id: string
  name: string
  email: string
  avatarUrl?: string | null
  isAdmin: boolean
}

export interface StatusDto {
  id: string
  projectId: string
  name: string
  color: string
  category: number // 0 бэклог / 1 к работе / 2 в работе / 3 готово
  order: number
}

export interface ProjectSummaryDto {
  id: string
  key: string
  name: string
  description: string
  color: string
  icon?: string | null
  isFavorite: boolean
  counts: { total: number; backlog: number; todo: number; inProgress: number; done: number }
  updatedAt: string
  createdAt: string
}

export interface ProjectDetailDto {
  id: string
  key: string
  name: string
  description: string
  color: string
  icon?: string | null
  /** автодобавление новых задач на канвас графа (умолчание для галочки в модалке) */
  autoGraph: boolean
  isFavorite: boolean
  statuses: StatusDto[]
  counts: { total: number; backlog: number; todo: number; inProgress: number; done: number }
  updatedAt: string
  createdAt: string
}

// Лёгкий контракт списка задач (ФТ-2.1.1): без description
export interface TaskRowDto {
  id: string
  projectId: string
  number: number
  key: string
  type: TaskType
  title: string
  statusId: string
  assigneeId: string | null
  priority: Priority
  dueDate: string | null
  labels: string[]
  parentId: string | null
  hasChildren: boolean
  commentCount: number
  attachmentCount: number
  boardOrder: string
  createdAt: string
  updatedAt: string
  /** совпадение с поисковым запросом (сервер ищет и по тексту описания) */
  matches?: boolean
}

export interface CommentDto {
  id: string
  taskId: string
  authorId: string
  body: string
  createdAt: string
  updatedAt: string
  author: UserDto
}

export interface AttachmentDto {
  id: string
  taskId: string | null
  fileName: string
  size: number
  mime: string
  hasPreview: boolean
  createdAt: string
}

export interface TaskLinkDto {
  linkId: string
  type: LinkType
  dir: 'out' | 'in'
  task: {
    id: string
    key: string
    title: string
    type: TaskType
    statusId: string
    statusName: string
    statusColor: string
    onGraph?: boolean
  }
}

export interface ActivityDto {
  id: string
  event: string
  actorId: string
  payload: Record<string, unknown>
  createdAt: string
  actor: UserDto
}

export interface TaskFullDto extends TaskRowDto {
  onGraph?: boolean
  description: string
  assignee: UserDto | null
  parent: { id: string; key: string; title: string; type: TaskType } | null
  children: TaskRowDto[]
  comments: CommentDto[]
  attachments: AttachmentDto[]
  links: TaskLinkDto[]
  activity: ActivityDto[]
  blockedByCount: number
}

export interface GraphTaskSnapshot {
  id: string
  key: string
  title: string
  type: TaskType
  statusId: string
  statusName: string
  statusColor: string
  statusCategory: number
  assigneeId: string | null
  priority: Priority
  labels: string[]
  dueDate: string | null
  blocked: boolean
  commentCount: number
  attachmentCount: number
}

export interface GraphNodeDto {
  id: string
  refType: GraphRefType
  refId: string | null
  parentId: string | null
  x: number
  y: number
  text: string | null
  w: number | null
  h: number | null
  task?: GraphTaskSnapshot
  attachment?: { id: string; fileName: string; mime: string; hasPreview: boolean }
}

export interface GraphDto {
  nodes: GraphNodeDto[]
  /** canvas / relates / blocks на канвасе; blocks/relates задач — также в Link */
  edges: { id: string; source: string; target: string; type: GraphCanvasEdgeType }[]
  hierarchy: { id: string; source: string; target: string }[]
}
