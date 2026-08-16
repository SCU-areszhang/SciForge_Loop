---
status: accepted
---

# Stage OpenContent Content Space before Shared Documents

SciForge will deliver the provider-neutral Content Space domain and its OpenContent integration milestone before implementing Shared Documents. The first OpenContent Connector milestone exposes only the composition-bound Content Space adapter port; it does not define a Document port, optional Document methods, or a stub Document integration. A later, separately reviewed change may add an independently declared and authorized Document adapter port to the same main-only Connector, after `add-shared-documents-v1` is implemented. `add-opencontent-document-provider-v1` and Portable Resource Open Routing remain deferred. This sequencing removes the Document dependency from the Content Space delivery path without weakening the one-Connector rule, merging the two Provider contracts, or introducing a compatibility path.
