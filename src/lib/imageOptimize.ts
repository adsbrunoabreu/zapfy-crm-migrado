/**
 * Redimensiona e comprime imagens no cliente antes do upload.
 * - Mantém proporção, escala para caber em maxDimension
 * - Converte para WebP (com fallback JPEG) com qualidade configurável
 * - Pula compressão se o arquivo já for menor que skipIfUnder
 */

export interface OptimizeOptions {
  maxDimension?: number; // px (default: 512)
  quality?: number; // 0..1 (default: 0.85)
  mimeType?: 'image/webp' | 'image/jpeg'; // default: webp
  skipIfUnder?: number; // bytes (default: 100 KB)
}

export interface OptimizeResult {
  file: File;
  originalBytes: number;
  finalBytes: number;
  width: number;
  height: number;
  skipped: boolean;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Falha ao gerar blob'))),
      type,
      quality
    );
  });
}

export async function optimizeAvatarImage(
  file: File,
  opts: OptimizeOptions = {}
): Promise<OptimizeResult> {
  const maxDimension = opts.maxDimension ?? 512;
  const quality = opts.quality ?? 0.85;
  const targetMime = opts.mimeType ?? 'image/webp';
  const skipIfUnder = opts.skipIfUnder ?? 100 * 1024;

  // GIFs (animação) não são processados — manter original
  if (file.type === 'image/gif') {
    return {
      file,
      originalBytes: file.size,
      finalBytes: file.size,
      width: 0,
      height: 0,
      skipped: true,
    };
  }

  const img = await loadImage(file);
  const { naturalWidth: w0, naturalHeight: h0 } = img;

  // Calcula novas dimensões respeitando proporção
  const scale = Math.min(1, maxDimension / Math.max(w0, h0));
  const w = Math.round(w0 * scale);
  const h = Math.round(h0 * scale);

  // Pula se já é pequeno o suficiente E não precisa de resize
  if (file.size <= skipIfUnder && scale === 1) {
    return {
      file,
      originalBytes: file.size,
      finalBytes: file.size,
      width: w0,
      height: h0,
      skipped: true,
    };
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D não disponível neste navegador');

  // Fundo branco para PNGs com transparência convertidos para JPEG
  if (targetMime === 'image/jpeg') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
  }

  // Melhor qualidade de redimensionamento
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);

  let blob: Blob;
  let finalMime = targetMime;
  try {
    blob = await canvasToBlob(canvas, targetMime, quality);
    // Alguns navegadores antigos retornam PNG quando o tipo não é suportado
    if (!blob.type.includes(targetMime.split('/')[1])) {
      finalMime = 'image/jpeg';
      blob = await canvasToBlob(canvas, 'image/jpeg', quality);
    }
  } catch {
    finalMime = 'image/jpeg';
    blob = await canvasToBlob(canvas, 'image/jpeg', quality);
  }

  // Se a otimização ficou maior que o original, manter o original
  if (blob.size >= file.size && scale === 1) {
    return {
      file,
      originalBytes: file.size,
      finalBytes: file.size,
      width: w0,
      height: h0,
      skipped: true,
    };
  }

  const ext = finalMime === 'image/webp' ? 'webp' : 'jpg';
  const baseName = file.name.replace(/\.[^.]+$/, '') || 'avatar';
  const optimizedFile = new File([blob], `${baseName}.${ext}`, {
    type: finalMime,
    lastModified: Date.now(),
  });

  return {
    file: optimizedFile,
    originalBytes: file.size,
    finalBytes: optimizedFile.size,
    width: w,
    height: h,
    skipped: false,
  };
}
