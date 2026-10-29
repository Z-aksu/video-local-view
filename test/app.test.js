import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createVideoApp } from '../server/app.js'

async function startFixtureServer(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'video-view-api-'))
  const nested = path.join(root, '资料')
  await mkdir(nested)
  await writeFile(path.join(nested, 'sample.mp4'), '0123456789abcdef')
  await writeFile(path.join(root, 'notes.txt'), 'not public')

  const app = createVideoApp({ rootDir: root, staticDir: null })
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance))
  })
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve))
    await rm(root, { recursive: true, force: true })
  })

  return { root, baseUrl: `http://127.0.0.1:${server.address().port}` }
}

test('GET /api/tree returns the root name and nested video list', async (t) => {
  const { root, baseUrl } = await startFixtureServer(t)

  const response = await fetch(`${baseUrl}/api/tree`)
  const result = await response.json()

  assert.equal(response.status, 200)
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(result.rootName, path.basename(root))
  assert.match(result.sessionId, /^[0-9a-f-]{36}$/i)
  assert.equal(result.count, 1)
  assert.equal(result.tree[0].children[0].path, '资料/sample.mp4')
})

test('GET /api/video serves a video and supports HTTP Range requests', async (t) => {
  const { baseUrl } = await startFixtureServer(t)
  const videoUrl = `${baseUrl}/api/video?path=${encodeURIComponent('资料/sample.mp4')}`

  const response = await fetch(videoUrl)
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type'), /^video\/mp4/)
  assert.match(response.headers.get('content-disposition'), /^inline;/)
  assert.equal(await response.text(), '0123456789abcdef')

  const rangeResponse = await fetch(videoUrl, { headers: { Range: 'bytes=4-7' } })
  assert.equal(rangeResponse.status, 206)
  assert.equal(rangeResponse.headers.get('content-range'), 'bytes 4-7/16')
  assert.equal(await rangeResponse.text(), '4567')

  const traversalResponse = await fetch(`${baseUrl}/api/video?path=${encodeURIComponent('../outside.mp4')}`)
  assert.equal(traversalResponse.status, 403)
})

test('unknown API routes return JSON', async (t) => {
  const { baseUrl } = await startFixtureServer(t)

  const response = await fetch(`${baseUrl}/api/missing`)

  assert.equal(response.status, 404)
  assert.deepEqual(await response.json(), { error: 'API route not found.' })
})
