# Project Coordinator and Worker Runner

Backend-only B package. It owns Coordinator planning/validation, Worker execution,
and durable journal/outbox behavior. It consumes ports owned by A (Cloud), C
(current Principal), and E (portable Content Space materialization and transfer).

The Worker journal and lock identity is `(taskId, executionId)`. Agent start and
upload-start markers are persisted before side effects, so recovery cannot rerun
an Agent or duplicate an upload whose outcome is unknown. Every A progress,
ResourceRef, and terminal write checks the current execution fence before send.

Task proposal confirmation is intentionally blocked until A publishes its public
proposal digest helper. This package does not copy A Server hashing logic.
