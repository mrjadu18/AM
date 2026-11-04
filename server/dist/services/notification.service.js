import Notification from '../models/Notification.js';
export const sendNotification = async (data) => {
    try {
        const count = await Notification.countDocuments();
        const id = `NTF-${String(count + 1).padStart(3, '0')}`;
        await Notification.create({
            id,
            adminId: data.adminId,
            title: data.title,
            message: data.message,
            type: data.type || 'info',
            link: data.link,
            metadata: data.metadata,
            isRead: false,
        });
    }
    catch (err) {
        console.error('Failed to create notification:', err);
    }
};
