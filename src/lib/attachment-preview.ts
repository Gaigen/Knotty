/** Как показывать вложение в AttachmentViewer */
export type AttachmentPreviewKind = 'image' | 'pdf' | 'text' | 'markdown' | 'video' | 'audio' | 'download'

export const MAX_TEXT_PREVIEW_BYTES = 512 * 1024

const MARKDOWN_EXT = new Set(['.md', '.markdown', '.mdown', '.mkd'])

const TEXT_EXT = new Set([
  '.txt', '.log', '.csv', '.json', '.xml', '.yaml', '.yml', '.toml', '.ini', '.env',
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css', '.scss', '.less', '.html', '.htm',
  '.sql', '.sh', '.bash', '.zsh', '.ps1', '.bat', '.py', '.rb', '.go', '.rs', '.java',
  '.c', '.h', '.cpp', '.hpp', '.cs', '.php', '.swift', '.kt', '.vue', '.svelte',
  '.graphql', '.gql', '.dockerfile', '.gitignore', '.editorconfig',
])

function fileExt(fileName: string): string {
  const i = fileName.lastIndexOf('.')
  return i >= 0 ? fileName.slice(i).toLowerCase() : ''
}

/** MIME + имя файла → способ предпросмотра */
export function resolveAttachmentPreviewKind(mime: string, fileName: string): AttachmentPreviewKind {
  const m = mime.toLowerCase().split(';')[0].trim()
  const ext = fileExt(fileName)

  if (m.startsWith('image/')) return 'image'
  if (m === 'application/pdf' || ext === '.pdf') return 'pdf'
  if (m.startsWith('video/')) return 'video'
  if (m.startsWith('audio/')) return 'audio'
  if (MARKDOWN_EXT.has(ext) || m.includes('markdown')) return 'markdown'
  if (
    m.startsWith('text/') ||
    m === 'application/json' ||
    m === 'application/xml' ||
    m === 'application/javascript' ||
    TEXT_EXT.has(ext)
  ) {
    return 'text'
  }
  return 'download'
}

export function attachmentPreviewSupported(mime: string, fileName: string): boolean {
  return resolveAttachmentPreviewKind(mime, fileName) !== 'download'
}

export const GRAPH_ATTACHMENT_MAX_W = 420
export const GRAPH_ATTACHMENT_MAX_H = 320
export const GRAPH_ATTACHMENT_MIN_W = 120
export const GRAPH_ATTACHMENT_MIN_H = 64

/** Вписывает натуральные размеры медиа в лимиты ноды на графе */
export function fitGraphAttachmentDimensions(naturalW: number, naturalH: number): { w: number; h: number } {
  if (!naturalW || !naturalH) return { w: 200, h: 150 }
  const ratio = naturalW / naturalH
  let w = naturalW
  let h = naturalH
  if (w > GRAPH_ATTACHMENT_MAX_W) {
    w = GRAPH_ATTACHMENT_MAX_W
    h = w / ratio
  }
  if (h > GRAPH_ATTACHMENT_MAX_H) {
    h = GRAPH_ATTACHMENT_MAX_H
    w = h * ratio
  }
  return {
    w: Math.max(GRAPH_ATTACHMENT_MIN_W, Math.round(w)),
    h: Math.max(GRAPH_ATTACHMENT_MIN_H, Math.round(h)),
  }
}

/** Дефолтный размер ноды-вложения до авто-подгонки */
export function graphAttachmentDefaultSize(kind: AttachmentPreviewKind): { w: number; h: number } {
  switch (kind) {
    case 'image':
      return { w: 200, h: 150 }
    case 'video':
      return { w: 300, h: 190 }
    case 'pdf':
      return { w: 280, h: 210 }
    case 'text':
    case 'markdown':
      return { w: 300, h: 168 }
    case 'audio':
      return { w: 280, h: 120 }
    default:
      return { w: 200, h: 80 }
  }
}

export const GRAPH_TEXT_SNIPPET_BYTES = 4096
