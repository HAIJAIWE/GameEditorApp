// 假 shell：单测 system.terminal 用。读 stdin 每行，回 `echo:<行>`。
import process from 'node:process'

process.stdin.setEncoding('utf8')
let buffer = ''
process.stdin.on('data', (chunk) => {
  buffer += chunk
  let index
  while ((index = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, index)
    buffer = buffer.slice(index + 1)
    process.stdout.write(`echo:${line}\n`)
  }
})
