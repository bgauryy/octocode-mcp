import { forgetFileReadState, recordFileReadStateFromContent } from './file-state.js';
import { markOwnWrite } from './peer-wip.js';

/** Bookkeeping cannot turn a committed filesystem mutation into an uncommitted failure. */
export async function finishFileMutation(absolutePath: string, content?: string): Promise<string[]> {
  const warnings: string[] = [];
  try {
    forgetFileReadState(absolutePath);
    if (content !== undefined) await recordFileReadStateFromContent(absolutePath, content);
  } catch (error) { warnings.push(`File committed; read state refresh failed: ${error instanceof Error ? error.message : String(error)}`); }
  try { markOwnWrite(absolutePath); }
  catch (error) { warnings.push(`File committed; status update failed: ${error instanceof Error ? error.message : String(error)}`); }
  return warnings;
}
