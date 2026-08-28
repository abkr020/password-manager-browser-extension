console.log('Password Manager content script loaded')
console.log(window.location.href)

interface SavedCredential {
  url: string
  hostname: string
  username: string
  password: string
  timestamp: number
}

declare const chrome: {
  storage: {
    local: {
      get(key: string): Promise<Record<string, unknown>>
      set(items: Record<string, unknown>): Promise<void>
    }
  }
}

const savedPasswordsStorageKey = 'saved_passwords'
const detectedPasswordFields = new WeakSet<HTMLInputElement>()
const detectedLoginForms = new WeakSet<HTMLFormElement>()
let credentialSaveQueue = Promise.resolve()

async function saveCredential(username: string, password: string) {
  const storedData = await chrome.storage.local.get(savedPasswordsStorageKey)
  const savedPasswords = Array.isArray(storedData[savedPasswordsStorageKey])
    ? (storedData[savedPasswordsStorageKey] as SavedCredential[])
    : []

  savedPasswords.push({
    url: window.location.href,
    hostname: window.location.hostname,
    username,
    password,
    timestamp: Date.now(),
  })

  await chrome.storage.local.set({
    [savedPasswordsStorageKey]: savedPasswords,
  })
}

function queueCredentialSave(username: string, password: string) {
  credentialSaveQueue = credentialSaveQueue
    .then(() => saveCredential(username, password))
    .catch(() => {
      console.error('Unable to save credential')
    })
}

function findUsernameField(form: HTMLFormElement) {
  const usernameSelectors = [
    'input[type="email"]',
    'input[name="email"]',
    'input[name="username"]',
    'input[name="user"]',
    'input[autocomplete="username"]',
  ]

  for (const selector of usernameSelectors) {
    const usernameField = form.querySelector<HTMLInputElement>(selector)
    if (usernameField) {
      return usernameField
    }
  }

  return null
}

function findPasswordField(form: HTMLFormElement) {
  return Array.from(form.elements).find(
    (element): element is HTMLInputElement =>
      element instanceof HTMLInputElement && element.type === 'password',
  )
}

function detectLoginForm(form: HTMLFormElement) {
  if (detectedLoginForms.has(form)) {
    return
  }

  detectedLoginForms.add(form)

  form.addEventListener('submit', () => {
    const passwordField = findPasswordField(form)
    if (!passwordField || passwordField.value === '') {
      return
    }

    const username = findUsernameField(form)?.value ?? ''
    queueCredentialSave(username, passwordField.value)
  })
}

function detectPasswordField(passwordField: HTMLInputElement) {
  if (detectedPasswordFields.has(passwordField)) {
    return
  }

  detectedPasswordFields.add(passwordField)
  console.log('Password field detected')
  console.log(passwordField)

  if (passwordField.form) {
    detectLoginForm(passwordField.form)
  }
}

function detectPasswordFields(root: ParentNode) {
  if (root instanceof HTMLInputElement && root.type === 'password') {
    detectPasswordField(root)
  }

  root
    .querySelectorAll<HTMLInputElement>('input[type="password"]')
    .forEach(detectPasswordField)
}

detectPasswordFields(document)

const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node instanceof Element) {
        detectPasswordFields(node)
      }
    }
  }
})

observer.observe(document.documentElement, { childList: true, subtree: true })
