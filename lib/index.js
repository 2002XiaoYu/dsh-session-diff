/**
 * Host half of dsh-session-diff.
 *
 * This package contributes browser presentation only. The export exists so the
 * cordis Loader has a host-side row to resolve: the client module registry
 * discovers client bundles by walking live Loader entries, so without this row
 * the package's `./client` bundle would never be served.
 */
export function apply() {}
