# Connected GRC production acceptance gate

A production Connected GRC validation is accepted only when all conditions below are true:

1. Every configured live source endpoint returns HTTP 2xx under the authenticated production session.
2. The Connected GRC header reaches the expected live-source count and leaves loading state.
3. At least one relationship is rendered when the production graph has connected records.
4. Any endpoint with adapter-projectable rows appears in domain density.
5. First-party console errors, page errors and failed requests are zero.
6. The actual EN switch changes `document.documentElement.lang` to `en` and exposes the English `Dashboard` navigation label.

Auxiliary API arrays that are not converted by `buildConnectedGrcEnterpriseRows` are deliberately excluded from graph-projection expectations.
