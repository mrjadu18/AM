import mongoose, { Schema, Document } from 'mongoose';

export type ApprovalType = 'Resource Request' | 'Task Completion' | 'Requirement Clarification' | 'Role Escalation';
export type ApprovalStatus = 'Pending' | 'Approved' | 'Rejected' | 'Needs Information';

export interface IApproval extends Document {
  approvalId: string;
  approvalType: ApprovalType;
  title: string;
  description?: string;
  referenceModel: 'Ticket' | 'Task' | 'Admin';
  referenceId: mongoose.Types.ObjectId;
  referenceCode?: string;
  requesterId: mongoose.Types.ObjectId;
  requesterName: string;
  assignedReviewerId?: mongoose.Types.ObjectId;
  status: ApprovalStatus;
  decisionBy?: mongoose.Types.ObjectId;
  decisionByName?: string;
  decisionNotes?: string;
  decidedAt?: Date;
  metadata?: any;
  createdAt: Date;
  updatedAt: Date;
}

const ApprovalSchema = new Schema<IApproval>(
  {
    approvalId: {
      type: String,
      required: true,
      unique: true,
    },
    approvalType: {
      type: String,
      enum: ['Resource Request', 'Task Completion', 'Requirement Clarification', 'Role Escalation'],
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    referenceModel: {
      type: String,
      enum: ['Ticket', 'Task', 'Admin'],
      required: true,
    },
    referenceId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    referenceCode: {
      type: String,
      trim: true,
    },
    requesterId: {
      type: Schema.Types.ObjectId,
      ref: 'Admin',
      required: true,
    },
    requesterName: {
      type: String,
      required: true,
      trim: true,
    },
    assignedReviewerId: {
      type: Schema.Types.ObjectId,
      ref: 'Admin',
    },
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected', 'Needs Information'],
      default: 'Pending',
    },
    decisionBy: {
      type: Schema.Types.ObjectId,
      ref: 'Admin',
    },
    decisionByName: {
      type: String,
      trim: true,
    },
    decisionNotes: {
      type: String,
      trim: true,
    },
    decidedAt: {
      type: Date,
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

ApprovalSchema.index({ status: 1 });
ApprovalSchema.index({ approvalType: 1 });
ApprovalSchema.index({ requesterId: 1 });
ApprovalSchema.index({ referenceId: 1 });
ApprovalSchema.index({ createdAt: -1 });

export default mongoose.model<IApproval>('Approval', ApprovalSchema);
