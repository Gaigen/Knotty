import { describe, expect, test } from 'bun:test'
import {
  DEFAULT_GROUP_SIZE,
  GROUP_PAD,
  GROUP_PAD_TOP,
  hitTestGroup,
  toAbsolute,
  toRelative,
  ungroupChildren,
  wrapSelection,
  type NodeBox,
} from './graph-grouping'
import { dropReroutedSelfLoops, hiddenByGroupCollapse, hiddenByTreeCollapse, rerouteCollapsedEdges } from './graph-collapse'
import { zoomBand } from './semantic-zoom'
import { collectBlockedTaskIds, findBlocksCycleOnGraph } from './graph-blocks'
import { computeAlignmentSnap } from './graph-guides'

const box = (id: string, x: number, y: number, w = 100, h = 80, parentId?: string): NodeBox => ({
  id, x, y, w, h, parentId,
})

describe('wrapSelection', () => {
  test('рамка охватывает ноды с полями, дети получают относительные координаты', () => {
    const a = box('a', 100, 100, 120, 80)
    const b = box('b', 280, 160, 100, 60)
    const r = wrapSelection([a, b])
    expect(r.group.x).toBe(100 - GROUP_PAD)
    expect(r.group.y).toBe(100 - GROUP_PAD_TOP)
    expect(r.group.w).toBe(280 + 100 - 100 + GROUP_PAD * 2)
    expect(r.group.h).toBe(160 + 60 - 100 + GROUP_PAD_TOP + GROUP_PAD)
    const relA = r.children.find((c) => c.id === 'a')!
    expect(relA.x).toBe(GROUP_PAD)
    expect(relA.y).toBe(GROUP_PAD_TOP)
  })

  test('пустой набор даёт размер по умолчанию', () => {
    const r = wrapSelection([])
    expect(r.group).toEqual({ x: 0, y: 0, ...DEFAULT_GROUP_SIZE })
    expect(r.children).toEqual([])
  })
})

describe('relative/absolute', () => {
  test('ungroup возвращает абсолютные координаты', () => {
    const group = { x: 50, y: 40 }
    const children = [{ id: 'a', x: 20, y: 30 }]
    expect(ungroupChildren(group, children)).toEqual([{ id: 'a', x: 70, y: 70 }])
    expect(toRelative({ x: 70, y: 70 }, group)).toEqual({ x: 20, y: 30 })
    expect(toAbsolute({ x: 20, y: 30 }, group)).toEqual({ x: 70, y: 70 })
  })
})

describe('hitTestGroup', () => {
  test('выбирает меньшую рамку, если точка в нескольких', () => {
    const big = box('big', 0, 0, 400, 400)
    const small = box('small', 50, 50, 100, 100)
    expect(hitTestGroup({ x: 80, y: 80 }, [big, small])).toBe('small')
    expect(hitTestGroup({ x: 10, y: 10 }, [big, small])).toBe('big')
    expect(hitTestGroup({ x: 500, y: 10 }, [big, small])).toBeNull()
  })

  test('игнорирует id из exclude', () => {
    const g = box('g', 0, 0, 200, 200)
    expect(hitTestGroup({ x: 10, y: 10 }, [g], new Set(['g']))).toBeNull()
  })
})

describe('zoomBand', () => {
  test('пороги far/mid/near', () => {
    expect(zoomBand(0.2)).toBe('far')
    expect(zoomBand(0.8)).toBe('mid')
    expect(zoomBand(1.4)).toBe('near')
  })

  test('гистерезис не дёргает пояс на границе', () => {
    expect(zoomBand(0.44, 'far')).toBe('far')
    expect(zoomBand(0.47, 'far')).toBe('mid')
    expect(zoomBand(0.44, 'mid')).toBe('mid')
    expect(zoomBand(0.42, 'mid')).toBe('far')
  })
})

describe('collapse', () => {
  test('group collapse прячет детей', () => {
    const nodes = [
      { id: 'g', parentId: null as string | null },
      { id: 'a', parentId: 'g' },
      { id: 'b', parentId: 'g' },
      { id: 'c', parentId: null as string | null },
    ]
    const hidden = hiddenByGroupCollapse(nodes, ['g'])
    expect([...hidden].sort()).toEqual(['a', 'b'])
  })

  test('tree collapse прячет потомков', () => {
    const hierarchy = [
      { source: 'epic', target: 's1' },
      { source: 's1', target: 't1' },
      { source: 'epic', target: 's2' },
    ]
    const hidden = hiddenByTreeCollapse(hierarchy, ['epic'])
    expect([...hidden].sort()).toEqual(['s1', 's2', 't1'])
    expect(hiddenByTreeCollapse(hierarchy, ['s1']).has('t1')).toBe(true)
    expect(hiddenByTreeCollapse(hierarchy, ['s1']).has('s2')).toBe(false)
  })

  test('reroute вешает рёбра скрытых детей на рамку', () => {
    const parentOf = new Map([['a', 'g'], ['b', 'g']])
    const hidden = new Set(['a', 'b'])
    const edges = [
      { id: 'e1', source: 'x', target: 'a' },
      { id: 'e2', source: 'b', target: 'y' },
      { id: 'e3', source: 'x', target: 'y' },
    ]
    const out = rerouteCollapsedEdges(edges, hidden, parentOf)
    expect(out[0]).toMatchObject({ id: 'e1', source: 'x', target: 'g' })
    expect(out[1]).toMatchObject({ id: 'e2', source: 'g', target: 'y' })
    expect(out[2]).toMatchObject({ id: 'e3', source: 'x', target: 'y' })
  })

  test('внутренние рёбра свёрнутой рамки не рисуются, внешние переносятся на рамку', () => {
    const parentOf = new Map([['a', 'g'], ['b', 'g'], ['c', 'g']])
    const hidden = new Set(['a', 'b', 'c'])
    const edges = [
      { id: 't1', source: 'a', target: 'b', data: { kind: 'tree' } },
      { id: 't2', source: 'a', target: 'c', data: { kind: 'tree' } },
      { id: 'out', source: 'b', target: 'x', data: { kind: 'canvas' } },
    ]
    const rerouted = rerouteCollapsedEdges(edges, hidden, parentOf)
    const visible = dropReroutedSelfLoops(rerouted)
    expect(visible).toHaveLength(1)
    expect(visible[0]).toMatchObject({ id: 'out', source: 'g', target: 'x' })
  })
})

describe('guides', () => {
  test('выравнивает левый край к левому краю соседа', () => {
    const moving = [{ id: 'a', x: 103, y: 10, w: 100, h: 50 }]
    const others = [{ id: 'b', x: 100, y: 200, w: 80, h: 40 }]
    const r = computeAlignmentSnap(moving, others, 5)
    expect(r.dx).toBe(-3)
    expect(r.dy).toBe(0)
    expect(r.guides.some((g) => g.type === 'vertical')).toBe(true)
  })

  test('без соседей snap не применяется', () => {
    const r = computeAlignmentSnap([{ id: 'a', x: 50, y: 50, w: 100, h: 50 }], [])
    expect(r.dx).toBe(0)
    expect(r.dy).toBe(0)
  })
})

describe('blocks', () => {
  test('задача blocked от Link и от GraphEdge на её ноду', () => {
    const ids = collectBlockedTaskIds({
      links: [{ fromTaskId: 't1', toTaskId: 't2', type: 'blocks' }],
      graphEdges: [{ fromNodeId: 'g1', toNodeId: 'n3', kind: 'blocks' }],
      nodes: [
        { id: 'n2', refType: 'task', refId: 't2' },
        { id: 'n3', refType: 'task', refId: 't3' },
        { id: 'g1', refType: 'group', refId: null },
      ],
    })
    expect(ids.has('t2')).toBe(true)
    expect(ids.has('t3')).toBe(true)
    expect(ids.has('t1')).toBe(false)
  })

  test('цикл через рамку ловится', () => {
    const cycle = findBlocksCycleOnGraph('t:A', 'g:G', [
      { from: 'g:G', to: 't:B' },
      { from: 't:B', to: 't:A' },
    ])
    expect(cycle).not.toBeNull()
    expect(cycle).toContain('t:A')
    expect(cycle).toContain('g:G')
  })

  test('без цикла возвращает null', () => {
    expect(findBlocksCycleOnGraph('t:A', 't:B', [{ from: 't:C', to: 't:D' }])).toBeNull()
  })
})
