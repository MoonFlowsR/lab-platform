const LIMIT = 100_000;
export async function compressUploadPhoto(file) {
  if (!/\.(png|jpe?g)$/i.test(file.name) || file.size <= LIMIT) return file;
  let image;
  try { image = await createImageBitmap(file); }
  catch { throw new Error('照片无法读取，请选择有效的 PNG、JPG/JPEG 图片。'); }
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('浏览器无法压缩照片，请更换浏览器后重试。');
    let scale = Math.min(1, 2560 / Math.max(image.width, image.height));
    for (let attempt = 0; attempt < 12; attempt++, scale *= 0.8) {
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      // Prefer preserving dimensions and moderate quality before reducing resolution further.
      for (const quality of [0.86, 0.76, 0.66, 0.56]) {
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
        if (!blob) throw new Error('照片压缩失败，请重新选择照片。');
        if (blob.size <= LIMIT) return new File([blob], file.name.replace(/\.(png|jpe?g)$/i, '.jpg'), { type: 'image/jpeg', lastModified: file.lastModified });
      }
    }
    throw new Error('照片未能压缩到 100 KB 以内，请重新选择照片。');
  } finally { image.close(); }
}
