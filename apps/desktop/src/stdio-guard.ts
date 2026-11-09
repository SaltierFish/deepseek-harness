/** Prevent disconnected parent pipes from terminating the Electron main process. */
const streams: Array<NodeJS.WriteStream | undefined> = [process.stdout, process.stderr]
for (const stream of streams) {
  stream?.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code !== 'EPIPE' && error.code !== 'EBADF') throw error
  })
}
