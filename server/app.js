import express from 'express'
import { randomUUID } from 'node:crypto'
import path from 'node:path'

import { buildVideoTree, countVideoFiles, resolveVideoPath } from './files.js'

function asyncRoute(handler) {
  return (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(next)
  }
}

export function createVideoApp({ rootDir, staticDir }) {
  const app = express()
  const absoluteRoot = path.resolve(rootDir)
  const sessionId = randomUUID()

  app.disable('x-powered-by')
  app.use((_request, response, next) => {
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
    response.status(404).json({ error: 'API route not found.' })
  })

  if (staticDir) {
    const absoluteStaticDir = path.resolve(staticDir)
    app.use(express.static(absoluteStaticDir, { index: false }))
    app.get(/.*/, (_request, response) => {
      response.sendFile(path.join(absoluteStaticDir, 'index.html'))
    })
  }

  app.use((_request, response) => {
    response.status(404).json({ error: 'Page not found.' })
  })

  app.use((error, _request, response, next) => {
    if (response.headersSent) {
      next(error)
      return
    }

    const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500
    response.status(statusCode).json({ error: statusCode === 500 ? 'A local server error occurred.' : error.message })
  })

  return app
}
