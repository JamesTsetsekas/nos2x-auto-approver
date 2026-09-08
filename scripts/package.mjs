import {createHash} from 'node:crypto'
import {createWriteStream} from 'node:fs'
import {mkdir, readFile, readdir, rm, writeFile} from 'node:fs/promises'
import {dirname, relative, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

import archiver from 'archiver'

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const extensionDirectory = resolve(rootDirectory, 'extension')
const distDirectory = resolve(rootDirectory, 'dist')

if (dirname(distDirectory) !== rootDirectory) {
  throw new Error('Refusing to package outside the repository root')
}

const packageJson = JSON.parse(
  await readFile(resolve(rootDirectory, 'package.json'), 'utf8')
)
const manifest = JSON.parse(
  await readFile(resolve(extensionDirectory, 'manifest.json'), 'utf8')
)

if (packageJson.version !== manifest.version) {
  throw new Error(
    `Version mismatch: package.json=${packageJson.version}, manifest.json=${manifest.version}`
  )
}

const runtimeFiles = [
  'background.build.js',
  'content-script.build.js',
  'manifest.json',
  'nostr-provider.js',
  'options.build.js',
  'options.html',
  'popup.build.js',
  'popup.html',
  'prompt.build.js',
  'prompt.html',
  'styles.build.css'
]

async function filesBelow(directory) {
  const entries = await readdir(directory, {withFileTypes: true})
  const files = []

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await filesBelow(path)))
    else files.push(path)
  }

  return files
}

const iconFiles = await filesBelow(resolve(extensionDirectory, 'icons'))
const files = [
  ...runtimeFiles.map(file => resolve(extensionDirectory, file)),
  ...iconFiles
]

await rm(distDirectory, {force: true, recursive: true})
await mkdir(distDirectory, {recursive: true})

const archiveName = `${packageJson.name}-v${packageJson.version}.zip`
const archivePath = resolve(distDirectory, archiveName)
const output = createWriteStream(archivePath)
const archive = archiver('zip', {zlib: {level: 9}})

const completion = new Promise((resolveArchive, rejectArchive) => {
  output.on('close', resolveArchive)
  output.on('error', rejectArchive)
  archive.on('error', rejectArchive)
})

archive.pipe(output)
for (const file of files) {
  archive.append(await readFile(file), {
    date: new Date(0),
    mode: 0o644,
    name: relative(extensionDirectory, file).replaceAll('\\', '/')
  })
}
await archive.finalize()
await completion

const digest = createHash('sha256')
  .update(await readFile(archivePath))
  .digest('hex')
await writeFile(
  resolve(distDirectory, `${archiveName}.sha256`),
  `${digest}  ${archiveName}\n`
)

console.log(`Created dist/${archiveName}`)
