export type LocalAuthInput = {
  action: 'login' | 'bootstrap' | 'demo_login';
  name?: string; email?: string; password?: string;
};

/** A write is sent exactly once: a lost response does not prove it was rejected. */
export async function submitLocalAuthentication(url: string, input: LocalAuthInput, options: {
  signal: AbortSignal; fetcher?: typeof fetch; timeoutMs?: number;
}): Promise<void> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  options.signal.addEventListener('abort', cancel, { once: true });
  if (options.signal.aborted) cancel();
  const timer = setTimeout(cancel, options.timeoutMs ?? 15_000);
  try {
    const response = await (options.fetcher ?? fetch)(url, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input), signal: controller.signal,
    });
    const result = await response.json().catch(() => null);
    if (controller.signal.aborted) throw new Error('timeout');
    if (!response.ok) throw new Error(typeof result?.error === 'string' ? result.error.slice(0, 300) : 'Giriş servisi yanıt veremedi. Oturum durumunu kontrol edin.');
    if (result?.ok !== true) throw new Error('İşlem sonucu doğrulanamadı. Oturum durumunu kontrol edin.');
  } catch (error) {
    if (controller.signal.aborted) throw new Error('İşlem zaman aşımına uğradı. Yeniden göndermeden önce oturum durumunu kontrol edin.');
    if (error instanceof TypeError) throw new Error('Bağlantı kurulamadı. İşlem sonucu doğrulanamadı; oturum durumunu kontrol edin.');
    throw error;
  } finally {
    clearTimeout(timer);
    options.signal.removeEventListener('abort', cancel);
  }
}
