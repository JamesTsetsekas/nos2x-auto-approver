import assert from 'node:assert/strict'
import {webcrypto} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import vm from 'node:vm'
import test from 'node:test'
import {generateSecretKey, getPublicKey} from 'nostr-tools/pure'
import * as nip44 from 'nostr-tools/nip44'

// The real provider, content script and generated background run in separate
// process-local contexts. Transport is emulated, not a live Chrome assertion.
// Only generated identities and synthetic text enter this harness; console
// output, browser/profile access and network are deliberately unavailable.
const source = async name =>
  readFile(new URL(`../extension/${name}`, import.meta.url), 'utf8')
const jsonClone = value => JSON.parse(JSON.stringify(value))
const silentConsole = {log() {}, error() {}, warn() {}}

async function bridge({host = 'branch.conduit-merchant-33n.pages.dev'} = {}) {
  const secret = generateSecretKey()
  const publicKey = getPublicKey(secret)
  const storedHex = Buffer.from(secret).toString('hex')
  const state = {
    private_key: storedHex,
    notifications: false,
    policies: {'blocked.example': {false: {'nip44.encrypt': {conditions: {}}}}}
  }
  const counters = {
    runtimeRequests: 0,
    runtimeResponses: 0,
    runtimeRejections: 0,
    storageWrites: 0,
    dispatchFailures: 0
  }
  const messageListeners = []
  const dispatches = new Set()
  let onMessage
  let rejectRuntime = false
  const origin = `https://${host}`
  const window = {
    addEventListener(type, listener) {
      if (type === 'message') messageListeners.push(listener)
    },
    postMessage(value, targetOrigin) {
      if (targetOrigin !== '*' && targetOrigin !== origin) return
      const data = structuredClone(value)
      queueMicrotask(() => {
        for (const listener of [...messageListeners]) {
          const dispatch = Promise.resolve().then(() =>
            listener({source: window, origin, data: structuredClone(data)})
          )
          dispatches.add(dispatch)
          void dispatch.then(
            () => dispatches.delete(dispatch),
            () => {
              counters.dispatchFailures += 1
              dispatches.delete(dispatch)
            }
          )
        }
      })
    }
  }
  const browser = {
    storage: {
      local: {
        async get(names) {
          return jsonClone(
            Object.fromEntries(
              (Array.isArray(names) ? names : [names]).map(name => [
                name,
                state[name]
              ])
            )
          )
        },
        async set(value) {
          counters.storageWrites += 1
          Object.assign(state, jsonClone(value))
        }
      }
    },
    runtime: {
      getURL: name => `qa-extension://${name}`,
      onInstalled: {addListener() {}},
      onMessage: {
        addListener(listener) {
          onMessage = listener
        }
      },
      onMessageExternal: {addListener() {}},
      async sendMessage(message) {
        counters.runtimeRequests += 1
        if (rejectRuntime) {
          counters.runtimeRejections += 1
          throw new Error(
            'The message port closed before a response was received.'
          )
        }
        const result = await onMessage(jsonClone(message))
        counters.runtimeResponses += 1
        return jsonClone(result)
      }
    },
    windows: {onRemoved: {addListener() {}}}
  }
  const globals = {
    browser,
    Object,
    Array,
    Uint8Array,
    ArrayBuffer,
    DataView,
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    crypto: webcrypto,
    console: silentConsole
  }
  const background = vm.createContext({...globals})
  background.self = background
  const backgroundSource = process.env.QA_SIGNER_BRIDGE_BACKGROUND
    ? await readFile(process.env.QA_SIGNER_BRIDGE_BACKGROUND, 'utf8')
    : await source('background.build.js')
  vm.runInContext(backgroundSource, background)
  assert.equal(typeof onMessage === 'function', true)

  const provider = await source('nostr-provider.js')
  const document = {
    addEventListener() {},
    createElement() {
      return {
        attributes: {},
        setAttribute(name, value) {
          this.attributes[name] = value
        }
      }
    },
    head: {
      appendChild(script) {
        assert.equal(
          script.attributes.src === 'qa-extension://nostr-provider.js',
          true
        )
        vm.runInContext(provider, page)
      }
    }
  }
  const page = vm.createContext({...globals, window, document})
  page.self = window
  const content = vm.createContext({
    ...globals,
    window,
    self: window,
    document,
    location: {host}
  })
  vm.runInContext(await source('content-script.build.js'), content)
  assert.equal(typeof window.nostr?.nip44?.encrypt === 'function', true)

  return {
    nostr: window.nostr,
    publicKey,
    secret,
    rejectRuntime() {
      rejectRuntime = true
    },
    async settled() {
      await Promise.resolve()
      await Promise.all([...dispatches])
      await Promise.resolve()
      return {
        ...counters,
        pendingRequests: Object.keys(window.nostr._requests).length,
        storedKeyUnchanged: state.private_key === storedHex
      }
    }
  }
}

async function assertClean(qa, expectedRequests) {
  const result = await qa.settled()
  assert.equal(result.runtimeRequests === expectedRequests, true)
  assert.equal(
    result.runtimeResponses + result.runtimeRejections === expectedRequests,
    true
  )
  assert.equal(result.pendingRequests, 0)
  assert.equal(result.dispatchFailures, 0)
  assert.equal(result.storageWrites, 0)
  assert.equal(result.storedKeyUnchanged, true)
}

for (const [label, plaintext] of [
  ['short', 'synthetic bridge compatibility'],
  ['extended', 'x'.repeat(65536)]
]) {
  test(
    `composed provider/content/background roundtrips ${label} self-message`,
    {timeout: 5000},
    async () => {
      const qa = await bridge()
      assert.equal((await qa.nostr.getPublicKey()) === qa.publicKey, true)
      const ciphertext = await qa.nostr.nip44.encrypt(qa.publicKey, plaintext)
      assert.equal(typeof ciphertext === 'string', true)
      const conversation = nip44.v2.utils.getConversationKey(
        qa.secret,
        qa.publicKey
      )
      assert.equal(
        nip44.v2.decrypt(ciphertext, conversation) === plaintext,
        true
      )
      const decrypted = await qa.nostr.nip44.decrypt(qa.publicKey, ciphertext)
      assert.equal(decrypted === plaintext, true)
      await assertClean(qa, 3)
    }
  )
}

test(
  'composed known denial rejects and clears the provider request',
  {timeout: 5000},
  async () => {
    const qa = await bridge({host: 'blocked.example'})
    const denied = await qa.nostr.nip44
      .encrypt(qa.publicKey, 'synthetic denied request')
      .then(
        () => false,
        error =>
          typeof error?.message === 'string' &&
          error.message === 'nos2x: denied'
      )
    assert.equal(denied, true)
    await assertClean(qa, 1)
  }
)

test(
  'composed runtime rejection rejects and clears a cached-identity request',
  {timeout: 5000},
  async () => {
    const qa = await bridge()
    assert.equal((await qa.nostr.getPublicKey()) === qa.publicKey, true)
    qa.rejectRuntime()
    assert.equal((await qa.nostr.getPublicKey()) === qa.publicKey, true)
    const rejected = await qa.nostr.nip44
      .encrypt(qa.publicKey, 'synthetic transport failure')
      .then(
        () => false,
        error =>
          typeof error?.message === 'string' &&
          error.message.includes('message port closed')
      )
    assert.equal(rejected, true)
    await assertClean(qa, 2)
  }
)
