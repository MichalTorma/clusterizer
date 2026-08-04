import { useMemo, useState } from 'react'
import {
  signInWithGoogle,
  verifyEarthEngineReady,
  verifyProjectListAccess,
  type CloudProjectOption,
} from '../lib/earthEngine'
import {
  applyEarthEngineReadyResult,
  applyProjectListResult,
  applyProjectSelected,
  applySignedIn,
  EARTH_ENGINE_CODE_EDITOR_URL,
  hardChecksPassed,
  initialSetupChecks,
  markCheck,
  type SetupCheckItem,
} from '../lib/setupChecks'
import './SetupGate.css'

type SetupStep = 'welcome' | 'project' | 'checks'

export interface SetupGateProps {
  configurationError?: string
  initialProjectId: string
  onComplete: (projectId: string) => void
}

function statusGlyph(status: SetupCheckItem['status']) {
  switch (status) {
    case 'pass':
      return '✓'
    case 'fail':
      return '✕'
    case 'soft_fail':
      return '!'
    case 'running':
      return '…'
    default:
      return '·'
  }
}

export function SetupGate({ configurationError, initialProjectId, onComplete }: SetupGateProps) {
  const hasStoredProject = Boolean(initialProjectId.trim())
  const [step, setStep] = useState<SetupStep>('welcome')
  const [returning, setReturning] = useState(hasStoredProject)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [projectId, setProjectId] = useState(initialProjectId)
  const [projects, setProjects] = useState<CloudProjectOption[]>([])
  const [manualEntry, setManualEntry] = useState(!hasStoredProject)
  const [checks, setChecks] = useState<SetupCheckItem[]>(() => initialSetupChecks())

  const stepIndex = step === 'welcome' ? 1 : step === 'project' ? 2 : 3
  const preferredProject = useMemo(() => {
    const trimmed = projectId.trim()
    if (trimmed && projects.some((project) => project.projectId === trimmed)) return trimmed
    return (
      projects.find((project) => project.earthEngineLabeled)?.projectId
      ?? projects[0]?.projectId
      ?? trimmed
    )
  }, [projectId, projects])

  const applyProjectListToState = async (baseChecks: SetupCheckItem[]) => {
    const listResult = await verifyProjectListAccess()
    const nextChecks = applyProjectListResult(applySignedIn(baseChecks), listResult)
    setChecks(nextChecks)
    setProjects(listResult.projects)
    if (!listResult.ok || listResult.projects.length === 0) {
      setManualEntry(true)
    } else {
      const next =
        listResult.projects.find((project) => project.projectId === projectId.trim())?.projectId
        ?? listResult.projects.find((project) => project.earthEngineLabeled)?.projectId
        ?? listResult.projects[0]?.projectId
        ?? projectId
      if (next) setProjectId(next)
      setManualEntry(false)
    }
    return { listResult, nextChecks }
  }

  const runVerification = async (nextProjectId: string, baseChecks: SetupCheckItem[]) => {
    const trimmed = nextProjectId.trim()
    setStep('checks')
    setError(undefined)
    setBusy(true)

    let nextChecks = applyProjectSelected(applySignedIn(baseChecks), trimmed)
    nextChecks = markCheck(nextChecks, 'ee_api', { status: 'running', detail: 'Checking…' })
    nextChecks = markCheck(nextChecks, 'ee_compute', { status: 'pending' })
    setChecks(nextChecks)

    try {
      const eeResult = await verifyEarthEngineReady(trimmed)
      nextChecks = applyEarthEngineReadyResult(nextChecks, eeResult)
      setChecks(nextChecks)
      if (!eeResult.ok) {
        setError(eeResult.message ?? 'Earth Engine is not ready for this project.')
        return
      }
      if (hardChecksPassed(nextChecks)) {
        onComplete(trimmed)
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Verification failed.'
      setError(message)
      setChecks((current) =>
        markCheck(current, 'ee_compute', {
          status: 'fail',
          detail: message,
        }),
      )
    } finally {
      setBusy(false)
    }
  }

  const handleSignIn = async () => {
    if (configurationError) {
      setError(configurationError)
      return
    }
    setError(undefined)
    setBusy(true)
    setReturning(false)
    try {
      await signInWithGoogle()
      await applyProjectListToState(initialSetupChecks())
      setStep('project')
    } catch (cause) {
      console.error('Sign-in failed:', cause)
      setError(cause instanceof Error ? cause.message : 'Unable to sign in with Google.')
      setChecks((current) =>
        markCheck(current, 'signed_in', {
          status: 'fail',
          detail: cause instanceof Error ? cause.message : 'Sign-in failed.',
        }),
      )
    } finally {
      setBusy(false)
    }
  }

  const handleContinueReturning = async () => {
    if (configurationError) {
      setError(configurationError)
      return
    }
    const trimmed = projectId.trim()
    if (!trimmed) {
      setReturning(false)
      setStep('welcome')
      return
    }
    setError(undefined)
    setBusy(true)
    try {
      await signInWithGoogle()
      const { nextChecks } = await applyProjectListToState(initialSetupChecks())
      setBusy(false)
      await runVerification(trimmed, nextChecks)
    } catch (cause) {
      console.error('Reconnect failed:', cause)
      setError(cause instanceof Error ? cause.message : 'Unable to reconnect.')
      setReturning(false)
      setStep('welcome')
      setBusy(false)
    }
  }

  const handleConfirmProject = async () => {
    const trimmed = (manualEntry ? projectId : preferredProject).trim()
    if (!trimmed) {
      setError('Choose or enter an Earth Engine–enabled Google Cloud project.')
      setChecks((current) => applyProjectSelected(current, ''))
      return
    }
    setProjectId(trimmed)
    await runVerification(trimmed, checks)
  }

  const handleRefreshProjects = async () => {
    setBusy(true)
    setError(undefined)
    try {
      await applyProjectListToState(checks)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not refresh projects.')
    } finally {
      setBusy(false)
    }
  }

  const showList = projects.length > 0 && !manualEntry

  return (
    <div className="setup-gate">
      <div className="setup-gate-inner">
        <p className="setup-eyebrow">AlphaEarth · 10 m embeddings</p>
        <h1>Clusterizer</h1>
        <p className="setup-lede">
          Map recurring nature types from Satellite Embedding — using your Google Earth Engine project.
        </p>

        <ol className="setup-steps" aria-label="Setup progress">
          <li className={stepIndex >= 1 ? 'active' : undefined} aria-current={stepIndex === 1 ? 'step' : undefined}>
            Sign in
          </li>
          <li className={stepIndex >= 2 ? 'active' : undefined} aria-current={stepIndex === 2 ? 'step' : undefined}>
            Project
          </li>
          <li className={stepIndex >= 3 ? 'active' : undefined} aria-current={stepIndex === 3 ? 'step' : undefined}>
            Verify
          </li>
        </ol>

        {(configurationError || error) && (
          <p className="setup-notice error">
            {configurationError ?? error}
          </p>
        )}

        {step === 'welcome' && returning && (
          <div className="setup-panel">
            <h2>Welcome back</h2>
            <p className="setup-hint">
              Continue with project <code>{projectId.trim()}</code>. We will sign you in and verify
              Earth Engine before opening the map.
            </p>
            <button
              type="button"
              className="setup-primary"
              disabled={Boolean(configurationError) || busy}
              onClick={() => void handleContinueReturning()}
            >
              {busy ? 'Connecting…' : 'Continue'}
            </button>
            <button
              type="button"
              className="setup-secondary"
              disabled={busy}
              onClick={() => {
                setReturning(false)
                setError(undefined)
              }}
            >
              Use a different project
            </button>
          </div>
        )}

        {step === 'welcome' && !returning && (
          <div className="setup-panel">
            <h2>Connect Earth Engine</h2>
            <p className="setup-hint">
              Sign in with the Google account you use in the Earth Engine Code Editor. Analysis runs
              as you, on your Cloud project — not on the app host.
            </p>
            <ul className="setup-need">
              <li>Earth Engine access on your Google account</li>
              <li>A Cloud project with the Earth Engine API enabled</li>
            </ul>
            <button
              type="button"
              className="setup-primary"
              disabled={Boolean(configurationError) || busy}
              onClick={() => void handleSignIn()}
            >
              {busy ? 'Signing in…' : 'Sign in with Google'}
            </button>
            <p className="setup-hint">
              New to Earth Engine?{' '}
              <a href={EARTH_ENGINE_CODE_EDITOR_URL} target="_blank" rel="noreferrer">
                Open the Code Editor
              </a>{' '}
              to register, then return here.
            </p>
          </div>
        )}

        {step === 'project' && (
          <div className="setup-panel">
            <h2>Choose your Cloud project</h2>
            <p className="setup-hint">
              Pick the project you already use for Earth Engine. Quota and permissions follow that
              project.
            </p>

            {showList ? (
              <label className="setup-field">
                Cloud project
                <select
                  value={preferredProject}
                  onChange={(event) => setProjectId(event.target.value)}
                  disabled={busy}
                >
                  {projects.map((project) => (
                    <option key={project.projectId} value={project.projectId}>
                      {project.displayName}
                      {project.displayName !== project.projectId ? ` (${project.projectId})` : ''}
                      {project.earthEngineLabeled ? ' · EE' : ''}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="setup-field">
                Cloud project ID
                <input
                  type="text"
                  value={projectId}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="my-ee-cloud-project"
                  disabled={busy}
                  onChange={(event) => setProjectId(event.target.value)}
                />
              </label>
            )}

            <div className="setup-actions">
              {projects.length > 0 && (
                <button
                  type="button"
                  className="setup-secondary"
                  disabled={busy}
                  onClick={() => setManualEntry((value) => !value)}
                >
                  {manualEntry ? 'Use project list' : 'Enter ID manually'}
                </button>
              )}
              <button
                type="button"
                className="setup-secondary"
                disabled={busy}
                onClick={() => void handleRefreshProjects()}
              >
                Refresh projects
              </button>
            </div>

            <p className="setup-hint">
              No project yet? Create one during{' '}
              <a href={EARTH_ENGINE_CODE_EDITOR_URL} target="_blank" rel="noreferrer">
                Earth Engine registration
              </a>
              , enable the Earth Engine API, then refresh the list.
            </p>

            <button
              type="button"
              className="setup-primary"
              disabled={busy || !(manualEntry ? projectId : preferredProject).trim()}
              onClick={() => void handleConfirmProject()}
            >
              {busy ? 'Checking…' : 'Verify and continue'}
            </button>
          </div>
        )}

        {step === 'checks' && (
          <div className="setup-panel">
            <h2>Readiness checks</h2>
            <p className="setup-hint">
              We confirm the APIs and permissions this app needs before showing the map.
            </p>
            <ul className="setup-checklist">
              {checks.map((check) => (
                <li key={check.id} className={`check-${check.status}`}>
                  <span className="check-glyph" aria-hidden>
                    {statusGlyph(check.status)}
                  </span>
                  <div>
                    <strong>{check.label}</strong>
                    <p>{check.why}</p>
                    {check.detail && <p className="check-detail">{check.detail}</p>}
                    {check.fixHref && check.fixLabel && (
                      <a href={check.fixHref} target="_blank" rel="noreferrer">
                        {check.fixLabel}
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <div className="setup-actions">
              <button
                type="button"
                className="setup-secondary"
                disabled={busy}
                onClick={() => {
                  setStep('project')
                  setError(undefined)
                }}
              >
                Change project
              </button>
              <button
                type="button"
                className="setup-primary"
                disabled={busy || !projectId.trim()}
                onClick={() => void runVerification(projectId, checks)}
              >
                {busy ? 'Checking…' : 'Retry checks'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
