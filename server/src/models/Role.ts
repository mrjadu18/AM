import mongoose, { Schema, Document } from 'mongoose';

export interface IRole extends Document {
  id: string;
  name: string;
  description?: string;
  department?: string;
  users: number;
  access: string;
  permissions: string[];
  status: 'Active' | 'Inactive';
  isSystem: boolean;
  createdBy?: mongoose.Types.ObjectId | string;
  updatedBy?: mongoose.Types.ObjectId | string;
  createdAt: Date;
  updatedAt: Date;
}

const RoleSchema = new Schema<IRole>(
  {
    id: {
      type: String,
      required: true,
      unique: true,
    },
    name: {
      type: String,
      required: [true, 'Role name is required'],
      trim: true,
      unique: true,
    },
    description: {
      type: String,
      trim: true,
    },
    department: {
      type: String,
      trim: true,
    },
    users: {
      type: Number,
      default: 0,
      min: 0,
    },
    access: {
      type: String,
      default: 'Custom Access',
      trim: true,
    },
    permissions: [{
      type: String,
    }],
    status: {
      type: String,
      enum: ['Active', 'Inactive'],
      default: 'Active',
    },
    isSystem: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: Schema.Types.Mixed,
    },
    updatedBy: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

RoleSchema.index({ status: 1 });

export default mongoose.model<IRole>('Role', RoleSchema);
