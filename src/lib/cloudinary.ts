const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

export async function convertToWebP(file: File, maxWidth = 400, quality = 0.82): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Conversión fallida"));
        },
        "image/webp",
        quality
      );
    };
    img.onerror = () => reject(new Error("No se pudo cargar la imagen"));
    img.src = objectUrl;
  });
}

export async function uploadToCloudinary(blob: Blob, folder = "duqp1lxvk"): Promise<string> {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new Error("Cloudinary no está configurado (variables de entorno faltantes)");
  }
  const fd = new FormData();
  fd.append("file", blob, "foto.webp");
  fd.append("upload_preset", UPLOAD_PRESET);
  fd.append("folder", folder);
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
    { method: "POST", body: fd }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? "Error al subir la imagen");
  return data.secure_url as string;
}
