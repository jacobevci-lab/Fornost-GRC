import test from 'node:test';
import assert from 'node:assert/strict';
import { readWorkView, workViewSchema } from '../app/work-queue-views';
import { changeSavedViews, parseSavedViews } from '../app/saved-register-views';

const state = { query: 'Invoice', filters: { module: 'Kanıtlar', status: 'overdue' }, columns: workViewSchema.columns };
test('saved work criteria round-trip without storing ownership scope or records', () => {
  const views = changeSavedViews(null, { action: 'create', id: 'work', name: 'Late evidence', state }, workViewSchema);
  const loaded = parseSavedViews(JSON.stringify({ version: 1, views }))[0];
  assert.deepEqual(readWorkView(loaded, ['Kanıtlar']), { query: 'Invoice', module: 'Kanıtlar', status: 'overdue' });
  assert.deepEqual(Object.keys(loaded.filters).sort(), ['module', 'status']);
});
test('unsupported work criteria reject instead of broadening or changing scope', () => {
  for (const filters of [{ ...state.filters, scope: 'organization' }, { ...state.filters, status: 'retired' }, { ...state.filters, module: 'Removed module' }, { module: 'Kanıtlar' }]) {
    assert.throws(() => readWorkView({ ...state, filters }, ['Kanıtlar']), /schema/);
  }
});
test('all-module and completed views preserve exact search and use current evaluation', () => {
  assert.deepEqual(readWorkView({ ...state, query: '', filters: { status: 'completed' } }, []), { query: '', module: '', status: 'completed' });
  // Supported modules may have no tasks in the current ownership scope; keep their filter.
  assert.equal(readWorkView(state, ['Kanıtlar']).module, 'Kanıtlar');
});
