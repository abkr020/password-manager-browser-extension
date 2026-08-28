export interface SavedCredential {
  username: string
  password: string
  domains: string[]
  timestamp: number
}

export interface CredentialDraft {
  username: string
  password: string
  domains: string[]
}
