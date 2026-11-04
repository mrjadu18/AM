import mongoose, { Schema, Document } from 'mongoose';

export type PasswordResetStatus = 'Pending' | 'Approved' | 'Rejected' | 'Completed' | 'Expired';

export interface IPasswordResetRequest extends Document {
  requestId: string;
  identifier: string;
  userId?: mongoose.Types.ObjectId;
  employeeName?: string;
  username?: string;
  email?: string;
  status: PasswordResetStatus;
  requestType: 'employee_assistance' | 'admin_initiated';
  tokenHash?: string;
  tokenExpiresAt?: Date;
  tokenUsedAt?: Date;
  reviewedBy?: mongoose.Types.ObjectId;
  reviewedByName?: string;
  reviewedAt?: Date;
  reviewNotes?: string;
  adminEmailAttempt?: {
    attempted: boolean;
    delivered: boolean;
    error?: string;
  };
  employeeEmailAttempt?: {
    attempted: boolean;
    delivered: boolean;
    error?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const PasswordResetRequestSchema = new Schema<IPasswordResetRequest>(
  {
    requestId: { type: String, required: true, unique: true, trim: true },
    identifier: { type: String, required: true, trim: true, lowercase: true },
    userId: { type: Schema.Types.ObjectId, ref: 'Admin' },
    employeeName: { type: String, trim: true },
    username: { type: String, trim: true, lowercase: true },
    email: { type: String, trim: true, lowercase: true },
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected', 'Completed', 'Expired'],
      default: 'Pending',
    },
    requestType: {
      type: String,
      enum: ['employee_assistance', 'admin_initiated'],
      default: 'employee_assistance',
    },
    tokenHash: { type: String, select: false },
    tokenExpiresAt: { type: Date },
    tokenUsedAt: { type: Date },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
    reviewedByName: { type: String, trim: true },
    reviewedAt: { type: Date },
    reviewNotes: { type: String, trim: true },
    adminEmailAttempt: {
      attempted: { type: Boolean, default: false },
      delivered: { type: Boolean, default: false },
      error: { type: String },
    },
    employeeEmailAttempt: {
      attempted: { type: Boolean, default: false },
      delivered: { type: Boolean, default: false },
      error: { type: String },
    },
  },
  { timestamps: true }
);

PasswordResetRequestSchema.index({ status: 1, createdAt: -1 });
PasswordResetRequestSchema.index({ userId: 1 });
PasswordResetRequestSchema.index({ identifier: 1, createdAt: -1 });

export default mongoose.model<IPasswordResetRequest>('PasswordResetRequest', PasswordResetRequestSchema);
