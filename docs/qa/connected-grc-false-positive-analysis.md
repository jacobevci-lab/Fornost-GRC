# False-positive analysis

The previous dedicated production run reported domain-projection failures while all seven source endpoints were healthy and the browser graph had 49 relationships. The failures did not demonstrate missing product records: the validator summed every top-level API array, including auxiliary collections that the graph adapter intentionally ignores.

The corrected validator mirrors the adapter's input collections. This ensures a domain is required in the graph only when that domain has at least one row the adapter can actually create.
