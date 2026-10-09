# Fixed Qwen 2.5 1.5B startup

The app opens directly to chat and automatically initializes Qwen 2.5 1.5B
Instruct Q4_K_M. There is no Models tab, model picker, or user download button.
You can type a draft while the model loads. Sending waits until actual inference is ready. Startup errors have a
Try again action; they never silently activate canned responses.

## Browser preview

Run `npm run web`. The browser uses `@wllama/wllama` to run the actual GGUF model
through WebAssembly in a worker. The WASM binary is included in the web build.

First use automatically fetches 1,117,320,736 bytes of model data from Hugging
Face and stores it in the browser's Origin Private File System. Subsequent visits
reuse that cache. Initial network access and enough browser storage/RAM are
required. Clearing site data removes the cached model. The loading notice reports
real transfer progress, verification, and engine startup.

The browser fetches four 8 MiB byte ranges in parallel, reports received megabytes
and transfer speed, and retries a stalled range up to three times. Completed ranges
are saved individually, so a refresh or retry reuses them. A 30-second idle timeout
prevents a connection from hanging indefinitely. A complete older runtime cache is
also reused without downloading again.

Cached model size and SHA-256 are checked before inference starts. Incomplete or
corrupt data is removed and can be fetched again by retrying startup. The app uses
a fixed model; users do not select, download, or switch models manually.

Use a recent browser with WebAssembly SIMD and OPFS support on localhost or HTTPS.
Vite dev/preview supplies COOP `same-origin` and COEP `credentialless` headers for
WASM threading. Configure the same headers on a production host; the runtime can
fall back to one thread if cross-origin isolation is unavailable. Model caching
allows inference without a network after loading; app assets must still be served
or cached separately to support an entirely offline page reload.

## Native builds

For Android/iOS builds, the same model can ship inside the application:

```sh
npm run prepare:model
npm run check:model
```

These are developer build preparation commands, not user actions. The large GGUF
is excluded from Git. Android includes it as an uncompressed asset and unpacks it
to local storage on first launch. iOS adds it to the app's resources during pod
installation. Native startup reports an error if the included weights are missing or invalid.

The model metadata is in `scripts/bundled-model.json`, sourced from the
[official Qwen GGUF repository](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/tree/main).
Unit tests exercise startup, verification and streaming at mocked engine
boundaries. They do not measure full-model browser or device performance.
