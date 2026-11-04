import dotenv from 'dotenv';
dotenv.config({ path: 'server/.env' });
const requireSecureEnv = (name, minimumLength, forbiddenValues = []) => {
    const value = process.env[name]?.trim();
    if (!value || value.length < minimumLength || forbiddenValues.includes(value)) {
        throw new Error(`${name} must be configured in server/.env with a secure value.`);
    }
    return value;
};
const jwtSecret = requireSecureEnv('JWT_SECRET', 32, [
    'your-super-secret-jwt-key-change-in-production',
    'replace-with-a-random-secret-at-least-32-characters',
]);
const jwtRefreshSecret = requireSecureEnv('JWT_REFRESH_SECRET', 32, [
    'your-super-secret-refresh-key-change-in-production',
    'replace-with-a-different-random-secret-at-least-32-characters',
]);
const adminPassword = requireSecureEnv('ADMIN_PASSWORD', 12, ['ChangeMe123!']);
if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}$/.test(adminPassword)) {
    throw new Error('ADMIN_PASSWORD must be at least 12 characters and include upper/lowercase letters, a number, and a symbol.');
}
export const env = {
    PORT: parseInt(process.env.PORT || '5000', 10),
    NODE_ENV: process.env.NODE_ENV || 'development',
    MONGODB_URI: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ardumul_am',
    JWT_SECRET: jwtSecret,
    JWT_EXPIRE: process.env.JWT_EXPIRE || '7d',
    JWT_REFRESH_SECRET: jwtRefreshSecret,
    JWT_REFRESH_EXPIRE: process.env.JWT_REFRESH_EXPIRE || '30d',
    FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
    ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'admin@ardumul.com',
    ADMIN_PASSWORD: adminPassword,
    ADMIN_NAME: process.env.ADMIN_NAME || 'Super Admin',
    ADMIN_NOTIFY_EMAIL: process.env.ADMIN_NOTIFY_EMAIL || process.env.ADMIN_EMAIL || 'admin@ardumul.com',
    SMTP_HOST: process.env.SMTP_HOST || '',
    SMTP_PORT: parseInt(process.env.SMTP_PORT || '587', 10),
    SMTP_SECURE: process.env.SMTP_SECURE === 'true',
    SMTP_USER: process.env.SMTP_USER || '',
    SMTP_PASS: process.env.SMTP_PASS || '',
    SMTP_FROM: process.env.SMTP_FROM || process.env.ADMIN_EMAIL || 'noreply@ardumul.com',
    UPLOAD_DIR: process.env.UPLOAD_DIR || 'server/uploads',
    MAX_UPLOAD_BYTES: parseInt(process.env.MAX_UPLOAD_BYTES || String(15 * 1024 * 1024), 10),
};
export default env;
