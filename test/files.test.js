import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { buildVideoTree, countVideoFiles, resolveVideoPath } from '../server/files.js'

async function createFixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'video-view-files-'))
  t.after(() => rm(root, { recursive: true, force: true }))

  await mkdir(path.join(root, '课程', '第二章'), { recursive: true })
  await mkdir(path.join(root, '空目录'), { recursive: true })
  await mkdir(path.join(root, '.private'), { recursive: true })
  await mkdir(path.join(root, 'node_modules', 'manual'), { recursive: true })
  await writeFile(path.join(root, '课程', '第二章', '视频 02.MP4'), 'nested video')
  await writeFile(path.join(root, '根目录.webm'), 'root video')
  await writeFile(path.join(root, 'notes.txt'), 'ignore me')
  await writeFile(path.join(root, '.private', 'secret.mp4'), 'secret')
  await writeFile(path.join(root, 'node_modules', 'manual', 'dependency.mp4'), 'dependency')
  return root
}

test('buildVideoTree keeps visible video branches and sorts directories before files', async (t) => {
  const root = await createFixture(t)

  const tree = await buildVideoTree(root)

  assert.deepEqual(tree, [
    {
      type: 'directory',
      name: '课程',
      path: '课程',
      children: [{
        type: 'directory',
        name: '第二章',
        path: '课程/第二章',
        children: [{ type: 'file', name: '视频 02.MP4', path: '课程/第二章/视频 02.MP4' }],
      }],
    },
    { type: 'file', name: '根目录.webm', path: '根目录.webm' },
  ])
  assert.equal(countVideoFiles(tree), 2)
})

test('resolveVideoPath accepts nested videos and rejects traversal and non-video files', async (t) => {
  const root = await createFixture(t)

  assert.equal(
    await resolveVideoPath(root, '课程/第二章/视频 02.MP4'),
    path.join(root, '课程', '第二章', '视频 02.MP4'),
  )
  await assert.rejects(() => resolveVideoPath(root, '../outside.mp4'), { statusCode: 403 })
  await assert.rejects(() => resolveVideoPath(root, 'notes.txt'), { statusCode: 400 })
})

test('resolveVideoPath rejects a symbolic link that escapes the root', async (t) => {
  const root = await createFixture(t)
  const outside = await mkdtemp(path.join(os.tmpdir(), 'video-view-outside-'))
  t.after(() => rm(outside, { recursive: true, force: true }))
  const outsideVideo = path.join(outside, 'outside.mp4')
  await writeFile(outsideVideo, 'outside video')

  try {
    await symlink(outsideVideo, path.join(root, 'escape.mp4'), 'file')
  } catch (error) {
    if (error.code === 'EPERM') {
      t.skip('当前 Windows 配置不允许创建符号链接')
      return
    }
    throw error
  }

  await assert.rejects(() => resolveVideoPath(root, 'escape.mp4'), { statusCode: 403 })
})
