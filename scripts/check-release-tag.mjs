import {readFile} from 'node:fs/promises'

const packageJson = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8')
)
const manifest = JSON.parse(
  await readFile(new URL('../extension/manifest.json', import.meta.url), 'utf8')
)
const releaseTag = process.env.RELEASE_TAG || process.env.GITHUB_REF_NAME
const expectedTag = `v${packageJson.version}`

if (manifest.version !== packageJson.version) {
  throw new Error(
    `Version mismatch: package.json=${packageJson.version}, manifest.json=${manifest.version}`
  )
}

if (!releaseTag) throw new Error('RELEASE_TAG or GITHUB_REF_NAME is required')
if (releaseTag !== expectedTag) {
  throw new Error(`Release tag ${releaseTag} must equal ${expectedTag}`)
}

console.log(`Release tag ${releaseTag} matches extension version`)
