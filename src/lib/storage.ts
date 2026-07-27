import { supabase } from '@/integrations/supabase/client';

const SIGNED_URL_EXPIRY = 3600; // 1 hour

/**
 * Extracts the storage path from a full Supabase storage URL.
 * Handles both full URLs and plain paths.
 */
export function extractStoragePath(url: string, bucket: string): string | null {
  if (!url) return null;
  
  // If it's already a plain path (no http), return as-is
  if (!url.startsWith('http')) return url;
  
  // Extract path from full URL pattern: .../storage/v1/object/public/bucket-name/path
  const publicPattern = `/storage/v1/object/public/${bucket}/`;
  const idx = url.indexOf(publicPattern);
  if (idx !== -1) {
    let path = url.substring(idx + publicPattern.length);
    // Remove query params (e.g., ?t=timestamp)
    const qIdx = path.indexOf('?');
    if (qIdx !== -1) path = path.substring(0, qIdx);
    return decodeURIComponent(path);
  }
  
  return null;
}

/**
 * Creates a signed URL from a stored media URL or path.
 * Returns the original URL if it can't be converted (e.g., external URL).
 */
export async function getSignedMediaUrl(
  storedUrl: string | null | undefined,
  bucket: string = 'lead-attachments'
): Promise<string | null> {
  if (!storedUrl) return null;

  const path = extractStoragePath(storedUrl, bucket);
  if (!path) {
    // External URL or unrecognized format - return as-is
    return storedUrl;
  }

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_EXPIRY);

  if (error || !data?.signedUrl) {
    console.error('Error creating signed URL:', error);
    return null;
  }

  return data.signedUrl;
}

/**
 * Batch create signed URLs for multiple media URLs.
 */
export async function getSignedMediaUrls(
  items: { url: string | null | undefined; bucket?: string }[]
): Promise<(string | null)[]> {
  return Promise.all(
    items.map(item => getSignedMediaUrl(item.url, item.bucket || 'lead-attachments'))
  );
}
