import JSZip from 'jszip';

export type ValidatedUpload = {
  mimeType: string;
  extension: string;
};

const EXTENSION_BY_MIME: Record<string, string[]> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/gif': ['gif'],
  'image/webp': ['webp'],
  'application/pdf': ['pdf'],
  'application/msword': ['doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'],
  'text/plain': ['txt'],
  'text/csv': ['csv'],
};

function extensionOf(filename: string): string {
  return filename.toLowerCase().split('.').at(-1) ?? '';
}

function startsWith(buffer: Buffer, signature: number[]): boolean {
  return buffer.length >= signature.length && signature.every((byte, index) => buffer[index] === byte);
}

function looksLikeSafeText(buffer: Buffer): boolean {
  if (buffer.length === 0 || buffer.includes(0)) return false;
  const sample = buffer.subarray(0, Math.min(buffer.length, 8192));
  let controls = 0;
  for (const byte of sample) {
    if (byte < 0x20 && ![0x09, 0x0a, 0x0d].includes(byte)) controls++;
  }
  return controls / sample.length < 0.01;
}

async function sniffMime(buffer: Buffer, extension: string): Promise<string | null> {
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (buffer.length >= 6 && ['GIF87a', 'GIF89a'].includes(buffer.toString('ascii', 0, 6))) return 'image/gif';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (buffer.length >= 5 && buffer.toString('ascii', 0, 5) === '%PDF-') return 'application/pdf';
  if (startsWith(buffer, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]) && extension === 'doc') {
    return 'application/msword';
  }
  if (startsWith(buffer, [0x50, 0x4b, 0x03, 0x04]) && (extension === 'docx' || extension === 'xlsx')) {
    try {
      const zip = await JSZip.loadAsync(buffer);
      if (extension === 'docx' && zip.file('word/document.xml')) {
        return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      }
      if (extension === 'xlsx' && zip.file('xl/workbook.xml')) {
        return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      }
    } catch {
      return null;
    }
  }
  if ((extension === 'txt' || extension === 'csv') && looksLikeSafeText(buffer)) {
    return extension === 'csv' ? 'text/csv' : 'text/plain';
  }
  return null;
}

export async function validateUploadBytes(
  buffer: Buffer,
  filename: string,
  options: { allowedMimeTypes?: string[] } = {}
): Promise<ValidatedUpload | null> {
  const extension = extensionOf(filename);
  const mimeType = await sniffMime(buffer, extension);
  if (!mimeType) return null;
  if (options.allowedMimeTypes && !options.allowedMimeTypes.includes(mimeType)) return null;
  if (!EXTENSION_BY_MIME[mimeType]?.includes(extension)) return null;
  return { mimeType, extension };
}
