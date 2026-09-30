"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_IMAGE_UPLOAD_BYTES,
  formatBytes,
  validateImageFile,
} from "@/lib/validation/image";
import type { ApiResponse, UploadedAsset } from "@/types";

type UploadPhase = "idle" | "uploading" | "success" | "error";

export default function UploadForm() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<File | null>(null);
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [asset, setAsset] = useState<UploadedAsset | null>(null);
  const [message, setMessage] = useState("");

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setAsset(null);
    setMessage("");
    if (!file) {
      setSelected(null);
      setPhase("idle");
      return;
    }
    const check = validateImageFile({
      name: file.name,
      type: file.type,
      size: file.size,
    });
    if (!check.ok) {
      setSelected(null);
      setMessage(check.message);
      setPhase("error");
      event.target.value = "";
      return;
    }
    setSelected(file);
    setPhase("idle");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) {
      setPhase("error");
      setMessage("Select an image file first.");
      return;
    }
    setPhase("uploading");
    setMessage("");
    const formData = new FormData();
    formData.append("file", selected);
    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const body = (await response.json().catch(() => null)) as
        | ApiResponse<{ asset: UploadedAsset }>
        | null;
      if (body && body.ok) {
        setAsset(body.data.asset);
        setPhase("success");
        return;
      }
      setMessage(
        body && !body.ok
          ? body.error.message
          : `Upload failed (HTTP ${response.status}).`,
      );
      setPhase("error");
    } catch {
      setMessage("A network error occurred. The upload could not be completed.");
      setPhase("error");
    }
  }

  function handleReset() {
    setSelected(null);
    setAsset(null);
    setMessage("");
    setPhase("idle");
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 sm:flex-row sm:items-end"
      >
        <div className="flex-1">
          <label
            htmlFor="media-file"
            className="block text-sm font-medium text-slate-700"
          >
            Image file
          </label>
          <input
            id="media-file"
            ref={inputRef}
            type="file"
            accept={ALLOWED_IMAGE_MIME_TYPES.join(",")}
            onChange={handleFileChange}
            disabled={phase === "uploading"}
            className="mt-1 w-full cursor-pointer rounded-md border border-slate-300 bg-white text-sm text-slate-700 file:mr-3 file:rounded-l-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
          />
          <p className="mt-1 text-xs text-slate-500">
            JPEG, PNG, GIF or WebP · max {formatBytes(MAX_IMAGE_UPLOAD_BYTES)}
            {selected
              ? ` · selected: ${selected.name} (${formatBytes(selected.size)})`
              : ""}
          </p>
        </div>
        <button
          type="submit"
          disabled={phase === "uploading"}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {phase === "uploading" && (
            <span
              aria-hidden="true"
              className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
            />
          )}
          {phase === "uploading" ? "Uploading…" : "Upload to Cloudinary"}
        </button>
      </form>

      {phase === "uploading" && (
        <p
          role="status"
          aria-live="polite"
          className="mt-3 text-sm text-slate-600"
        >
          Uploading {selected?.name} to Cloudinary…
        </p>
      )}

      {phase === "error" && (
        <div
          role="alert"
          className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          <p className="font-semibold">Upload failed</p>
          <p className="mt-1">{message}</p>
        </div>
      )}

      {phase === "success" && asset && (
        <div className="mt-4 space-y-4">
          <div
            role="status"
            className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
          >
            <p className="font-semibold">Upload complete — stored in Cloudinary</p>
            <p className="mt-1">
              The asset now exists in the Cloudinary account. No analysis has
              been run yet.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-[minmax(0,16rem)_1fr]">
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
              <Image
                src={asset.secureUrl}
                alt={`Uploaded asset ${asset.publicId}`}
                width={asset.width}
                height={asset.height}
                className="h-auto w-full object-contain"
              />
            </div>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">Public ID</dt>
                <dd className="break-all font-mono text-slate-900">
                  {asset.publicId}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Original name</dt>
                <dd className="break-all text-slate-900">{asset.originalName}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Format</dt>
                <dd className="text-slate-900">{asset.format}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Dimensions</dt>
                <dd className="text-slate-900">
                  {asset.width} × {asset.height} px
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Size</dt>
                <dd className="text-slate-900">{formatBytes(asset.bytes)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Uploaded (UTC)</dt>
                <dd className="text-slate-900">{asset.createdAt}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-slate-500">Asset URL</dt>
                <dd>
                  <a
                    href={asset.secureUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all text-slate-900 underline underline-offset-4 hover:text-slate-600"
                  >
                    {asset.secureUrl}
                  </a>
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <p className="font-semibold text-slate-700">Analysis: not run</p>
            <p className="mt-1">
              Upload success does not mean analysis succeeded. Provera has not
              analyzed this asset yet — analysis support arrives with the next
              phase.
            </p>
          </div>

          <button
            type="button"
            onClick={handleReset}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Upload another image
          </button>
        </div>
      )}
    </div>
  );
}