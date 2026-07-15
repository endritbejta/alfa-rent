import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/** All app assets live under one root folder in the Cloudinary media library. */
const ROOT_FOLDER = "alfa-rent-a-car";

export type UploadedImage = {
  url: string;
  publicId: string;
};

/**
 * Server-side signed upload — no unsigned upload preset exposed to the
 * client. Images are keyed under alfa-rent-a-car/vehicles/<vehicleId>/ so
 * a vehicle's assets can be listed and cleaned up as a unit.
 */
export async function uploadVehicleImage(
  file: File,
  vehicleId: string
): Promise<UploadedImage> {
  const buffer = Buffer.from(await file.arrayBuffer());

  const result = await new Promise<{ secure_url: string; public_id: string }>(
    (resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            folder: `${ROOT_FOLDER}/vehicles/${vehicleId}`,
            resource_type: "image",
            // Normalize huge uploads at the edge instead of shipping
            // originals to every visitor.
            transformation: [{ width: 1920, height: 1080, crop: "limit" }],
          },
          (error, uploadResult) => {
            if (error || !uploadResult) {
              reject(error ?? new Error("Cloudinary returned no result"));
              return;
            }
            resolve(uploadResult);
          }
        )
        .end(buffer);
    }
  );

  return { url: result.secure_url, publicId: result.public_id };
}

export async function deleteImage(publicId: string): Promise<void> {
  await cloudinary.uploader.destroy(publicId);
}
