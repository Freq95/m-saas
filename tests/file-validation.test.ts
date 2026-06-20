import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { validateUploadBytes } from '@/lib/file-validation';

describe('upload byte validation', () => {
  it('accepts matching PDF bytes and extension', async () => {
    const result = await validateUploadBytes(Buffer.from('%PDF-1.7\n%test'), 'document.pdf');
    expect(result?.mimeType).toBe('application/pdf');
  });

  it('rejects a spoofed image and arbitrary octet-stream content', async () => {
    await expect(validateUploadBytes(Buffer.from('<script>alert(1)</script>'), 'scan.png')).resolves.toBeNull();
    await expect(validateUploadBytes(Buffer.from([0, 1, 2, 3]), 'payload.bin')).resolves.toBeNull();
  });

  it('requires the detected type to match the extension', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    await expect(validateUploadBytes(png, 'renamed.pdf')).resolves.toBeNull();
  });

  it('recognizes the internal structure of OOXML files', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', '<w:document/>');
    const docx = await zip.generateAsync({ type: 'nodebuffer' });
    const result = await validateUploadBytes(docx, 'plan.docx');
    expect(result?.mimeType).toContain('wordprocessingml.document');
  });
});
