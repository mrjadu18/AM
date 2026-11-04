import mongoose, { Schema, Document } from 'mongoose';

export interface IPlatformSettings extends Document {
  storeName: string;
  supportEmail: string;
  commission: number;
  currency: string;
  marketplace: boolean;
  sellerRegistration: boolean;
  productApproval: boolean;
  customerReviews: boolean;
  gst: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const PlatformSettingsSchema = new Schema<IPlatformSettings>(
  {
    storeName: {
      type: String,
      default: 'ARDUMUL',
      trim: true,
    },
    supportEmail: {
      type: String,
      default: 'support@ardumul.com',
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },
    commission: {
      type: Number,
      default: 15,
      min: 0,
      max: 100,
    },
    currency: {
      type: String,
      default: 'INR',
      enum: ['INR', 'USD', 'EUR'],
    },
    marketplace: {
      type: Boolean,
      default: true,
    },
    sellerRegistration: {
      type: Boolean,
      default: true,
    },
    productApproval: {
      type: Boolean,
      default: true,
    },
    customerReviews: {
      type: Boolean,
      default: true,
    },
    gst: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IPlatformSettings>('PlatformSettings', PlatformSettingsSchema);
