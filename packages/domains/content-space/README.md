# Content Space

Trusted compile-time, provider-neutral Content Space domain package. It owns ordinary provider-hosted container, file-transfer, and immutable-artifact semantics while keeping Provider integrations behind the public `ContentSpaceProvider` contract.

The package has separate definition, main, and renderer entrypoints. It has no Workspace Server, sidecar, runtime plugin loader, or provider-specific UI entrypoint.
