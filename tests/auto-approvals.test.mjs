import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'

import {finalizeEvent, getPublicKey} from 'nostr-tools/pure'

import {
  AUTO_APPROVE_STORAGE_KEYS,
  DEFAULT_AUTO_APPROVE_HOST_PATTERNS,
  hostMatchesPattern,
  normalizeHostPattern,
  parseHostPatterns,
  shouldAutoApproveHost
} from '../extension/auto-approvals.mjs'

test('defaults auto-approve Conduit local, preview, and production hosts', () => {
  const approved = [
    'localhost',
    'localhost:7000',
    'market.localhost:7000',
    '127.0.0.1:7001',
    '[::1]:7001',
    '0.0.0.0:7002',
    'conduit-market-coo.pages.dev',
    'c2d90892.conduit-market-coo.pages.dev',
    'branch.conduit-merchant-33n.pages.dev',
    'shop.conduit.market',
    'sell.conduit.market',
    'build.conduit.market'
  ]

  for (const host of approved) {
    assert.equal(shouldAutoApproveHost(host), true, host)
  }
})

test('defaults reject lookalikes and unrelated sites', () => {
  const rejected = [
    'evilconduit-market-coo.pages.dev',
    'conduit-market-coo.pages.dev.example.com',
    'anything.pages.dev',
    'relay.conduit.market',
    'shop.conduit.market.example.com',
    'example.com',
    '',
    null
  ]

  for (const host of rejected) {
    assert.equal(shouldAutoApproveHost(host), false, String(host))
  }
})

test('custom host patterns replace defaults and ignore URL details', () => {
  const keys = AUTO_APPROVE_STORAGE_KEYS
  const stored = {
    [keys.enabled]: true,
    [keys.allHosts]: false,
    [keys.hostPatterns]: [
      'https://agent.example.test:8443/signer',
      '*.preview.example.test'
    ]
  }

  assert.equal(shouldAutoApproveHost('agent.example.test:3000', stored), true)
  assert.equal(shouldAutoApproveHost('preview.example.test', stored), true)
  assert.equal(shouldAutoApproveHost('pr-42.preview.example.test', stored), true)
  assert.equal(shouldAutoApproveHost('shop.conduit.market', stored), false)
  assert.equal(shouldAutoApproveHost('notpreview.example.test', stored), false)
})

test('disabled mode wins and all-hosts mode requires enabled mode', () => {
  const keys = AUTO_APPROVE_STORAGE_KEYS
  const disabled = {
    [keys.enabled]: false,
    [keys.allHosts]: true,
    [keys.hostPatterns]: []
  }
  const allHosts = {...disabled, [keys.enabled]: true}

  assert.equal(shouldAutoApproveHost('anything.example', disabled), false)
  assert.equal(shouldAutoApproveHost('anything.example', allHosts), true)
})

test('patterns normalize safely and a bare wildcard is rejected', () => {
  assert.equal(
    normalizeHostPattern(' HTTPS://*.Preview.Example.Test:443/path '),
    '*.preview.example.test'
  )
  assert.equal(normalizeHostPattern('*'), null)
  assert.equal(normalizeHostPattern('foo.*.example.test'), null)
  assert.equal(
    hostMatchesPattern('evilpreview.example.test', '*.preview.example.test'),
    false
  )

  const parsed = parseHostPatterns(`
    # dedicated test services
    localhost
    LOCALHOST:3000
    *.preview.example.test
    *
  `)
  assert.deepEqual(parsed.hostPatterns, [
    'localhost',
    '*.preview.example.test'
  ])
  assert.deepEqual(parsed.invalidPatterns, ['*'])
})

test('the pinned nos2x crypto accepts its stored hex-key representation', () => {
  const storedHexKey = '01'.repeat(32)
  const publicKey = getPublicKey(storedHexKey)
  const signed = finalizeEvent(
    {kind: 1, created_at: 1, tags: [], content: 'test fixture'},
    storedHexKey
  )

  assert.match(publicKey, /^[0-9a-f]{64}$/)
  assert.equal(signed.pubkey, publicKey)
  assert.match(signed.id, /^[0-9a-f]{64}$/)
  assert.match(signed.sig, /^[0-9a-f]{128}$/)
})

test('package, manifest, and nos2x crypto versions stay release-safe', async () => {
  const packageJson = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8')
  )
  const manifest = JSON.parse(
    await readFile(new URL('../extension/manifest.json', import.meta.url), 'utf8')
  )

  assert.equal(packageJson.dependencies, undefined)
  assert.equal(packageJson.devDependencies['nostr-tools'], '2.12.0')
  assert.equal(packageJson.version, manifest.version)
  assert.equal(packageJson.version, '0.1.0')
  assert.deepEqual(
    DEFAULT_AUTO_APPROVE_HOST_PATTERNS.filter(pattern => pattern === '*'),
    []
  )
})
