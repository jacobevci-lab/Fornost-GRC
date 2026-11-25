const port = process.env.PORT || "3000";
const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "/fornost-grc";
try {
  const response = await fetch(`http://127.0.0.1:${port}${base}/api/auth`, {
    signal: AbortSignal.timeout(4000), redirect: "error",
  });
  await response.body?.cancel();
  process.exitCode = response.ok ? 0 : 1;
} catch { process.exitCode = 1; }
