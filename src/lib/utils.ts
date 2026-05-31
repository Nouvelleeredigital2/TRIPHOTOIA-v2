import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

const HASH_CHUNK_SIZE = 1024 * 1024; // 1 MB

export async function calculateFileHash(file: File): Promise<string> {
  try {
    const chunks: ArrayBuffer[] = [];

    if (file.size <= 2 * HASH_CHUNK_SIZE) {
      chunks.push(await file.arrayBuffer());
    } else {
      chunks.push(await file.slice(0, HASH_CHUNK_SIZE).arrayBuffer());
      chunks.push(await file.slice(file.size - HASH_CHUNK_SIZE).arrayBuffer());
    }

    // Append file size as 8-byte big-endian so files with identical content
    // but different sizes produce different hashes (edge-case guard).
    const sizeView = new DataView(new ArrayBuffer(8));
    sizeView.setBigUint64(0, BigInt(file.size), false);
    chunks.push(sizeView.buffer);

    const totalBytes = chunks.reduce((acc, c) => acc + c.byteLength, 0);
    const combined = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(new Uint8Array(chunk), offset);
      offset += chunk.byteLength;
    }

    const hashBuffer = await crypto.subtle.digest('SHA-256', combined);
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  } catch (error) {
    console.error('Error calculating file hash:', error);
    return '';
  }
}
