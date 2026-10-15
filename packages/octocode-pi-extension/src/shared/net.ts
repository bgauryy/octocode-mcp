/** `URL.hostname` spellings of this machine (IPv6 keeps its brackets there). */
const LOOPBACK_HOSTNAMES: ReadonlySet<string> = new Set(['127.0.0.1', 'localhost', '[::1]']);

/** Whether a `URL.hostname` names this machine. */
export const isLoopbackHostname = (hostname: string): boolean => LOOPBACK_HOSTNAMES.has(hostname);
