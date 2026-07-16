"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { ImagePlus, Star, Trash2, Upload } from "lucide-react";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { cn } from "@/lib/utils";

export type ExistingImage = { id: string; url: string };

const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/avif"];
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Drag-and-drop uploader for vehicle photos.
 *
 * Files are staged into a real <input type="file"> so the surrounding form
 * still posts them as FormData — the server action keeps streaming uploads
 * exactly as before, and this stays presentation.
 */
export function ImageDropzone({
  name,
  existing = [],
  onDeleteExisting,
}: {
  name: string;
  existing?: ExistingImage[];
  onDeleteExisting?: (id: string) => Promise<{ error: string } | undefined>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [staged, setStaged] = useState<{ file: File; url: string }[]>([]);
  const [rejected, setRejected] = useState<string[]>([]);
  const [confirming, setConfirming] = useState<
    { kind: "existing"; id: string } | { kind: "staged"; index: number } | null
  >(null);
  const [pending, setPending] = useState(false);

  /** Mirror the accepted files back into the real input for form submit. */
  const sync = (files: { file: File; url: string }[]) => {
    if (!inputRef.current) return;
    const dt = new DataTransfer();
    files.forEach((f) => dt.items.add(f.file));
    inputRef.current.files = dt.files;
  };

  const accept = (list: FileList | null) => {
    if (!list) return;
    const good: { file: File; url: string }[] = [];
    const bad: string[] = [];
    Array.from(list).forEach((file) => {
      if (!ACCEPTED.includes(file.type)) {
        bad.push(`${file.name} — unsupported format`);
      } else if (file.size > MAX_BYTES) {
        bad.push(`${file.name} — over 5 MB`);
      } else {
        good.push({ file, url: URL.createObjectURL(file) });
      }
    });
    const next = [...staged, ...good];
    setStaged(next);
    setRejected(bad);
    sync(next);
  };

  const removeStaged = (index: number) => {
    const next = staged.filter((_, i) => i !== index);
    URL.revokeObjectURL(staged[index].url);
    setStaged(next);
    sync(next);
  };

  const confirmDelete = async () => {
    if (!confirming) return;
    if (confirming.kind === "staged") {
      removeStaged(confirming.index);
      setConfirming(null);
      return;
    }
    setPending(true);
    await onDeleteExisting?.(confirming.id);
    setPending(false);
    setConfirming(null);
  };

  const total = existing.length + staged.length;

  return (
    <section className="bg-card rounded-xl border shadow-xs">
      <div className="flex items-center justify-between gap-3 border-b px-5 py-3">
        <h2 className="font-display flex items-center gap-2 text-sm font-bold">
          <ImagePlus className="text-brand h-4 w-4" />
          Photos
        </h2>
        <p className="text-muted-foreground text-xs">
          {total === 0 ? "None yet" : `${total} image${total === 1 ? "" : "s"}`}
        </p>
      </div>

      <div className="p-5">
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) =>
            (e.key === "Enter" || e.key === " ") && inputRef.current?.click()
          }
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            accept(e.dataTransfer.files);
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
            dragging
              ? "border-brand bg-brand/[0.06]"
              : "border-input hover:border-brand/40 hover:bg-secondary/60"
          )}
        >
          <span
            className={cn(
              "mb-3 flex h-11 w-11 items-center justify-center rounded-full transition-colors",
              dragging ? "bg-brand text-white" : "bg-secondary text-brand"
            )}
          >
            <Upload className="h-5 w-5" />
          </span>
          <p className="text-sm font-semibold">
            {dragging ? "Drop to add" : "Drag photos here"}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            or click to browse — JPEG, PNG, WebP or AVIF, up to 5 MB each
          </p>
          <input
            ref={inputRef}
            type="file"
            name={name}
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => accept(e.target.files)}
          />
        </div>

        {rejected.length > 0 && (
          <ul role="alert" className="mt-3 space-y-1">
            {rejected.map((r) => (
              <li key={r} className="text-destructive text-xs">
                {r}
              </li>
            ))}
          </ul>
        )}

        {total > 0 && (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {existing.map((image, i) => (
              <Thumb
                key={image.id}
                url={image.url}
                primary={i === 0}
                onDelete={
                  onDeleteExisting
                    ? () => setConfirming({ kind: "existing", id: image.id })
                    : undefined
                }
              />
            ))}
            {staged.map((s, i) => (
              <Thumb
                key={s.url}
                url={s.url}
                primary={existing.length === 0 && i === 0}
                pendingUpload
                onDelete={() => setConfirming({ kind: "staged", index: i })}
              />
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirming !== null}
        pending={pending}
        title="Delete this image?"
        body="This action cannot be undone. The photo will be removed from the vehicle and from storage."
        confirmLabel="Delete image"
        onCancel={() => setConfirming(null)}
        onConfirm={confirmDelete}
      />
    </section>
  );
}

function Thumb({
  url,
  primary,
  pendingUpload,
  onDelete,
}: {
  url: string;
  primary: boolean;
  pendingUpload?: boolean;
  onDelete?: () => void;
}) {
  return (
    <div className="group relative aspect-[4/3] overflow-hidden rounded-lg border bg-neutral-900">
      <Image
        src={url}
        alt=""
        fill
        sizes="12rem"
        unoptimized={pendingUpload}
        className="object-cover"
      />
      {primary && (
        <span className="absolute top-1.5 left-1.5 flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
          <Star className="h-2.5 w-2.5 fill-current" />
          Primary
        </span>
      )}
      {pendingUpload && (
        <span className="bg-status-maint absolute bottom-1.5 left-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white">
          Not saved yet
        </span>
      )}
      {onDelete && (
        <button
          type="button"
          aria-label="Delete image"
          onClick={onDelete}
          className="bg-destructive absolute top-1.5 right-1.5 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
