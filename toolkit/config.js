/** Supported version conflict resolution policies. */
export const SUPPORTED_POLICIES = new Set(['fail', 'major', 'minor', 'patch']);

/** Default version conflict resolution policy. */
export const DEFAULT_POLICY = 'patch';
