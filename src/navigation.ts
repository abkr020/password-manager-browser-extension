const historyChangeEvent = 'password-manager-history-change'
const observerWindow = window as Window & {
  __passwordManagerHistoryObserverInstalled__?: boolean
}

if (!observerWindow.__passwordManagerHistoryObserverInstalled__) {
  observerWindow.__passwordManagerHistoryObserverInstalled__ = true

  const originalPushState = history.pushState
  history.pushState = function (...args: Parameters<History['pushState']>) {
    const result = originalPushState.apply(this, args)
    window.dispatchEvent(new Event(historyChangeEvent))
    return result
  }

  const originalReplaceState = history.replaceState
  history.replaceState = function (...args: Parameters<History['replaceState']>) {
    const result = originalReplaceState.apply(this, args)
    window.dispatchEvent(new Event(historyChangeEvent))
    return result
  }
}
