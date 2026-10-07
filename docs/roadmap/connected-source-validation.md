# Connected GRC source validation

Graph readiness now validates every consumed enterprise collection, not only AI sources. Missing arrays, malformed records, missing canonical IDs and duplicate normalized IDs invalidate the entire source. Invalid payloads are excluded from the graph; successful independent sources remain available. Empty, valid collections are ready.

Valid collections reaching their authoritative list API cap remain visible but are marked incomplete. This includes CAPA (3,000), automation findings and recent runs (100), and the bounded incident, continuity, policy, KRI, regulatory and vendor lists. At an exact cap, the graph deliberately cannot distinguish an exact fit from truncation. The vendor union uses a conservative 1,000-row boundary. Automation source and rule lists currently have no SQL limit.

Existing UI then suppresses overall completeness and assurance conclusions and labels CSV exports partial. Retry can restore complete coverage. This does not add pagination, guarantee an atomic cross-module snapshot, or change permissions. Larger datasets still require paginated source contracts; history caps are explicitly treated as partial graph scope.

Tests cover all enterprise collection shapes, normalized duplicate IDs, child-list caps, retained capped data, source isolation and recovery. The browser QA adds malformed CAPA response scenarios and checks partial export labeling and suppressed completeness before recovery.
