'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant, MiniMap, Panel,
  useNodesState, useEdgesState, useReactFlow,
  type Connection, type Edge, type Node, type NodeMouseHandler, type NodeTypes, type OnNodeDrag, type Viewport,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  BoxSelect, CheckCircle2, ChevronRight, Flame, GitBranch, ListPlus, Maximize2, Map as MapIcon, Magnet, Network, Pencil, Plus, Search, SquareArrowOutUpRight, Trash2, Upload, UserCircle2, Waypoints, MonitorSmartphone, StickyNote, SquarePlus, Percent, X, ZoomIn, ZoomOut, ArrowRight, ArrowDownCircle, Eye,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command'
import { EmptyState, TypeIcon, UserAvatar } from '@/components/shared/bits'
import { AttachmentViewer } from '@/components/shared/attachment-viewer'
import { MarkdownView, isMarkdownCheckboxInteraction } from '@/components/shared/markdown'
import {
  useCreateLink, useCreateGraphNode, useDeleteGraphNode, useGraph, useSaveGraphPositions, useTasks, useUpdateGraphNode, useUpdateTask,
  useCreateGraphEdge, useDeleteGraphEdge, useBulkAddGraphTasks, useWrapGraphGroup, attachmentFileUrl,
} from '@/lib/api'
import { PRIORITIES, PRIORITY_LABELS_RU, TASK_TYPES, TYPE_LABELS_RU } from '@/lib/config'
import { layoutDependencyStrip, layoutHierarchyColumn, layoutTree } from '@/lib/graph-dagre-layout'
import { prefGet, prefKey, prefSet } from '@/lib/prefs'
import { graphEdgeMarkers } from '@/lib/graph-edge-theme'
import { DEFAULT_GROUP_SIZE, hitTestGroup, toAbsolute, toRelative } from '@/lib/graph-grouping'
import { dropReroutedSelfLoops, hiddenByGroupCollapse, hiddenByTreeCollapse, rerouteCollapsedEdges } from '@/lib/graph-collapse'
import { graphAttachmentDefaultSize, resolveAttachmentPreviewKind } from '@/lib/attachment-preview'
import { cn } from '@/lib/utils'
import { AttachmentNodeCard, NoteNodeCard, TaskNodeCard, type AttachmentNodeData, type NoteNodeData, type TaskNodeData } from '@/components/graph/nodes'
import { GroupNodeCard, type GroupNodeData } from '@/components/graph/graph-group-node'
import { KnottyEdge, type KnottyEdgeData } from '@/components/graph/graph-edges'
import { GraphOffCanvasPanel, GRAPH_TASK_DRAG_TYPE } from '@/components/graph/graph-off-canvas-panel'
import { GraphFilterCheck, GraphToolbarBtn } from '@/components/graph/graph-toolbar-bits'
import { GraphEdgeLegend } from '@/components/graph/graph-edge-legend'
import { GraphCanvasHints } from '@/components/graph/graph-canvas-hints'
import { isEditableTarget } from '@/lib/keyboard'
import type { ProjectDetailDto, UserDto } from '@/lib/types'

const nodeTypes: NodeTypes = {
  taskRF: TaskNodeCard,
  noteRF: NoteNodeCard,
  attachmentRF: AttachmentNodeCard,
  groupRF: GroupNodeCard,
}

const edgeTypes = { knotty: KnottyEdge }

/** Шаблоны быстрых заметок для ПКМ-меню */
const NOTE_TEMPLATES = [
  { id: 'idea', icon: '💡', label: 'Идея', text: '## 💡 Идея\n\n- Суть:\n- Зачем:\n- Что нужно:' },
  { id: 'checklist', icon: '☑️', label: 'Чек-лист', text: '## ☑️ Чек-лист\n\n- [ ] Пункт 1\n- [ ] Пункт 2\n- [ ] Пункт 3' },
  { id: 'question', icon: '❓', label: 'Вопрос', text: '## ❓ Вопрос\n\n**Контекст:**\n\n**Вопрос:**\n\n**Ответ:**' },
  { id: 'risk', icon: '⚠️', label: 'Риск', text: '## ⚠️ Риск\n\n**Что может пойти не так:**\n\n**Вероятность:**\n\n**Митигация:**' },
] as const

export function GraphView({
  project,
  users,
  onOpenTask,
}: {
  project: ProjectDetailDto
  users: UserDto[]
  onOpenTask: (id: string) => void
}) {
  return (
    <ReactFlowProvider>
      <GraphCanvas key={project.id} project={project} users={users} onOpenTask={onOpenTask} />
    </ReactFlowProvider>
  )
}

interface GraphFilters {
  showTasks: boolean
  showNotes: boolean
  showAttachments: boolean
  showHierarchy: boolean
  showBlocks: boolean
  showRelates: boolean
  showCanvas: boolean
  statusIds: string[]
  assigneeIds: string[]
  subtreeFrom: string | null
}

const DEFAULT_GRAPH_FILTERS: GraphFilters = {
  showTasks: true,
  showNotes: true,
  showAttachments: true,
  showHierarchy: true,
  showBlocks: true,
  showRelates: true,
  showCanvas: true,
  statusIds: [],
  assigneeIds: [],
  subtreeFrom: null,
}

function loadGraphFilters(projectId: string): GraphFilters {
  try {
    const raw = prefGet(prefKey(`graphFilters:${projectId}`))
    if (!raw) return DEFAULT_GRAPH_FILTERS
    const parsed = JSON.parse(raw) as Partial<GraphFilters>
    return {
      ...DEFAULT_GRAPH_FILTERS,
      ...parsed,
      subtreeFrom: null,
    }
  } catch {
    return DEFAULT_GRAPH_FILTERS
  }
}

function persistGraphFilters(projectId: string, filters: GraphFilters) {
  try {
    const { subtreeFrom: _, ...rest } = filters
    prefSet(prefKey(`graphFilters:${projectId}`), JSON.stringify(rest))
  } catch {}
}

interface GraphCollapsed {
  groups: string[]
  trees: string[]
}

function loadCollapsed(projectId: string): GraphCollapsed {
  try {
    const raw = prefGet(prefKey(`graphCollapsed:${projectId}`))
    if (!raw) return { groups: [], trees: [] }
    const p = JSON.parse(raw) as Partial<GraphCollapsed>
    return { groups: p.groups ?? [], trees: p.trees ?? [] }
  } catch {
    return { groups: [], trees: [] }
  }
}

function persistCollapsed(projectId: string, v: GraphCollapsed) {
  prefSet(prefKey(`graphCollapsed:${projectId}`), JSON.stringify(v))
}

function loadViewport(projectId: string): Viewport | undefined {
  try {
    const raw = prefGet(prefKey(`graphViewport:${projectId}`))
    if (!raw) return undefined
    const v = JSON.parse(raw) as Viewport
    if (typeof v.x === 'number' && typeof v.y === 'number' && typeof v.zoom === 'number') return v
  } catch {}
  return undefined
}

function GraphCanvas({
  project,
  users,
  onOpenTask,
}: {
  project: ProjectDetailDto
  users: UserDto[]
  onOpenTask: (id: string) => void
}) {
  const { data: graph, isLoading } = useGraph(project.id)
  const { data: tasks = [] } = useTasks(project.id)
  const createNode = useCreateGraphNode()
  const bulkAddGraph = useBulkAddGraphTasks()
  const updateNode = useUpdateGraphNode()
  const deleteNode = useDeleteGraphNode()
  const savePositions = useSaveGraphPositions()
  const createLink = useCreateLink()
  const createCanvasEdge = useCreateGraphEdge()
  const deleteCanvasEdge = useDeleteGraphEdge()
  const wrapGroup = useWrapGraphGroup()
  const updateTask = useUpdateTask()
  const qc = useQueryClient()
  const updateTaskRef = useRef(updateTask)
  useEffect(() => {
    updateTaskRef.current = updateTask
  }, [updateTask])

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [filters, setFiltersState] = useState<GraphFilters>(() => loadGraphFilters(project.id))
  const setFilters = useCallback(
    (patch: GraphFilters | ((f: GraphFilters) => GraphFilters)) => {
      setFiltersState((prev) => {
        const next = typeof patch === 'function' ? patch(prev) : patch
        persistGraphFilters(project.id, next)
        return next
      })
    },
    [project.id]
  )
  useEffect(() => {
    setFiltersState(loadGraphFilters(project.id))
  }, [project.id])
  const [searchOpen, setSearchOpen] = useState(false)
  const [offCanvasOpen, setOffCanvasOpen] = useState(true)
  const [readOnly, setReadOnly] = useState(false)
  const [showMinimap, setShowMinimap] = useState(true)
  const [collapsed, setCollapsed] = useState<GraphCollapsed>(() => loadCollapsed(project.id))
  const savedViewport = useMemo(() => loadViewport(project.id), [project.id])
  useEffect(() => {
    setCollapsed(loadCollapsed(project.id))
  }, [project.id])
  const [connectDraft, setConnectDraft] = useState<{ from: string; to: string; mode: 'tasks' | 'mixed' } | null>(null)
  const [addTaskOpen, setAddTaskOpen] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskType, setNewTaskType] = useState('task')
  const [pickTaskOpen, setPickTaskOpen] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  // снап-сетка: аккуратное выравнивание нод/ресайза, тогглится и запоминается
  const [snap, setSnap] = useState(true)
  // контекстное меню по ПКМ: { x, y } — экран; flow — координаты канваса для создания в точке
  const [ctxMenu, setCtxMenu] = useState<{
    x: number
    y: number
    flow: { x: number; y: number }
    nodeId?: string
  } | null>(null)
  // предпросмотр: большая заметка и полноэкранный просмотр файлов
  const [noteDialog, setNoteDialog] = useState<{ id: string; text: string } | null>(null)
  const [noteEdit, setNoteEdit] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')
  const [fileViewer, setFileViewer] = useState<{ id: string; fileName: string; mime: string; hasPreview: boolean } | null>(null)
  const { screenToFlowPosition, fitView, zoomTo, zoomIn, zoomOut, setCenter, getNode, getNodes, getEdges } =
    useReactFlow()
  const wrapperRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const apply = () => setIsMobile(mq.matches)
    const raf = requestAnimationFrame(apply)
    const fn = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', fn)
    return () => {
      cancelAnimationFrame(raf)
      mq.removeEventListener('change', fn)
    }
  }, [])

  // восстановление снап-режима
  useEffect(() => {
    const apply = () => {
      try {
        const v = prefGet(prefKey('graphSnap'))
        if (v === '0') setSnap(false)
        const ro = prefGet(prefKey('graphReadOnly'))
        if (ro === '1') setReadOnly(true)
      } catch {}
    }
    const raf = requestAnimationFrame(apply)
    return () => cancelAnimationFrame(raf)
  }, [])

  function toggleReadOnly() {
    setReadOnly((v) => {
      const next = !v
      try {
        prefSet(prefKey('graphReadOnly'), next ? '1' : '0')
      } catch {}
      return next
    })
  }

  function toggleSnap() {
    setSnap((v) => {
      const next = !v
      try {
        prefSet(prefKey('graphSnap'), next ? '1' : '0')
      } catch {}
      return next
    })
  }

  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users])
  const nodeRefToId = useMemo(() => new Map((graph?.nodes ?? []).filter((n) => n.refType === 'task').map((n) => [n.id, n.refId!])), [graph])

  // стабильная ссылка на мутацию (объект useMutation пересоздаётся каждый рендер)
  const updateNodeRef = useRef(updateNode)
  useEffect(() => {
    updateNodeRef.current = updateNode
  }, [updateNode])
  const deleteNodeRef = useRef(deleteNode)
  useEffect(() => {
    deleteNodeRef.current = deleteNode
  }, [deleteNode])

  // открытие задачи из тулбара ноды (ref — чтобы не пересоздавать колбэк в data)
  const openTaskRef = useRef(onOpenTask)
  useEffect(() => {
    openTaskRef.current = onOpenTask
  }, [onOpenTask])
  const openTaskFromNode = useCallback((_nodeId: string, taskId: string) => {
    openTaskRef.current(taskId)
  }, [])

  const focusGraphNode = useCallback(
    (nodeId: string) => {
      const rfNode = getNode(nodeId)
      if (!rfNode) return
      const w = rfNode.width ?? rfNode.measured?.width ?? 220
      const h = rfNode.height ?? rfNode.measured?.height ?? 80
      setCenter(rfNode.position.x + w / 2, rfNode.position.y + h / 2, { zoom: 1.1, duration: 350 })
      setNodes((nds) => nds.map((n) => ({ ...n, selected: n.id === nodeId })))
      setSelectedNodeId(nodeId)
      setSearchOpen(false)
    },
    [getNode, setCenter, setNodes]
  )

  async function addAllTasksToGraph() {
    try {
      const r = await bulkAddGraph.mutateAsync({ projectId: project.id, all: true })
      if (r.created === 0) {
        toast.message('Все задачи уже на канвасе')
        return
      }
      toast.success(`Добавлено на канвас: ${r.created}`)
      setTimeout(() => fitView({ padding: 0.25, duration: 400 }), 350)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  // удаление ноды из тулбара: подтверждение + мутация, граф рефетчится и пересобирается
  const projectIdRef = useRef(project.id)
  useEffect(() => {
    projectIdRef.current = project.id
  }, [project.id])
  const requestDeleteNode = useCallback((nodeId: string, label: string) => {
    if (confirm(`Удалить ${label} с канваса?`)) {
      deleteNodeRef.current.mutate({ id: nodeId, projectId: projectIdRef.current })
    }
  }, [])

  const toggleGroupCollapse = useCallback((nodeId: string) => {
    setCollapsed((prev) => {
      const groups = prev.groups.includes(nodeId)
        ? prev.groups.filter((id) => id !== nodeId)
        : [...prev.groups, nodeId]
      const next = { ...prev, groups }
      persistCollapsed(projectIdRef.current, next)
      return next
    })
  }, [])

  const toggleTreeCollapse = useCallback((nodeId: string) => {
    setCollapsed((prev) => {
      const trees = prev.trees.includes(nodeId)
        ? prev.trees.filter((id) => id !== nodeId)
        : [...prev.trees, nodeId]
      const next = { ...prev, trees }
      persistCollapsed(projectIdRef.current, next)
      return next
    })
  }, [])

  // удаление ребра с кнопки ×: edge-* — GraphEdge, link-* — Link
  const handleDeleteEdge = useCallback(
    (edgeId: string, _kind: KnottyEdgeData['kind']) => {
      setEdges((es) => es.filter((e) => e.id !== edgeId))
      if (edgeId.startsWith('edge-')) {
        deleteCanvasEdge.mutate(
          { id: edgeId.slice(5), projectId: project.id },
          { onError: (e) => toast.error(e.message) }
        )
      } else if (edgeId.startsWith('link-')) {
        fetch(`/api/links/${edgeId.slice(5)}`, { method: 'DELETE' })
          .then(() => {
            qc.invalidateQueries({ queryKey: ['graph', project.id] })
            qc.invalidateQueries({ queryKey: ['projects'] })
          })
          .catch(() => toast.error('Не удалось удалить связь'))
      }
    },
    [deleteCanvasEdge, project.id, qc, setEdges]
  )

  // сохранение размеров ноды после ресайза (w/h персистятся в GraphNode)
  const handleNodeResize = useCallback((id: string, w?: number, h?: number) => {
    updateNodeRef.current.mutate({
      id,
      w: w ? Math.round(w) : undefined,
      h: h ? Math.round(h) : undefined,
    })
  }, [])

  const handleAutoFitAttachment = useCallback((nodeId: string, w: number, h: number) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === nodeId
          ? { ...n, style: { ...n.style, width: w, height: h } }
          : n
      )
    )
    updateNodeRef.current.mutate({ id: nodeId, w, h })
  }, [setNodes])

  // fix: текст заметок с последнего синка сервера
  // но локально он другой (пользователь печатает), локальная версия сохраняется
  const serverNoteTextRef = useRef<Map<string, string>>(new Map())

  // полноэкранный предпросмотр вложения (единый viewer для всех типов)
  const openAttachmentPreview = useCallback((att: { id: string; fileName: string; mime: string; hasPreview: boolean }) => {
    setFileViewer(att)
  }, [])

  // синхронизация данных сервера → ноды/рёбра React Flow (ФТ-3.7)
  useEffect(() => {
    if (!graph) return
    const prevServerText = serverNoteTextRef.current
    const newServerText = new Map<string, string>()
    for (const n of graph.nodes) {
      if (n.refType === 'note') newServerText.set(n.id, n.text ?? '')
    }
    const childCountByGroup = new Map<string, number>()
    const treeChildOf = new Set<string>()
    for (const n of graph.nodes) {
      if (n.parentId) childCountByGroup.set(n.parentId, (childCountByGroup.get(n.parentId) ?? 0) + 1)
    }
    for (const h of graph.hierarchy) treeChildOf.add(h.source)

    const rfNodes: Node[] = graph.nodes.map((n) => {
      const parentId = n.parentId ?? undefined
      if (n.refType === 'group') {
        return {
          id: n.id,
          type: 'groupRF',
          position: { x: n.x, y: n.y },
          style: { width: n.w ?? DEFAULT_GROUP_SIZE.w, height: n.h ?? DEFAULT_GROUP_SIZE.h },
          zIndex: -1,
          data: {
            title: n.text?.trim() || 'Пачка',
            childCount: childCountByGroup.get(n.id) ?? 0,
            onResize: handleNodeResize,
            onRename: (id: string, title: string) => updateNodeRef.current.mutate({ id, text: title }),
            onToggleCollapse: toggleGroupCollapse,
            onUngroup: (id: string) => {
              if (confirm('Удалить рамку? Содержимое останется на канвасе.')) {
                deleteNodeRef.current.mutate({ id, projectId: projectIdRef.current })
              }
            },
            onDeleteNode: requestDeleteNode,
          } as GroupNodeData,
        }
      }
      if (n.refType === 'task' && n.task) {
        return {
          id: n.id,
          type: 'taskRF',
          parentId,
          position: { x: n.x, y: n.y },
          style: { width: n.w ?? 220, ...(n.h ? { height: n.h } : {}) },
          data: {
            snapshot: n.task,
            assignee: n.task.assigneeId ? userById.get(n.task.assigneeId) ?? null : null,
            onResize: handleNodeResize,
            onOpenTask: openTaskFromNode,
            onDeleteNode: requestDeleteNode,
            hasTreeChildren: treeChildOf.has(n.id),
            onToggleTreeCollapse: toggleTreeCollapse,
          } as TaskNodeData,
        }
      }
      if (n.refType === 'note') {
        return {
          id: n.id,
          type: 'noteRF',
          parentId,
          position: { x: n.x, y: n.y },
          dragHandle: '.note-drag-handle',
          style: { width: n.w ?? 260, ...(n.h ? { height: n.h } : {}) },
          data: {
            text: n.text ?? '',
            onSave: (id: string, text: string) => {
              updateNodeRef.current.mutate({ id, text })
              setNodes((nds) => nds.map((x) => (x.id === id ? { ...x, data: { ...x.data, text } } : x)))
            },
            onExpand: (id: string, text: string) => {
              setNoteDialog({ id, text })
              setNoteDraft(text)
              setNoteEdit(false)
            },
            onResize: handleNodeResize,
            onDeleteNode: requestDeleteNode,
          } as NoteNodeData,
        }
      }
      const att = n.attachment!
      const previewKind = resolveAttachmentPreviewKind(att.mime, att.fileName)
      const defaults = graphAttachmentDefaultSize(previewKind)
      return {
        id: n.id,
        type: 'attachmentRF',
        parentId,
        position: { x: n.x, y: n.y },
        dragHandle: '.attachment-drag-handle',
        style: { width: n.w ?? defaults.w, height: n.h ?? defaults.h },
        data: {
          attachment: att,
          onOpenPreview: openAttachmentPreview,
          onResize: handleNodeResize,
          onDeleteNode: requestDeleteNode,
          autoFitSize: !n.h && (previewKind === 'image' || previewKind === 'video'),
          onAutoFitSize: handleAutoFitAttachment,
        } as AttachmentNodeData,
      }
    })

    // единый тип рёбер: стиль/подпись/кнопка удаления — внутри KnottyEdge
    const rfEdges: Edge[] = graph.edges.map((e) => {
      const kind: KnottyEdgeData['kind'] = (e.type === 'canvas' ? 'canvas' : e.type) as KnottyEdgeData['kind']
      const markers = graphEdgeMarkers(kind)
      return {
        id: e.id,
        type: 'knotty',
        source: e.source,
        target: e.target,
        deletable: true,
        data: {
          kind,
          label: kind === 'blocks' ? 'блокирует' : kind === 'relates' ? 'связана' : undefined,
          onDeleteEdge: handleDeleteEdge,
        } as KnottyEdgeData,
        ...markers,
      }
    })

    // иерархия — тонкие рёбра, не удаляемые (опция отображения)
    for (const h of graph.hierarchy) {
      rfEdges.push({
        id: h.id,
        type: 'knotty',
        source: h.source,
        target: h.target,
        deletable: false,
        selectable: false,
        data: { kind: 'tree' } as KnottyEdgeData,
        ...graphEdgeMarkers('tree'),
      })
    }

    const ordered = [...rfNodes].sort((a, b) => {
      if (a.type === 'groupRF' && b.type !== 'groupRF') return -1
      if (a.type !== 'groupRF' && b.type === 'groupRF') return 1
      return 0
    })
    setNodes((current) =>
      ordered.map((nn) => {
        if (nn.type !== 'noteRF') return nn
        // сервер не менял текст с прошлого сника → уважаем локальную правку (печать без blur)
        if (prevServerText.get(nn.id) === newServerText.get(nn.id)) {
          const cur = current.find((c) => c.id === nn.id)
          if (cur && (cur.data as NoteNodeData).text !== (nn.data as NoteNodeData).text) {
            return { ...nn, data: { ...nn.data, text: (cur.data as NoteNodeData).text } }
          }
        }
        return nn
      })
    )
    serverNoteTextRef.current = newServerText
    setEdges(rfEdges)
  }, [graph, userById, setNodes, setEdges])

  // фильтрация + подсветка (ФТ-3.5, ФТ-3.6)
  const { displayNodes, displayEdges } = useMemo(() => {
    let ns = nodes
    let es = edges

    // фильтры
    const hidden = new Set<string>()
    if (!filters.showTasks || filters.statusIds.length || filters.assigneeIds.length) {
      for (const n of ns) {
        if (n.type === 'taskRF') {
          const d = n.data as TaskNodeData
          if (!filters.showTasks) hidden.add(n.id)
          else if (filters.statusIds.length && !filters.statusIds.includes(d.snapshot.statusId)) hidden.add(n.id)
          else if (filters.assigneeIds.length) {
            const id = d.snapshot.assigneeId ?? 'none'
            if (!filters.assigneeIds.includes(id)) hidden.add(n.id)
          }
        }
        if (n.type === 'noteRF' && !filters.showNotes) hidden.add(n.id)
        if (n.type === 'attachmentRF' && !filters.showAttachments) hidden.add(n.id)
      }
    }
    // поддерево от выбранной (ФТ-3.6)
    if (filters.subtreeFrom) {
      const childrenMap = new Map<string, string[]>()
      for (const e of es) {
        if (!e.id.startsWith('tree-')) continue
        const arr = childrenMap.get(e.source) ?? []
        arr.push(e.target)
        childrenMap.set(e.source, arr)
      }
      const keep = new Set<string>([filters.subtreeFrom])
      const queue = [filters.subtreeFrom]
      while (queue.length) {
        const cur = queue.shift()!
        for (const c of childrenMap.get(cur) ?? []) {
          if (!keep.has(c)) {
            keep.add(c)
            queue.push(c)
          }
        }
      }
      for (const n of ns) if (!keep.has(n.id)) hidden.add(n.id)
    }

    const groupHidden = hiddenByGroupCollapse(
      ns.map((n) => ({ id: n.id, parentId: n.parentId })),
      collapsed.groups
    )
    const treeHidden = hiddenByTreeCollapse(
      es.filter((e) => e.id.startsWith('tree-')).map((e) => ({ source: e.source, target: e.target })),
      collapsed.trees
    )
    for (const id of groupHidden) hidden.add(id)
    for (const id of treeHidden) hidden.add(id)

    const parentOf = new Map<string, string>()
    for (const n of ns) {
      if (n.parentId) parentOf.set(n.id, n.parentId)
    }

    es = es.filter((e) => {
      const kind = (e.data as KnottyEdgeData | undefined)?.kind
      if (kind === 'tree') return filters.showHierarchy
      if (kind === 'blocks') return filters.showBlocks
      if (kind === 'relates') return filters.showRelates
      if (kind === 'canvas') return filters.showCanvas
      return true
    })

    const collapseHidden = new Set<string>([...groupHidden, ...treeHidden])
    es = rerouteCollapsedEdges(es, collapseHidden, parentOf)
    es = es.filter((e) => !hidden.has(e.source) && !hidden.has(e.target))
    es = dropReroutedSelfLoops(es)

    // подсветка при наведении: связанные рёбра и ноды, остальное гаснет (ФТ-3.5)
    let related: Set<string> | null = null
    if (hoveredId) {
      related = new Set<string>([hoveredId])
      for (const e of es) {
        if (e.source === hoveredId) related.add(e.target)
        if (e.target === hoveredId) related.add(e.source)
      }
    }

    const dns: Node[] = ns
      .filter((n) => !hidden.has(n.id))
      .map((n) => {
        const groupCollapsed = n.type === 'groupRF' && collapsed.groups.includes(n.id)
        return {
          ...n,
          style: groupCollapsed ? { ...n.style, height: 48 } : n.style,
          data: {
            ...n.data,
            dimmed: related ? !related.has(n.id) : false,
            collapsed: groupCollapsed,
            treeCollapsed: n.type === 'taskRF' && collapsed.trees.includes(n.id),
          },
        }
      })
    const des: Edge[] = es.map((e) => ({
      ...e,
      style: {
        ...e.style,
        opacity: related ? (e.source === hoveredId || e.target === hoveredId ? 1 : 0.15) : (e.style?.opacity ?? 1),
      },
      labelStyle: e.labelStyle,
    }))
    return { displayNodes: dns, displayEdges: des }
  }, [nodes, edges, filters, hoveredId, collapsed])

  const searchableCanvasNodes = useMemo(() => {
    return nodes
      .filter((n) => n.type === 'taskRF')
      .map((n) => {
        const s = (n.data as TaskNodeData).snapshot
        return { nodeId: n.id, key: s.key, title: s.title }
      })
  }, [nodes])

  const onNodeMouseEnter: NodeMouseHandler = useCallback((_, node) => setHoveredId(node.id), [])
  const onNodeMouseLeave: NodeMouseHandler = useCallback(() => setHoveredId(null), [])

  // сохранение позиций (ФТ-3.2)
  const onNodeDragStop = useCallback<OnNodeDrag<Node>>(
    (e, node) => {
      const all = getNodes()
      const byId = new Map(all.map((n) => [n.id, n]))
      const moving = all.filter((n) => n.selected)
      const pack = moving.length > 1 ? moving : [node]
      const movingIds = new Set(pack.map((n) => n.id))
      const groupBoxes = all
        .filter((n) => n.type === 'groupRF' && !movingIds.has(n.id))
        .map((n) => {
          const w = (n.measured?.width ?? n.width ?? Number(n.style?.width) ?? DEFAULT_GROUP_SIZE.w) as number
          const h = (n.measured?.height ?? n.height ?? Number(n.style?.height) ?? DEFAULT_GROUP_SIZE.h) as number
          return { id: n.id, x: n.position.x, y: n.position.y, w, h }
        })

      const point =
        'clientX' in e
          ? { x: e.clientX, y: e.clientY }
          : e.changedTouches[0]
            ? { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY }
            : null
      const flow = point ? screenToFlowPosition(point) : node.position
      const hit = readOnly || !point ? null : hitTestGroup(flow, groupBoxes)

      function worldOf(n: Node): { x: number; y: number } {
        if (!n.parentId) return n.position
        const p = byId.get(n.parentId)
        if (!p) return n.position
        return toAbsolute(n.position, p.position)
      }

      const positions = pack.map((n) => {
        if (n.type === 'groupRF') {
          return { id: n.id, x: n.position.x, y: n.position.y }
        }
        const world = worldOf(n)
        if (hit) {
          const g = byId.get(hit)!
          const rel = toRelative(world, g.position)
          return { id: n.id, x: rel.x, y: rel.y, parentId: hit }
        }
        return { id: n.id, x: world.x, y: world.y, parentId: null as string | null }
      })

      setNodes((nds) =>
        nds.map((n) => {
          const p = positions.find((x) => x.id === n.id)
          if (!p) return n
          return {
            ...n,
            position: { x: p.x, y: p.y },
            parentId: 'parentId' in p ? p.parentId ?? undefined : n.parentId,
          }
        })
      )
      savePositions.mutate({ projectId: project.id, positions })
    },
    [getNodes, screenToFlowPosition, readOnly, setNodes, savePositions, project.id]
  )

  // создание связи хэндлами (ФТ-3.4): задача→задача — выбор типа (blocks/relates,
  // сервер проверяет циклы); заметка/файл ↔ любая нода — свободное ребро канваса
  const onConnect = useCallback(
    (c: Connection) => {
      if (!c.source || !c.target) return
      const src = nodes.find((n) => n.id === c.source)
      const tgt = nodes.find((n) => n.id === c.target)
      if (src?.type === 'taskRF' && tgt?.type === 'taskRF') {
        setConnectDraft({ from: c.source, to: c.target, mode: 'tasks' })
        return
      }
      if (src?.type === 'groupRF' || tgt?.type === 'groupRF') {
        setConnectDraft({ from: c.source, to: c.target, mode: 'mixed' })
        return
      }
      createCanvasEdge.mutate(
        { projectId: project.id, fromNodeId: c.source, toNodeId: c.target, kind: 'canvas' },
        {
          onSuccess: () => toast.success('Связь нод создана'),
          onError: (e) => toast.error(e.message),
        }
      )
    },
    [nodes, project.id, createCanvasEdge]
  )

  function submitConnect(type: 'blocks' | 'relates' | 'canvas') {
    if (!connectDraft) return
    if (connectDraft.mode === 'mixed' || type === 'canvas') {
      createCanvasEdge.mutate(
        { projectId: project.id, fromNodeId: connectDraft.from, toNodeId: connectDraft.to, kind: type },
        {
          onSuccess: () => {
            toast.success(type === 'blocks' ? 'Связь «блокирует» создана' : type === 'relates' ? 'Связь «связана с» создана' : 'Связь нод создана')
            setConnectDraft(null)
          },
          onError: (e) => {
            toast.error(e.message)
            setConnectDraft(null)
          },
        }
      )
      return
    }
    if (type !== 'blocks' && type !== 'relates') return
    const fromTaskId = nodeRefToId.get(connectDraft.from)
    const toTaskId = nodeRefToId.get(connectDraft.to)
    if (!fromTaskId || !toTaskId) {
      toast.error('Связывать можно только ноды задач')
      setConnectDraft(null)
      return
    }
    createLink.mutate(
      { fromTaskId, toTaskId, type, projectId: project.id },
      {
        onSuccess: () => {
          toast.success(type === 'blocks' ? 'Связь «блокирует» создана' : 'Связь «связана с» создана')
          setConnectDraft(null)
        },
        onError: (e) => {
          toast.error(e.message)
          setConnectDraft(null)
        },
      }
    )
  }

  // удаление рёбер (клик по ребру → Delete) и нод
  const onEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      for (const e of deleted) {
        if (e.id.startsWith('link-')) {
          fetch(`/api/links/${e.id.slice(5)}`, { method: 'DELETE' })
            .then(() => {
              qc.invalidateQueries({ queryKey: ['graph', project.id] })
              qc.invalidateQueries({ queryKey: ['projects'] })
            })
            .catch(() => toast.error('Не удалось удалить связь'))
        } else if (e.id.startsWith('edge-')) {
          deleteCanvasEdge.mutate(
            { id: e.id.slice(5), projectId: project.id },
            { onError: (err) => toast.error(err.message) }
          )
        }
      }
    },
    [qc, project.id, deleteCanvasEdge]
  )

  // подтверждение удаления нод ДО фактического удаления (Delete/Backspace или тулбар)
  const onBeforeDelete = useCallback(
    async ({ nodes }: { nodes: Node[]; edges: Edge[] }) => {
      if (nodes.length === 0) return true
      const label =
        nodes.length === 1
          ? nodes[0].type === 'taskRF'
            ? 'ноду (задача останется в проекте)'
            : nodes[0].type === 'noteRF'
              ? 'заметку'
              : nodes[0].type === 'groupRF'
                ? 'рамку (содержимое останется)'
                : 'ноду файла'
          : `${nodes.length} нод`
      const ok = confirm(`Удалить ${label} с канваса?`)
      if (ok) {
        for (const n of nodes) {
          deleteNodeRef.current.mutate({ id: n.id, projectId: projectIdRef.current })
        }
      }
      return ok
    },
    []
  )

  // контекстное меню фона канваса: создание в точке клика (ФТ-3.3)
  const onPaneContextMenu = useCallback((e: React.MouseEvent | MouseEvent) => {
    e.preventDefault()
    setCtxMenu({
      x: (e as MouseEvent).clientX,
      y: (e as MouseEvent).clientY,
      flow: screenToFlowPosition({ x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY }),
    })
  }, [screenToFlowPosition])

  // контекстное меню ноды: действия над конкретным элементом
  const onNodeContextMenu = useCallback((e: React.MouseEvent | MouseEvent, node: Node) => {
    e.preventDefault()
    setCtxMenu({
      x: (e as MouseEvent).clientX,
      y: (e as MouseEvent).clientY,
      flow: { x: node.position.x, y: node.position.y },
      nodeId: node.id,
    })
  }, [])

  function closeCtxMenu() {
    setCtxMenu(null)
    setCtxSubmenu(null)
  }

  // открытый подраздел контекстного меню (статусы/приоритет/шаблоны/исполнители)
  const [ctxSubmenu, setCtxSubmenu] = useState<string | null>(null)

  // счётчик выделенных нод — для панели действий и меню
  const selectedCount = useMemo(() => nodes.filter((n) => n.selected).length, [nodes])

  // Esc — меню / поиск / предпросмотр; / — найти ноду (e.code — любая раскладка)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isEditableTarget(e.target)) return
      if (e.code === 'Slash') {
        e.preventDefault()
        setSearchOpen(true)
        return
      }
      if (e.code !== 'Escape') return
      if (ctxMenu) {
        setCtxMenu(null)
        setCtxSubmenu(null)
        return
      }
      if (searchOpen) {
        setSearchOpen(false)
        return
      }
      if (noteDialog) {
        setNoteDialog(null)
        return
      }
      if (fileViewer) {
        setFileViewer(null)
        return
      }
      setNodes((nds) => nds.map((n) => ({ ...n, selected: false })))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [ctxMenu, searchOpen, noteDialog, fileViewer, setNodes])

  useEffect(() => {
    if (!searchOpen) return
    const raf = requestAnimationFrame(() => {
      const el = document.querySelector('[data-graph-search-input]') as HTMLInputElement | null
      el?.focus()
    })
    return () => cancelAnimationFrame(raf)
  }, [searchOpen])

  /** Создать элемент по ПКМ: задача/заметка/файл появляется в точке клика */
  function ctxCreate(kind: 'newTask' | 'pickTask' | 'note' | 'file' | 'noteTpl' | 'group', noteTplId?: string) {
    if (!ctxMenu) return
    pendingPosRef.current = ctxMenu.flow
    closeCtxMenu()
    if (kind === 'newTask') setAddTaskOpen(true)
    else if (kind === 'pickTask') setPickTaskOpen(true)
    else if (kind === 'note') createNote()
    else if (kind === 'noteTpl' && noteTplId) createNote(NOTE_TEMPLATES.find((t) => t.id === noteTplId)?.text ?? '')
    else if (kind === 'group') {
      const pos = pendingPosRef.current ?? centerPosition()
      pendingPosRef.current = null
      createNode.mutate({
        projectId: project.id,
        refType: 'group',
        x: pos.x,
        y: pos.y,
        text: 'Пачка',
        w: DEFAULT_GROUP_SIZE.w,
        h: DEFAULT_GROUP_SIZE.h,
      })
    }
    else fileInputRef.current?.click()
  }

  function wrapSelectedNodes() {
    const ids = nodes.filter((n) => n.selected && n.type !== 'groupRF').map((n) => n.id)
    if (ids.length < 1) {
      toast.message('Выделите ноды для рамки')
      return
    }
    wrapGroup.mutate(
      { projectId: project.id, nodeIds: ids },
      {
        onSuccess: () => toast.success('Рамка создана'),
        onError: (e) => toast.error(e.message),
      }
    )
  }

  /** Быстрая правка поля задачи прямо из ПКМ (одна нода-задача или все выделенные) */
  function ctxPatchTasks(field: 'statusId' | 'priority' | 'assigneeId', value: string | null) {
    if (!ctxMenu) return
    closeCtxMenu()
    const targets = nodes
      .filter((n) => n.type === 'taskRF' && (n.selected || n.id === ctxMenu.nodeId))
      .map((n) => nodeRefToId.get(n.id))
      .filter((x): x is string => !!x)
    if (targets.length === 0) return
    updateTaskRef.current.mutate(
      { id: targets[0], projectId: project.id, [field]: value },
      {
        onSuccess: () => {
          for (const id of targets.slice(1)) {
            updateTaskRef.current.mutate({ id, projectId: project.id, [field]: value })
          }
          toast.success(targets.length > 1 ? `Обновлено задач: ${targets.length}` : 'Задача обновлена')
        },
        onError: (e) => toast.error(e.message),
      }
    )
  }

  /** Быстрый статус «Готово» — частый сценарий */
  function ctxMarkDone() {
    const done = project.statuses.filter((s) => s.category === 3).sort((a, b) => b.order - a.order)[0]
    if (done) ctxPatchTasks('statusId', done.id)
  }

  /** Выделить все ноды видимого графа */
  function ctxSelectAll() {
    closeCtxMenu()
    setNodes((nds) => nds.map((n) => ({ ...n, selected: true })))
  }

  /** Снять выделение */
  function ctxDeselectAll() {
    closeCtxMenu()
    setNodes((nds) => nds.map((n) => ({ ...n, selected: false })))
  }

  // ПКМ по ноде: действия
  function ctxNodeAction(action: 'open' | 'edit' | 'preview' | 'delete' | 'deleteSelected') {
    if (!ctxMenu) return
    const node = nodes.find((n) => n.id === ctxMenu.nodeId)
    closeCtxMenu()
    if (!node) return

    if (action === 'deleteSelected') {
      const selected = nodes.filter((n) => n.selected)
      if (selected.length === 0) return
      const ok = confirm(`Удалить выбранные ноды (${selected.length}) с канваса?`)
      if (!ok) return
      for (const n of selected) {
        deleteNodeRef.current.mutate({ id: n.id, projectId: projectIdRef.current })
      }
      return
    }

    if (action === 'delete') {
      const label = node.type === 'taskRF'
        ? 'ноду (задача останется в проекте)'
        : node.type === 'noteRF'
          ? 'заметку'
          : node.type === 'groupRF'
            ? 'рамку (содержимое останется)'
            : 'ноду файла'
      requestDeleteNode(node.id, label)
      return
    }
    if (node.type === 'taskRF') {
      const ref = nodeRefToId.get(node.id)
      if (ref) openTaskRef.current(ref)
      return
    }
    if (node.type === 'noteRF') {
      const d = node.data as NoteNodeData
      setNoteDialog({ id: node.id, text: d.text })
      setNoteDraft(d.text)
      setNoteEdit(action === 'edit')
      return
    }
    if (node.type === 'attachmentRF') {
      const d = node.data as AttachmentNodeData
      if (d.attachment) openAttachmentPreview(d.attachment)
    }
  }

  // добавление на канвас (ФТ-3.3); позиция может быть задана контекстным меню (ПКМ)
  const pendingPosRef = useRef<{ x: number; y: number } | null>(null)

  function takePosition(): { x: number; y: number } {
    const pos = pendingPosRef.current ?? centerPosition()
    pendingPosRef.current = null
    return pos
  }

  function centerPosition(): { x: number; y: number } {
    const rect = wrapperRef.current?.getBoundingClientRect()
    if (!rect) return { x: 100, y: 100 }
    return screenToFlowPosition({ x: rect.left + rect.width / 2 - 110, y: rect.top + rect.height / 2 - 60 })
  }

  async function createNewTask() {
    const title = newTaskTitle.trim()
    if (!title) return
    try {
      const res = await fetch(`/api/projects/${project.id}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, type: newTaskType }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Ошибка создания')
      const task = await res.json()
      const pos = takePosition()
      await createNode.mutateAsync({ projectId: project.id, refType: 'task', refId: task.id, x: pos.x, y: pos.y })
      // fix: задача должна появиться в списке и на доске без перезагрузки (п. 1.2)
      qc.invalidateQueries({ queryKey: ['tasks', project.id] })
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['project', project.id] })
      toast.success(`Задача ${task.key} создана на канвасе`)
      setAddTaskOpen(false)
      setNewTaskTitle('')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function addExistingTask(taskId: string) {
    const pos = takePosition()
    try {
      await createNode.mutateAsync({ projectId: project.id, refType: 'task', refId: taskId, x: pos.x, y: pos.y })
      setPickTaskOpen(false)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function createNote(text = '') {
    const pos = takePosition()
    await createNode.mutateAsync({ projectId: project.id, refType: 'note', x: pos.x, y: pos.y, text })
  }

  async function uploadFileToCanvas(file: File, position?: { x: number; y: number }) {
    const pos = position ?? takePosition()
    try {
      const form = new FormData()
      form.append('files', file)
      const res = await fetch(`/api/projects/${project.id}/attachments`, { method: 'POST', body: form })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Ошибка загрузки')
      const created: { id: string }[] = await res.json()
      for (const att of created) {
        await createNode.mutateAsync({ projectId: project.id, refType: 'attachment', refId: att.id, x: pos.x, y: pos.y })
      }
      toast.success(`Файл «${file.name}» на канвасе`)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  // автоматическая раскладка дерева по иерархии (ФТ-3.2)
  /** Ноды с актуальными w/h из React Flow (style + measured), для dagre-раскладки */
  function nodesForLayout() {
    return getNodes().map((n) => {
      const w = n.width ?? n.measured?.width
      const h = n.height ?? n.measured?.height
      if (!w && !h) return n
      return {
        ...n,
        style: {
          ...n.style,
          ...(w ? { width: w } : {}),
          ...(h ? { height: h } : {}),
        },
      }
    })
  }

  function applyLayoutPositions(positions: Map<string, { x: number; y: number }>, label = 'Раскладка применена') {
    setNodes((nds) => nds.map((n) => ({ ...n, position: positions.get(n.id) ?? n.position })))
    savePositions.mutate({
      projectId: project.id,
      positions: [...positions.entries()].map(([id, p]) => ({ id, ...p })),
    })
    toast.success(label)
    setTimeout(() => fitView({ padding: 0.2, duration: 400 }), 120)
  }

  function autoLayoutTree() {
    applyLayoutPositions(layoutTree(nodesForLayout(), getEdges()), 'Дерево: иерархия и подзадачи')
  }

  function autoLayoutColumn() {
    applyLayoutPositions(layoutHierarchyColumn(nodesForLayout(), getEdges()), 'Столб: подзадачи под родителем')
  }

  function autoLayoutStrip() {
    applyLayoutPositions(layoutDependencyStrip(nodesForLayout(), getEdges()), 'Полоса: зависимости слева → справа')
  }

  if (isMobile) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <EmptyState
          icon={<MonitorSmartphone className="h-10 w-10" />}
          title="Граф доступен с компьютера"
          description="Бесконечный канвас с зумом и перетаскиванием рассчитан на большой экран."
        />
      </div>
    )
  }

  const tasksWithoutNode = tasks.filter(
    (t) => !(graph?.nodes ?? []).some((n) => n.refType === 'task' && n.refId === t.id)
  )

  return (
    <div
      ref={wrapperRef}
      className={cn('relative h-full min-h-0 flex-1', dragOver && 'ring-2 ring-inset ring-teal-600')}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        if (readOnly) return
        e.preventDefault()
        setDragOver(false)
        const taskId = e.dataTransfer.getData(GRAPH_TASK_DRAG_TYPE)
        if (taskId) {
          pendingPosRef.current = screenToFlowPosition({ x: e.clientX, y: e.clientY })
          addExistingTask(taskId)
          return
        }
        const files = Array.from(e.dataTransfer.files)
        if (files.length) {
          const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY })
          files.forEach((f) => uploadFileToCanvas(f, pos))
        }
      }}
    >
      <ReactFlow
        nodes={displayNodes}
        edges={displayEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onEdgesDelete={onEdgesDelete}
        onBeforeDelete={onBeforeDelete}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
        onPaneContextMenu={onPaneContextMenu}
        onNodeContextMenu={onNodeContextMenu}
        onMoveStart={closeCtxMenu}
        onNodeClick={(e, n) => {
          if (isMarkdownCheckboxInteraction(e.target)) return
          setSelectedNodeId(n.id)
        }}
        onNodeDoubleClick={(_, n) => {
          if (n.type === 'taskRF') {
            const ref = nodeRefToId.get(n.id)
            if (ref) onOpenTask(ref)
          } else if (n.type === 'attachmentRF') {
            // предпросмотр вложения: двойной клик = кнопка ⤢
            const d = n.data as AttachmentNodeData
            if (d.attachment) openAttachmentPreview(d.attachment)
          }
        }}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        deleteKeyCode={readOnly ? null : ['Delete', 'Backspace']}
        multiSelectionKeyCode={['Control', 'Meta']}
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        elementsSelectable={true}
        edgesReconnectable={!readOnly}
        /* зона-выделение — основной режим: ЛКМ-рамка по фону;
           панорама — СКМ-драг или Space+драг; ПКМ — контекстное меню */
        selectionKeyCode={null}
        selectionOnDrag={true}
        panOnDrag={[1]}
        panActivationKeyCode="Space"
        connectionLineStyle={{ stroke: '#0f766e', strokeWidth: 2, strokeDasharray: '4 2' }}
        connectionRadius={32}
        snapToGrid={snap}
        snapGrid={[10, 10]}
        fitView={!savedViewport}
        defaultViewport={savedViewport}
        onMoveEnd={(_, vp) => {
          try {
            prefSet(prefKey(`graphViewport:${project.id}`), JSON.stringify({ x: vp.x, y: vp.y, zoom: vp.zoom }))
          } catch {}
        }}
        fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
        minZoom={0.1}
        maxZoom={2.5}
        proOptions={{ hideAttribution: true }}
        className="bg-muted/20"
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1.5} color="#c8cdd4" />
        {showMinimap && (
          <MiniMap
            pannable
            zoomable
            className="!bottom-4 !right-4 overflow-hidden rounded-lg border border-border bg-background shadow-md"
            bgColor="var(--background)"
            maskColor="color-mix(in oklch, var(--background) 55%, transparent)"
            nodeColor={(n) => {
              if (n.type === 'taskRF') {
                const d = n.data as TaskNodeData
                return d.snapshot.blocked ? '#ef4444' : d.snapshot.statusColor
              }
              if (n.type === 'noteRF') return '#fbbf24'
              return '#a1a1aa'
            }}
          />
        )}

        {/* Тулбар (ФТ-3.1, ФТ-3.3) — горизонтальные полоски, ширина по контенту */}
        <Panel position="top-left" className="!m-3 flex w-max max-w-[calc(100vw-1.5rem)] flex-col gap-1.5">
          <div className="flex flex-nowrap items-center gap-1 rounded-xl border bg-background/95 p-1 shadow-md backdrop-blur">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" className="h-8 shrink-0 gap-1.5 px-2.5">
                  <Plus className="h-4 w-4 shrink-0" />
                  Добавить
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => setAddTaskOpen(true)}>
                  <SquarePlus className="h-4 w-4" /> Новая задача
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setPickTaskOpen(true)}>
                  <Search className="h-4 w-4" /> Существующая задача…
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => createNote()}>
                  <StickyNote className="h-4 w-4" /> Заметка
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    const pos = centerPosition()
                    createNode.mutate({
                      projectId: project.id,
                      refType: 'group',
                      x: pos.x,
                      y: pos.y,
                      text: 'Пачка',
                      w: DEFAULT_GROUP_SIZE.w,
                      h: DEFAULT_GROUP_SIZE.h,
                    })
                  }}
                >
                  <BoxSelect className="h-4 w-4" /> Рамка
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-4 w-4" /> Загрузить файл
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="h-8 shrink-0 gap-1.5 px-2.5" title="Автоматическая раскладка">
                  <Waypoints className="h-4 w-4 shrink-0" />
                  Раскладка
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => autoLayoutTree()}>
                  <GitBranch className="h-4 w-4" /> Дерево (иерархия)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => autoLayoutColumn()}>
                  <ArrowDownCircle className="h-4 w-4" /> Столб (подзадачи вниз)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => autoLayoutStrip()}>
                  <ArrowRight className="h-4 w-4" /> Полоса (blocks / relates)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Popover open={searchOpen} onOpenChange={setSearchOpen}>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline" className="h-8 shrink-0 gap-1.5 px-2.5" title="Найти ноду на канвасе (/)">
                  <Search className="h-4 w-4 shrink-0" />
                  Найти
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72 p-0">
                <Command>
                  <CommandInput placeholder="Ключ или название задачи…" data-graph-search-input />
                  <CommandList className="max-h-64">
                    <CommandEmpty>Нет задач на канвасе</CommandEmpty>
                    <CommandGroup>
                      {searchableCanvasNodes.map((t) => (
                        <CommandItem
                          key={t.nodeId}
                          value={`${t.key} ${t.title}`}
                          onSelect={() => focusGraphNode(t.nodeId)}
                        >
                          <span className="font-mono text-xs text-muted-foreground">{t.key}</span>
                          <span className="truncate">{t.title}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline" className="h-8 shrink-0 gap-1.5 px-2.5" title="Фильтры графа">
                  <Network className="h-4 w-4 shrink-0" />
                  Фильтры
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72">
                <div className="space-y-3">
                  <div>
                    <Label className="mb-1 text-xs text-muted-foreground">Типы нод</Label>
                    <div className="space-y-1">
                      <GraphFilterCheck label="Задачи" checked={filters.showTasks} onChange={(v) => setFilters((f) => ({ ...f, showTasks: v }))} />
                      <GraphFilterCheck label="Заметки" checked={filters.showNotes} onChange={(v) => setFilters((f) => ({ ...f, showNotes: v }))} />
                      <GraphFilterCheck label="Файлы" checked={filters.showAttachments} onChange={(v) => setFilters((f) => ({ ...f, showAttachments: v }))} />
                    </div>
                  </div>
                  <div>
                    <Label className="mb-1 text-xs text-muted-foreground">Связи на канвасе</Label>
                    <div className="space-y-1">
                      <GraphFilterCheck label="Иерархия (родитель → потомок)" checked={filters.showHierarchy} onChange={(v) => setFilters((f) => ({ ...f, showHierarchy: v }))} dot="#d4d4d8" />
                      <GraphFilterCheck label="Блокирует" checked={filters.showBlocks} onChange={(v) => setFilters((f) => ({ ...f, showBlocks: v }))} dot="#d97706" />
                      <GraphFilterCheck label="Связана с" checked={filters.showRelates} onChange={(v) => setFilters((f) => ({ ...f, showRelates: v }))} dot="#a1a1aa" />
                      <GraphFilterCheck label="Визуальные (заметка/файл)" checked={filters.showCanvas} onChange={(v) => setFilters((f) => ({ ...f, showCanvas: v }))} dot="#0d9488" />
                    </div>
                  </div>
                  <div>
                    <Label className="mb-1 text-xs text-muted-foreground">Статусы</Label>
                    <div className="space-y-1">
                      {project.statuses.map((s) => (
                        <GraphFilterCheck
                          key={s.id}
                          label={s.name}
                          dot={s.color}
                          checked={filters.statusIds.includes(s.id)}
                          onChange={(v) =>
                            setFilters((f) => ({
                              ...f,
                              statusIds: v ? [...f.statusIds, s.id] : f.statusIds.filter((x) => x !== s.id),
                            }))
                          }
                        />
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label className="mb-1 text-xs text-muted-foreground">Исполнитель</Label>
                    <div className="space-y-1">
                      {users.map((u) => (
                        <GraphFilterCheck
                          key={u.id}
                          label={u.name}
                          avatar={<UserAvatar user={u} size={16} />}
                          checked={filters.assigneeIds.includes(u.id)}
                          onChange={(v) =>
                            setFilters((f) => ({
                              ...f,
                              assigneeIds: v ? [...f.assigneeIds, u.id] : f.assigneeIds.filter((x) => x !== u.id),
                            }))
                          }
                        />
                      ))}
                    </div>
                  </div>
                  {selectedNodeId && (
                    <div className="border-t pt-2">
                      <GraphFilterCheck
                        label="Только поддерево от выбранной"
                        checked={!!filters.subtreeFrom}
                        onChange={(v) => setFilters((f) => ({ ...f, subtreeFrom: v ? selectedNodeId : null }))}
                      />
                    </div>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <div className="w-max max-w-full rounded-xl border bg-background/95 px-2.5 py-1.5 shadow-md backdrop-blur">
            <GraphEdgeLegend className="text-[10px] leading-snug text-muted-foreground" />
          </div>
        </Panel>

        {/* Кнопки зума/вписать/снап/миникарта (ФТ-3.1) */}
        <Panel position="top-right" className="!m-3 flex flex-col gap-1.5">
          <div className="flex overflow-hidden rounded-xl border bg-background/95 shadow-md backdrop-blur">
            <GraphToolbarBtn title="Приблизить" onClick={() => zoomIn({ duration: 250 })} icon={<ZoomIn className="h-4 w-4" />} />
            <GraphToolbarBtn title="Масштаб 100%" onClick={() => zoomTo(1, { duration: 300 })} icon={<Percent className="h-4 w-4" />} />
            <GraphToolbarBtn title="Отдалить" onClick={() => zoomOut({ duration: 250 })} icon={<ZoomOut className="h-4 w-4" />} />
          </div>
          <div className="flex overflow-hidden rounded-xl border bg-background/95 shadow-md backdrop-blur">
            <GraphToolbarBtn title="Вписать в экран" onClick={() => fitView({ padding: 0.25, duration: 300 })} icon={<Maximize2 className="h-4 w-4" />} />
            <GraphToolbarBtn
              title={snap ? 'Сетка выравнивания: вкл (перетаскивание и ресайз по шагам 10px)' : 'Сетка выравнивания: выкл'}
              onClick={toggleSnap}
              icon={<Magnet className={cn('h-4 w-4', snap && 'text-teal-700')} />}
            />
            <GraphToolbarBtn
              title={readOnly ? 'Режим просмотра: вкл (перетаскивание и связи отключены)' : 'Режим просмотра: выкл'}
              onClick={toggleReadOnly}
              icon={<Eye className={cn('h-4 w-4', readOnly && 'text-teal-700')} />}
            />
            <GraphToolbarBtn
              title={showMinimap ? 'Скрыть миникарту' : 'Показать миникарту'}
              onClick={() => setShowMinimap((v) => !v)}
              icon={<MapIcon className={cn('h-4 w-4', showMinimap && 'text-teal-700')} />}
            />
          </div>
        </Panel>

        {/* Панель действий над выделением + подсказка по управлению (слева, не перекрывает «Не на канвасе») */}
        <Panel position="bottom-left" className="!mb-3 !ml-3 flex max-w-[min(calc(100vw-2rem),36rem)] flex-col items-start gap-2">
          <GraphCanvasHints />
          {selectedCount > 1 && (
            <div className="flex items-center gap-1.5 rounded-xl border bg-background/95 px-2 py-1.5 shadow-lg backdrop-blur">
              <span className="px-1 text-xs font-medium text-muted-foreground">
                Выделено: {selectedCount}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs"
                onClick={ctxSelectAll}
                title="Выделить все ноды"
              >
                <BoxSelect className="h-3.5 w-3.5" /> Все
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs"
                onClick={ctxDeselectAll}
                title="Снять выделение (Esc)"
              >
                <X className="h-3.5 w-3.5" /> Снять
              </Button>
              <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs"
                onClick={() => wrapSelectedNodes()}
                title="Объединить в рамку"
              >
                <BoxSelect className="h-3.5 w-3.5" /> Рамка
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs"
                onClick={() => autoLayoutTree()}
                title="Раскладка дерева (иерархия)"
              >
                <Waypoints className="h-3.5 w-3.5" /> Раскладка
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => {
                  if (confirm(`Удалить выбранные ноды (${selectedCount}) с канваса?`)) {
                    for (const n of nodes.filter((x) => x.selected)) {
                      deleteNodeRef.current.mutate({ id: n.id, projectId: projectIdRef.current })
                    }
                  }
                }}
                title="Удалить выделенные ноды (Delete)"
              >
                <Trash2 className="h-3.5 w-3.5" /> Удалить
              </Button>
            </div>
          )}
        </Panel>

        <GraphOffCanvasPanel
          tasks={tasksWithoutNode}
          open={offCanvasOpen}
          onOpenChange={setOffCanvasOpen}
          bulkAdding={bulkAddGraph.isPending}
          readOnly={readOnly}
          onAddAll={addAllTasksToGraph}
          onAddTask={(taskId) => {
            pendingPosRef.current = centerPosition()
            addExistingTask(taskId)
          }}
        />
      </ReactFlow>

      {!isLoading && nodes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center p-6">
          <div className="pointer-events-auto w-full max-w-md">
            <EmptyState
              icon={<Network className="h-10 w-10" />}
              title="Канвас пуст"
              description="Добавьте задачи на граф — связи blocks/relates и иерархия появятся автоматически, когда обе задачи на канвасе."
              action={
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {tasks.length > 0 && (
                    <Button size="sm" className="gap-1.5" disabled={bulkAddGraph.isPending} onClick={() => addAllTasksToGraph()}>
                      <ListPlus className="h-4 w-4" />
                      Добавить все задачи ({tasks.length})
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAddTaskOpen(true)}>
                    <SquarePlus className="h-4 w-4" /> Новая задача
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => createNote()}>
                    <StickyNote className="h-4 w-4" /> Заметка
                  </Button>
                </div>
              }
            />
          </div>
        </div>
      )}

      {/* Контекстное меню по ПКМ (фон — создание в точке; нода — действия) */}
      {ctxMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={closeCtxMenu}
            onContextMenu={(e) => {
              e.preventDefault()
              closeCtxMenu()
            }}
            aria-hidden
          />
          <div
            className="relative z-50 min-w-[230px] overflow-visible rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg"
            style={{
              position: 'fixed',
              left: Math.min(ctxMenu.x, window.innerWidth - 250),
              top: Math.min(ctxMenu.y, window.innerHeight - 340),
            }}
            role="menu"
          >
            {ctxMenu.nodeId ? (
              (() => {
                const node = nodes.find((n) => n.id === ctxMenu.nodeId)
                const selectedNodes = nodes.filter((n) => n.selected)
                const selectedCnt = selectedNodes.length
                const taskTargets = nodes.filter((n) => n.type === 'taskRF' && (n.selected || n.id === ctxMenu.nodeId))
                const isTask = node?.type === 'taskRF'
                return (
                  <>
                    {isTask && (
                      <CtxItem icon={<SquareArrowOutUpRight className="h-3.5 w-3.5" />} label="Открыть задачу" onClick={() => ctxNodeAction('open')} />
                    )}
                    {node?.type === 'noteRF' && (
                      <>
                        <CtxItem icon={<Pencil className="h-3.5 w-3.5" />} label="Редактировать" onClick={() => ctxNodeAction('edit')} />
                        <CtxItem icon={<Maximize2 className="h-3.5 w-3.5" />} label="Предпросмотр" onClick={() => ctxNodeAction('preview')} />
                      </>
                    )}
                    {node?.type === 'attachmentRF' && (
                      <CtxItem icon={<Maximize2 className="h-3.5 w-3.5" />} label="Открыть" onClick={() => ctxNodeAction('preview')} />
                    )}

                    {/* быстрая правка полей задач (одиночная и все выделенные) */}
                    {isTask && taskTargets.length > 0 && (
                      <>
                        <CtxSeparator />
                        <CtxSubmenu
                          id="status"
                          open={ctxSubmenu === 'status'}
                          onToggle={() => setCtxSubmenu(ctxSubmenu === 'status' ? null : 'status')}
                          icon={<GitBranch className="h-3.5 w-3.5" />}
                          label="Статус"
                        >
                          {project.statuses.map((s) => (
                            <CtxItem key={s.id} dot={s.color} label={s.name} onClick={() => ctxPatchTasks('statusId', s.id)} />
                          ))}
                        </CtxSubmenu>
                        <CtxSubmenu
                          id="priority"
                          open={ctxSubmenu === 'priority'}
                          onToggle={() => setCtxSubmenu(ctxSubmenu === 'priority' ? null : 'priority')}
                          icon={<Flame className="h-3.5 w-3.5" />}
                          label="Приоритет"
                        >
                          {PRIORITIES.map((p) => (
                            <CtxItem key={p} label={PRIORITY_LABELS_RU[p]} onClick={() => ctxPatchTasks('priority', p)} />
                          ))}
                        </CtxSubmenu>
                        <CtxSubmenu
                          id="assignee"
                          open={ctxSubmenu === 'assignee'}
                          onToggle={() => setCtxSubmenu(ctxSubmenu === 'assignee' ? null : 'assignee')}
                          icon={<UserCircle2 className="h-3.5 w-3.5" />}
                          label="Исполнитель"
                        >
                          {users.map((u) => (
                            <CtxItem
                              key={u.id}
                              avatar={<UserAvatar user={u} size={16} />}
                              label={u.name}
                              onClick={() => ctxPatchTasks('assigneeId', u.id)}
                            />
                          ))}
                          <CtxSeparator />
                          <CtxItem label="Не назначен" onClick={() => ctxPatchTasks('assigneeId', null)} />
                        </CtxSubmenu>
                        <CtxSeparator />
                        <CtxItem icon={<CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />} label="Готово" onClick={ctxMarkDone} />
                      </>
                    )}

                    {/* действия над выделением */}
                    {selectedCnt > 1 && (
                      <>
                        <CtxSeparator />
                        <div className="px-2 pb-0.5 pt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          Выделено: {selectedCnt}
                        </div>
                        <CtxItem
                          icon={<BoxSelect className="h-3.5 w-3.5" />}
                          label="Объединить в рамку"
                          onClick={() => {
                            closeCtxMenu()
                            wrapSelectedNodes()
                          }}
                        />
                        <CtxItem
                          icon={<Trash2 className="h-3.5 w-3.5" />}
                          label={`Удалить выбранные (${selectedCnt})`}
                          danger
                          onClick={() => ctxNodeAction('deleteSelected')}
                        />
                        <CtxItem icon={<X className="h-3.5 w-3.5" />} label="Снять выделение" onClick={ctxDeselectAll} />
                      </>
                    )}
                    <CtxSeparator />
                    <CtxItem icon={<Trash2 className="h-3.5 w-3.5" />} label="Удалить" danger onClick={() => ctxNodeAction('delete')} />
                  </>
                )
              })()
            ) : (
              <>
                <CtxItem icon={<SquarePlus className="h-3.5 w-3.5" />} label="Новая задача здесь…" onClick={() => ctxCreate('newTask')} />
                <CtxItem icon={<Search className="h-3.5 w-3.5" />} label="Существующая задача…" onClick={() => ctxCreate('pickTask')} />
                <CtxSubmenu
                  id="notes"
                  open={ctxSubmenu === 'notes'}
                  onToggle={() => setCtxSubmenu(ctxSubmenu === 'notes' ? null : 'notes')}
                  icon={<StickyNote className="h-3.5 w-3.5" />}
                  label="Заметка"
                >
                  <CtxItem icon={<Pencil className="h-3.5 w-3.5" />} label="Пустая" onClick={() => ctxCreate('note')} />
                  {NOTE_TEMPLATES.map((t) => (
                    <CtxItem key={t.id} label={`${t.icon} ${t.label}`} onClick={() => ctxCreate('noteTpl', t.id)} />
                  ))}
                </CtxSubmenu>
                <CtxItem icon={<Upload className="h-3.5 w-3.5" />} label="Загрузить файл здесь…" onClick={() => ctxCreate('file')} />
                <CtxItem icon={<BoxSelect className="h-3.5 w-3.5" />} label="Рамка здесь…" onClick={() => ctxCreate('group')} />
                <CtxSeparator />
                <CtxItem icon={<BoxSelect className="h-3.5 w-3.5" />} label="Выделить всё" onClick={ctxSelectAll} />
                <CtxItem icon={<GitBranch className="h-3.5 w-3.5" />} label="Дерево" onClick={() => { closeCtxMenu(); autoLayoutTree() }} />
                <CtxItem icon={<ArrowDownCircle className="h-3.5 w-3.5" />} label="Столб" onClick={() => { closeCtxMenu(); autoLayoutColumn() }} />
                <CtxItem icon={<ArrowRight className="h-3.5 w-3.5" />} label="Полоса зависимостей" onClick={() => { closeCtxMenu(); autoLayoutStrip() }} />
                <CtxItem icon={<Maximize2 className="h-3.5 w-3.5" />} label="Вписать в экран" onClick={() => { closeCtxMenu(); fitView({ padding: 0.25, duration: 300 }) }} />
              </>
            )}
          </div>
        </>
      )}

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) uploadFileToCanvas(f)
          e.target.value = ''
        }}
      />

      {/* Выбор типа связи при протягивании от ноды к ноде (ФТ-3.4) */}
      <Dialog open={!!connectDraft} onOpenChange={(v) => !v && setConnectDraft(null)}>
        <DialogContent className={cn('sm:max-w-sm', connectDraft?.mode === 'mixed' && 'sm:max-w-lg')}>
          <DialogHeader>
            <DialogTitle>Тип связи</DialogTitle>
          </DialogHeader>
          <div
            className={cn(
              'grid gap-2 py-1',
              connectDraft?.mode === 'mixed' ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2'
            )}
          >
            <Button
              variant="outline"
              className="h-auto min-w-0 w-full shrink whitespace-normal flex-col items-center gap-1 px-2 py-3 text-center"
              onClick={() => submitConnect('blocks')}
            >
              <span className="text-lg leading-none">→</span>
              <span className="w-full text-sm font-medium">Блокирует</span>
              <span className="w-full text-balance text-xs leading-snug text-muted-foreground">стрелка по направлению</span>
            </Button>
            <Button
              variant="outline"
              className="h-auto min-w-0 w-full shrink whitespace-normal flex-col items-center gap-1 px-2 py-3 text-center"
              onClick={() => submitConnect('relates')}
            >
              <span className="text-lg leading-none">↔</span>
              <span className="w-full text-sm font-medium">Связана с</span>
              <span className="w-full text-balance text-xs leading-snug text-muted-foreground">без направления</span>
            </Button>
            {connectDraft?.mode === 'mixed' && (
              <Button
                variant="outline"
                className="h-auto min-w-0 w-full shrink whitespace-normal flex-col items-center gap-1 px-2 py-3 text-center"
                onClick={() => submitConnect('canvas')}
              >
                <span className="text-lg leading-none">~</span>
                <span className="w-full text-sm font-medium">Просто связь</span>
                <span className="w-full text-balance text-xs leading-snug text-muted-foreground">визуально</span>
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Новая задача на канвас */}
      <Dialog open={addTaskOpen} onOpenChange={setAddTaskOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Новая задача на канвасе</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-1">
            <div className="flex gap-1 rounded-lg border p-1" role="group" aria-label="Тип задачи">
              {TASK_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setNewTaskType(t)}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1 rounded-md px-1 py-1.5 text-xs font-medium',
                    newTaskType === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <TypeIcon type={t} className="h-3.5 w-3.5" />
                  {TYPE_LABELS_RU[t]}
                </button>
              ))}
            </div>
            <Input
              autoFocus
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createNewTask()}
              placeholder="Название задачи"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddTaskOpen(false)}>Отмена</Button>
            <Button onClick={createNewTask} disabled={!newTaskTitle.trim()}>Создать ноду</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Выбор существующей задачи */}
      <Dialog open={pickTaskOpen} onOpenChange={setPickTaskOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Добавить существующую задачу</DialogTitle>
          </DialogHeader>
          <Command>
            <CommandInput placeholder="Поиск по ключу или названию…" />
            <CommandList className="max-h-72">
              <CommandEmpty>Все задачи проекта уже на канвасе</CommandEmpty>
              <CommandGroup>
                {tasksWithoutNode.map((t) => (
                  <CommandItem key={t.id} value={`${t.key} ${t.title}`} onSelect={() => addExistingTask(t.id)}>
                    <TypeIcon type={t.type} className="h-3.5 w-3.5" />
                    <span className="font-mono text-xs text-muted-foreground">{t.key}</span>
                    <span className="truncate">{t.title}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>

      {isLoading && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-background/60">
          <Badge variant="secondary" className="animate-pulse">Загрузка графа…</Badge>
        </div>
      )}

      {/* Предпросмотр заметки: большой рендер Markdown + редактирование */}
      <Dialog open={!!noteDialog} onOpenChange={(v) => !v && setNoteDialog(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Заметка</DialogTitle>
          </DialogHeader>
          {noteEdit ? (
            <Textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              rows={12}
              className="font-mono text-[13px]"
              aria-label="Текст заметки"
              autoFocus
            />
          ) : (
            <div className="custom-scroll max-h-[60vh] overflow-y-auto rounded-lg border border-amber-300/60 bg-amber-50/60 p-4 dark:border-amber-500/30 dark:bg-amber-950/20">
              <MarkdownView
                source={noteDialog?.text ?? ''}
                interactiveCheckboxes
                onSourceChange={(next) => {
                  if (!noteDialog) return
                  updateNodeRef.current.mutate({ id: noteDialog.id, text: next })
                  setNodes((nds) =>
                    nds.map((x) =>
                      x.id === noteDialog.id ? { ...x, data: { ...x.data, text: next } } : x
                    )
                  )
                  setNoteDialog({ ...noteDialog, text: next })
                  setNoteDraft(next)
                }}
              />
            </div>
          )}
          <DialogFooter>
            {noteEdit ? (
              <>
                <Button variant="outline" onClick={() => setNoteEdit(false)}>Отмена</Button>
                <Button
                  onClick={() => {
                    if (!noteDialog) return
                    updateNodeRef.current.mutate({ id: noteDialog.id, text: noteDraft })
                    setNodes((nds) => nds.map((x) => (x.id === noteDialog.id ? { ...x, data: { ...x.data, text: noteDraft } } : x)))
                    setNoteDialog({ ...noteDialog, text: noteDraft })
                    setNoteEdit(false)
                    toast.success('Заметка сохранена')
                  }}
                >
                  Сохранить
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" className="gap-1.5" onClick={() => setNoteEdit(true)}>
                  <Pencil className="h-3.5 w-3.5" /> Редактировать
                </Button>
                <Button onClick={() => setNoteDialog(null)}>Закрыть</Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AttachmentViewer item={fileViewer} onClose={() => setFileViewer(null)} />
    </div>
  )
}

function CtxItem({
  icon,
  label,
  onClick,
  danger,
  dot,
  avatar,
}: {
  icon?: React.ReactNode
  label: string
  onClick: () => void
  danger?: boolean
  dot?: string
  avatar?: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors',
        danger ? 'text-destructive hover:bg-destructive/10' : 'hover:bg-muted'
      )}
    >
      {dot && <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: dot }} aria-hidden />}
      {avatar}
      {icon}
      {label}
    </button>
  )
}

function CtxSeparator() {
  return <div className="my-1 h-px bg-border" role="separator" />
}

/** Пункт с раскрывающимся подразделом (flyout справа) */
function CtxSubmenu({
  id,
  open,
  onToggle,
  icon,
  label,
  children,
}: {
  id: string
  open: boolean
  onToggle: () => void
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  void id
  return (
    <div className="relative">
      <button
        type="button"
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={onToggle}
        className={cn(
          'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors',
          open ? 'bg-muted' : 'hover:bg-muted'
        )}
      >
        {icon}
        {label}
        <ChevronRight className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-[calc(100%-4px)] top-0 z-10 min-w-[170px] rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          {children}
        </div>
      )}
    </div>
  )
}
