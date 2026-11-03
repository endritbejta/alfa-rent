import { describe, expect, it } from "vitest";
import cloudinaryLoader, {
  cloudinaryPlaceholder,
  placeholderStyle,
} from "@/lib/cloudinary/image-loader";

const DELIVERED =
  "https://res.cloudinary.com/demo-cloud/image/upload/v1712345678/alfa-rent-a-car/vehicles/abc/photo.jpg";

describe("the next/image loader", () => {
  it("asks Cloudinary for the width the browser wants", () => {
    expect(cloudinaryLoader({ src: DELIVERED, width: 640 })).toBe(
      "https://res.cloudinary.com/demo-cloud/image/upload/f_auto,q_auto,c_limit,w_640/v1712345678/alfa-rent-a-car/vehicles/abc/photo.jpg"
    );
  });

  it("passes an explicit quality through", () => {
    expect(
      cloudinaryLoader({ src: DELIVERED, width: 256, quality: 70 })
    ).toContain("q_70,c_limit,w_256/");
  });

  it("keeps the version and public id after the transforms", () => {
    const url = cloudinaryLoader({ src: DELIVERED, width: 128 });
    expect(url).toContain(
      "/v1712345678/alfa-rent-a-car/vehicles/abc/photo.jpg"
    );
    // One transform segment, not two — the loader must not stack on itself.
    expect(url.match(/f_auto/g)).toHaveLength(1);
  });

  /**
   * The loader is global once configured, so everything next/image renders
   * comes through here — including the brand logo, which is a local file.
   */
  it("leaves anything that is not a Cloudinary delivery URL alone", () => {
    for (const src of [
      "/brand/alfa-logo-red.png",
      "blob:http://localhost:3000/1234-5678",
      "data:image/png;base64,iVBORw0KGgo=",
      "https://example.test/photo.jpg",
      // Right host, but not a delivery URL.
      "https://res.cloudinary.com/demo-cloud/video/upload/v1/clip.mp4",
    ]) {
      expect(cloudinaryLoader({ src, width: 640 })).toBe(src);
    }
  });
});

describe("the blurred placeholder", () => {
  it("asks Cloudinary for a tiny blurred render of the same photo", () => {
    expect(cloudinaryPlaceholder(DELIVERED)).toBe(
      "https://res.cloudinary.com/demo-cloud/image/upload/c_limit,w_32,e_blur:400,q_auto:low,f_auto/v1712345678/alfa-rent-a-car/vehicles/abc/photo.jpg"
    );
  });

  /**
   * No photo, a local file or anything not delivered by Cloudinary keeps the
   * frame's plain colour — never a broken background request.
   */
  it("leaves anything else alone", () => {
    for (const src of [
      null,
      undefined,
      "/brand/alfa-logo-red.png",
      "https://example.test/photo.jpg",
      "https://res.cloudinary.com/demo-cloud/video/upload/v1/clip.mp4",
    ]) {
      expect(cloudinaryPlaceholder(src)).toBeNull();
      expect(placeholderStyle(src)).toBeUndefined();
    }
  });

  it("paints it as a covering background", () => {
    expect(placeholderStyle(DELIVERED)).toEqual({
      backgroundImage: `url("${cloudinaryPlaceholder(DELIVERED)}")`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    });
  });
});
