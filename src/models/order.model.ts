import mongoose, { Document, Schema } from "mongoose";

/**
 * Order status enum
 */
export enum OrderStatus {
  CREATED = "CREATED",
  PENDING = "PENDING",
  CONFIRMED = "CONFIRMED",
  PROCESSING = "PROCESSING",
  SHIPPING = "SHIPPING",
  DELIVERED = "DELIVERED",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
  REFUNDED = "REFUNDED",
}

/**
 * Event types for order history
 */
export enum OrderEventType {
  CREATED = "CREATED",
  STATUS_CHANGE = "STATUS_CHANGE",
  NOTE_ADDED = "NOTE_ADDED",
  STAFF_NOTE_ADDED = "STAFF_NOTE_ADDED",
  CUSTOMER_NOTIFIED = "CUSTOMER_NOTIFIED",
  PAYMENT_RECEIVED = "PAYMENT_RECEIVED",
  PAYMENT_FAILED = "PAYMENT_FAILED",
  SHIPPING_UPDATED = "SHIPPING_UPDATED",
  OTHER = "OTHER",
}

/**
 * Order history event interface
 */
export interface IOrderEvent {
  type: OrderEventType;
  timestamp: Date;
  description: string;
  changedBy?: string; // User ID or system ID
  metadata?: Record<string, any>; // Additional event data
}

/**
 * Order item interface
 */
export interface IOrderItem {
  productId: mongoose.Types.ObjectId; // Reference to the product
  name: string; // Product name at time of order
  price: number; // Price at time of order
  quantity: number;
  discount: number; // Per-item discount amount
  imageUrl?: string; // Product image at time of order
  notes?: string; // Special instructions for this item
}

/**
 * Customer information interface
 */
export interface ICustomer {
  email: string;
  name: string;
  phone?: string;
  userId?: mongoose.Types.ObjectId; // Reference to user when available
}

/**
 * Shipping information interface
 */
export interface IShippingInfo {
  name: string; // Recipient name
  phone: string; // Recipient phone number
  address: string;
  city: string;
  state?: string;
  zipCode: string;
  country: string;
  trackingNumber?: string;
  shippingMethod?: string;
  estimatedDelivery?: Date;
}

/**
 * Order interface
 */
export interface IOrder {
  orderNumber: string; // Unique human-readable order number
  password: string; // New field for order access
  customer: ICustomer;
  items: IOrderItem[];
  shipping: IShippingInfo;
  status: OrderStatus;
  subtotal: number; // Sum of all items * quantity before discounts
  itemDiscountTotal: number; // Sum of all per-item discounts
  orderDiscount: number; // Discount applied to entire order
  shippingCost: number;
  tax: number;
  total: number; // Final amount after all discounts and additions
  notes?: string; // General order notes visible to customer
  staffNotes?: string; // Internal notes for staff only
  history: IOrderEvent[]; // Order history/audit trail
  estimatedDelivery?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Order document interface
 */
export interface IOrderDocument extends IOrder, Document {
  _id: mongoose.Types.ObjectId;
}

/**
 * Schema for order history events
 */
const orderEventSchema = new Schema<IOrderEvent>({
  type: {
    type: String,
    enum: Object.values(OrderEventType),
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
  description: {
    type: String,
    required: true,
  },
  changedBy: {
    type: String,
    default: "system",
  },
  metadata: {
    type: Schema.Types.Mixed,
    default: {},
  },
});

/**
 * Schema for order items
 */
const orderItemSchema = new Schema<IOrderItem>({
  productId: {
    type: Schema.Types.ObjectId,
    ref: "Product",
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  price: {
    type: Number,
    required: true,
    min: 0,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  discount: {
    type: Number,
    default: 0,
    min: 0,
  },
  imageUrl: {
    type: String,
  },
  notes: {
    type: String,
  },
});

/**
 * Schema for customer information
 */
const customerSchema = new Schema<ICustomer>({
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  phone: {
    type: String,
    trim: true,
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
  },
});

/**
 * Schema for shipping information
 */
const shippingInfoSchema = new Schema<IShippingInfo>({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  phone: {
    type: String,
    required: true,
    trim: true,
  },
  address: {
    type: String,
    required: true,
    trim: true,
  },
  city: {
    type: String,
    required: true,
    trim: true,
  },
  state: {
    type: String,
    trim: true,
  },
  zipCode: {
    type: String,
    required: true,
    trim: true,
  },
  country: {
    type: String,
    required: true,
    trim: true,
  },
  trackingNumber: {
    type: String,
    trim: true,
  },
  shippingMethod: {
    type: String,
    trim: true,
  },
  estimatedDelivery: {
    type: Date,
  },
});

/**
 * Main Order schema
 */
const orderSchema = new Schema<IOrderDocument>(
  {
    orderNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    password: {
      type: String,
      required: true, // Make it required
      select: false, // Don't include it in query results by default
    },
    customer: {
      type: customerSchema,
      required: true,
    },
    items: {
      type: [orderItemSchema],
      required: true,
      validate: {
        validator: function (items: IOrderItem[]) {
          return items.length > 0;
        },
        message: "An order must have at least one item",
      },
    },
    shipping: {
      type: shippingInfoSchema,
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(OrderStatus),
      default: OrderStatus.CREATED,
      required: true,
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
    itemDiscountTotal: {
      type: Number,
      default: 0,
      min: 0,
    },
    orderDiscount: {
      type: Number,
      default: 0,
      min: 0,
    },
    shippingCost: {
      type: Number,
      default: 0,
      min: 0,
    },
    tax: {
      type: Number,
      default: 0,
      min: 0,
    },
    total: {
      type: Number,
      required: true,
      min: 0,
    },
    notes: {
      type: String,
    },
    staffNotes: {
      type: String,
    },
    history: {
      type: [orderEventSchema],
      default: [],
    },
    estimatedDelivery: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Pre-save hook to validate total amount and automatically add the initial history entry
orderSchema.pre<IOrderDocument>("save", function (next) {
  // Add initial history event for new orders
  if (this.isNew) {
    this.history.push({
      type: OrderEventType.CREATED,
      timestamp: new Date(),
      description: `Order created with status ${this.status}`,
      changedBy: "system",
    });
  }

  // Validate that total equals calculated sum
  const calculatedTotal =
    this.subtotal -
    this.itemDiscountTotal -
    this.orderDiscount +
    this.shippingCost +
    this.tax;

  // Allow for small floating point differences (0.01)
  if (Math.abs(this.total - calculatedTotal) > 0.01) {
    return next(new Error("Order total doesn't match the calculated amount"));
  }

  next();
});

// Create indexes for better query performance
orderSchema.index({ "customer.email": 1 });
orderSchema.index({ "customer.userId": 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ createdAt: 1 });

export const Order = mongoose.model<IOrderDocument>("Order", orderSchema);
