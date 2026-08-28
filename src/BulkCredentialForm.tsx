import { useState, type ClipboardEvent, type FormEvent } from 'react'

export interface BulkCredentialRow {
  username: string
  password: string
}

interface BulkCredentialFormProps {
  onCancel: () => void
  onSave: (rows: BulkCredentialRow[]) => void
}

function parseRows(text: string): BulkCredentialRow[] {
  return text.split(/\r?\n/).filter((line) => line !== '').map((line) => {
    const [username = '', ...passwordParts] = line.split('\t')
    return { username: username.trim(), password: passwordParts.join('\t') }
  })
}

function BulkCredentialForm({ onCancel, onSave }: BulkCredentialFormProps) {
  const [pasteValue, setPasteValue] = useState('')
  const [rows, setRows] = useState<BulkCredentialRow[]>([])
  const [showPasswords, setShowPasswords] = useState(false)
  const [error, setError] = useState('')

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const text = event.clipboardData.getData('text')
    event.preventDefault()
    setPasteValue(text)
    setRows(parseRows(text))
    setError('')
  }

  function updateRow(index: number, field: keyof BulkCredentialRow, value: string) {
    setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row))
    setError('')
  }

  function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nonEmptyRows = rows.filter((row) => row.username.trim() !== '' || row.password !== '')
    const invalidCount = nonEmptyRows.filter((row) => row.username.trim() === '' || row.password === '').length
    const validRows = nonEmptyRows.filter((row) => row.username.trim() !== '' && row.password !== '').map((row) => ({ ...row, username: row.username.trim() }))
    if (validRows.length === 0) {
      setError('Add at least one row with both a username and password.')
      return
    }
    if (invalidCount > 0) {
      setError(`Complete or delete ${invalidCount} incomplete row${invalidCount === 1 ? '' : 's'} before saving.`)
      return
    }
    onSave(validRows)
  }

  return (
    <form className="bulk-credential-form" onSubmit={submitForm}>
      <label>Paste credentials
        <textarea onChange={(event) => setPasteValue(event.target.value)} onPaste={handlePaste} placeholder="Paste email and password data copied from pgAdmin..." value={pasteValue} />
      </label>
      <p className="field-hint">Paste tab-separated email/username and password rows to add them below.</p>
      <div className="bulk-table-wrap"><table className="bulk-table"><thead><tr><th scope="col">Email / Username</th><th scope="col">Password</th><th scope="col"><span className="sr-only">Delete</span></th></tr></thead><tbody>
        {rows.map((row, index) => <tr key={index}><td><input aria-label={`Username for row ${index + 1}`} onChange={(event) => updateRow(index, 'username', event.target.value)} value={row.username} /></td><td><input aria-label={`Password for row ${index + 1}`} autoComplete="new-password" onChange={(event) => updateRow(index, 'password', event.target.value)} type={showPasswords ? 'text' : 'password'} value={row.password} /></td><td><button aria-label={`Delete row ${index + 1}`} className="text-button danger" onClick={() => setRows((current) => current.filter((_, rowIndex) => rowIndex !== index))} type="button">Delete</button></td></tr>)}
      </tbody></table></div>
      <div className="bulk-row-actions"><button className="secondary-button" onClick={() => setRows((current) => [...current, { username: '', password: '' }])} type="button">+ Add row</button><button className="text-button" onClick={() => setShowPasswords((current) => !current)} type="button">{showPasswords ? 'Hide passwords' : 'Show passwords'}</button></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions"><button className="secondary-button" onClick={onCancel} type="button">Cancel</button><button type="submit">Save all</button></div>
    </form>
  )
}

export default BulkCredentialForm
