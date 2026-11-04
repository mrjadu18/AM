import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
const ALLOWED_EXTENSIONS = new Set([
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.png', '.jpg', '.jpeg', '.webp', '.zip',
]);
const ALLOWED_MIME = new Set([
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/zip',
    'application/x-zip-compressed',
]);
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);
export function getUploadRoot() {
    return path.resolve(process.cwd(), env.UPLOAD_DIR);
}
export function ensureUploadRoot() {
    const root = getUploadRoot();
    if (!fs.existsSync(root)) {
        fs.mkdirSync(root, { recursive: true });
    }
}
export function validateUpload(file, kind = 'document') {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (kind === 'image') {
        if (!IMAGE_EXTENSIONS.has(ext) || !IMAGE_MIME.has(file.mimetype)) {
            throw new ApiError(400, 'Only JPG, JPEG, PNG and WebP images are allowed');
        }
    }
    else if (!ALLOWED_EXTENSIONS.has(ext) || !ALLOWED_MIME.has(file.mimetype)) {
        throw new ApiError(400, `File type not allowed: ${ext || file.mimetype}`);
    }
    if (file.size > env.MAX_UPLOAD_BYTES) {
        throw new ApiError(413, `File exceeds the ${Math.round(env.MAX_UPLOAD_BYTES / (1024 * 1024))}MB limit`);
    }
}
export function persistUpload(file) {
    ensureUploadRoot();
    const ext = path.extname(file.originalname || '').toLowerCase() || '.bin';
    const storedName = `${Date.now()}-${crypto.randomBytes(12).toString('hex')}${ext}`;
    const absolutePath = path.join(getUploadRoot(), storedName);
    fs.writeFileSync(absolutePath, file.buffer);
    return { storedName, absolutePath };
}
export function resolveStoredFile(storedName) {
    const root = getUploadRoot();
    const absolutePath = path.join(root, path.basename(storedName));
    if (!absolutePath.startsWith(root)) {
        throw new ApiError(400, 'Invalid file path');
    }
    if (!fs.existsSync(absolutePath)) {
        throw new ApiError(404, 'File not found on storage');
    }
    return absolutePath;
}
export function removeStoredFile(storedName) {
    try {
        const absolutePath = resolveStoredFile(storedName);
        fs.unlinkSync(absolutePath);
    }
    catch {
        // Best-effort cleanup
    }
}
