export const earthEngineConfig = {
  clientId: import.meta.env.VITE_EE_OAUTH_CLIENT_ID as string | undefined,
  projectId: import.meta.env.VITE_EE_PROJECT_ID as string | undefined,
}

export function getEarthEngineConfigurationError() {
  if (!earthEngineConfig.clientId || !earthEngineConfig.projectId) {
    return 'Set VITE_EE_OAUTH_CLIENT_ID and VITE_EE_PROJECT_ID before signing in.'
  }

  return undefined
}
