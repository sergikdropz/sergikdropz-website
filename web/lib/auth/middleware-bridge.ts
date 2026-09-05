/**
 * Internal header: set only by middleware after a successful refresh.
 * Stripped from incoming requests so clients cannot spoof a session.
 */
export const MW_SB_ACCESS_HEADER = 'x-middleware-sb-access-token'
