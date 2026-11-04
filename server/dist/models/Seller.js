import mongoose, { Schema } from 'mongoose';
const SellerSchema = new Schema({
    id: {
        type: String,
        required: true,
        unique: true,
    },
    name: {
        type: String,
        required: [true, 'Business name is required'],
        trim: true,
    },
    owner: {
        type: String,
        required: [true, 'Owner name is required'],
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
    category: {
        type: String,
        required: [true, 'Category is required'],
        trim: true,
    },
    status: {
        type: String,
        enum: ['Pending', 'Active', 'Blocked'],
        default: 'Pending',
    },
    phone: {
        type: String,
        trim: true,
    },
    address: {
        type: String,
        trim: true,
    },
    commissionRate: {
        type: Number,
        default: 15,
        min: 0,
        max: 100,
    },
    totalRevenue: {
        type: Number,
        default: 0,
    },
    totalOrders: {
        type: Number,
        default: 0,
    },
}, {
    timestamps: true,
});
SellerSchema.index({ status: 1 });
export default mongoose.model('Seller', SellerSchema);
