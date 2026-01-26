import exifr from 'exifr';

/**
 * Strip EXIF data from an image file, preserving only essential metadata if needed
 * Returns a new Blob with scrubbed data
 */
export async function scrubImageExif(file: File): Promise<Blob> {
  // Read the file as array buffer
  const arrayBuffer = await file.arrayBuffer();
  
  // Parse EXIF to check if it exists
  const exifData = await exifr.parse(arrayBuffer, {
    pick: ['GPSLatitude', 'GPSLongitude'], // Only check for GPS, we'll remove it
  });

  // If no EXIF, return original file as blob
  if (!exifData) {
    return new Blob([arrayBuffer], { type: file.type });
  }

  // For images with EXIF, we need to strip it
  // Using canvas to re-encode without EXIF
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }
      
      ctx.drawImage(img, 0, 0);
      
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to create blob'));
          }
        },
        file.type || 'image/jpeg',
        0.92 // Quality
      );
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    
    img.src = url;
  });
}

/**
 * Check if a file is a video (basic check)
 */
export function isVideoFile(file: File): boolean {
  return file.type.startsWith('video/');
}

/**
 * For videos, we can't easily strip metadata client-side
 * Return the file as-is but note that server-side processing may be needed
 */
export async function scrubVideoMetadata(file: File): Promise<Blob> {
  // For now, return as-is
  // In production, you might want to use FFmpeg.wasm or process on server
  return file;
}

/**
 * Main scrubbing function - routes to appropriate handler
 */
export async function scrubMediaFile(file: File): Promise<Blob> {
  if (isVideoFile(file)) {
    return scrubVideoMetadata(file);
  } else {
    return scrubImageExif(file);
  }
}
