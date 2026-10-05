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
  const controller = new AbortController();
  const cancel = () => controller.abort();
  options.signal.addEventListener('abort', cancel, { once: true });
  if (options.signal.aborted) cancel();
  const timer = setTimeout(cancel, options.timeoutMs ?? 12_000);
  const fetcher = options.fetcher ?? fetch;
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      let response: Response;
      try {
        response = await fetcher(url, { cache: 'no-store', signal: controller.signal });
      } catch (error) {
        if (controller.signal.aborted || attempt) throw error;
        continue;
      }
      if ([502, 503, 504].includes(response.status) && !attempt) {
        await response.body?.cancel();
        continue;
      }
      if (!response.ok) throw new Error('Kimlik servisine ulaşılamadı. Tekrar deneyin.');
      const value = await response.json();
      if (!value || typeof value.authenticated !== 'boolean' || typeof value.bootstrapRequired !== 'boolean'
        || (value.authenticated && (!value.user || typeof value.user.id !== 'string' || !value.user.id || typeof value.user.role !== 'string'))) {
        throw new Error('Kimlik servisi geçerli bir oturum yanıtı vermedi. Tekrar deneyin.');
      }
      return value;
    }
    throw new Error('Kimlik servisine ulaşılamadı.');
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Oturum kontrolü zaman aşımına uğradı. Tekrar deneyin.');
    throw error;
  } finally {
    clearTimeout(timer);
    options.signal.removeEventListener('abort', cancel);
  }
}
