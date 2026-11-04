import mongoose, { Schema } from 'mongoose';
const NotificationSchema = new Schema({
    id: {
        type: String,
        required: true,
        unique: true,
    },
    title: {
        type: String,
        required: [true, 'Title is required'],
        trim: true,
    },
    message: {
        type: String,
        required: [true, 'Message is required'],
        trim: true,
    },
    type: {
        type: String,
        enum: ['info', 'success', 'warning', 'error'],
        default: 'info',
    },
    isRead: {
        type: Boolean,
        default: false,
    },
    adminId: {
        type: Schema.Types.ObjectId,
        ref: 'Admin',
    },
    link: {
        type: String,
        trim: true,
    },
    metadata: {
        type: Schema.Types.Mixed,
    },
}, {
    timestamps: true,
});
NotificationSchema.index({ adminId: 1, isRead: 1 });
NotificationSchema.index({ createdAt: -1 });
export default mongoose.model('Notification', NotificationSchema);
