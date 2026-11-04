import mongoose, { Schema, Document } from 'mongoose';

export interface IOrder extends Document {
  id: string;
  product: string;
  productId?: mongoose.Types.ObjectId;
  customer: string;
  customerId?: mongoose.Types.ObjectId;
  seller: string;
  sellerId?: mongoose.Types.ObjectId;
  amount: number;
  payment: 'Paid' | 'Pending' | 'Failed';
  status: 'Pending' | 'Processing' | 'Completed';
  shippingAddress?: string;
  phone?: string;
  createdAt: Date;
  updatedAt: Date;
}

const OrderSchema = new Schema<IOrder>(
  {
    id: {
      type: String,
      required: true,
      unique: true,
    },
    product: {
      type: String,
      required: [true, 'Product is required'],
      trim: true,
    },
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
    },
    customer: {
      type: String,
      required: [true, 'Customer is required'],
      trim: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'Customer',
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
    payment: {
      type: String,
      enum: ['Paid', 'Pending', 'Failed'],
      default: 'Pending',
    },
    status: {
      type: String,
      enum: ['Pending', 'Processing', 'Completed'],
      default: 'Pending',
    },
    shippingAddress: {
      type: String,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

OrderSchema.index({ status: 1 });
OrderSchema.index({ payment: 1 });
OrderSchema.index({ customer: 1 });
OrderSchema.index({ seller: 1 });
OrderSchema.index({ createdAt: -1 });

export default mongoose.model<IOrder>('Order', OrderSchema);
