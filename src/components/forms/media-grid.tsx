"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertCircle,
  GripVertical,
  ImagePlus,
  Plus,
  Upload,
  X,
} from "lucide-react";
import type { UploadSignature } from "@/lib/cloudinary";
import {
  MAX_VEHICLE_IMAGES,
  type VehicleImageItem,
} from "@/lib/validations/image";
import { cn } from "@/lib/utils";

export type ExistingImage = { id: string; url: string };

const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/avif"];

/**
 * Cloudinary itself rejects images over 10 MB on the free tier, so refusing
 * them here turns a confusing round-trip failure into an instant, specific
 * message. Raise alongside the Cloudinary plan, not on its own.
 */
const MAX_BYTES = 10 * 1024 * 1024;

type CloudinaryUploadResponse = {
  public_id?: string;
  version?: number;
  signature?: string;
  error?: { message?: string };
};

/**
 * A tile in the grid. `saved` and `ready` are the two states that survive to
 * the server; `uploading` and `error` are local to this session.
 */
type Item = {
  key: string;
  previewUrl: string;
  status: "saved" | "uploading" | "ready" | "error";
  id?: string;
  publicId?: string;
  version?: number;
  signature?: string;
  progress?: number;
  message?: string;
  file?: File;
};

type SignFn = (
  target: { vehicleId: string } | { draftId: string }
) => Promise<{ signature: UploadSignature } | { error: string }>;

/**
 * Only what the server can verify; order is position in the grid. Typed as
 * VehicleImageItem so this and the Zod schema cannot drift apart silently.
 */
function serialize(items: Item[]): string {
  const payload = items.flatMap<VehicleImageItem>((item) => {
    if (item.status === "saved" && item.id) {
      return [{ kind: "existing", id: item.id }];
    }
    if (
      item.status === "ready" &&
      item.publicId &&
      item.version !== undefined &&
      item.signature
    ) {
      return [
        {
          kind: "uploaded",
          publicId: item.publicId,
          version: item.version,
          signature: item.signature,
        },
      ];
    }
    return [];
  });
  return JSON.stringify(payload);
}

/**
 * Vehicle photo manager.
 *
 * Files go straight from the browser to Cloudinary with a signature minted
 * per batch — they never cross a Vercel function, which is both why uploads
 * of real phone photos work at all (the platform caps request bodies at
 * 4.5 MB) and why each tile can show its own progress. The form submits only
 * the ordered receipts, so add, remove and reorder all land together on save
 * and Cancel genuinely reverts.
 */
export function MediaGrid({
  name,
  existing = [],
  vehicleId,
  signUpload,
  onDirty,
}: {
  name: string;
  existing?: ExistingImage[];
  vehicleId?: string;
  signUpload: SignFn;
  onDirty?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const draftIdRef = useRef<string | null>(null);
  const [items, setItems] = useState<Item[]>(() =>
    existing.map((image) => ({
      key: image.id,
      previewUrl: image.url,
      status: "saved" as const,
      id: image.id,
    }))
  );
  const [dragging, setDragging] = useState(false);
  const [rejected, setRejected] = useState<string[]>([]);

  const sensors = useSensors(
    // A few pixels of slack, or the delete button never gets its click.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const patch = (key: string, next: Partial<Item>) =>
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...next } : item))
    );

  /** Generated on first use: a vehicle being created has no id to file under. */
  const target = () => {
    if (vehicleId) return { vehicleId };
    draftIdRef.current ??= crypto.randomUUID();
    return { draftId: draftIdRef.current };
  };

  const upload = async (staged: Item[]) => {
    const signed = await signUpload(target());
    if ("error" in signed) {
      staged.forEach((item) =>
        patch(item.key, { status: "error", message: signed.error })
      );
      return;
    }
    // One signature covers the batch: same folder, same transformation.
    await Promise.all(staged.map((item) => send(item, signed.signature)));
  };

  const send = (item: Item, signature: UploadSignature) =>
    new Promise<void>((resolve) => {
      const body = new FormData();
      body.append("file", item.file!);
      body.append("api_key", signature.apiKey);
      body.append("timestamp", String(signature.timestamp));
      body.append("signature", signature.signature);
      body.append("folder", signature.folder);
      body.append("transformation", signature.transformation);

      // XHR rather than fetch: fetch cannot report upload progress.
      const xhr = new XMLHttpRequest();
      xhr.open(
        "POST",
        `https://api.cloudinary.com/v1_1/${signature.cloudName}/image/upload`
      );

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        patch(item.key, {
          progress: Math.round((event.loaded / event.total) * 100),
        });
      };

      xhr.onload = () => {
        let result: CloudinaryUploadResponse | null = null;
        try {
          result = JSON.parse(xhr.responseText) as CloudinaryUploadResponse;
        } catch {
          /* fall through to the generic message below */
        }

        const ok =
          xhr.status >= 200 &&
          xhr.status < 300 &&
          result?.public_id &&
          result.version !== undefined &&
          result.signature;

        if (!ok) {
          // Cloudinary explains itself ("File size too large", "Invalid
          // signature"); a bare "Upload failed" is what made the old uploader
          // impossible to diagnose from the operator's side.
          patch(item.key, {
            status: "error",
            message: result?.error?.message ?? "Upload failed",
          });
          resolve();
          return;
        }

        patch(item.key, {
          status: "ready",
          publicId: result!.public_id,
          version: result!.version,
          signature: result!.signature,
          progress: 100,
        });
        resolve();
      };

      xhr.onerror = () => {
        patch(item.key, { status: "error", message: "Network error" });
        resolve();
      };

      xhr.send(body);
    });

  const accept = (list: FileList | null) => {
    if (!list) return;
    const bad: string[] = [];
    const staged: Item[] = [];
    const room = MAX_VEHICLE_IMAGES - items.length;

    Array.from(list).forEach((file) => {
      if (!ACCEPTED.includes(file.type)) {
        bad.push(`${file.name} — unsupported format`);
      } else if (file.size > MAX_BYTES) {
        bad.push(`${file.name} — over 10 MB`);
      } else if (staged.length >= room) {
        bad.push(`${file.name} — limit is ${MAX_VEHICLE_IMAGES} photos`);
      } else {
        staged.push({
          key: crypto.randomUUID(),
          previewUrl: URL.createObjectURL(file),
          status: "uploading",
          progress: 0,
          file,
        });
      }
    });

    setRejected(bad);
    if (staged.length === 0) return;

    setItems((current) => [...current, ...staged]);
    onDirty?.();
    void upload(staged);

    // Let the same file be picked again after a remove.
    if (inputRef.current) inputRef.current.value = "";
  };

  const remove = (key: string) => {
    setItems((current) => {
      const gone = current.find((item) => item.key === key);
      if (gone?.file) URL.revokeObjectURL(gone.previewUrl);
      return current.filter((item) => item.key !== key);
    });
    onDirty?.();
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setItems((current) => {
      const from = current.findIndex((item) => item.key === active.id);
      const to = current.findIndex((item) => item.key === over.id);
      return arrayMove(current, from, to);
    });
    onDirty?.();
  };

  const open = () => inputRef.current?.click();
  const uploading = items.filter((i) => i.status === "uploading").length;
  const full = items.length >= MAX_VEHICLE_IMAGES;

  return (
    <section className="bg-card rounded-xl border shadow-xs">
      <div className="flex items-center justify-between gap-3 border-b px-5 py-3">
        <h2 className="font-display flex items-center gap-2 text-sm font-bold">
          <ImagePlus className="text-brand h-4 w-4" />
          Media
        </h2>
        <p className="text-muted-foreground text-xs">
          {uploading > 0
            ? `Uploading ${uploading}…`
            : items.length === 0
              ? "None yet"
              : `${items.length} of ${MAX_VEHICLE_IMAGES} — drag to reorder, first is the cover`}
        </p>
      </div>

      <div
        className="p-5"
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
      >
        {items.length === 0 ? (
          <div
            role="button"
            tabIndex={0}
            onClick={open}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && open()}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors",
              dragging
                ? "border-brand bg-brand/[0.06]"
                : "border-input hover:border-brand/40 hover:bg-surface-hover"
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
              {dragging ? "Drop to upload" : "Drag photos here"}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              or click to browse — JPEG, PNG, WebP or AVIF, up to 10 MB each
            </p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
          >
            <SortableContext
              items={items.map((item) => item.key)}
              strategy={rectSortingStrategy}
            >
              <div
                className={cn(
                  "grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5",
                  dragging &&
                    "outline-brand rounded-xl outline-2 outline-dashed"
                )}
              >
                {items.map((item, index) => (
                  <Tile
                    key={item.key}
                    item={item}
                    cover={index === 0}
                    onRemove={() => remove(item.key)}
                  />
                ))}

                {!full && (
                  <button
                    type="button"
                    onClick={open}
                    aria-label="Add photos"
                    className="border-input text-muted-foreground hover:border-brand/50 hover:bg-surface-hover hover:text-brand flex aspect-square cursor-pointer items-center justify-center rounded-lg border-2 border-dashed transition-colors"
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                )}
              </div>
            </SortableContext>
          </DndContext>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED.join(",")}
          multiple
          className="hidden"
          onChange={(e) => accept(e.target.files)}
        />
        <input type="hidden" name={name} value={serialize(items)} />

        {rejected.length > 0 && (
          <ul role="alert" className="mt-3 space-y-1">
            {rejected.map((reason) => (
              <li key={reason} className="text-destructive text-xs">
                {reason}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function Tile({
  item,
  cover,
  onRemove,
}: {
  item: Item;
  cover: boolean;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.key });

  const failed = item.status === "error";

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "bg-media group relative overflow-hidden rounded-lg border",
        // The cover photo is what the fleet grid and search results show,
        // so it earns the space that makes it obviously different.
        cover ? "col-span-2 row-span-2 aspect-square" : "aspect-square",
        isDragging && "z-10 opacity-80 shadow-lg",
        failed && "border-destructive"
      )}
    >
      <Image
        src={item.previewUrl}
        alt=""
        fill
        sizes={cover ? "24rem" : "12rem"}
        unoptimized={item.status !== "saved"}
        className={cn(
          "object-cover transition-opacity",
          item.status === "uploading" && "opacity-50"
        )}
      />

      {/* Drag surface. Separate from the tile so the buttons stay clickable. */}
      <div
        {...attributes}
        {...listeners}
        aria-label="Reorder photo"
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
      />

      {cover && !failed && (
        <span className="pointer-events-none absolute top-2 left-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
          Cover
        </span>
      )}

      {item.status === "uploading" && (
        <div className="pointer-events-none absolute inset-x-2 bottom-2">
          <div className="h-1 overflow-hidden rounded-full bg-white/25">
            <div
              className="bg-brand h-full rounded-full transition-[width] duration-200"
              style={{ width: `${item.progress ?? 0}%` }}
            />
          </div>
        </div>
      )}

      {failed && (
        <div className="bg-destructive/85 pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-white">
          <AlertCircle className="h-3 w-3 shrink-0" />
          <span className="truncate">{item.message}</span>
        </div>
      )}

      <span className="pointer-events-none absolute top-2 right-9 text-white/70 opacity-0 transition-opacity group-hover:opacity-100">
        <GripVertical className="h-4 w-4" />
      </span>

      <button
        type="button"
        aria-label="Remove photo"
        onClick={onRemove}
        className="absolute top-2 right-2 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-black/70 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
