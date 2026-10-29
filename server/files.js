import { readdir, realpath, stat } from 'node:fs/promises'
import path from 'node:path'

export const VIDEO_EXTENSIONS = new Set([
  '.3gp', '.avi', '.m4v', '.mkv', '.mov', '.mp4', '.mpe', '.mpeg', '.mpg',
  '.mts', '.m2ts', '.ogv', '.ts', '.webm', '.wmv',
])

const SKIPPED_DIRECTORIES = new Set(['node_modules', '.git'])
const collator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' })

function createHttpError(message, statusCode) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

function isInsideRoot(rootDir, candidate) {
  const relative = path.relative(rootDir, candidate)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

function sortNodes(left, right) {
  if (left.type !== right.type) return left.type === 'directory' ? -1 : 1
  return collator.compare(left.name, right.name)
}

async function scanDirectory(absoluteDir, relativeParts = []) {
  const entries = await readdir(absoluteDir, { withFileTypes: true })
  const nodes = []

  for (const entry of entries) {
    if (entry.isSymbolicLink() || entry.name.startsWith('.')) continue

    const nextParts = [...relativeParts, entry.name]
    const clientPath = nextParts.join('/')
    const absolutePath = path.join(absoluteDir, entry.name)

    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) continue

      let children
      try {
        children = await scanDirectory(absolutePath, nextParts)
      } catch (error) {
        if (error.code === 'EACCES' || error.code === 'EPERM') continue
        throw error
      }

      if (children.length > 0) {
        nodes.push({ type: 'directory', name: entry.name, path: clientPath, children })
      }
      continue
    }

    if (entry.isFile() && VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      nodes.push({ type: 'file', name: entry.name, path: clientPath })
    }
  }

  return nodes.sort(sortNodes)
}

export async function buildVideoTree(rootDir) {
  return scanDirectory(path.resolve(rootDir))
}

export function countVideoFiles(nodes) {
  return nodes.reduce((count, node) => count + (node.type === 'file' ? 1 : countVideoFiles(node.children)), 0)
}

export async function resolveVideoPath(rootDir, requestedPath) {
  if (typeof requestedPath !== 'string' || requestedPath.trim() === '') {
    throw createHttpError('Missing video file path.', 400)
  }

  if (!VIDEO_EXTENSIONS.has(path.extname(requestedPath).toLowerCase())) {
    throw createHttpError('Unsupported video file type.', 400)
  }

  const absoluteRoot = await realpath(path.resolve(rootDir))
  const unresolvedCandidate = path.resolve(absoluteRoot, requestedPath)
  if (!isInsideRoot(absoluteRoot, unresolvedCandidate)) {
    throw createHttpError('Access to files outside the video folder is not allowed.', 403)
  }

  let candidate
  try {
    candidate = await realpath(unresolvedCandidate)
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
      throw createHttpError('Video file not found.', 404)
    }
    throw error
  }

  if (!isInsideRoot(absoluteRoot, candidate)) {
    throw createHttpError('Access to files outside the video folder is not allowed.', 403)
  }

  const fileStat = await stat(candidate)
  if (!fileStat.isFile()) throw createHttpError('The requested path is not a file.', 400)

  return candidate
}
