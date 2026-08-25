import { describe, expect, it } from 'vitest'
import { hostChildProcessEnvironment } from './child-process-environment'

describe('hostChildProcessEnvironment', () => {
  it('selects only validated, non-authorizing runtime values', () => {
    expect(hostChildProcessEnvironment({
      HOME: '/safe/home',
      PATH: '/safe/bin',
      SHELL: '/bin/zsh',
      TMPDIR: '/safe/tmp',
      XDG_CONFIG_HOME: '/safe/config',
      APPDATA: 'C:\\safe\\appdata',
      NODE_OPTIONS: '--require /tmp/inject.cjs',
      DYLD_INSERT_LIBRARIES: '/tmp/inject.dylib',
      AWS_SECRET_ACCESS_KEY: 'secret',
      OIDC_ACCESS_TOKEN: 'secret',
      LOCALAPPDATA: 'bad\0value',
      TEMP: 'x'.repeat(16_385),
      USER: ''
    })).toEqual({
      HOME: '/safe/home',
      PATH: '/safe/bin',
      SHELL: '/bin/zsh',
      TMPDIR: '/safe/tmp',
      APPDATA: 'C:\\safe\\appdata',
      XDG_CONFIG_HOME: '/safe/config'
    })
  })
})
