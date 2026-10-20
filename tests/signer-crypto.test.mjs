import assert from 'node:assert/strict'
import {webcrypto} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import vm from 'node:vm'
import test from 'node:test'
import {build} from 'esbuild'
import {generateSecretKey, getPublicKey, verifyEvent} from 'nostr-tools/pure'
import * as nip19 from 'nostr-tools/nip19'
import * as nip04 from 'nostr-tools/nip04'
import * as nip44 from 'nostr-tools/nip44'

// Exercise the actual extension entrypoints using process-local generated keys.
// No browser/profile storage, real identities, payload logs or network are used.
const root = fileURLToPath(new URL('..', import.meta.url))
const bundles = new Map()
const bytesToHex = bytes => Buffer.from(bytes).toString('hex')

function bundle(entry) {
  if (!bundles.has(entry)) {
    bundles.set(
      entry,
      build({
        absWorkingDir: root,
        entryPoints: [`extension/${entry}`],
        bundle: true,
        write: false,
        platform: 'browser',
        format: 'iife',
        logLevel: 'silent',
        plugins: [
          {
            name: 'process-local-browser',
            setup(builder) {
              builder.onResolve(
                {
                  filter:
                    /^(webextension-polyfill|react|react-dom\/client|react-qr-code)$/
                },
                args => ({path: args.path, namespace: 'qa-test'})
              )
              builder.onLoad({filter: /.*/, namespace: 'qa-test'}, args => {
                const contents = {
                  'webextension-polyfill':
                    'export default globalThis.qaBrowser',
                  react:
                    'export default globalThis.qaReact; export const {useState, useRef, useEffect} = globalThis.qaReact',
                  'react-dom/client':
                    'export const createRoot = () => ({render: node => node.type()})',
                  'react-qr-code': 'export default () => null'
                }[args.path]
                return {contents, loader: 'js'}
              })
            }
          }
        ]
      }).then(result => result.outputFiles[0].text)
    )
  }
  return bundles.get(entry)
}

async function signer({
  storedKey = bytesToHex(generateSecretKey()),
  policies
} = {}) {
  const state = {private_key: storedKey, policies, notifications: false}
  const writes = []
  const effects = []
  const renderedStates = []
  let listener
  const browser = {
    storage: {
      local: {
        async get(names) {
          return Object.fromEntries(
            (Array.isArray(names) ? names : [names]).map(name => [
              name,
              state[name]
            ])
          )
        },
        async set(value) {
          writes.push(value)
          Object.assign(state, value)
        }
      }
    },
    runtime: {
      onInstalled: {addListener() {}},
      onMessage: {
        addListener(callback) {
          listener = callback
        }
      },
      onMessageExternal: {addListener() {}}
    },
    windows: {onRemoved: {addListener() {}}}
  }
  const context = vm.createContext({
    browser,
    qaBrowser: browser,
    qaReact: {
      createElement: (type, props) => ({type, props}),
      useState: initial => [initial, value => renderedStates.push(value)],
      useRef: value => ({current: value}),
      useEffect: effect => effects.push(effect)
    },
    crypto: webcrypto,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    ArrayBuffer,
    DataView,
    Object,
    Array,
    URL,
    URLSearchParams,
    document: {getElementById: () => ({})}
  })
  context.self = context
  vm.runInContext(
    process.env.QA_SIGNER_STAGED_BACKGROUND
      ? await readFile(process.env.QA_SIGNER_STAGED_BACKGROUND, 'utf8')
      : await bundle('background.js'),
    context
  )
  return {
    request: (
      type,
      params = {},
      host = 'branch.conduit-merchant-33n.pages.dev'
    ) => listener({type, params, host}),
    async popup() {
      vm.runInContext(await bundle('popup.jsx'), context)
      await Promise.all(effects.map(effect => effect()))
      await Promise.resolve()
      return renderedStates
    },
    state,
    writes
  }
}

function hasError(value) {
  return value && typeof value === 'object' && 'error' in value
}

test('message handler and popup retain the identity of a stored hex key', async () => {
  const key = generateSecretKey()
  const storedKey = bytesToHex(key).toUpperCase()
  const expected = getPublicKey(key)
  const qa = await signer({storedKey})
  assert.equal((await qa.request('getPublicKey')) === expected, true)
  const event = await qa.request('signEvent', {
    event: {kind: 1, created_at: 1, tags: [], content: 'synthetic signer test'}
  })
  assert.equal(hasError(event), false)
  assert.equal(event.pubkey === expected, true)
  assert.equal(verifyEvent(event), true)
  const popupStates = await qa.popup()
  assert.equal(popupStates.includes(nip19.npubEncode(expected)), true)
  assert.equal(qa.state.private_key === storedKey, true)
  assert.equal(qa.writes.length, 0)
})

for (const [label, plaintext] of [
  ['short', 'synthetic encryption compatibility'],
  ['65535-byte boundary', 'x'.repeat(65535)],
  ['65536-byte extended boundary', 'x'.repeat(65536)],
  ['65537-byte extended boundary', 'x'.repeat(65537)],
  ['multi-byte extended', 'é'.repeat(32768)],
  ['application-sized synthetic checkpoint', 'x'.repeat(240000)]
]) {
  test(`real NIP44 operation roundtrips ${label} in both directions`, async () => {
    const senderKey = generateSecretKey()
    const peerKey = generateSecretKey()
    const senderPubkey = getPublicKey(senderKey)
    const peer = getPublicKey(peerKey)
    const storedKey = bytesToHex(senderKey)
    const qa = await signer({storedKey})
    const ciphertext = await qa.request('nip44.encrypt', {peer, plaintext})
    assert.equal(
      typeof ciphertext === 'string',
      true,
      'encryption must succeed'
    )
    const conversation = nip44.v2.utils.getConversationKey(
      peerKey,
      senderPubkey
    )
    assert.equal(nip44.v2.decrypt(ciphertext, conversation) === plaintext, true)
    const reply = nip44.v2.encrypt(plaintext, conversation)
    const decrypted = await qa.request('nip44.decrypt', {
      peer,
      ciphertext: reply
    })
    assert.equal(decrypted === plaintext, true)
    assert.equal(qa.state.private_key === storedKey, true)
    assert.equal(qa.writes.length, 0)
  })
}

test('legacy NIP04 remains interoperable without migrating stored keys', async () => {
  const key = generateSecretKey()
  const peerKey = generateSecretKey()
  const peer = getPublicKey(peerKey)
  const pubkey = getPublicKey(key)
  const storedKey = bytesToHex(key)
  const qa = await signer({storedKey})
  const plaintext = 'synthetic legacy compatibility'
  const ciphertext = await qa.request('nip04.encrypt', {peer, plaintext})
  assert.equal(typeof ciphertext === 'string', true)
  assert.equal(
    (await nip04.decrypt(peerKey, pubkey, ciphertext)) === plaintext,
    true
  )
  const reply = await nip04.encrypt(peerKey, pubkey, plaintext)
  assert.equal(
    (await qa.request('nip04.decrypt', {peer, ciphertext: reply})) ===
      plaintext,
    true
  )
  assert.equal(qa.writes.length, 0)
})

test('a known denial and an unapproved public-key peek stay denied', async () => {
  const qa = await signer({
    policies: {'untrusted.example': {false: {getPublicKey: {conditions: {}}}}}
  })
  const denied = await qa.request('getPublicKey', {}, 'untrusted.example')
  assert.equal(denied.error?.message === 'denied', true)
  assert.equal(await qa.request('peekPublicKey', {}, 'unknown.example'), '')
  assert.equal(qa.writes.length, 0)
})

test('missing or malformed stored keys fail without writes', async () => {
  const valid = bytesToHex(generateSecretKey())
  for (const storedKey of ['', valid.slice(2), `${valid}aa`, 'not-hex', null]) {
    const qa = await signer({storedKey})
    assert.equal(hasError(await qa.request('getPublicKey')), true)
    assert.equal(qa.state.private_key === storedKey, true)
    assert.equal(qa.writes.length, 0)
  }
})
