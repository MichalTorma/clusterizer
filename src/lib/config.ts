const PROJECT_STORAGE_KEY = 'clusterizer.eeProjectId'

export const earthEngineConfig = {
  clientId: import.meta.env.VITE_EE_OAUTH_CLIENT_ID as string | undefined,
  /** Optional default only — each user should connect with their own EE Cloud project. */
  defaultProjectId: import.meta.env.VITE_EE_PROJECT_ID as string | undefined,
}

export function getEarthEngineConfigurationError() {
  if (!earthEngineConfig.clientId) {
    return 'Set VITE_EE_OAUTH_CLIENT_ID before signing in. Each user then supplies their own Earth Engine Cloud project.'
  }

  return undefined
}

export function readStoredProjectId() {
  try {
    const stored = window.localStorage.getItem(PROJECT_STORAGE_KEY)?.trim()
    if (stored) return stored
  } catch {
    // Ignore storage failures (private mode, etc.).
  }
  return earthEngineConfig.defaultProjectId?.trim() ?? ''
}

export function writeStoredProjectId(projectId: string) {
  try {
    const trimmed = projectId.trim()
    if (trimmed) window.localStorage.setItem(PROJECT_STORAGE_KEY, trimmed)
    else window.localStorage.removeItem(PROJECT_STORAGE_KEY)
  } catch {
    // Ignore storage failures.
  }
}
