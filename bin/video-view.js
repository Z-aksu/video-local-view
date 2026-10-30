#!/usr/bin/env node

import { access, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

import open from 'open'

import { createVideoApp } from '../server/app.js'
import { listenOnAvailablePort } from '../server/listen.js'
import { parseCliOptions } from '../server/options.js'
import { LANGUAGE_HELP } from '../shared/localization.js'

const require = createRequire(import.meta.url)
const packageInfo = require('../package.json')
const packageRoot = fileURLToPath(new URL('..', import.meta.url))
const staticDir = path.join(packageRoot, 'dist')

const HELP_TEXT = `
Video Local View

Usage:
  video-view [options]

Options:
  -d, --dir <directory>  Video folder (default: current directory)
  -p, --port <port>      Port to listen on (default: first available port from 31221)
      --host <address>   Address to listen on (default: 127.0.0.1, local access only)
      --lan              Allow access from other devices on the local network
      --no-open          Do not open a browser on startup
  -h, --help             Show this help
  -v, --version          Show the version

Video files in the specified folder and its subfolders are scanned recursively. Use quotes for paths containing spaces.

Examples:
  video-view
  video-view --dir "D:\\Videos"
  video-view -d .\\lessons --port 4300 --no-open
`.trim()

function browserHost(host) {
  if (host === '0.0.0.0' || host === '::') return '127.0.0.1'
  return host.includes(':') ? `[${host}]` : host
}

function lanHosts() {
  return [...new Set(Object.values(os.networkInterfaces())
    .flatMap((interfaces) => interfaces ?? [])
    .filter((address) => !address.internal && (address.family === 'IPv4' || address.family === 4))
    .map((address) => address.address))]
}

async function ensureClientBuild() {
  try {
    await access(path.join(staticDir, 'index.html'))
  } catch {
    const error = new Error('Built client files were not found. Run npm run build in the project directory first.')
    error.code = 'CLIENT_BUILD_MISSING'
    throw error
  }
}

async function resolveRootDirectory(directory) {
  const rootDir = path.resolve(directory)
  let stats

  try {
    stats = await stat(rootDir)
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') throw new Error(`Directory not found: ${rootDir}`)
    if (error.code === 'EACCES' || error.code === 'EPERM') throw new Error(`Cannot access directory (permission denied): ${rootDir}`)
    throw error
  }

  if (!stats.isDirectory()) throw new Error(`Path is not a directory: ${rootDir}`)
  return rootDir
}

export async function main(args = process.argv.slice(2)) {
  const options = parseCliOptions(args)

  if (options.help) {
    console.log(HELP_TEXT)
    return null
  }

  if (options.version) {
    console.log(packageInfo.version)
    return null
  }

  const rootDir = await resolveRootDirectory(options.directory)
  await ensureClientBuild()

  const app = createVideoApp({ rootDir, staticDir })
  const { server, port } = await listenOnAvailablePort(app, {
    host: options.host,
    port: options.port,
    retryOnConflict: !options.portSpecified,
    onPortInUse: (occupiedPort, nextPort) => console.warn(`Port ${occupiedPort} is in use. Trying ${nextPort}.`),
  })
  const url = `http://${browserHost(options.host)}:${port}`

  console.log('Video Local View is running')
  console.log(`Folder: ${rootDir}`)
  console.log(`Config: ${path.join(rootDir, '.video', 'config.json')}`)
  console.log(`Language: ${app.locals.language}. Supported languages: ${LANGUAGE_HELP}.`)
  console.log(`Open: ${url}`)
  if (options.host === '0.0.0.0' || options.host === '::') {
    for (const host of lanHosts()) console.log(`LAN access: http://${host}:${port}`)
  }
  console.log('Press Ctrl+C to stop the server.')

  if (options.open) {
    open(url).catch((error) => console.warn(`Could not open a browser automatically: ${error.message}`))
  }

  const shutdown = () => server.close(() => process.exit(0))
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)

  return { server, url, rootDir }
}

main().catch((error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Startup failed: port ${error.port ?? ''} is already in use. Specify another port with --port.`)
  } else {
    console.error(`Startup failed: ${error.message}`)
  }
  process.exitCode = 1
})
