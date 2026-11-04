import mongoose, { Schema } from 'mongoose';
const CustomerSchema = new Schema({
    id: {
        type: String,
        required: true,
        unique: true,
    },
    name: {
        type: String,
        required: [true, 'Customer name is required'],
        trim: true,
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        lowercase: true,
        trim: true,
        match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },
    phone: {
        type: String,
        trim: true,
    },
    orders: {
        type: Number,
        default: 0,
        min: 0,
    },
    spent: {
        type: Number,
        default: 0,
        min: 0,
    },
    status: {
        type: String,
        enum: ['Active', 'Inactive'],
        default: 'Active',
    },
}, {
    timestamps: true,
});
CustomerSchema.index({ status: 1 });
export default mongoose.model('Customer', CustomerSchema);
