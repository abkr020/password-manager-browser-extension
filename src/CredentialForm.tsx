import { useState, type FormEvent } from 'react'
import type { CredentialDraft } from './types'

interface CredentialFormProps {
  initialCredential?: CredentialDraft
  onCancel: () => void
  onSave: (credential: CredentialDraft) => void
}

function CredentialForm({
  initialCredential,
  onCancel,
  onSave,
}: CredentialFormProps) {
  const [username, setUsername] = useState(initialCredential?.username ?? '')
  const [password, setPassword] = useState(initialCredential?.password ?? '')
  const [domains, setDomains] = useState(initialCredential?.domains ?? [])
  const [domainInput, setDomainInput] = useState('')
  const [error, setError] = useState('')

  function addDomain() {
    const domain = domainInput.trim().toLowerCase()

    if (domain === '') {
      setError('Domain cannot be empty.')
      return
    }

    if (domains.includes(domain)) {
      setError('That domain has already been added.')
      return
    }

    setDomains([...domains, domain])
    setDomainInput('')
    setError('')
  }

  function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (username.trim() === '') {
      setError('Username or email is required.')
      return
    }

    if (password === '') {
      setError('Password is required.')
      return
    }

    onSave({ username: username.trim(), password, domains })
  }

  return (
    <form className="credential-form" onSubmit={submitForm}>
      <label>
        Username or email
        <input
          autoComplete="username"
          onChange={(event) => setUsername(event.target.value)}
          value={username}
        />
      </label>

      <label>
        Password
        <input
          autoComplete="new-password"
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          value={password}
        />
      </label>

      <div className="domain-section">
        <span className="field-label">Domains</span>
        {domains.length > 0 && (
          <ul className="domain-list">
            {domains.map((domain) => (
              <li key={domain}>
                <span>{domain}</span>
                <button
                  aria-label={`Remove ${domain}`}
                  className="text-button danger"
                  onClick={() => setDomains(domains.filter((item) => item !== domain))}
                  type="button"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="domain-input-row">
          <input
            aria-label="Domain"
            onChange={(event) => setDomainInput(event.target.value)}
            placeholder="example.com"
            value={domainInput}
          />
          <button onClick={addDomain} type="button">
            Add domain
          </button>
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}

      <div className="form-actions">
        <button className="secondary-button" onClick={onCancel} type="button">
          Cancel
        </button>
        <button type="submit">Save credential</button>
      </div>
    </form>
  )
}

export default CredentialForm
