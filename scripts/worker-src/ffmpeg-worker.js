// Custom FFmpeg worker. Replaces @ffmpeg/ffmpeg's dist/esm/worker.js.
//
// Why: the original worker has an `importScripts(coreURL)` try/catch
// fallback for classic-worker compatibility. Even when wrapped in try/catch,
// Chromium's stricter module-worker policy can refuse the call as a
// "cross-origin redirect of the top-level worker script". This worker
// has no such fallback — it always does a clean dynamic `import(coreURL)`
// against a same-origin blob: URL, which Chrome accepts without complaint.
//
// Protocol matches the @ffmpeg/ffmpeg 0.12 message types so the same
// MiniFFmpeg main-thread wrapper can talk to it.

const FF_MSG = {
  LOAD: "LOAD",
  EXEC: "EXEC",
  WRITE_FILE: "WRITE_FILE",
  READ_FILE: "READ_FILE",
  DELETE_FILE: "DELETE_FILE",
  ERROR: "ERROR",
  PROGRESS: "PROGRESS",
  LOG: "LOG",
};

let core = null;

async function load(data) {
  // The main thread sends raw bytes for ffmpeg-core.js and ffmpeg-core.wasm.
  // We construct blob: URLs *inside the worker's own realm* so the worker's
  // dynamic import is unambiguously a same-realm same-origin load.
  //
  // Cross-realm blob URLs (created in the main thread, resolved in the
  // worker) are treated as a cross-origin redirect of the top-level worker
  // script by Chromium when the page is on file:// (null) origin. This
  // worker-local construction sidesteps that entirely.
  const { coreSource, wasmBinary } = data;
  const coreBlob = new Blob([coreSource], { type: "text/javascript" });
  const coreURL = URL.createObjectURL(coreBlob);

  const mod = await import(coreURL);
  if (!mod || typeof mod.default !== "function") {
    throw new Error("ffmpeg-core.js did not expose a default factory export");
  }

  // Pass wasm bytes directly via Module.wasmBinary so ffmpeg-core never
  // fetches anything itself. mainScriptUrlOrBlob is still required by the
  // patched _locateFile() in @ffmpeg/core, but it's only consulted when
  // wasmBinary isn't set — we pass a placeholder hash anyway for safety.
  core = await mod.default({
    wasmBinary,
    mainScriptUrlOrBlob: `${coreURL}#${btoa(
      JSON.stringify({ wasmURL: "", workerURL: "" }),
    )}`,
  });
  core.setLogger((d) =>
    self.postMessage({ type: FF_MSG.LOG, data: d }),
  );
  core.setProgress((d) =>
    self.postMessage({ type: FF_MSG.PROGRESS, data: d }),
  );
  return true;
}

function exec(data) {
  if (!core) throw new Error("ffmpeg not loaded");
  core.setTimeout(data.timeout ?? -1);
  core.exec(...data.args);
  const ret = core.ret;
  core.reset();
  return ret;
}

function writeFile(data) {
  if (!core) throw new Error("ffmpeg not loaded");
  core.FS.writeFile(data.path, data.data);
  return true;
}

function readFile(data) {
  if (!core) throw new Error("ffmpeg not loaded");
  return core.FS.readFile(data.path, { encoding: data.encoding });
}

function deleteFile(data) {
  if (!core) throw new Error("ffmpeg not loaded");
  core.FS.unlink(data.path);
  return true;
}

self.onmessage = async (e) => {
  const { id, type, data } = e.data;
  const transfer = [];
  let result;
  try {
    switch (type) {
      case FF_MSG.LOAD:
        result = await load(data);
        break;
      case FF_MSG.EXEC:
        result = exec(data);
        break;
      case FF_MSG.WRITE_FILE:
        result = writeFile(data);
        break;
      case FF_MSG.READ_FILE:
        result = readFile(data);
        if (result instanceof Uint8Array) transfer.push(result.buffer);
        break;
      case FF_MSG.DELETE_FILE:
        result = deleteFile(data);
        break;
      default:
        throw new Error(`Unknown message type: ${type}`);
    }
  } catch (err) {
    self.postMessage({
      id,
      type: FF_MSG.ERROR,
      data: err && err.message ? err.message : String(err),
    });
    return;
  }
  self.postMessage({ id, type, data: result }, transfer);
};
