import mongoose, { Schema } from 'mongoose';
const AdminSchema = new Schema({
    fullName: {
        type: String,
        required: [true, 'Full name is required'],
        trim: true,
    },
    username: {
        type: String,
        trim: true,
        lowercase: true,
        sparse: true,
        unique: true,
        minlength: [2, 'Username must be at least 2 characters'],
        match: [
            /^[a-z0-9._-]+$/,
            'Username can only contain lowercase letters, numbers, dots, underscores and hyphens',
        ],
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        lowercase: true,
        trim: true,
        match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },
    mobileNumber: {
        type: String,
        trim: true,
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: [6, 'Password must be at least 6 characters'],
        select: false,
    },
    role: {
        type: String,
        default: 'Admin',
        trim: true,
    },
    roleId: {
        type: Schema.Types.ObjectId,
        ref: 'Role',
    },
    department: {
        type: String,
        trim: true,
        default: 'Engineering',
    },
    jobTitle: {
        type: String,
        trim: true,
        default: 'Team Member',
    },
    designation: {
        type: String,
        trim: true,
    },
    reportingManager: {
        type: String,
        trim: true,
    },
    location: {
        type: String,
        trim: true,
    },
    bio: {
        type: String,
        trim: true,
    },
    employeeId: {
        type: String,
        trim: true,
    },
    employeeSerial: { type: String, trim: true, sparse: true, unique: true },
    adminMessage: {
        type: String,
        trim: true,
    },
    permissionGrants: {
        type: [String],
        default: [],
    },
    permissionDenials: {
        type: [String],
        default: [],
    },
    isActive: {
        type: Boolean,
        default: true,
    },
    status: {
        type: String,
        enum: ['Active', 'Inactive', 'Suspended'],
        default: 'Active',
    },
    mustChangePassword: {
        type: Boolean,
        default: false,
    },
    createdBy: {
        type: Schema.Types.Mixed,
    },
    tokenVersion: {
        type: Number,
        default: 0,
    },
    lastLogin: {
        type: Date,
    },
    deletedAt: {
        type: Date,
        default: null,
    },
    deletedBy: {
        type: Schema.Types.Mixed,
    },
    deletionState: {
        type: String,
        enum: ['none', 'permanent'],
        default: 'none',
    },
}, {
    timestamps: true,
});
AdminSchema.index({ status: 1 });
AdminSchema.index({ role: 1 });
AdminSchema.index({ deletedAt: 1 });
AdminSchema.index({ deletionState: 1 });
// username unique sparse index is defined inline above
export default mongoose.model('Admin', AdminSchema);
