## MODIFIED Requirements

### Requirement: Routing is pinned to trusted Provider Instance
A domain operation SHALL select a factory only after a trusted non-secret Provider Instance Directory resolves ProviderInstanceRef to its Provider Kind. Trusted compile-time packages SHALL contribute directory entries through the standard generated main composition, and Host SHALL expose only a generic read-only directory projection to domains. Caller input and portable identity SHALL NOT supply an endpoint, package ID, connection, credential, fallback order, or unregistered directory entry. Duplicate instance ownership and declaration/runtime mismatch SHALL fail before Provider factory invocation.

#### Scenario: Provider Instance is unknown
- **WHEN** a valid resource reference names an unregistered Provider Instance
- **THEN** routing SHALL fail before Provider factory invocation, endpoint resolution, credential use, or network access

#### Scenario: Integration package adds a selectable instance
- **WHEN** a trusted compile-time package declares a compatible Provider factory and Provider Instance Directory entry
- **THEN** generated source and packaged composition SHALL expose the instance through the generic directory without a Host feature map, Provider Kind switch, arbitrary default, or domain import of the integration package

#### Scenario: Duplicate Provider Instance is declared
- **WHEN** two contributions claim the same ProviderInstanceRef
- **THEN** directory composition SHALL fail closed before either Provider factory is invoked
