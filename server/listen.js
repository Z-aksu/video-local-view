import { once } from 'node:events'

const MAX_PORT = 65535

export async function listenOnAvailablePort(app, { host, port, onPortInUse, retryOnConflict = true }) {
  let candidatePort = port

  while (candidatePort <= MAX_PORT) {
    const server = app.listen(candidatePort, host)

    try {
      await once(server, 'listening')
      const address = server.address()
      const actualPort = typeof address === 'object' && address ? address.port : candidatePort
      return { server, port: actualPort }
    } catch (error) {
      if (error.code !== 'EADDRINUSE' || candidatePort === 0 || !retryOnConflict) {
        throw error
      }

      if (candidatePort === MAX_PORT) {
        const unavailableError = new Error(`All ports from ${port} through ${MAX_PORT} are in use.`)
        unavailableError.code = 'NO_AVAILABLE_PORT'
        unavailableError.cause = error
        throw unavailableError
      }

      const nextPort = candidatePort + 1
      onPortInUse?.(candidatePort, nextPort)
      candidatePort = nextPort
    }
  }

  throw new Error('No available port was found.')
}
