const intervalMs = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 5_000);

// Foundation worker: sonraki fazda Prisma ile pending outbox olaylarını idempotent işler.
function pollOutbox() {
  if (process.env.NODE_ENV !== 'test') {
    console.info(
      JSON.stringify({
        level: 'info',
        event: 'outbox.poll',
        message: 'İşlenecek olaylar kontrol edildi.',
      }),
    );
  }
}

pollOutbox();
setInterval(pollOutbox, intervalMs).unref();

export { pollOutbox };
