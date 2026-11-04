import mongoose, { Schema, Document } from 'mongoose';

export type TaskPriority = 'Low' | 'Medium' | 'High' | 'Urgent';
export type TaskStatus =
  | 'Draft'
  | 'Assigned'
  | 'Acknowledged'
  | 'In Progress'
  | 'On Hold'
  | 'Blocked'
  | 'Submitted for Review'
  | 'Revision Requested'
  | 'Approved'
  | 'Completed';

export interface ITaskMilestone {
  title: string;
  completed: boolean;
  dueDate?: Date;
  completedAt?: Date;
}

export interface ITaskAttachment {
  name: string;
  url: string;
  size?: number;
  uploadedAt: Date;
}

export interface ITask extends Document {
  taskId: string;
  title: string;
  description: string;
  instructions?: string;
  project?: string;
  assignedTo: mongoose.Types.ObjectId[];
  assignedToNames?: string[];
  ownerId?: mongoose.Types.ObjectId;
  ownerName?: string;
  reviewers: mongoose.Types.ObjectId[];
  createdBy: mongoose.Types.ObjectId;
  createdByName?: string;
  priority: TaskPriority;
  status: TaskStatus;
  startDate?: Date;
  dueDate?: Date;
  estimatedHours?: number;
  actualHours?: number;
  progress: number;
  milestones: ITaskMilestone[];
  attachments: ITaskAttachment[];
  tags: string[];
  relatedTickets: string[];
  completionEvidence?: string;
  reviewFeedback?: string;
  acknowledgedAt?: Date;
  submittedAt?: Date;
  approvedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const TaskMilestoneSchema = new Schema<ITaskMilestone>(
  {
    title: { type: String, required: true, trim: true },
    completed: { type: Boolean, default: false },
    dueDate: { type: Date },
    completedAt: { type: Date },
  },
  { _id: false }
);

const TaskAttachmentSchema = new Schema<ITaskAttachment>(
  {
    name: { type: String, required: true },
    url: { type: String, required: true },
    size: { type: Number },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const TaskSchema = new Schema<ITask>(
  {
    taskId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    title: {
      type: String,
      required: [true, 'Task title is required'],
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'Task description is required'],
      trim: true,
    },
    instructions: {
      type: String,
      trim: true,
    },
    project: {
      type: String,
      trim: true,
      default: 'General Operations',
    },
    assignedTo: [{
      type: Schema.Types.ObjectId,
      ref: 'Admin',
    }],
    assignedToNames: [{
      type: String,
      trim: true,
    }],
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: 'Admin',
    },
    ownerName: {
      type: String,
      trim: true,
    },
    reviewers: [{
      type: Schema.Types.ObjectId,
      ref: 'Admin',
    }],
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'Admin',
      required: true,
    },
    createdByName: {
      type: String,
      trim: true,
    },
    priority: {
      type: String,
      enum: ['Low', 'Medium', 'High', 'Urgent'],
      default: 'Medium',
    },
    status: {
      type: String,
      enum: [
        'Draft',
        'Assigned',
        'Acknowledged',
        'In Progress',
        'On Hold',
        'Blocked',
        'Submitted for Review',
        'Revision Requested',
        'Approved',
        'Completed',
      ],
      default: 'Assigned',
    },
    startDate: {
      type: Date,
    },
    dueDate: {
      type: Date,
    },
    estimatedHours: {
      type: Number,
      default: 0,
    },
    actualHours: {
      type: Number,
      default: 0,
    },
    progress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    milestones: {
      type: [TaskMilestoneSchema],
      default: [],
    },
    attachments: {
      type: [TaskAttachmentSchema],
      default: [],
    },
    tags: [{
      type: String,
      trim: true,
    }],
    relatedTickets: [{
      type: String,
      trim: true,
    }],
    completionEvidence: {
      type: String,
      trim: true,
    },
    reviewFeedback: {
      type: String,
      trim: true,
    },
    acknowledgedAt: { type: Date },
    submittedAt: { type: Date },
    approvedAt: { type: Date },
    completedAt: { type: Date },
  },
  {
    timestamps: true,
  }
);

TaskSchema.index({ assignedTo: 1 });
TaskSchema.index({ status: 1 });
TaskSchema.index({ priority: 1 });
TaskSchema.index({ dueDate: 1 });
TaskSchema.index({ createdAt: -1 });

export default mongoose.model<ITask>('Task', TaskSchema);
