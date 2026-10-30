import express from 'express'
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import path from 'node:path'

import { buildVideoTree, countVideoFiles, resolveVideoPath } from './files.js'
import { hasLockPassword, initializeWorkspaceConfig } from './config.js'
import { translate } from '../shared/localization.js'

function asyncRoute(handler) {
  return (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(next)
  }
}

export function createVideoApp({ rootDir, staticDir }) {
  const app = express()
  const absoluteRoot = path.resolve(rootDir)
  const sessionId = randomUUID()
  const config = initializeWorkspaceConfig(absoluteRoot)
  const t = (message) => translate(config.language, message)
  app.locals.language = config.language
  const workspaceId = createHash('sha256').update(absoluteRoot).digest('hex')

  app.disable('x-powered-by')
  app.use((_request, response, next) => {
    response.setHeader('Content-Language', config.language)
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.setHeader('X-Frame-Options', 'DENY')
    response.setHeader('Referrer-Policy', 'no-referrer')
    response.setHeader('Content-Security-Policy', [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "media-src 'self' blob:",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
      "form-action 'none'",
    ].join('; '))
    next()
  })

  app.get('/api/config', (_request, response) => {
    response.setHeader('Cache-Control', 'no-store')
    response.json({ workspaceId, language: config.language, blurLockScreen: config.blurLockScreen, hasLockPassword: hasLockPassword(config) })
  })

  app.post('/api/unlock', express.json({ limit: '1kb' }), (request, response) => {
    response.setHeader('Cache-Control', 'no-store')
    if (!config.blurLockScreen || !hasLockPassword(config)) {
      response.json({ unlocked: true })
      return
    }
    const password = request.body?.password
    if (typeof password !== 'string' || password.length === 0) {
      response.status(400).json({ error: t('Enter your password.') })
      return
    }
    const expected = createHash('sha256').update(String(config.lockPassword)).digest()
    const received = createHash('sha256').update(password).digest()
    if (!timingSafeEqual(expected, received)) {
      response.status(401).json({ error: t('Incorrect password. Try again.') })
      return
    }
    response.json({ unlocked: true })
  })

  app.get('/api/tree', asyncRoute(async (_request, response) => {
    const tree = await buildVideoTree(absoluteRoot)
    response.setHeader('Cache-Control', 'no-store')
    response.json({ rootName: path.basename(absoluteRoot), sessionId, count: countVideoFiles(tree), tree })
  }))

  app.get('/api/video', asyncRoute(async (request, response, next) => {
    const videoPath = await resolveVideoPath(absoluteRoot, request.query.path)
    response.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(path.basename(videoPath))}`)
    response.setHeader('Cache-Control', 'no-store')
    response.sendFile(videoPath, { acceptRanges: true, cacheControl: false }, (error) => {
      if (error && !response.headersSent) next(error)
    })
  }))

  app.use('/api', (_request, response) => {
    response.status(404).json({ error: t('API route not found.') })
  })

  if (staticDir) {
    const absoluteStaticDir = path.resolve(staticDir)
    app.use(express.static(absoluteStaticDir, { index: false }))
    app.get(/.*/, (_request, response) => {
      response.sendFile(path.join(absoluteStaticDir, 'index.html'))
    })
  }

  app.use((_request, response) => {
    response.status(404).json({ error: t('Page not found.') })
  })

  app.use((error, _request, response, next) => {
    if (response.headersSent) {
      next(error)
      return
    }

    const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500
    const message = error.type === 'entity.parse.failed' ? 'Invalid JSON request body.'
      : error.type === 'entity.too.large' ? 'Request body is too large.'
        : statusCode === 500 ? 'A local server error occurred.' : error.message
    response.status(statusCode).json({ error: t(message) })
  })

  return app
}
