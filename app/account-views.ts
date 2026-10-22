import { validateViewState, type SavedViewState } from './saved-register-views';
import { registerViewSchema } from './register-view-schema';
import { readWorkView, WORK_MODULE_LABELS, workViewSchema } from './work-queue-views';
import { canReadModule, type AccessSubject } from './module-access';

export const VIEW_MODULES = ['Risk Assessment','BIA','Varlık Envanteri','Uyum','Kontroller','Kanıtlar','Denetim Yönetimi','My Work'] as const;
export type ViewScope = 'personal' | 'team';
export type AccountView = { id: string; module: string; scope: ViewScope; name: string; state: SavedViewState; revision: string; updatedAt: string };
export class AccountViewError extends Error { constructor(public code: string, public status = 400) { super(code); } }
export const viewNameKey = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase('tr-TR');
export function viewModule(value: unknown): string {
  if (typeof value !== 'string' || !VIEW_MODULES.includes(value as typeof VIEW_MODULES[number])) throw new AccountViewError('fields');
  return value;
}
export function viewScope(value: unknown): ViewScope {
  if (value !== 'personal' && value !== 'team') throw new AccountViewError('fields');
  return value;
}
export function viewId(value: unknown): string {
  if (typeof value !== 'string' || !/^SV-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value)) throw new AccountViewError('fields');
  return value;
}
export function accountViewState(module: string, value: unknown): SavedViewState {
  viewModule(module);
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['query','filters','columns'].includes(key))) throw new AccountViewError('schema');
  try {
    const state = validateViewState(value, module === 'My Work' ? workViewSchema : registerViewSchema(module));
    if (module === 'My Work') readWorkView(state, Object.keys(WORK_MODULE_LABELS));
    return state;
  } catch { throw new AccountViewError('schema'); }
}
export function canReadView(subject: AccessSubject, module: string, state?: SavedViewState) {
  return module === 'My Work' ? (!state?.filters.module || canReadModule(subject, state.filters.module)) : canReadModule(subject, module);
}
