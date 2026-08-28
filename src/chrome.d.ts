interface ChromeStorageChange {
  newValue?: unknown
  oldValue?: unknown
}

interface ChromeStorageArea {
  get(key: string): Promise<Record<string, unknown>>
  set(items: Record<string, unknown>): Promise<void>
}

declare const chrome: {
  storage: {
    local: ChromeStorageArea
    onChanged: {
      addListener(
        callback: (changes: Record<string, ChromeStorageChange>, areaName: string) => void,
      ): void
      removeListener(
        callback: (changes: Record<string, ChromeStorageChange>, areaName: string) => void,
      ): void
    }
  }
}
