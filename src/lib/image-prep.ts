export type PreparedImage = { data: string; preview: string; name: string }

const MAX_SIDE = 1600
const MAX_INPUT_BYTES = 12 * 1024 * 1024

/**
 * Reduz a imagem no navegador antes do envio (o corpo das requisições na Vercel é limitado a 4,5 MB)
 * e a redesenha em um canvas, o que já descarta EXIF/GPS. O servidor repete o processo como garantia.
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!/^image\/(jpeg|png|webp|gif|heic|heif)$/i.test(file.type) && !/\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name)) {
    throw new Error("Escolha uma imagem (JPG, PNG ou WebP).")
  }
  if (file.size > MAX_INPUT_BYTES) throw new Error("Imagem grande demais (máximo de 12 MB).")

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" })
  } catch {
    throw new Error("Não foi possível ler essa imagem. Tente um JPG ou PNG.")
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext("2d")!
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const dataUrl = canvas.toDataURL("image/jpeg", 0.8)
  return { data: dataUrl.slice(dataUrl.indexOf(",") + 1), preview: dataUrl, name: file.name }
}
