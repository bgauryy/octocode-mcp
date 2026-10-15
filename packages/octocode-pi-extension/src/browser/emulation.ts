/** Per-page setup the session applies to every page it drives (the first and each tab it switches to). */

/** The one CDP call page setup needs, so this module does not depend on the connection code. */
interface CdpSender {
  send<T = Record<string, unknown>>(method: string, params?: Record<string, unknown>, signal?: AbortSignal): Promise<T>;
}

/** Saves the page's downloads to `dir` and reports their progress as events. */
export async function applyDownloads(page: CdpSender, dir: string, signal?: AbortSignal): Promise<void> {
  await page.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dir, eventsEnabled: true }, signal);
}
