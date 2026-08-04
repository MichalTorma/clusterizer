import { describe, expect, it } from 'vitest'
import {
  applyEarthEngineReadyResult,
  applyProjectListResult,
  earthEngineApiEnableUrl,
  hardChecksPassed,
  initialSetupChecks,
} from './setupChecks'

describe('setupChecks', () => {
  it('builds Console deep-links with project query', () => {
    expect(earthEngineApiEnableUrl('my-ee')).toContain('project=my-ee')
    expect(earthEngineApiEnableUrl('my-ee')).toContain('earthengine.googleapis.com')
  })

  it('treats CRM list failure as soft', () => {
    const checks = applyProjectListResult(initialSetupChecks(), {
      ok: false,
      projects: [],
      errorKind: 'crm_disabled',
      message: 'CRM off',
    })
    const list = checks.find((check) => check.id === 'project_list')
    expect(list?.status).toBe('soft_fail')
    expect(list?.hard).toBe(false)
    expect(list?.fixHref).toContain('cloudresourcemanager')
  })

  it('requires hard EE checks to pass', () => {
    let checks = initialSetupChecks().map((check) =>
      check.id === 'project_list'
        ? check
        : { ...check, status: 'pass' as const },
    )
    expect(hardChecksPassed(checks)).toBe(true)

    checks = applyEarthEngineReadyResult(checks, {
      ok: false,
      projectId: 'p',
      errorKind: 'ee_api_disabled',
      message: 'API disabled',
    })
    expect(hardChecksPassed(checks)).toBe(false)
    expect(checks.find((check) => check.id === 'ee_api')?.fixHref).toContain('earthengine')
  })
})
