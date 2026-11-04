import mongoose, { Schema, Document } from 'mongoose';

export type FileOwnerType = 'task' | 'ticket' | 'product' | 'owned-product' | 'progress' | 'resource';
export type FileKind = 'employee' | 'admin' | 'additional' | 'solution' | 'reference' | 'evidence' | 'photo' | 'guide';

export interface IFileAsset extends Document {
  fileId: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  size: number;
  ownerType: FileOwnerType;
  ownerId: string;
  kind: FileKind;
  description?: string;
  uploadedBy: mongoose.Types.ObjectId;
  uploadedByName?: string;
  createdAt: Date;
  updatedAt: Date;
}

const FileAssetSchema = new Schema<IFileAsset>(
  {
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
  },
  { timestamps: true }
);

FileAssetSchema.index({ ownerType: 1, ownerId: 1 });

export default mongoose.model<IFileAsset>('FileAsset', FileAssetSchema);
