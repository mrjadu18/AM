import mongoose, { Schema, Document } from 'mongoose';

export interface IAuditLog extends Document {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  adminId?: mongoose.Types.ObjectId;
  adminName?: string;
  details?: any;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    id: {
      type: String,
      required: true,
      unique: true,
    },
    action: {
      type: String,
      required: [true, 'Action is required'],
      trim: true,
    },
    entity: {
      type: String,
      required: [true, 'Entity is required'],
      trim: true,
    },
    entityId: {
      type: String,
      required: [true, 'Entity ID is required'],
      trim: true,
    },
    adminId: {
      type: Schema.Types.ObjectId,
      ref: 'Admin',
    },
    adminName: {
      type: String,
      trim: true,
    },
    details: {
      type: Schema.Types.Mixed,
    },
    ipAddress: {
      type: String,
      trim: true,
    },
    userAgent: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

AuditLogSchema.index({ entity: 1 });
AuditLogSchema.index({ adminId: 1 });
AuditLogSchema.index({ createdAt: -1 });

export default mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
