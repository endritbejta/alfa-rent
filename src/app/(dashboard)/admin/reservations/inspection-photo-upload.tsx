"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Camera, LoaderCircle, Plus, X } from "lucide-react";
import type { UploadSignature } from "@/lib/cloudinary";
import { MAX_INSPECTION_PHOTOS } from "@/lib/validations/inspection";
import { useI18n } from "@/components/shared/locale-provider";

type Receipt = {
  publicId: string;
  version: number;
  signature: string;
};

type Item = {
  id: string;
  preview: string;
  status: "uploading" | "ready" | "error";
  receipt?: Receipt;
  message?: string;
  file: File;
};

type SignResult = { signature: UploadSignature } | { error: string };

const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/avif"];
/** A phone photo on a slow connection is slow, not broken. */
const UPLOAD_TIMEOUT_MS = 60_000;

const MAX_BYTES = 10 * 1024 * 1024;

export function InspectionPhotoUpload({
  sign,
  onStateChange,
}: {
  sign: () => Promise<SignResult>;
  onStateChange: (state: { uploading: boolean; hasErrors: boolean }) => void;
}) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);
  const uploading = items.some((item) => item.status === "uploading");
  const hasErrors = items.some((item) => item.status === "error");

  useEffect(
    () => onStateChange({ uploading, hasErrors }),
    [hasErrors, onStateChange, uploading]
  );

  const patch = (id: string, change: Partial<Item>) =>
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...change } : item))
    );

  const send = (item: Item, upload: UploadSignature) =>
    new Promise<void>((resolve) => {
      const body = new FormData();
      body.append("file", item.file);
      body.append("api_key", upload.apiKey);
      body.append("timestamp", String(upload.timestamp));
      body.append("signature", upload.signature);
      body.append("folder", upload.folder);
      body.append("transformation", upload.transformation);

      const request = new XMLHttpRequest();
      request.open(
        "POST",
        `https://api.cloudinary.com/v1_1/${upload.cloudName}/image/upload`
      );
      request.onload = () => {
        try {
          const result = JSON.parse(request.responseText) as {
            public_id?: string;
            version?: number;
            signature?: string;
            error?: { message?: string };
          };
          if (
            request.status < 200 ||
            request.status >= 300 ||
            !result.public_id ||
            result.version === undefined ||
            !result.signature
          ) {
            patch(item.id, {
              status: "error",
              message: result.error?.message ?? t("admin.uploadFailed"),
            });
          } else {
            patch(item.id, {
              status: "ready",
              receipt: {
                publicId: result.public_id,
                version: result.version,
                signature: result.signature,
              },
            });
          }
        } catch {
          patch(item.id, { status: "error", message: t("admin.uploadFailed") });
        }
        resolve();
      };
      /*
       * xhr.timeout defaults to 0 — no limit. A stalled upload otherwise
       * leaves this promise unresolved and the tile stuck on "uploading",
       * which the inspection form's Save button is gated on: the operator
       * cannot submit and is told nothing.
       */
      request.timeout = UPLOAD_TIMEOUT_MS;
      request.ontimeout = () => {
        patch(item.id, { status: "error", message: t("admin.networkError") });
        resolve();
      };
      request.onerror = () => {
        patch(item.id, { status: "error", message: t("admin.networkError") });
        resolve();
      };
      request.send(body);
    });

  const choose = async (files: FileList | null) => {
    if (!files) return;
    setError(null);
    const room = MAX_INSPECTION_PHOTOS - items.length;
    const accepted = Array.from(files)
      .slice(0, room)
      .filter((file) => {
        if (!ACCEPTED.includes(file.type)) {
          setError(t("admin.photoFormats"));
          return false;
        }
        if (file.size > MAX_BYTES) {
          setError(t("admin.photoSize"));
          return false;
        }
        return true;
      })
      .map<Item>((file) => ({
        id: crypto.randomUUID(),
        preview: URL.createObjectURL(file),
        status: "uploading",
        file,
      }));
    if (accepted.length === 0) return;

    setItems((current) => [...current, ...accepted]);
    const signed = await sign();
    if ("error" in signed) {
      accepted.forEach((item) =>
        patch(item.id, { status: "error", message: signed.error })
      );
      return;
    }
    await Promise.all(accepted.map((item) => send(item, signed.signature)));
    if (input.current) input.current.value = "";
  };

  const remove = (id: string) =>
    setItems((current) => {
      const item = current.find((candidate) => candidate.id === id);
      if (item) URL.revokeObjectURL(item.preview);
      return current.filter((candidate) => candidate.id !== id);
    });

  const receipts = items.flatMap((item) =>
    item.status === "ready" && item.receipt ? [item.receipt] : []
  );

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <label className="text-xs font-semibold">
          {t("admin.conditionPhotos")}
        </label>
        <span className="text-muted-foreground text-xs">
          {items.length} / {MAX_INSPECTION_PHOTOS}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="bg-media relative aspect-square overflow-hidden rounded-lg border"
          >
            <Image
              src={item.preview}
              alt=""
              fill
              unoptimized
              sizes="8rem"
              className="object-cover"
            />
            {item.status === "uploading" && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-white">
                <LoaderCircle className="h-5 w-5 animate-spin" />
              </span>
            )}
            {item.status === "error" && (
              <span className="bg-destructive/90 absolute inset-x-0 bottom-0 px-1 py-1 text-center text-[10px] text-white">
                {item.message}
              </span>
            )}
            <button
              type="button"
              aria-label={t("admin.removePhoto")}
              onClick={() => remove(item.id)}
              className="absolute top-1 right-1 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-black/70 text-white"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        {items.length < MAX_INSPECTION_PHOTOS && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="text-muted-foreground hover:text-brand hover:border-brand/40 flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed"
          >
            {items.length === 0 ? (
              <Camera className="h-5 w-5" />
            ) : (
              <Plus className="h-5 w-5" />
            )}
            <span className="text-[10px]">{t("admin.addPhotos")}</span>
          </button>
        )}
      </div>

      <input
        ref={input}
        type="file"
        accept={ACCEPTED.join(",")}
        multiple
        className="hidden"
        onChange={(event) => void choose(event.target.files)}
      />
      <input type="hidden" name="photos" value={JSON.stringify(receipts)} />
      {error && (
        <p role="alert" className="text-destructive mt-1 text-xs">
          {error}
        </p>
      )}
      {hasErrors && (
        <p role="alert" className="text-destructive mt-1 text-xs">
          {t("admin.photoErrors")}
        </p>
      )}
    </div>
  );
}
