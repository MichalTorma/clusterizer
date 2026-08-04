import type {
  EarthEngineReadyErrorKind,
  EarthEngineReadyVerification,
  ProjectListVerification,
} from './earthEngine'

export type SetupCheckId =
  | 'signed_in'
  | 'project_list'
  | 'project_selected'
  | 'ee_api'
  | 'ee_compute'

export type SetupCheckStatus = 'pending' | 'running' | 'pass' | 'fail' | 'soft_fail'

export interface SetupCheckItem {
  id: SetupCheckId
  label: string
  why: string
  /** Soft checks never block entering the app. */
  hard: boolean
  status: SetupCheckStatus
  detail?: string
  fixHref?: string
  fixLabel?: string
}

export const EARTH_ENGINE_ACCESS_URL =
  'https://developers.google.com/earth-engine/guides/access'
export const EARTH_ENGINE_CODE_EDITOR_URL = 'https://code.earthengine.google.com/'
export const CLOUD_RESOURCE_MANAGER_API_URL =
  'https://console.cloud.google.com/apis/library/cloudresourcemanager.googleapis.com'

export function earthEngineApiEnableUrl(projectId: string) {
  const url = new URL('https://console.cloud.google.com/apis/library/earthengine.googleapis.com')
  if (projectId.trim()) url.searchParams.set('project', projectId.trim())
  return url.toString()
}

export function earthEngineIamUrl(projectId: string) {
  const url = new URL('https://console.cloud.google.com/iam-admin/iam')
  if (projectId.trim()) url.searchParams.set('project', projectId.trim())
  return url.toString()
}

const CHECK_COPY: Record<
  SetupCheckId,
  Pick<SetupCheckItem, 'label' | 'why' | 'hard'>
> = {
  signed_in: {
    label: 'Signed in with Google',
    why: 'Authenticate as you; analyses never use the host’s quota.',
    hard: true,
  },
  project_list: {
    label: 'Cloud project list',
    why: 'Lets us show your projects so you do not have to type an ID. Optional if you paste one.',
    hard: false,
  },
  project_selected: {
    label: 'Cloud project selected',
    why: 'Earth Engine bills compute and permissions to your Cloud project.',
    hard: true,
  },
  ee_api: {
    label: 'Earth Engine API',
    why: 'The Earth Engine API must be enabled on that project before any analysis can run.',
    hard: true,
  },
  ee_compute: {
    label: 'Earth Engine compute',
    why: 'Confirms your account can run read-only Earth Engine calls on the selected project.',
    hard: true,
  },
}

function baseItem(id: SetupCheckId, status: SetupCheckStatus = 'pending'): SetupCheckItem {
  return { id, status, ...CHECK_COPY[id] }
}

export function initialSetupChecks(): SetupCheckItem[] {
  return (
    ['signed_in', 'project_list', 'project_selected', 'ee_api', 'ee_compute'] as SetupCheckId[]
  ).map((id) => baseItem(id))
}

export function markCheck(
  checks: SetupCheckItem[],
  id: SetupCheckId,
  patch: Partial<SetupCheckItem>,
): SetupCheckItem[] {
  return checks.map((check) => (check.id === id ? { ...check, ...patch } : check))
}

export function applySignedIn(checks: SetupCheckItem[]): SetupCheckItem[] {
  return markCheck(checks, 'signed_in', { status: 'pass', detail: undefined, fixHref: undefined })
}

export function applyProjectListResult(
  checks: SetupCheckItem[],
  result: ProjectListVerification,
): SetupCheckItem[] {
  if (result.ok) {
    return markCheck(checks, 'project_list', {
      status: 'pass',
      detail: result.projects.length
        ? `${result.projects.length} project${result.projects.length === 1 ? '' : 's'} found.`
        : 'No projects returned — enter a project ID manually.',
      fixHref: undefined,
      fixLabel: undefined,
    })
  }

  const crmHint = result.errorKind === 'crm_disabled'
  return markCheck(checks, 'project_list', {
    status: 'soft_fail',
    detail: crmHint
      ? 'Project listing needs the Cloud Resource Manager API on the app host’s OAuth Cloud project. You can still enter a project ID.'
      : (result.message ?? 'Could not list projects. Enter a project ID manually.'),
    fixHref: crmHint ? CLOUD_RESOURCE_MANAGER_API_URL : undefined,
    fixLabel: crmHint ? 'Enable Cloud Resource Manager API' : undefined,
  })
}

export function applyProjectSelected(
  checks: SetupCheckItem[],
  projectId: string,
): SetupCheckItem[] {
  const trimmed = projectId.trim()
  if (!trimmed) {
    return markCheck(checks, 'project_selected', {
      status: 'fail',
      detail: 'Choose a project from the list or enter a Cloud project ID.',
    })
  }
  return markCheck(checks, 'project_selected', {
    status: 'pass',
    detail: trimmed,
    fixHref: undefined,
    fixLabel: undefined,
  })
}

function fixForEarthEngineError(
  projectId: string,
  errorKind: EarthEngineReadyErrorKind | undefined,
): Pick<SetupCheckItem, 'fixHref' | 'fixLabel' | 'detail'> {
  switch (errorKind) {
    case 'ee_api_disabled':
      return {
        detail: 'Enable the Earth Engine API on this Cloud project, then retry.',
        fixHref: earthEngineApiEnableUrl(projectId),
        fixLabel: 'Enable Earth Engine API',
      }
    case 'ee_access':
      return {
        detail: 'Register for Earth Engine access (or open the Code Editor once), then retry.',
        fixHref: EARTH_ENGINE_ACCESS_URL,
        fixLabel: 'Earth Engine access guide',
      }
    case 'permission':
      return {
        detail:
          'You need permission to use Earth Engine on this project (e.g. Earth Engine Viewer + Service Usage Consumer).',
        fixHref: earthEngineIamUrl(projectId),
        fixLabel: 'Open IAM for this project',
      }
    default:
      return {
        detail: 'Earth Engine could not run a test call on this project.',
        fixHref: earthEngineApiEnableUrl(projectId),
        fixLabel: 'Check Earth Engine API',
      }
  }
}

/**
 * Maps EE init + smoke-test result onto ee_api and ee_compute checks.
 * A single failure usually means API off, missing access, or IAM — we mark both accordingly.
 */
export function applyEarthEngineReadyResult(
  checks: SetupCheckItem[],
  result: EarthEngineReadyVerification,
): SetupCheckItem[] {
  if (result.ok) {
    return markCheck(
      markCheck(checks, 'ee_api', {
        status: 'pass',
        detail: 'Earth Engine API responded.',
        fixHref: undefined,
        fixLabel: undefined,
      }),
      'ee_compute',
      {
        status: 'pass',
        detail: 'Read-only compute succeeded.',
        fixHref: undefined,
        fixLabel: undefined,
      },
    )
  }

  const fix = fixForEarthEngineError(result.projectId, result.errorKind)
  const message = result.message ? `${fix.detail} (${result.message})` : fix.detail

  if (result.errorKind === 'ee_api_disabled') {
    return markCheck(
      markCheck(checks, 'ee_api', {
        status: 'fail',
        detail: message,
        fixHref: fix.fixHref,
        fixLabel: fix.fixLabel,
      }),
      'ee_compute',
      { status: 'pending', detail: undefined, fixHref: undefined, fixLabel: undefined },
    )
  }

  return markCheck(
    markCheck(checks, 'ee_api', {
      status: 'pass',
      detail: 'Could not confirm API disablement; compute check failed instead.',
      fixHref: undefined,
      fixLabel: undefined,
    }),
    'ee_compute',
    {
      status: 'fail',
      detail: message,
      fixHref: fix.fixHref,
      fixLabel: fix.fixLabel,
    },
  )
}

export function hardChecksPassed(checks: SetupCheckItem[]) {
  return checks.filter((check) => check.hard).every((check) => check.status === 'pass')
}
