console.log('Password Manager content script loaded')
console.log(window.location.href)

const detectedPasswordFields = new WeakSet<HTMLInputElement>()

function logPasswordField(passwordField: HTMLInputElement) {
  if (detectedPasswordFields.has(passwordField)) {
    return
  }

  detectedPasswordFields.add(passwordField)
  console.log('Password field detected')
  console.log(passwordField)
}

function detectPasswordFields(root: ParentNode) {
  if (root instanceof HTMLInputElement && root.type === 'password') {
    logPasswordField(root)
  }

  root
    .querySelectorAll<HTMLInputElement>('input[type="password"]')
    .forEach(logPasswordField)
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
