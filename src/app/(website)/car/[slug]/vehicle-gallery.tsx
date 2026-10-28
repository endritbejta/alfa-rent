"use client";

import { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/shared/locale-provider";

type GalleryImage = { id: string; url: string };

/**
 * The detail page's centrepiece. Thumbnails used to be decorative tiles a
 * customer could not open; they now choose the main photo. The first photo
 * is the page's largest element, so it loads eagerly at high priority; the
 * rest stay lazy until picked.
 */
export function VehicleGallery({
  images,
  name,
  badge,
}: {
  images: GalleryImage[];
  name: string;
  badge?: React.ReactNode;
}) {
  const { t } = useI18n();
  const [index, setIndex] = useState(0);
  const current = images[index];

  return (
    <div>
      <div className="bg-media relative aspect-[16/10] overflow-hidden">
        {current ? (
          <Image
            key={current.id}
            src={current.url}
            alt={
              images.length > 1
                ? `${name} — ${t("detail.photo", { index: index + 1, count: images.length })}`
                : name
            }
            fill
            loading={index === 0 ? "eager" : undefined}
            fetchPriority={index === 0 ? "high" : undefined}
            sizes="(max-width: 1024px) 100vw, 60vw"
            className="animate-in fade-in object-cover duration-300 motion-reduce:animate-none"
          />
        ) : (
          <span className="text-media-foreground absolute inset-0 flex items-center justify-center px-6 text-center text-sm tracking-[0.16em] uppercase">
            {name}
          </span>
        )}
        {badge && <span className="absolute top-4 left-4">{badge}</span>}
      </div>

      {images.length > 1 && (
        <div
          className="mt-3 grid grid-cols-4 gap-3 sm:grid-cols-5"
          role="group"
          aria-label={t("detail.photos")}
        >
          {images.slice(0, 5).map((image, i) => (
            <button
              key={image.id}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={t("detail.photo", {
                index: i + 1,
                count: images.length,
              })}
              aria-pressed={i === index}
              className={cn(
                "bg-media ring-offset-background focus-visible:ring-ring relative aspect-[16/10] overflow-hidden ring-offset-2 transition-[box-shadow,opacity] duration-[var(--motion-hover)] focus-visible:ring-2 focus-visible:outline-none",
                i === index
                  ? "ring-foreground ring-2"
                  : "opacity-70 hover:opacity-100"
              )}
            >
              <Image
                src={image.url}
                alt=""
                fill
                sizes="12vw"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
