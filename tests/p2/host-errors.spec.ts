import { describe, expect, it } from 'vitest'
import { localizeHostError } from '../../apps/web/src/model/host-errors'

describe('Host error presentation', () => {
  it('translates known errors while keeping codes and the accepted language', () => {
    expect(localizeHostError('gateway/internal：文件已变化，请刷新后重试', 'it')).toBe(
      'gateway/internal: Il file è cambiato. Aggiorna e riprova.',
    )
    expect(localizeHostError('gateway/internal: 文件已变化，请刷新后重试', 'it')).toBe(
      'gateway/internal: Il file è cambiato. Aggiorna e riprova.',
    )
    expect(localizeHostError('文件已变化，请刷新后重试', 'zh')).toBe('文件已变化，请刷新后重试')
    expect(localizeHostError('请填写 API Key', 'en')).toBe('Enter an API key')
    expect(
      localizeHostError(
        'session create failed: gateway/internal: Host 会话服务尚未就绪，请检查认证与连接',
        'it',
      ),
    ).toBe(
      'Creazione della chat non riuscita: gateway/internal: Il servizio chat dell’Host non è pronto. Controlla autenticazione e connessione.',
    )
  })
  it('preserves recovery paths and never changes unknown details', () => {
    expect(localizeHostError('TIANZHIAI_HOME 必须是 Host 的绝对路径', 'it')).toBe(
      'TIANZHIAI_HOME deve essere un percorso assoluto sull’Host',
    )
    expect(localizeHostError('TUAI_HOME 必须是 Host 的绝对路径', 'en')).toBe(
      'TUAI_HOME must be an absolute path on the Host',
    )
    expect(
      localizeHostError('tuai.manifest.json 的 requiredTools 必须为工具名数组', 'it'),
    ).toContain('tuai.manifest.json')
    expect(localizeHostError('技能包不能同时包含新旧清单', 'en')).toContain(
      'cannot contain both old and new manifests',
    )
    expect(localizeHostError('晨曦主题目前仅支持浅色', 'it')).toBe(
      'Il tema Alba supporta attualmente solo la modalità chiara',
    )
    expect(localizeHostError('gateway/internal: 纯白主题目前仅支持浅色', 'en')).toBe(
      'gateway/internal: The Pure White theme currently supports light mode only',
    )
    expect(localizeHostError('文件删除未完成；文件保留在 /tmp/a，b，请手动恢复', 'it')).toContain(
      '/tmp/a，b',
    )
    expect(localizeHostError('unrecognized detail', 'it')).toBe('unrecognized detail')
    expect(
      localizeHostError('原文件已删除，但删除记录保存失败；请刷新核对，不要重复删除', 'en'),
    ).toContain('do not delete again')
  })
})
