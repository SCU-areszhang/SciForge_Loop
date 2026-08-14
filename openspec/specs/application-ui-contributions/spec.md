# application-ui-contributions Specification

## Purpose
Lets trusted domain packages contribute session-independent application overlays and renderable Workbench toolbar controls without hard-coding domain UI into the host shell.
## Requirements
### Requirement: Application overlays are generic and session-independent
The renderer Host SHALL provide one generic application-overlay contribution kind whose views can be opened and closed without a Thread, Workspace, runtime session, right-panel owner, or domain-specific Host API. The application shell SHALL render registered overlays by contribution identity and SHALL NOT branch on domain or provider IDs.

#### Scenario: Open an account overlay without a session
- **WHEN** a trusted package requests its registered application overlay while no Thread or Workspace session exists
- **THEN** the application shell renders that overlay and supplies a generic close action

#### Scenario: Request an unknown application overlay
- **WHEN** a caller requests an overlay contribution that is not registered
- **THEN** the Host ignores or rejects the request without mounting arbitrary renderer content

### Requirement: Application overlay ownership is enforced
An application overlay SHALL be registered, rendered, opened, closed, and disposed through one canonical registry and Host contract. A package SHALL control only its own declared overlay contribution and SHALL NOT open another package's overlay through a forged identity.

#### Scenario: Package opens its declared overlay
- **WHEN** a package uses its Host-bound application surface to open its own declared overlay
- **THEN** the canonical registry activates that overlay

#### Scenario: Package attempts cross-owner overlay control
- **WHEN** one package tries to control an overlay owned by another package
- **THEN** the Host rejects the request

#### Scenario: Dispose an overlay contribution
- **WHEN** renderer domain composition is disposed
- **THEN** the overlay registration and active view are removed without leaving event listeners or mounted roots

### Requirement: Workbench toolbar widgets support package-owned rendering
The renderer Host SHALL provide a generic Workbench toolbar-widget contribution kind for compact, package-owned controls whose presentation can react to domain state. The Workbench top bar SHALL order and render registered widgets without importing domain components or reading domain state.

#### Scenario: Render a dynamic account widget
- **WHEN** the Identity package contributes a toolbar widget and its current username changes
- **THEN** the widget updates its own icon and text while the Workbench remains unaware of Identity contracts

#### Scenario: Workbench has no active Thread
- **WHEN** the Workbench is visible with no active Thread or Workspace
- **THEN** registered toolbar widgets remain available unless their package-owned availability rule hides them

### Requirement: Application UI contributions are manifest-driven
Application overlays and toolbar widgets SHALL be declared by each domain package manifest and included through generated renderer composition. Adding or removing such a package SHALL NOT require editing a central domain-ID map, provider switch, or package-specific host configuration.

#### Scenario: Generate renderer composition
- **WHEN** a trusted domain package declares valid application-overlay and toolbar-widget contributions
- **THEN** the generated renderer entry set includes and validates them through their generic contracts

#### Scenario: Invalid contribution value
- **WHEN** a package's runtime value does not match the declared generic UI contract
- **THEN** renderer composition fails validation and rolls back registrations atomically
