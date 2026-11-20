import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const input = fileURLToPath(new URL('../.site-build/', import.meta.url))
const output = fileURLToPath(new URL('../dist/', import.meta.url))
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.csv': 'text/csv; charset=utf-8',
  '.sql': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
}

async function assetsAt(directory, prefix = '') {
  const entries = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    const url = prefix + '/' + entry.name
    if (entry.isDirectory()) {
      entries.push(...await assetsAt(path, url))
    } else if (entry.name !== '_headers') {
      const type = mime[extname(entry.name)]
      if (!type) throw new Error('Unknown deploy asset type: ' + url)
      entries.push([url, { type, body: (await readFile(path)).toString('base64') }])
    }
  }
  return entries.sort(([left], [right]) => left.localeCompare(right))
}

const entries = await assetsAt(input)
if (!entries.some(([url]) => url === '/index.html')) throw new Error('Missing client build')
const { headers } = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'))
const policy = Object.fromEntries(headers[0].headers.map(({ key, value }) => [key, value]))
const moduleSource = [
  'const assets = new Map(' + JSON.stringify(entries) + ')',
  'const policy = ' + JSON.stringify(policy),
  await readFile(new URL('./sites-static-handler.mjs', import.meta.url), 'utf8'),
].join('\n')
await rm(output, { recursive: true, force: true })
await mkdir(join(output, 'server'), { recursive: true })
await writeFile(join(output, 'server', 'index.js'), moduleSource)
