import mongoose, { Schema } from 'mongoose';
const FileAssetSchema = new Schema({
    fileId: { type: String, required: true, unique: true, trim: true },
    originalName: { type: String, required: true, trim: true },
    storedName: { type: String, required: true, trim: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    ownerType: {
        type: String,
        enum: ['task', 'ticket', 'product', 'owned-product', 'progress', 'resource'],
        required: true,
    },
    ownerId: { type: String, required: true, trim: true },
    kind: {
        type: String,
        enum: ['employee', 'admin', 'additional', 'solution', 'reference', 'evidence', 'photo', 'guide'],
        default: 'reference',
    },
    description: { type: String, trim: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'Admin', required: true },
    uploadedByName: { type: String, trim: true },
}, { timestamps: true });
FileAssetSchema.index({ ownerType: 1, ownerId: 1 });
export default mongoose.model('FileAsset', FileAssetSchema);
