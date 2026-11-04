import mongoose, { Schema } from 'mongoose';
const PlatformSettingsSchema = new Schema({
    storeName: {
        type: String,
        default: 'ARDUMUL',
        trim: true,
    },
    supportEmail: {
        type: String,
        default: 'support@ardumul.com',
        trim: true,
        match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },
    commission: {
        type: Number,
        default: 15,
        min: 0,
        max: 100,
    },
    currency: {
        type: String,
        default: 'INR',
        enum: ['INR', 'USD', 'EUR'],
    },
    marketplace: {
        type: Boolean,
        default: true,
    },
    sellerRegistration: {
        type: Boolean,
        default: true,
    },
    productApproval: {
        type: Boolean,
        default: true,
    },
    customerReviews: {
        type: Boolean,
        default: true,
    },
    gst: {
        type: Boolean,
        default: true,
    },
}, {
    timestamps: true,
});
export default mongoose.model('PlatformSettings', PlatformSettingsSchema);
