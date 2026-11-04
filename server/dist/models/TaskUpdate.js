import mongoose, { Schema } from 'mongoose';
const TaskUpdateSchema = new Schema({
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
}, {
    timestamps: true,
});
TaskUpdateSchema.index({ taskId: 1, createdAt: -1 });
TaskUpdateSchema.index({ employeeId: 1 });
TaskUpdateSchema.index({ updateType: 1 });
export default mongoose.model('TaskUpdate', TaskUpdateSchema);
