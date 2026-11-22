import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { Archive, CheckCircle2, Download, Loader2, X } from "lucide-react";
import { Zip, ZipPassThrough } from "fflate";
import { Button } from "@/components/ui/button";
import {
  getStorageExportPage,
  listStorageExportBuckets,
} from "@/lib/storage-export.functions";

type Bucket = { id: string; name: string; public: boolean };
type FileEntry = {
  bucket: string;
  path: string;
  size: number;
  contentType: string | null;
  signedUrl: string;
};
type Phase =
  "idle" | "scanning" | "downloading" | "done" | "error" | "cancelled";
type FileSink = {
  write: (chunk: Uint8Array) => Promise<void>;
  close: () => Promise<void>;
  abort?: () => Promise<void>;
};
type SavePickerWindow = Window & {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<{ createWritable: () => Promise<FileSink> }>;
};

const formatBytes = (value: number) => {
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let n = value / 1024,
    i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n >= 100 ? 0 : 1)} ${units[i]}`;
};

async function fetchWithRetry(
  entry: FileEntry,
  signal: AbortSignal,
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (signal.aborted)
      throw new DOMException("Export cancelled", "AbortError");
    try {
      const response = await fetch(entry.signedUrl, {
        signal,
        cache: "no-store",
      });
      if (response.ok) return response;
      throw new Error(`Download failed (${response.status})`);
    } catch (error) {
      lastError = error;
      if (
        signal.aborted ||
        (error instanceof Error && error.name === "AbortError")
      )
        throw error;
      if (attempt < 2)
        await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("A Storage file could not be downloaded.");
}

export default function StorageExportTab() {
  const listBuckets = useServerFn(listStorageExportBuckets);
  const getPage = useServerFn(getStorageExportPage);
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("Loading Storage buckets…");
  const [scanned, setScanned] = useState(0);
  const [fileCount, setFileCount] = useState(0);
  const [doneFiles, setDoneFiles] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [doneBytes, setDoneBytes] = useState(0);
  const [zipBytes, setZipBytes] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const active = phase === "scanning" || phase === "downloading";

  useEffect(() => {
    let mounted = true;
    void listBuckets()
      .then((rows) => {
        if (mounted) {
          setBuckets(rows);
          setMessage(
            `${rows.length} bucket${rows.length === 1 ? "" : "s"} ready.`,
          );
        }
      })
      .catch((cause) => {
        if (mounted) {
          setPhase("error");
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load Storage buckets.",
          );
        }
      });
    return () => {
      mounted = false;
      abortRef.current?.abort();
    };
  }, [listBuckets]);

  const cancel = () => abortRef.current?.abort();

  const exportStorage = async () => {
    const controller = new AbortController();
    abortRef.current = controller;
    let sink: FileSink | null = null;
    let fallbackChunks: Uint8Array[] | null = null;
    try {
      const pickerWindow = window as SavePickerWindow;
      if (pickerWindow.showSaveFilePicker) {
        try {
          const handle = await pickerWindow.showSaveFilePicker({
            suggestedName: `autosocials-storage-${new Date().toISOString().slice(0, 10)}.zip`,
            types: [
              {
                description: "ZIP archive",
                accept: { "application/zip": [".zip"] },
              },
            ],
          });
          sink = await handle.createWritable();
        } catch (cause) {
          if (cause instanceof Error && cause.name === "AbortError")
            throw cause;
          fallbackChunks = [];
          setMessage(
            "This embedded preview blocks the save dialog; switching to a regular ZIP download.",
          );
        }
      } else {
        fallbackChunks = [];
        setMessage(
          "This browser cannot stream directly to disk; preparing a browser download instead.",
        );
      }
      setError(null);
      setScanned(0);
      setFileCount(0);
      setDoneFiles(0);
      setDoneBytes(0);
      setTotalBytes(0);
      setZipBytes(0);
      setPhase("scanning");
      const files: FileEntry[] = [];
      let discoveredBytes = 0;
      for (const bucket of buckets) {
        const pending = [""];
        setMessage(`Scanning ${bucket.name}…`);
        while (pending.length) {
          if (controller.signal.aborted)
            throw new DOMException("Export cancelled", "AbortError");
          const path = pending.shift()!;
          let offset = 0;
          for (;;) {
            const page = await getPage({
              data: { bucket: bucket.name, path, offset },
            });
            pending.push(...page.folders);
            for (const file of page.files) {
              files.push({ bucket: bucket.name, ...file });
              discoveredBytes += file.size;
            }
            setScanned((n) => n + page.count);
            setFileCount(files.length);
            setTotalBytes(discoveredBytes);
            if (page.count < page.pageSize) break;
            offset += page.pageSize;
            setMessage(
              `Scanning ${bucket.name}${path ? `/${path}` : ""} · ${files.length.toLocaleString()} files found…`,
            );
          }
        }
      }

      const bytes = discoveredBytes;
      if (
        bytes > 4_000_000_000 ||
        files.some((file) => file.size > 4_000_000_000)
      ) {
        throw new Error(
          "This export is larger than the single-file ZIP format limit. Split the source files into smaller exports and retry.",
        );
      }
      if (!sink && bytes > 1_500_000_000) {
        throw new Error(
          "This browser cannot safely download an archive this large without streaming-to-disk support. Use Chrome or Edge and retry.",
        );
      }
      setFileCount(files.length);
      setTotalBytes(bytes);
      setPhase("downloading");
      setMessage(
        files.length
          ? `Downloading 0 of ${files.length.toLocaleString()} · writing ZIP to disk…`
          : "No Storage files were found; writing an empty archive.",
      );

      let writeChain = Promise.resolve();
      let rejectZip!: (cause: Error) => void;
      let resolveZip!: () => void;
      const archiveDone = new Promise<void>((resolve, reject) => {
        resolveZip = resolve;
        rejectZip = reject;
      });
      let zipFailed = false;
      const zip = new Zip((zipError, chunk, final) => {
        if (zipError) {
          zipFailed = true;
          rejectZip(zipError);
          return;
        }
        if (chunk.length) {
          writeChain = writeChain.then(() =>
            sink
              ? sink.write(chunk)
              : (fallbackChunks!.push(chunk), Promise.resolve()),
          );
          void writeChain.catch((cause: unknown) => {
            zipFailed = true;
            rejectZip(
              cause instanceof Error
                ? cause
                : new Error("Could not write the ZIP archive."),
            );
          });
          setZipBytes((n) => n + chunk.length);
        }
        if (final)
          void writeChain
            .then(() => (zipFailed ? undefined : resolveZip()))
            .catch((cause: unknown) =>
              rejectZip(
                cause instanceof Error
                  ? cause
                  : new Error("Could not finish the ZIP archive."),
              ),
            );
      });

      const manifest = {
        exported_at: new Date().toISOString(),
        buckets: buckets.map(({ name, public: isPublic }) => ({
          name,
          public: isPublic,
        })),
        files: files.map(({ bucket, path, size, contentType }) => ({
          bucket,
          path,
          size,
          content_type: contentType,
        })),
      };
      const manifestFile = new ZipPassThrough("manifest.json");
      zip.add(manifestFile);
      manifestFile.push(
        new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
        true,
      );
      await writeChain;

      for (let index = 0; index < files.length; index++) {
        if (controller.signal.aborted)
          throw new DOMException("Export cancelled", "AbortError");
        const file = files[index]!;
        setMessage(
          `Downloading ${index + 1} of ${files.length.toLocaleString()} · ${file.bucket}/${file.path}`,
        );
        const response = await fetchWithRetry(file, controller.signal);
        if (!response.body)
          throw new Error(
            `No file data received for ${file.bucket}/${file.path}.`,
          );
        const zipFile = new ZipPassThrough(
          `buckets/${file.bucket}/${file.path}`,
        );
        zip.add(zipFile);
        const reader = response.body.getReader();
        let fileBytes = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (controller.signal.aborted) {
            await reader.cancel();
            throw new DOMException("Export cancelled", "AbortError");
          }
          zipFile.push(value);
          fileBytes += value.byteLength;
          setDoneBytes((n) => n + value.byteLength);
          await writeChain;
        }
        zipFile.push(new Uint8Array(), true);
        await writeChain;
        if (file.size && fileBytes !== file.size)
          throw new Error(
            `Size mismatch for ${file.bucket}/${file.path}; export stopped to avoid an incomplete archive.`,
          );
        setDoneFiles(index + 1);
      }

      zip.end();
      await archiveDone;
      if (sink) {
        await sink.close();
      } else {
        if (!fallbackChunks) throw new Error("ZIP buffer missing.");
        const archive = new Blob(fallbackChunks.map((chunk) => Uint8Array.from(chunk)), { type: "application/zip" });
        const url = URL.createObjectURL(archive);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `autosocials-storage-${new Date().toISOString().slice(0, 10)}.zip`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
      setPhase("done");
      setMessage(
        `Export ready · ${files.length.toLocaleString()} files · ${formatBytes(bytes)}.`,
      );
    } catch (cause) {
      if (sink?.abort) await sink.abort().catch(() => undefined);
      if (
        controller.signal.aborted ||
        (cause instanceof Error && cause.name === "AbortError")
      ) {
        setPhase("cancelled");
        setMessage("Export cancelled; the partial file was discarded.");
      } else {
        setPhase("error");
        setError(
          cause instanceof Error ? cause.message : "Storage export failed.",
        );
      }
    } finally {
      abortRef.current = null;
    }
  };

  const progress =
    phase === "scanning"
      ? null
      : phase === "downloading"
        ? fileCount
          ? Math.round((doneFiles / fileCount) * 100)
          : 0
        : phase === "done"
          ? 100
          : 0;

  return (
    <section className="max-w-3xl space-y-5">
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="flex items-start gap-3">
          <span className="rounded-lg bg-surface-subtle p-2.5">
            <Archive className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold">Export Storage files</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Downloads every file from every bucket into one ZIP, streaming it
              directly to disk where supported. Bucket visibility and file
              metadata are included in manifest.json.
            </p>
          </div>
        </div>
        <div className="mt-5 divide-y divide-border rounded-lg border border-border">
          {buckets.map((bucket) => (
            <div
              key={bucket.id}
              className="flex items-center justify-between px-3 py-2.5 text-sm"
            >
              <span className="font-medium">{bucket.name}</span>
              <span className="text-xs text-muted-foreground">
                {bucket.public ? "Public" : "Private"}
              </span>
            </div>
          ))}
          {!buckets.length && phase !== "error" && (
            <div className="px-3 py-4 text-sm text-muted-foreground">
              {message}
            </div>
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            onClick={() => void exportStorage()}
            disabled={active || buckets.length === 0}
          >
            {active ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : phase === "done" ? (
              <CheckCircle2 className="mr-2 h-4 w-4" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            {active
              ? "Exporting…"
              : phase === "done"
                ? "Export again"
                : "Export all buckets"}
          </Button>
          {active && (
            <Button variant="outline" onClick={cancel}>
              <X className="mr-2 h-4 w-4" />
              Cancel
            </Button>
          )}
        </div>
        {(active || phase === "done" || phase === "cancelled") && (
          <div className="mt-4 space-y-2" aria-live="polite">
            <div className="flex justify-between gap-4 text-xs text-muted-foreground">
              <span className="truncate">{message}</span>
              <span className="shrink-0 tabular-nums">{progress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-subtle">
              <div
                className="h-full rounded-full bg-primary transition-[width]"
                style={{ width: `${progress}%` }}
              />
            </div>
            {phase === "scanning" && (
              <p className="text-xs text-muted-foreground">
                Scanned {scanned.toLocaleString()} entries ·{" "}
                {fileCount.toLocaleString()} files found
              </p>
            )}
            {phase === "downloading" && (
              <p className="text-xs text-muted-foreground">
                {doneFiles.toLocaleString()} / {fileCount.toLocaleString()}{" "}
                files · {formatBytes(doneBytes)} / {formatBytes(totalBytes)}{" "}
                downloaded · {formatBytes(zipBytes)} written
              </p>
            )}
          </div>
        )}
        {error && (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        {phase === "done" && (
          <p className="mt-3 text-sm font-medium text-emerald-700">
            ZIP is ready. Check your browser downloads or the location you
            selected.
          </p>
        )}
      </div>
    </section>
  );
}
