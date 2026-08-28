console.log('Password Manager content script loaded')
console.log(window.location.href)

interface SavedCredential {
  username: string
  password: string
  domains: string[]
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isCurrentCredential(value: unknown): value is SavedCredential {
  return (
    isRecord(value) &&
    typeof value.username === 'string' &&
    typeof value.password === 'string' &&
    Array.isArray(value.domains) &&
    value.domains.every((domain) => typeof domain === 'string') &&
    new Set(value.domains).size === value.domains.length &&
    typeof value.timestamp === 'number' &&
    !('url' in value) &&
    !('hostname' in value)
  )
}

function hostnameFromUrl(value: unknown) {
  if (typeof value !== 'string') {
    return null
  }

  try {
    return new URL(value).hostname
  } catch {
    return null
  }
}

function domainsFromStoredCredential(credential: Record<string, unknown>) {
  const domains = Array.isArray(credential.domains)
    ? credential.domains.filter(
        (domain): domain is string => typeof domain === 'string' && domain !== '',
      )
    : []
  const legacyDomain =
    (typeof credential.hostname === 'string' && credential.hostname) ||
    hostnameFromUrl(credential.url)

  if (legacyDomain && !domains.includes(legacyDomain)) {
    domains.push(legacyDomain)
  }

  return [...new Set(domains)]
}

function migrateSavedCredentials(storedValue: unknown) {
  if (!Array.isArray(storedValue)) {
    return { credentials: [] as SavedCredential[], migrated: storedValue !== undefined }
  }

  const credentials: SavedCredential[] = []
  let migrated = false

  for (const storedCredential of storedValue) {
    if (!isRecord(storedCredential) || typeof storedCredential.password !== 'string') {
      migrated = true
      continue
    }

    if (!isCurrentCredential(storedCredential)) {
      migrated = true
    }

    const credential: SavedCredential = {
      username:
        typeof storedCredential.username === 'string'
          ? storedCredential.username
          : '',
      password: storedCredential.password,
      domains: domainsFromStoredCredential(storedCredential),
      timestamp:
        typeof storedCredential.timestamp === 'number'
          ? storedCredential.timestamp
          : Date.now(),
    }
    const existingCredential = credentials.find(
      (existing) =>
        existing.username === credential.username &&
        existing.password === credential.password,
    )

    if (existingCredential) {
      migrated = true
      for (const domain of credential.domains) {
        if (!existingCredential.domains.includes(domain)) {
          existingCredential.domains.push(domain)
        }
      }
    } else {
      credentials.push(credential)
    }
  }

  return { credentials, migrated }
}

async function saveCredential(username: string, password: string) {
  const storedData = await chrome.storage.local.get(savedPasswordsStorageKey)
  const { credentials, migrated } = migrateSavedCredentials(
    storedData[savedPasswordsStorageKey],
  )
  const matchingCredential = credentials.find(
    (credential) =>
      credential.username === username && credential.password === password,
  )

  if (matchingCredential) {
    if (!matchingCredential.domains.includes(window.location.hostname)) {
      matchingCredential.domains.push(window.location.hostname)
      await chrome.storage.local.set({ [savedPasswordsStorageKey]: credentials })
    } else if (migrated) {
      await chrome.storage.local.set({ [savedPasswordsStorageKey]: credentials })
    }

    return
  }

  credentials.push({
    username,
    password,
    domains: [window.location.hostname],
    timestamp: Date.now(),
  })

  await chrome.storage.local.set({ [savedPasswordsStorageKey]: credentials })
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
