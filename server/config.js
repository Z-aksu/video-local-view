import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export function initializeWorkspaceConfig(rootDir) {
  const configDir = path.join(path.resolve(rootDir), '.video')
  const configPath = path.join(configDir, 'config.json')

  try {
    mkdirSync(configDir, { recursive: true })
    let config
    let exists = true
    try {
      config = JSON.parse(readFileSync(configPath, 'utf8').replace(/^\uFEFF/, ''))
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      exists = false
      config = {}
    }

    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      throw new Error('Configuration must be a JSON object.')
    }
    const missingBlur = !Object.hasOwn(config, 'blurLockScreen')
    const missingPassword = !Object.hasOwn(config, 'lockPassword')
    if (missingBlur) config.blurLockScreen = true
    if (missingPassword) config.lockPassword = ''
    if (typeof config.blurLockScreen !== 'boolean') {
      throw new Error('blurLockScreen must be true or false.')
    }
    if (typeof config.lockPassword !== 'string'
      && !(Number.isSafeInteger(config.lockPassword) && config.lockPassword >= 0)) {
      throw new Error('lockPassword must be a string or a non-negative integer. Use "" for no password.')
    }

    if (!exists || missingBlur || missingPassword) {
      try {
        writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, {
          flag: exists ? 'w' : 'wx', mode: 0o600,
        })
      } catch (error) {
        if (!exists && error.code === 'EEXIST') return initializeWorkspaceConfig(rootDir)
        throw error
      }
    }
    return config
  } catch (error) {
    throw new Error(`Unable to initialize configuration ${configPath}: ${error.message}`, { cause: error })
  }
}

export function hasLockPassword(config) {
  return String(config.lockPassword).trim() !== ''
}
