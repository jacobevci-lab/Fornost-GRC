import { AuditRequestError } from './audit-requests';
import type { AuditWorkpaper, WorkpaperFields } from './audit-workpapers';
import { selectRandomSamples, selectionMatches, type SavedRandomSelection } from './workpaper-random-sampling';
import { SampleImportError } from './workpaper-sample-import';

/** Client proofs are never trusted; only a server recomputation or an unchanged
 * selection from the revision-guarded stored record can be retained. */
export async function prepareRandomSelection(action: string, input: unknown, fields: WorkpaperFields, current: AuditWorkpaper | null, email: string, stamp: string): Promise<SavedRandomSelection | undefined> {
  if (input !== undefined && (action !== 'save' || fields.method !== 'random')) throw new AuditRequestError('sampling');
  if (fields.method !== 'random') return undefined;
  if (input !== undefined) {
    let selection;
    try { ({ selection } = await selectRandomSamples(input)); }
    catch (error) { if (error instanceof SampleImportError) throw new AuditRequestError('sampling'); throw error; }
    if (!selectionMatches(selection, fields)) throw new AuditRequestError('sampling');
    return { ...selection, selectedBy: email, selectedAt: stamp };
  }
  if (!selectionMatches(current?.selection, fields)) throw new AuditRequestError('sampling');
  return current!.selection;
}
