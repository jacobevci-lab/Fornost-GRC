/** Cache completed metadata only, never another request's pending I/O promise.
 * Initializers must be idempotent: concurrent cold requests run independently.
 * A failed or abandoned request cannot keep other requests waiting on its work.
 */
export function completedInitialization() {
  const completed = new WeakSet<object>();
  return async (binding: object, initialize: () => Promise<unknown>): Promise<void> => {
    if (completed.has(binding)) return;
    await initialize();
    completed.add(binding);
  };
}
