import { describe, expect, it } from 'vitest'
import { displayPermissionPreset } from '../../packages/client/ui-permission-presets/src/client/presentation'
import { permissionSettingsIt } from '../../apps/web/src/model/italian-permissions'

describe('product permission labels', () => {
  const translate = (key: keyof typeof permissionSettingsIt) => permissionSettingsIt[key]
  it('localizes the known Host defaults without changing their identities', () => {
    expect(displayPermissionPreset('readonly', '仅可查看', translate)).toBe('Sola lettura')
    expect(displayPermissionPreset('full-access', '完全权限', translate)).toBe('Accesso completo')
  })
  it('retains custom names even for a built-in preset', () => {
    expect(displayPermissionPreset('readonly', 'Custom permission', translate)).toBe(
      'Custom permission',
    )
    expect(displayPermissionPreset('readonly', '仅可查看')).toBe('仅可查看')
  })
})
