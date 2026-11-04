import mongoose, { Schema } from 'mongoose';
const TransactionSchema = new Schema({
    id: {
        type: String,
        required: true,
        unique: true,
    },
    order: {
        type: String,
        required: [true, 'Order is required'],
        trim: true,
    },
    orderId: {
        type: Schema.Types.ObjectId,
        ref: 'Order',
    },
    seller: {
        type: String,
        required: [true, 'Seller is required'],
        trim: true,
    },
    sellerId: {
        type: Schema.Types.ObjectId,
        ref: 'Seller',
    },
    amount: {
        type: Number,
        required: [true, 'Amount is required'],
        min: [0, 'Amount cannot be negative'],
    },
    commission: {
        type: Number,
        required: [true, 'Commission is required'],
        min: [0, 'Commission cannot be negative'],
        default: 0,
    },
    net: {
        type: Number,
        required: [true, 'Net amount is required'],
        min: [0, 'Net amount cannot be negative'],
    },
    status: {
        type: String,
        enum: ['Pending', 'Settled'],
        default: 'Pending',
    },
    settlementDate: {
        type: Date,
    },
}, {
    timestamps: true,
});
TransactionSchema.index({ seller: 1 });
TransactionSchema.index({ status: 1 });
TransactionSchema.index({ createdAt: -1 });
export default mongoose.model('Transaction', TransactionSchema);
