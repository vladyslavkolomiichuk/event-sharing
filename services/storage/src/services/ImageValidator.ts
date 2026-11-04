import sharp from 'sharp';
import { env } from '../config/env.js';
import { StorageError } from '../domain/StorageError.js';

const formats = {
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'image/webp': 'webp',
} as const;
export type ImageMimeType = keyof typeof formats;

function matchesSignature(data: Buffer, mimeType: string): boolean {
  if (mimeType === 'image/png')
    return data
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mimeType === 'image/jpeg')
    return (
      data.length >= 3 &&
      data[0] === 0xff &&
      data[1] === 0xd8 &&
      data[2] === 0xff
    );
  if (mimeType === 'image/webp')
    return (
      data.length >= 12 &&
      data.toString('ascii', 0, 4) === 'RIFF' &&
      data.toString('ascii', 8, 12) === 'WEBP'
    );
  return false;
}

export class ImageValidator {
  async normalize(data: Buffer, mimeType: string): Promise<Buffer> {
    if (!Object.hasOwn(formats, mimeType))
      throw new StorageError(
        'Use a PNG, JPEG, or WebP image.',
        'INVALID_FILE_TYPE',
        415,
      );
    const format = formats[mimeType as ImageMimeType];
    try {
      if (!matchesSignature(data, mimeType))
        throw new Error('Invalid signature');
      const image = sharp(data, {
        failOn: 'warning',
        limitInputPixels: 16000000,
      });
      const info = await image.metadata();
      if (info.format !== format || (info.pages ?? 1) > 1)
        throw new Error('Invalid image');
      const clean = await image.rotate().toFormat(format).toBuffer();
      if (clean.length > env.STORAGE_MAX_FILE_BYTES)
        throw new StorageError(
          'The processed image is too large.',
          'FILE_TOO_LARGE',
          413,
        );
      return clean;
    } catch (error) {
      if (error instanceof StorageError) throw error;
      throw new StorageError(
        'The file is not a valid image of the declared type.',
        'INVALID_IMAGE',
        422,
      );
    }
  }
}
