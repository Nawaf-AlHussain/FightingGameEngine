/**
 * Character Downloader — Fetches character files from CDN.
 *
 * Primary CDN: jsDelivr (fast, global, free)
 * Fallback CDN: GitHub raw (no file size limit, no .cmd blocking)
 *
 * jsDelivr limitations:
 * - Blocks .cmd files (Windows batch extension) with 403
 * - 50MB file size limit (Spider-Man.sff is 54MB)
 *
 * GitHub raw (raw.githubusercontent.com):
 * - No file size limit
 * - Serves all file types
 * - Sets Access-Control-Allow-Origin: * (CORS works)
 */

export interface DownloadProgress {
  charId: string;
  fileIndex: number;
  fileTotal: number;
  currentFile: string;
  bytesDownloaded: number;
  bytesTotal: number;
  percent: number;
}

export interface DownloadResult {
  files: Map<string, ArrayBuffer>;
  totalBytes: number;
  elapsedMs: number;
}

/**
 * Convert a jsDelivr URL to the equivalent GitHub raw URL.
 */
function jsdelivrToGithubRaw(url: string): string {
  return url
    .replace("https://cdn.jsdelivr.net/gh/", "https://raw.githubusercontent.com/")
    .replace(/@main\//, "/main/")
    .replace(/@master\//, "/master/");
}

/**
 * Download a single file with streaming progress.
 * Tries jsDelivr first, falls back to GitHub raw on 403.
 */
async function downloadFile(
  url: string,
  filename: string,
  signal: AbortSignal | undefined,
  onFileProgress: (downloaded: number, total: number) => void
): Promise<ArrayBuffer> {
  // cache: 'no-cache' — always validate with server before using HTTP cache.
  // Without this, the browser may serve a stale .def file from its HTTP cache
  // (jsDelivr sets max-age=604800 = 7 days). When a character's .def is fixed
  // in the assets repo (e.g., localcoord removed), the browser would keep
  // serving the old cached version for up to 7 days.
  // 'no-cache' sends a conditional request (If-None-Match/If-Modified-Since).
  // If the file changed, server returns 200 with new body. If unchanged, 304
  // (fast, no body transfer).
  let response = await fetch(url, { signal, cache: "no-cache" });

  // If jsDelivr returns 403, try GitHub raw
  if (!response.ok && response.status === 403) {
    const githubRawUrl = jsdelivrToGithubRaw(url);
    console.warn(`[CharacterDownloader] jsDelivr 403 for ${filename}, trying GitHub raw`);
    response = await fetch(githubRawUrl, { signal, cache: "no-cache" });
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText} for ${filename}`);
  }

  const contentLength = parseInt(response.headers.get("Content-Length") || "0", 10);

  // Use streaming reader for progress tracking
  if (response.body && typeof ReadableStream !== "undefined") {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let fileBytesDownloaded = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (signal?.aborted) {
        reader.cancel();
        throw new DOMException("Download aborted", "AbortError");
      }

      chunks.push(value);
      fileBytesDownloaded += value.byteLength;
      onFileProgress(fileBytesDownloaded, contentLength);
    }

    // Combine chunks into a single ArrayBuffer
    const totalLength = chunks.reduce((sum, c) => sum + c.byteLength, 0);
    const buffer = new ArrayBuffer(totalLength);
    const view = new Uint8Array(buffer);
    let offset = 0;
    for (const chunk of chunks) {
      view.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return buffer;
  }

  // Fallback: no streaming
  return response.arrayBuffer();
}

export async function downloadCharacter(
  charId: string,
  cdnBase: string,
  files: string[],
  onProgress?: (progress: DownloadProgress) => void,
  signal?: AbortSignal
): Promise<DownloadResult> {
  const startTime = performance.now();
  const fileMap = new Map<string, ArrayBuffer>();
  let bytesDownloaded = 0;

  const base = cdnBase.endsWith("/") ? cdnBase : cdnBase + "/";

  for (let i = 0; i < files.length; i++) {
    const filename = files[i];
    const url = base + filename;

    if (signal?.aborted) {
      throw new DOMException("Download aborted", "AbortError");
    }

    onProgress?.({
      charId,
      fileIndex: i,
      fileTotal: files.length,
      currentFile: filename,
      bytesDownloaded,
      bytesTotal: 0,
      percent: (i / files.length) * 100,
    });

    try {
      const data = await downloadFile(url, filename, signal, (fileDownloaded, fileTotal) => {
        // Report progress during file download
        onProgress?.({
          charId,
          fileIndex: i,
          fileTotal: files.length,
          currentFile: filename,
          bytesDownloaded: bytesDownloaded + fileDownloaded,
          bytesTotal: 0,
          percent: ((i + (fileTotal > 0 ? fileDownloaded / fileTotal : 0)) / files.length) * 100,
        });
      });

      fileMap.set(filename, data);
      bytesDownloaded += data.byteLength;

      onProgress?.({
        charId,
        fileIndex: i + 1,
        fileTotal: files.length,
        currentFile: filename,
        bytesDownloaded,
        bytesTotal: 0,
        percent: ((i + 1) / files.length) * 100,
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        throw e;
      }
      throw new Error(`Failed to download ${filename}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  onProgress?.({
    charId,
    fileIndex: files.length,
    fileTotal: files.length,
    currentFile: "",
    bytesDownloaded,
    bytesTotal: 0,
    percent: 100,
  });

  const elapsedMs = performance.now() - startTime;
  console.log(
    `[CharacterDownloader] Downloaded ${charId}: ${files.length} files, ` +
    `${(bytesDownloaded / 1024 / 1024).toFixed(1)}MB in ${(elapsedMs / 1000).toFixed(1)}s`
  );

  return { files: fileMap, totalBytes: bytesDownloaded, elapsedMs };
}
