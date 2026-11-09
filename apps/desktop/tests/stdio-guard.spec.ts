import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

const guard = pathToFileURL(fileURLToPath(new URL('../src/stdio-guard.ts', import.meta.url))).href

describe('Desktop standard output streams', () => {
  for (const name of ['stdout', 'stderr'] as const) {
    it(`survives a disconnected ${name} pipe`, async () => {
      const script = `
        await import(${JSON.stringify(guard)})
        const stream = process[${JSON.stringify(name)}]
        stream.on('error', error => { clearInterval(timer); process.send({ code: error.code }, () => process.exit(0)) })
        process.on('message', () => { timer = setInterval(() => stream.write('update check\\n'), 10) })
        let timer
        process.send({ ready: true })
      `
      const child = spawn(process.execPath, ['--input-type=module', '-e', script], {
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      })
      try {
        const result = await new Promise<{ code: number | null; errorCode: string | undefined }>((resolve, reject) => {
          let errorCode: string | undefined
          const timeout = setTimeout(() => { reject(new Error('child did not observe a disconnected pipe')) }, 10_000)
          child.on('error', (error) => { clearTimeout(timeout); reject(error) })
          child.on('message', (message: { ready?: boolean; code?: string }) => {
            if (message.ready) { child[name]?.destroy(); child.send('write') }
            if (message.code) errorCode = message.code
          })
          child.on('exit', (code) => { clearTimeout(timeout); resolve({ code, errorCode }) })
        })
        expect(result.code).toBe(0)
        expect(['EPIPE', 'EBADF']).toContain(result.errorCode)
      } finally {
        if (child.exitCode === null) child.kill()
      }
    })
  }

  it('survives closed descriptors on both streams', () => {
    const script = `await import(${JSON.stringify(guard)}); for (const stream of [process.stdout, process.stderr]) stream.emit('error', Object.assign(new Error('closed descriptor'), { code: 'EBADF' }))`
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' })
    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
  })

  it('does not suppress other stream errors', () => {
    const script = `await import(${JSON.stringify(guard)}); process.stdout.emit('error', Object.assign(new Error('unexpected stream failure'), { code: 'EIO' }))`
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('unexpected stream failure')
  })
})
