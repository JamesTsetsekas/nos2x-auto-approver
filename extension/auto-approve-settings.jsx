import React, {useEffect, useState} from 'react'
import browser from 'webextension-polyfill'

import {
  AUTO_APPROVE_STORAGE_KEYS,
  normalizeHostPattern,
  resolveAutoApproveSettings
} from './auto-approvals.mjs'
import {BUILT_IN_AUTO_APPROVE_HOST_PATTERNS} from './approved-hosts.mjs'

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

const hostListStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  listStyle: 'none',
  margin: 0,
  padding: 0
}

const hostCodeStyle = {
  background: '#eeeeee',
  padding: '3px 6px'
}

export default function AutoApproveSettings() {
  const [loaded, setLoaded] = useState(false)
  const [enabled, setEnabled] = useState(true)
  const [allHosts, setAllHosts] = useState(false)
  const [disabledBuiltInHostPatterns, setDisabledBuiltInHostPatterns] =
    useState([])
  const [customHostPatterns, setCustomHostPatterns] = useState([])
  const [newHostPattern, setNewHostPattern] = useState('')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    browser.storage.local
      .get(Object.values(AUTO_APPROVE_STORAGE_KEYS))
      .then(stored => {
        const settings = resolveAutoApproveSettings(stored)
        setEnabled(settings.enabled)
        setAllHosts(settings.allHosts)
        setDisabledBuiltInHostPatterns(
          settings.disabledBuiltInHostPatterns
        )
        setCustomHostPatterns(settings.customHostPatterns)
        setLoaded(true)
      })
  }, [])

  function markUnsaved() {
    setStatus('Unsaved change. Select Save automatic approvals to apply.')
  }

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
    markUnsaved()
  }

  function addCustomHost(event) {
    event.preventDefault()
    const normalized = normalizeHostPattern(newHostPattern)

    if (!normalized) {
      setStatus('')
      setError(
        'Enter an exact host, a full URL, or a wildcard subdomain such as *.preview.example.test. A bare * is not allowed here.'
      )
      return
    }

    if (BUILT_IN_AUTO_APPROVE_HOST_PATTERNS.includes(normalized)) {
      setStatus('')
      setError(`${normalized} is already included by the built-in policy.`)
      return
    }

    if (customHostPatterns.includes(normalized)) {
      setStatus('')
      setError(`${normalized} is already in your custom hosts.`)
      return
    }

    setCustomHostPatterns([...customHostPatterns, normalized])
    setNewHostPattern('')
    setError('')
    setStatus('Host added locally. Select Save automatic approvals to apply.')
  }

  function toggleBuiltInHost(pattern, checked) {
    setDisabledBuiltInHostPatterns(current =>
      checked
        ? current.filter(candidate => candidate !== pattern)
        : [...current, pattern]
    )
    setError('')
    markUnsaved()
  }

  function removeCustomHost(pattern) {
    setCustomHostPatterns(
      customHostPatterns.filter(candidate => candidate !== pattern)
    )
    setError('')
    setStatus('Host removed locally. Select Save automatic approvals to apply.')
  }

  function resetDefaults() {
    setEnabled(true)
    setAllHosts(false)
    setDisabledBuiltInHostPatterns([])
    setCustomHostPatterns([])
    setNewHostPattern('')
    setError('')
    setStatus(
      'Safe defaults restored locally. Select Save automatic approvals to apply.'
    )
  }

  async function save() {
    await browser.storage.local.set({
      [AUTO_APPROVE_STORAGE_KEYS.enabled]: enabled,
      [AUTO_APPROVE_STORAGE_KEYS.allHosts]: allHosts,
      [AUTO_APPROVE_STORAGE_KEYS.disabledBuiltInHostPatterns]:
        disabledBuiltInHostPatterns,
      [AUTO_APPROVE_STORAGE_KEYS.hostPatterns]: customHostPatterns
    })
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
          onChange={event => {
            setEnabled(event.target.checked)
            markUnsaved()
          }}
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

      <div>
        <h3>built-in hosts</h3>
        <p>
          Shipped with this build. Uncheck an entry to disable it only in this
          browser profile. Agents and developers can change the team baseline in{' '}
          <code>extension/approved-hosts.mjs</code>, then rebuild and reload.
        </p>
        <ul style={hostListStyle}>
          {BUILT_IN_AUTO_APPROVE_HOST_PATTERNS.map(pattern => (
            <li key={pattern}>
              <label>
                <input
                  checked={!disabledBuiltInHostPatterns.includes(pattern)}
                  disabled={!loaded}
                  onChange={event =>
                    toggleBuiltInHost(pattern, event.target.checked)
                  }
                  type="checkbox"
                />{' '}
                <code style={hostCodeStyle}>{pattern}</code>{' '}
                <small>
                  {disabledBuiltInHostPatterns.includes(pattern)
                    ? 'built in — disabled in this profile'
                    : 'built in'}
                </small>
              </label>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3>custom hosts</h3>
        <p>
          Paste a host or full URL. Schemes, ports, paths, and trailing dots are
          removed. Use <code>*.example.test</code> to include an apex domain and
          all of its subdomains.
        </p>
        <form
          onSubmit={addCustomHost}
          style={{display: 'flex', gap: '8px', maxWidth: '720px'}}
        >
          <input
            aria-label="Host or URL to auto-approve"
            disabled={!loaded}
            onChange={event => setNewHostPattern(event.target.value)}
            placeholder="https://preview.example.test:3000/path"
            spellCheck="false"
            style={{flex: 1}}
            value={newHostPattern}
          />
          <button disabled={!loaded || !newHostPattern.trim()} type="submit">
            add host
          </button>
        </form>

        {customHostPatterns.length ? (
          <ul style={{...hostListStyle, marginTop: '10px'}}>
            {customHostPatterns.map(pattern => (
              <li
                key={pattern}
                style={{alignItems: 'center', display: 'flex', gap: '8px'}}
              >
                <code style={hostCodeStyle}>{pattern}</code>
                <small>added in settings</small>
                <button
                  disabled={!loaded}
                  onClick={() => removeCustomHost(pattern)}
                  type="button"
                >
                  remove
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p>
            <small>No custom hosts have been added.</small>
          </p>
        )}
      </div>

      <strong>
        {!enabled
          ? 'Effective approval: disabled (normal nos2x prompts)'
          : allHosts
            ? 'Effective approval: every website'
            : `Effective allowlist: ${
                BUILT_IN_AUTO_APPROVE_HOST_PATTERNS.length -
                disabledBuiltInHostPatterns.length +
                customHostPatterns.length
              } host patterns`}
      </strong>

      <div style={{display: 'flex', gap: '8px'}}>
        <button disabled={!loaded} onClick={save}>
          save automatic approvals
        </button>
        <button disabled={!loaded} onClick={resetDefaults}>
          restore safe defaults
        </button>
      </div>

      {error && <div style={{color: '#b00020'}}>{error}</div>}
      {status && <div>{status}</div>}
    </section>
  )
}
