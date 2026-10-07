export type SessionSnapshot = {
  authenticated: boolean;
  bootstrapRequired: boolean;
  user?: { id: string; role: string; [key: string]: unknown } | null;
  [key: string]: unknown;
};

// Retry only the read-only identity probe, never login/bootstrap writes.
export async function readSessionSnapshot(url: string, options: {
  signal: AbortSignal; fetcher?: typeof fetch; timeoutMs?: number;
}): Promise<SessionSnapshot> {
  const fetcher = options.fetcher ?? fetch;
  const budget = options.timeoutMs ?? 12_000;
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const cancel = () => controller.abort();
    options.signal.addEventListener('abort', cancel, { once: true });
    if (options.signal.aborted) cancel();
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout>;
    let rejectCancelled: () => void = () => {};
    const interrupted = new Promise<never>((_, reject) => {
      rejectCancelled = () => reject(new Error('Oturum kontrolü iptal edildi.'));
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
        reject(new Error('Oturum kontrolü zaman aşımına uğradı. Tekrar deneyin.'));
      }, budget / 2);
    });
    options.signal.addEventListener('abort', rejectCancelled, { once: true });
    try {
      return await Promise.race([interrupted, (async () => {
        if (options.signal.aborted) throw new Error('Oturum kontrolü iptal edildi.');
        const response = await fetcher(url, { cache: 'no-store', signal: controller.signal });
        if ([502, 503, 504].includes(response.status) && !attempt) {
          await response.body?.cancel();
          throw new TypeError('Kimlik servisi geçici olarak kullanılamıyor.');
        }
        if (!response.ok) throw new Error('Kimlik servisine ulaşılamadı. Tekrar deneyin.');
        const value = await response.json();
        if (!value || typeof value.authenticated !== 'boolean' || typeof value.bootstrapRequired !== 'boolean'
          || (value.authenticated && (!value.user || typeof value.user.id !== 'string' || !value.user.id || typeof value.user.role !== 'string'))) {
          throw new Error('Kimlik servisi geçerli bir oturum yanıtı vermedi. Tekrar deneyin.');
        }
        return value;
      })()]);
    } catch (error) {
      if (!options.signal.aborted && !attempt && (timedOut || error instanceof TypeError)) continue;
      if (timedOut) throw new Error('Oturum kontrolü zaman aşımına uğradı. Tekrar deneyin.');
      throw error;
    } finally {
      clearTimeout(timer!);
      options.signal.removeEventListener('abort', cancel);
      options.signal.removeEventListener('abort', rejectCancelled);
    }
  }
  throw new Error('Kimlik servisine ulaşılamadı.');
}
