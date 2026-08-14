import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { WorkbenchToolbarWidgetContributionRegistry } from './workbench-toolbar-widget-slot'

describe('Workbench toolbar widget slot', () => {
  it('orders package-owned renderable widgets and unregisters them canonically', () => {
    const registry = new WorkbenchToolbarWidgetContributionRegistry()
    const later = registry.register({
      id: 'fixture.later',
      ownerId: 'fixture.two',
      order: 10,
      contract: { location: 'workbench.topbar', label: 'Later' },
      value: { render: () => createElement('button') }
    })
    registry.register({
      id: 'fixture.first',
      ownerId: 'fixture.one',
      order: 20,
      contract: { location: 'workbench.topbar', label: 'First' },
      value: { render: () => createElement('button') }
    })
    expect(registry.list().map(({ id }) => id)).toEqual(['fixture.later', 'fixture.first'])
    later.dispose()
    expect(registry.list().map(({ id }) => id)).toEqual(['fixture.first'])
    registry.dispose()
  })
})
