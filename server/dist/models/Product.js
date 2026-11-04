import mongoose, { Schema } from 'mongoose';
const ProductSchema = new Schema({
    id: {
        type: String,
        required: true,
        unique: true,
    },
    name: {
        type: String,
        required: [true, 'Product name is required'],
        trim: true,
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
    category: {
        type: String,
        required: [true, 'Category is required'],
        trim: true,
    },
    price: {
        type: Number,
        required: [true, 'Price is required'],
        min: [0, 'Price cannot be negative'],
    },
    stock: {
        type: Number,
        required: [true, 'Stock is required'],
        min: [0, 'Stock cannot be negative'],
        default: 0,
    },
    status: {
        type: String,
        enum: ['Draft', 'Pending', 'Published', 'Unpublished'],
        default: 'Draft',
    },
    description: {
        type: String,
        trim: true,
    },
    images: [{
            type: String,
        }],
    serialNumber: { type: String, required: [true, 'Serial number is required'], trim: true, unique: true },
    sku: { type: String, required: [true, 'SKU is required'], trim: true, uppercase: true, unique: true },
    imageAssetIds: { type: [String], default: [] },
    installationGuideAssetId: { type: String, trim: true },
    isOwned: {
        type: Boolean,
        default: false,
    },
    totalSales: {
        type: Number,
        default: 0,
    },
    totalRevenue: {
        type: Number,
        default: 0,
    },
}, {
    timestamps: true,
});
ProductSchema.index({ seller: 1 });
ProductSchema.index({ status: 1 });
ProductSchema.index({ category: 1 });
ProductSchema.index({ isOwned: 1 });
export default mongoose.model('Product', ProductSchema);
