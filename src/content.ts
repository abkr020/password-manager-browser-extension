console.log('Password Manager content script loaded')
console.log(window.location.href)

interface SavedCredential {
  username: string
  password: string
  domains: string[]
  timestamp: number
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

const loginPanelId = 'password-manager-login-panel'
const loginPanelStylesId = 'password-manager-login-panel-styles'
let dismissedLoginUrl: string | null = null
let selectedPanelCredential: SavedCredential | null = null
let revealedPanelCredential: SavedCredential | null = null

function isLoginPage() {
  return window.location.href.toLowerCase().includes('login')
}

function areSameCredentials(left: SavedCredential | null, right: SavedCredential) {
  return (
    left !== null &&
    left.username === right.username &&
    left.password === right.password &&
    left.timestamp === right.timestamp
  )
}

function addPanelStyles() {
  if (document.getElementById(loginPanelStylesId)) {
    return
  }

  const styles = document.createElement('style')
  styles.id = loginPanelStylesId
  styles.textContent = `
    #${loginPanelId} { background: #fff; border: 1px solid #d8d1e7; border-radius: 10px; box-shadow: 0 12px 30px rgba(25, 15, 50, .22); box-sizing: border-box; color: #29233a; font: 14px/1.4 Arial, sans-serif; max-height: min(520px, calc(100vh - 32px)); overflow: auto; padding: 14px; position: fixed; right: 16px; top: 16px; width: 330px; z-index: 2147483647; }
    #${loginPanelId} * { box-sizing: border-box; }
    #${loginPanelId} .pm-header { align-items: center; display: flex; justify-content: space-between; margin-bottom: 12px; }
    #${loginPanelId} .pm-title { color: #251c39; font-size: 16px; font-weight: 700; margin: 0; }
    #${loginPanelId} button { background: #6542b8; border: 0; border-radius: 5px; color: #fff; cursor: pointer; font: inherit; padding: 5px 8px; }
    #${loginPanelId} button:hover { background: #53349d; }
    #${loginPanelId} .pm-close, #${loginPanelId} .pm-show { background: transparent; color: #5637a3; padding: 2px 5px; }
    #${loginPanelId} .pm-close { font-size: 18px; line-height: 1; }
    #${loginPanelId} .pm-list { display: grid; gap: 8px; }
    #${loginPanelId} .pm-credential { background: #fbfaff; border: 1px solid #e2dced; border-radius: 7px; cursor: pointer; padding: 10px; }
    #${loginPanelId} .pm-credential.pm-selected { border-color: #6542b8; box-shadow: 0 0 0 2px #e4dcf7; }
    #${loginPanelId} .pm-username { color: #251c39; font-weight: 700; overflow-wrap: anywhere; }
    #${loginPanelId} .pm-password { align-items: center; color: #5f5970; display: flex; gap: 6px; margin-top: 6px; overflow-wrap: anywhere; }
    #${loginPanelId} .pm-domains { color: #5f5970; font-size: 12px; margin-top: 8px; overflow-wrap: anywhere; }
    #${loginPanelId} .pm-domains span { background: #ede8f8; border-radius: 999px; display: inline-block; margin: 0 4px 4px 0; padding: 2px 6px; }
    #${loginPanelId} .pm-empty { color: #5f5970; margin: 0; }
  `
  document.head.append(styles)
}

function removeLoginPanel() {
  document.getElementById(loginPanelId)?.remove()
  selectedPanelCredential = null
  revealedPanelCredential = null
}

function createLoginPanel() {
  if (document.getElementById(loginPanelId) || !document.body) {
    return
  }

  addPanelStyles()
  const panel = document.createElement('aside')
  panel.id = loginPanelId
  panel.setAttribute('aria-label', 'Password Manager saved credentials')

  const header = document.createElement('div')
  header.className = 'pm-header'
  const title = document.createElement('h2')
  title.className = 'pm-title'
  title.textContent = 'Password Manager'
  const closeButton = document.createElement('button')
  closeButton.className = 'pm-close'
  closeButton.setAttribute('aria-label', 'Close Password Manager')
  closeButton.textContent = '×'
  closeButton.addEventListener('click', () => {
    dismissedLoginUrl = window.location.href
    removeLoginPanel()
  })
  header.append(title, closeButton)

  const list = document.createElement('div')
  list.className = 'pm-list'
  panel.append(header, list)
  document.body.append(panel)
}

async function renderLoginPanel() {
  const panel = document.getElementById(loginPanelId)
  const list = panel?.querySelector('.pm-list')
  if (!panel || !list || !isLoginPage()) {
    return
  }

  const storedData = await chrome.storage.local.get(savedPasswordsStorageKey)
  const { credentials } = migrateSavedCredentials(
    storedData[savedPasswordsStorageKey],
  )
  list.replaceChildren()

  if (credentials.length === 0) {
    const emptyState = document.createElement('p')
    emptyState.className = 'pm-empty'
    emptyState.textContent = 'No saved credentials yet.'
    list.append(emptyState)
    return
  }

  for (const credential of credentials) {
    const card = document.createElement('article')
    card.className = 'pm-credential'
    if (areSameCredentials(selectedPanelCredential, credential)) {
      card.classList.add('pm-selected')
    }
    card.addEventListener('click', () => {
      selectedPanelCredential = credential
      void renderLoginPanel()
    })

    const username = document.createElement('div')
    username.className = 'pm-username'
    username.textContent = credential.username

    const passwordRow = document.createElement('div')
    passwordRow.className = 'pm-password'
    const passwordLabel = document.createElement('span')
    passwordLabel.textContent = areSameCredentials(revealedPanelCredential, credential)
      ? credential.password
      : 'Password: ••••••••'
    const showButton = document.createElement('button')
    showButton.className = 'pm-show'
    const isRevealed = areSameCredentials(revealedPanelCredential, credential)
    showButton.textContent = isRevealed ? 'Hide' : 'Show'
    showButton.addEventListener('click', (event) => {
      event.stopPropagation()
      revealedPanelCredential = isRevealed ? null : credential
      void renderLoginPanel()
    })
    passwordRow.append(passwordLabel, showButton)

    const domains = document.createElement('div')
    domains.className = 'pm-domains'
    if (credential.domains.length === 0) {
      domains.textContent = 'No associated domains'
    } else {
      for (const domain of credential.domains) {
        const domainLabel = document.createElement('span')
        domainLabel.textContent = domain
        domains.append(domainLabel)
      }
    }

    card.append(username, passwordRow, domains)
    list.append(card)
  }
}

function updateLoginPanelForCurrentUrl() {
  const currentUrl = window.location.href

  if (!isLoginPage()) {
    removeLoginPanel()
    return
  }

  if (dismissedLoginUrl && dismissedLoginUrl !== currentUrl) {
    dismissedLoginUrl = null
  }

  if (dismissedLoginUrl === currentUrl) {
    return
  }

  createLoginPanel()
  void renderLoginPanel()
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (
    areaName === 'local' &&
    changes[savedPasswordsStorageKey] &&
    document.getElementById(loginPanelId)
  ) {
    void renderLoginPanel()
  }
})

const originalPushState = history.pushState
history.pushState = (...args: Parameters<History['pushState']>) => {
  const result = originalPushState.apply(history, args)
  queueMicrotask(updateLoginPanelForCurrentUrl)
  return result
}

const originalReplaceState = history.replaceState
history.replaceState = (...args: Parameters<History['replaceState']>) => {
  const result = originalReplaceState.apply(history, args)
  queueMicrotask(updateLoginPanelForCurrentUrl)
  return result
}

window.addEventListener('popstate', updateLoginPanelForCurrentUrl)
window.addEventListener('hashchange', updateLoginPanelForCurrentUrl)
updateLoginPanelForCurrentUrl()
