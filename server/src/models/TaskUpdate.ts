import mongoose, { Schema, Document } from 'mongoose';

export type TaskUpdateType = 'Daily' | 'Milestone' | 'Weekly' | 'On-Demand' | 'Blocker' | 'Submission' | 'Review-Feedback';

export interface ITaskUpdate extends Document {
  updateId: string;
  taskId: mongoose.Types.ObjectId;
  taskCode: string; // TSK-001
  employeeId: mongoose.Types.ObjectId;
  employeeName: string;
  updateType: TaskUpdateType;
  progressPercentage: number;
  workCompleted: string;
  workRemaining?: string;
  currentBlockers?: string;
  nextSteps?: string;
  attachments?: { name: string; url: string }[];
  managerFeedback?: string;
  acknowledgedBy?: mongoose.Types.ObjectId;
  acknowledgedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const TaskUpdateSchema = new Schema<ITaskUpdate>(
  {
    updateId: {
      type: String,
      required: true,
      unique: true,
    },
    taskId: {
      type: Schema.Types.ObjectId,
      ref: 'Task',
      required: true,
    },
    taskCode: {
      type: String,
      required: true,
      trim: true,
    },
    employeeId: {
      type: Schema.Types.ObjectId,
      ref: 'Admin',
      required: true,
    },
    employeeName: {
      type: String,
      required: true,
      trim: true,
    },
    updateType: {
      type: String,
      enum: ['Daily', 'Milestone', 'Weekly', 'On-Demand', 'Blocker', 'Submission', 'Review-Feedback'],
      default: 'On-Demand',
    },
    progressPercentage: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    workCompleted: {
      type: String,
      required: [true, 'Work completed summary is required'],
      trim: true,
    },
    workRemaining: {
      type: String,
      trim: true,
    },
    currentBlockers: {
      type: String,
      trim: true,
    },
    nextSteps: {
      type: String,
      trim: true,
    },
    attachments: [{
      name: String,
      url: String,
    }],
    managerFeedback: {
      type: String,
      trim: true,
    },
    acknowledgedBy: {
      type: Schema.Types.ObjectId,
      ref: 'Admin',
    },
    acknowledgedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

TaskUpdateSchema.index({ taskId: 1, createdAt: -1 });
TaskUpdateSchema.index({ employeeId: 1 });
TaskUpdateSchema.index({ updateType: 1 });

export default mongoose.model<ITaskUpdate>('TaskUpdate', TaskUpdateSchema);
