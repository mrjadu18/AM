import AuditLog from '../models/AuditLog.js';
export const createAuditLog = async (data) => {
    try {
        const count = await AuditLog.countDocuments();
        const id = `AUD-${String(count + 1).padStart(3, '0')}`;
        await AuditLog.create({
            id,
            ...data,
        });
    }
    catch (error) {
        console.error('Error creating audit log:', error);
    }
};
