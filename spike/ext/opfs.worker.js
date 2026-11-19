// OPFS writer. Sync access handles only exist in dedicated workers, so the cache
// layer has to live here; this spike measures that path.
export const FILLER = "x".repeat(1024 * 1024);

self.onmessage = async () => {
  const started = performance.now();
  try {
    if (!navigator.storage?.getDirectory) throw new Error("no navigator.storage.getDirectory");
    const dir = await navigator.storage.getDirectory();
    const handle = await dir.getFileHandle("spike.bin", { create: true });
    const access = await handle.createSyncAccessHandle();
    const chunk = new TextEncoder().encode(FILLER);
    for (let i = 0; i < 5; i += 1) access.write(chunk, { at: i * chunk.byteLength });
    access.flush();
    const size = access.getSize();
    const buf = new Uint8Array(size);
    access.read(buf, { at: 0 });
    access.close();
    const estimate = await navigator.storage.estimate?.();
    self.postMessage({
      ok: size === 5 * chunk.byteLength && buf[0] === 120,
      size,
      ms: Math.round(performance.now() - started),
      quota: estimate?.quota ?? null,
    });
  } catch (error) {
    self.postMessage({ ok: false, error: String(error) });
  }
};
