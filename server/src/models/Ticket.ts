import mongoose, { Schema, Document } from 'mongoose';

export type TicketType = 'Requirement Request' | 'Resource Request' | 'Technical Support' | 'Task Blocker';
export type TicketCategory = 'Technical' | 'Finance' | 'Seller' | 'Customer' | 'Requirement' | 'Resource' | 'Other';
export type TicketPriority = 'Low' | 'Medium' | 'High' | 'Urgent';
export type TicketStatus =
  | 'Open'
  | 'In Progress'
  | 'Under Review'
  | 'Additional Info Required'
  | 'Approved'
  | 'Rejected'
  | 'Resolved'
  | 'Closed';

export interface ITicketComment {
  id: string;
  text: string;
  author: string;
  authorId?: mongoose.Types.ObjectId;
  isInternal?: boolean;
  createdAt: Date;
}

export interface IResourceDetails {
  resourceType: 'Software' | 'Hardware' | 'Cloud/Hosting' | 'API Credits' | 'Database' | 'Access/License' | 'Budget' | 'Team Member' | 'Training' | 'Other';
  resourceName: string;
  businessJustification?: string;
  quantity?: number;
  estimatedCost?: number;
  currency?: string;
  requiredBy?: Date;
  allocationStatus?: 'Unallocated' | 'Allocated' | 'Fulfilled' | 'Cancelled';
  allocatedDetails?: string;
  fulfilledAt?: Date;
  decisionNotes?: string;
  decisionBy?: mongoose.Types.ObjectId;
  decisionByName?: string;
  decisionDate?: Date;
}

export interface ITicket extends Document {
  id: string;
  title: string;
  ticketType: TicketType;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  description?: string;
  reason?: string;
  expectedOutcome?: string;
  assigned: string;
  assignedId?: mongoose.Types.ObjectId;
  requesterId?: mongoose.Types.ObjectId;
  requesterName?: string;
  relatedTaskId?: mongoose.Types.ObjectId;
  relatedTaskCode?: string;
  resourceDetails?: IResourceDetails;
  comments: ITicketComment[];
  resolutionNotes?: string;
  resolvedAt?: Date;
  resolvedBy?: mongoose.Types.ObjectId;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const TicketCommentSchema = new Schema<ITicketComment>(
  {
    id: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
    text: { type: String, required: true },
    author: { type: String, required: true },
    authorId: { type: Schema.Types.ObjectId, ref: 'Admin' },
    isInternal: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const ResourceDetailsSchema = new Schema<IResourceDetails>(
  {
    resourceType: {
      type: String,
      enum: ['Software', 'Hardware', 'Cloud/Hosting', 'API Credits', 'Database', 'Access/License', 'Budget', 'Team Member', 'Training', 'Other'],
      default: 'Software',
    },
    resourceName: { type: String, trim: true },
    businessJustification: { type: String, trim: true },
    quantity: { type: Number, default: 1 },
    estimatedCost: { type: Number, default: 0 },
    currency: { type: String, default: 'INR' },
    requiredBy: { type: Date },
    allocationStatus: {
      type: String,
      enum: ['Unallocated', 'Allocated', 'Fulfilled', 'Cancelled'],
      default: 'Unallocated',
    },
    allocatedDetails: { type: String, trim: true },
    fulfilledAt: { type: Date },
    decisionNotes: { type: String, trim: true },
    decisionBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
    decisionByName: { type: String, trim: true },
    decisionDate: { type: Date },
  },
  { _id: false }
);

const TicketSchema = new Schema<ITicket>(
  {
    id: {
      type: String,
      required: true,
      unique: true,
    },
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
    },
    ticketType: {
      type: String,
      enum: ['Requirement Request', 'Resource Request', 'Technical Support', 'Task Blocker'],
      default: 'Technical Support',
    },
    category: {
      type: String,
      enum: ['Technical', 'Finance', 'Seller', 'Customer', 'Requirement', 'Resource', 'Other'],
      required: [true, 'Category is required'],
      default: 'Technical',
    },
    priority: {
      type: String,
      enum: ['Low', 'Medium', 'High', 'Urgent'],
      default: 'Medium',
    },
    status: {
      type: String,
      enum: [
        'Open',
        'In Progress',
        'Under Review',
        'Additional Info Required',
        'Approved',
        'Rejected',
        'Resolved',
        'Closed',
      ],
      default: 'Open',
    },
    assigned: {
      type: String,
      required: [true, 'Assigned to is required'],
      trim: true,
      default: 'Unassigned',
    },
    assignedId: {
      type: Schema.Types.ObjectId,
      ref: 'Admin',
    },
    requesterId: {
      type: Schema.Types.ObjectId,
      ref: 'Admin',
    },
    requesterName: {
      type: String,
      trim: true,
    },
    relatedTaskId: {
      type: Schema.Types.ObjectId,
      ref: 'Task',
    },
    relatedTaskCode: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    reason: {
      type: String,
      trim: true,
    },
    expectedOutcome: {
      type: String,
      trim: true,
    },
    resourceDetails: {
      type: ResourceDetailsSchema,
    },
    comments: {
      type: [TicketCommentSchema],
      default: [],
    },
    resolutionNotes: {
      type: String,
      trim: true,
    },
    resolvedAt: { type: Date },
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
    createdBy: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

TicketSchema.index({ status: 1 });
TicketSchema.index({ priority: 1 });
TicketSchema.index({ ticketType: 1 });
TicketSchema.index({ category: 1 });
TicketSchema.index({ requesterId: 1 });
TicketSchema.index({ assignedId: 1 });
TicketSchema.index({ createdAt: -1 });

export default mongoose.model<ITicket>('Ticket', TicketSchema);
