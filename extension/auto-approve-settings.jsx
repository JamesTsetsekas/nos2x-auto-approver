import React, {useEffect, useState} from 'react'
import browser from 'webextension-polyfill'

import {
  AUTO_APPROVE_STORAGE_KEYS,
  DEFAULT_AUTO_APPROVE_HOST_PATTERNS,
  parseHostPatterns,
  resolveAutoApproveSettings
} from './auto-approvals.mjs'

const warningStyle = {
  background: '#fff3cd',
  border: '2px solid #8a6d00',
  color: '#3d3100',
  maxWidth: '760px',
  padding: '12px'
}

const sectionStyle = {
  border: '1px solid currentColor',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  margin: '16px 0 24px',
  maxWidth: '760px',
  padding: '16px'
}

export default function AutoApproveSettings() {
  const [loaded, setLoaded] = useState(false)
  const [enabled, setEnabled] = useState(true)
  const [allHosts, setAllHosts] = useState(false)
  const [patternsText, setPatternsText] = useState('')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    browser.storage.local
      .get(Object.values(AUTO_APPROVE_STORAGE_KEYS))
      .then(stored => {
        const settings = resolveAutoApproveSettings(stored)
        setEnabled(settings.enabled)
        setAllHosts(settings.allHosts)
        setPatternsText(settings.hostPatterns.join('\n'))
        setLoaded(true)
      })
  }, [])

  function changeAllHosts(event) {
    const checked = event.target.checked
    if (
      checked &&
      !window.confirm(
        'Every website will be able to use this key without asking. Continue only with a disposable test identity.'
      )
    ) {
      return
    }

    setAllHosts(checked)
  }

  function resetDefaults() {
    setEnabled(true)
    setAllHosts(false)
    setPatternsText(DEFAULT_AUTO_APPROVE_HOST_PATTERNS.join('\n'))
    setError('')
    setStatus('Defaults restored locally. Select Save automatic approvals to apply.')
  }

  async function save() {
    const {hostPatterns, invalidPatterns} = parseHostPatterns(patternsText)
    if (invalidPatterns.length) {
      setStatus('')
      setError(`Invalid host patterns: ${invalidPatterns.join(', ')}`)
      return
    }

    await browser.storage.local.set({
      [AUTO_APPROVE_STORAGE_KEYS.enabled]: enabled,
      [AUTO_APPROVE_STORAGE_KEYS.allHosts]: allHosts,
      [AUTO_APPROVE_STORAGE_KEYS.hostPatterns]: hostPatterns
    })
    setPatternsText(hostPatterns.join('\n'))
    setError('')
    setStatus('Automatic approval settings saved.')
  }

  return (
    <section style={sectionStyle}>
      <div style={warningStyle}>
        <strong>Disposable test keys only.</strong> Automatic approval lets a
        matching website read this identity, sign events, and encrypt or decrypt
        messages without another prompt. Never use a personal, treasury, or
        merchant key here.
      </div>

      <h2 style={{margin: 0}}>automatic approvals</h2>

      <label>
        <input
          checked={enabled}
          disabled={!loaded}
          onChange={event => setEnabled(event.target.checked)}
          type="checkbox"
        />{' '}
        enable unattended approvals
      </label>

      <label>
        <input
          checked={allHosts}
          disabled={!loaded || !enabled}
          onChange={changeAllHosts}
          type="checkbox"
        />{' '}
        auto-approve every website (dangerous)
      </label>

      <label htmlFor="auto-approve-host-patterns">
        approved host patterns, one per line
      </label>
      <textarea
        disabled={!loaded || !enabled || allHosts}
        id="auto-approve-host-patterns"
        onChange={event => setPatternsText(event.target.value)}
        rows="12"
        spellCheck="false"
        style={{fontFamily: 'monospace', maxWidth: '720px', width: '100%'}}
        value={patternsText}
      />
      <small>
        Use an exact host such as <code>localhost</code> or a wildcard subdomain
        such as <code>*.example.test</code>. Ports, schemes, paths, and trailing
        dots are ignored. Lines beginning with # are comments.
      </small>

      <div style={{display: 'flex', gap: '8px'}}>
        <button disabled={!loaded} onClick={save}>
          save automatic approvals
        </button>
        <button disabled={!loaded} onClick={resetDefaults}>
          restore defaults
        </button>
      </div>

      {error && <div style={{color: '#b00020'}}>{error}</div>}
      {status && <div>{status}</div>}
    </section>
  )
}
