import { useEffect, useState } from 'react'
import BulkCredentialForm, { type BulkCredentialRow } from './BulkCredentialForm'
import CredentialForm from './CredentialForm'
import type { CredentialDraft, SavedCredential } from './types'
import './App.css'

const savedPasswordsStorageKey = 'saved_passwords'

function isSavedCredential(value: unknown): value is SavedCredential {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as SavedCredential).username === 'string' &&
    typeof (value as SavedCredential).password === 'string' &&
    Array.isArray((value as SavedCredential).domains) &&
    (value as SavedCredential).domains.every((domain) => typeof domain === 'string') &&
    typeof (value as SavedCredential).timestamp === 'number'
  )
}

function credentialsFromStorage(value: unknown) {
  return Array.isArray(value) ? value.filter(isSavedCredential) : []
}

function sameCredential(left: SavedCredential, right: SavedCredential) {
  return (
    left.username === right.username &&
    left.password === right.password &&
    left.timestamp === right.timestamp &&
    left.domains.length === right.domains.length &&
    left.domains.every((domain, index) => domain === right.domains[index])
  )
}

function mergeDomains(domains: string[], additionalDomains: string[]) {
  return [...new Set([...domains, ...additionalDomains])]
}

function App() {
  const [credentials, setCredentials] = useState<SavedCredential[]>([])
  const [editingCredential, setEditingCredential] = useState<SavedCredential | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [isBulkAdding, setIsBulkAdding] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [revealedPasswords, setRevealedPasswords] = useState<Set<number>>(new Set())

  function updateCredentials(nextCredentials: SavedCredential[]) {
    setCredentials(nextCredentials)
    setRevealedPasswords(new Set())
  }

  useEffect(() => {
    void chrome.storage.local.get(savedPasswordsStorageKey)
      .then((storedData) => {
        updateCredentials(credentialsFromStorage(storedData[savedPasswordsStorageKey]))
        setLoadError('')
      })
      .catch(() => setLoadError('Unable to load saved credentials.'))

    function handleStorageChange(
      changes: Record<string, ChromeStorageChange>,
      areaName: string,
    ) {
      if (areaName !== 'local' || !changes[savedPasswordsStorageKey]) {
        return
      }

      updateCredentials(
        credentialsFromStorage(changes[savedPasswordsStorageKey].newValue),
      )
    }

    chrome.storage.onChanged.addListener(handleStorageChange)
    return () => chrome.storage.onChanged.removeListener(handleStorageChange)
  }, [])

  async function saveCredential(draft: CredentialDraft) {
    try {
      const storedData = await chrome.storage.local.get(savedPasswordsStorageKey)
      const currentCredentials = credentialsFromStorage(
        storedData[savedPasswordsStorageKey],
      )
      const editedCredentialIndex = editingCredential
        ? currentCredentials.findIndex((credential) =>
            sameCredential(credential, editingCredential),
          )
        : -1
      const remainingCredentials = currentCredentials.filter(
        (_, index) => index !== editedCredentialIndex,
      )
      const matchingCredential = remainingCredentials.find(
        (credential) =>
          credential.username === draft.username && credential.password === draft.password,
      )

      if (matchingCredential) {
        matchingCredential.domains = mergeDomains(
          matchingCredential.domains,
          draft.domains,
        )
      } else {
        remainingCredentials.push({
          ...draft,
          domains: [...draft.domains],
          timestamp: editingCredential?.timestamp ?? Date.now(),
        })
      }

      await chrome.storage.local.set({
        [savedPasswordsStorageKey]: remainingCredentials,
      })
      updateCredentials(remainingCredentials)
      setEditingCredential(null)
      setIsAdding(false)
      setLoadError('')
    } catch {
      setLoadError('Unable to save credential.')
    }
  }

  async function saveBulkCredentials(rows: BulkCredentialRow[]) {
    try {
      const storedData = await chrome.storage.local.get(savedPasswordsStorageKey)
      const currentCredentials = credentialsFromStorage(storedData[savedPasswordsStorageKey])
      const seen = new Set(currentCredentials.map((credential) => `${credential.username}\u0000${credential.password}`))
      const timestamp = Date.now()
      const importedCredentials: SavedCredential[] = []

      rows.forEach((row) => {
        const key = `${row.username}\u0000${row.password}`
        if (seen.has(key)) return
        seen.add(key)
        importedCredentials.push({ username: row.username, password: row.password, domains: [], timestamp: timestamp + importedCredentials.length })
      })

      const nextCredentials = [...currentCredentials, ...importedCredentials]
      if (importedCredentials.length > 0) await chrome.storage.local.set({ [savedPasswordsStorageKey]: nextCredentials })
      updateCredentials(nextCredentials)
      setIsBulkAdding(false)
      setLoadError('')
    } catch {
      setLoadError('Unable to save imported credentials.')
    }
  }

  async function deleteCredential(credentialToDelete: SavedCredential) {
    if (!window.confirm('Delete this saved credential?')) {
      return
    }

    try {
      const storedData = await chrome.storage.local.get(savedPasswordsStorageKey)
      const currentCredentials = credentialsFromStorage(
        storedData[savedPasswordsStorageKey],
      )
      const nextCredentials = currentCredentials.filter(
        (credential) => !sameCredential(credential, credentialToDelete),
      )

      await chrome.storage.local.set({
        [savedPasswordsStorageKey]: nextCredentials,
      })
      updateCredentials(nextCredentials)
      setLoadError('')
    } catch {
      setLoadError('Unable to delete credential.')
    }
  }

  function closeForm() {
    setEditingCredential(null)
    setIsAdding(false)
    setIsBulkAdding(false)
  }

  function togglePassword(index: number) {
    setRevealedPasswords((current) => {
      const next = new Set(current)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  const formCredential = editingCredential
    ? {
        username: editingCredential.username,
        password: editingCredential.password,
        domains: editingCredential.domains,
      }
    : undefined

  return (
    <main className="popup">
      <header className="popup-header">
        <div>
          <p className="eyebrow">Password Manager</p>
          <h1>Saved credentials</h1>
        </div>
        {!isAdding && !isBulkAdding && !editingCredential && (
          <div className="header-actions">
            <button className="secondary-button" onClick={() => setIsBulkAdding(true)} type="button">Bulk add</button>
            <button onClick={() => setIsAdding(true)} type="button">Add credential</button>
          </div>
        )}
      </header>

      {loadError && <p className="status-message" role="alert">{loadError}</p>}

      {(isAdding || editingCredential) && (
        <section className="form-panel">
          <h2>{editingCredential ? 'Edit credential' : 'Add credential'}</h2>
          <CredentialForm
            initialCredential={formCredential}
            onCancel={closeForm}
            onSave={(draft) => void saveCredential(draft)}
          />
        </section>
      )}

      {isBulkAdding && (
        <section className="form-panel">
          <h2>Bulk add credentials</h2>
          <BulkCredentialForm onCancel={closeForm} onSave={(rows) => void saveBulkCredentials(rows)} />
        </section>
      )}

      {!isAdding && !isBulkAdding && !editingCredential && credentials.length === 0 && !loadError && (
        <p className="empty-state">No saved credentials yet.</p>
      )}

      {!isAdding && !isBulkAdding && !editingCredential && credentials.length > 0 && (
        <section className="credential-list" aria-label="Saved credentials">
          {credentials.map((credential, index) => {
            const isPasswordVisible = revealedPasswords.has(index)
            return (
              <article className="credential-card" key={`${credential.timestamp}-${index}`}>
                <div className="credential-details">
                  <p className="username">{credential.username}</p>
                  <div className="password-row">
                    <span className="password-value">
                      {isPasswordVisible ? credential.password : '••••••••'}
                    </span>
                    <button className="text-button" onClick={() => togglePassword(index)} type="button">
                      {isPasswordVisible ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <ul className="credential-domains">
                    {credential.domains.map((domain) => <li key={domain}>{domain}</li>)}
                  </ul>
                </div>
                <div className="credential-actions">
                  <button onClick={() => setEditingCredential(credential)} type="button">Edit</button>
                  <button className="danger-button" onClick={() => void deleteCredential(credential)} type="button">Delete</button>
                </div>
              </article>
            )
          })}
        </section>
      )}
    </main>
  )
}

export default App
