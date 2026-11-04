import multer from 'multer';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.MAX_UPLOAD_BYTES,
    files: 12,
  },
});

export function handleMulterError(err: unknown): never {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      throw new ApiError(413, 'Uploaded file is too large');
    }
    throw new ApiError(400, err.message);
  }
  throw err as Error;
}
