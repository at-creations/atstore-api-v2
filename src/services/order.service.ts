import {
  Order,
  IOrder,
  OrderStatus,
  OrderEventType,
  IOrderItem,
  IShippingInfo,
} from "../models/order.model";
import { Product } from "../models/product.model";
import { DbService } from "./db.service";
import { ProductService } from "./product.service";
import {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
} from "../middleware/error.middleware";
import {
  generateOrderNumber,
  generateOrderPassword,
} from "../utils/order.utils";
import { OrderEmailService } from "./order-email.service";

export class OrderService {
  /**
   * Create a new order
   * @param orderData Order data
   * @returns Created order
   */
  public static async createOrder(orderData: any): Promise<any> {
    return await DbService.executeDbOperation(async () => {
      // Generate unique order number
      const orderNumber = await generateOrderNumber();

      // Generate a secure password for this order
      const password = generateOrderPassword();

      // Prepare order data
      const orderToCreate: Partial<IOrder> = {
        ...orderData,
        orderNumber,
        password, // Add the generated password
      };

      // Set default status if not provided (staff users can override this)
      if (!orderToCreate.status) {
        orderToCreate.status = OrderStatus.CREATED;
      }

      // Initialize totals if not provided
      if (!orderToCreate.subtotal) {
        orderToCreate.subtotal = 0;
      }
      if (!orderToCreate.itemDiscountTotal) {
        orderToCreate.itemDiscountTotal = 0;
      }

      // Fetch real-time product data for each item
      const enhancedItems: IOrderItem[] = [];
      let calculatedSubtotal = 0;
      let calculatedItemDiscountTotal = 0;

      for (const item of orderData.items) {
        const product = await Product.findById(item.productId).lean();
        if (!product) {
          throw new NotFoundError(
            `Product with ID ${item.productId} not found`
          );
        }

        // Use product's current name and price if not specified
        const enhancedItem: IOrderItem = {
          ...item,
          name: item.name || product.name,
          price: item.price !== undefined ? item.price : product.price,
          imageUrl: item.imageUrl || product.thumbnail || undefined,
        };

        // Calculate item totals
        const itemTotal = enhancedItem.price * enhancedItem.quantity;
        calculatedSubtotal += itemTotal;
        calculatedItemDiscountTotal += enhancedItem.discount || 0;

        enhancedItems.push(enhancedItem);

        // Update product stock
        await ProductService.updateProductStock(
          product._id.toString(),
          -enhancedItem.quantity
        );
      }

      // Update calculated totals
      orderToCreate.items = enhancedItems;
      orderToCreate.subtotal = calculatedSubtotal;
      orderToCreate.itemDiscountTotal = calculatedItemDiscountTotal;

      // Calculate final total if not provided
      if (!orderToCreate.total) {
        orderToCreate.total =
          calculatedSubtotal -
          calculatedItemDiscountTotal -
          (orderToCreate.orderDiscount || 0) +
          (orderToCreate.shippingCost || 0) +
          (orderToCreate.tax || 0);
      }

      // Check if history events were added (e.g., by staff creating the order)
      // The normal CREATED event will still be added by the pre-save hook
      const existingHistory = Array.isArray(orderToCreate.history)
        ? orderToCreate.history
        : [];

      // Create and save the order
      const order = new Order({
        ...orderToCreate,
        history: existingHistory, // Include any history events added by controller
      });

      // The initial CREATED event will be added by the pre-save hook
      await order.save();

      // Send order confirmation email
      try {
        // Include the password in the confirmation email
        await OrderEmailService.sendOrderConfirmationEmail(order);

        // Add event to order history for email sent
        order.history.push({
          type: OrderEventType.CUSTOMER_NOTIFIED,
          timestamp: new Date(),
          description: "Order confirmation email sent to customer",
          changedBy: "system",
        });

        await order.save();
      } catch (error) {
        console.error("Failed to send order confirmation email:", error);
      }

      // Get a copy of the order that includes the password for the response
      const orderResponse = order.toObject();

      return orderResponse;
    });
  }

  // Add a new method to verify order password
  /**
   * Verify order password
   * @param orderNumber Order number
   * @param password Password to verify
   * @returns Order if password is correct, null otherwise
   */
  public static async verifyOrderPassword(
    orderNumber: string,
    password: string
  ): Promise<any> {
    return await DbService.executeDbOperation(async () => {
      // Fetch order with password field included
      const order = await Order.findOne({ orderNumber })
        .select("+password")
        .lean();

      if (!order) {
        return null;
      }

      // Compare passwords
      if (order.password !== password) {
        throw new ForbiddenError("Invalid order password");
      }

      // Remove password before returning
      const { password: _, ...orderWithoutPassword } = order;

      return orderWithoutPassword;
    });
  }

  /**
   * Get order by ID
   * @param id Order ID
   * @returns Order document
   */
  public static async getOrderById(id: string): Promise<any> {
    if (!DbService.isValidObjectId(id)) {
      throw new BadRequestError("Invalid order ID");
    }

    return await DbService.executeDbOperation(async () => {
      const order = await Order.findById(id).select("+password").lean();

      if (!order) {
        throw new NotFoundError("Order not found");
      }

      return order;
    });
  }

  /**
   * Get order by order number
   * @param orderNumber Order number
   * @returns Order document
   */
  public static async getOrderByNumber(orderNumber: string): Promise<any> {
    return await DbService.executeDbOperation(async () => {
      const order = await Order.findOne({ orderNumber })
        .select("+password")
        .lean();

      if (!order) {
        throw new NotFoundError("Order not found");
      }

      return order;
    });
  }

  /**
   * Get orders by customer email
   * @param email Customer email
   * @param limit Maximum number of orders to return
   * @param page Page number
   * @returns Orders and total count
   */
  public static async getOrdersByEmail(
    email: string,
    limit: number = 10,
    page: number = 1
  ): Promise<{ orders: any[]; totalCount: number }> {
    return await DbService.executeDbOperation(async () => {
      const skip = (page - 1) * limit;

      const orders = await Order.find({ "customer.email": email })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      const totalCount = await Order.countDocuments({
        "customer.email": email,
      });

      return { orders, totalCount };
    });
  }

  /**
   * Update order status and add to history
   * @param id Order ID
   * @param status New status
   * @param note Optional note about status change
   * @param changedBy Who made the change
   * @returns Updated order
   */
  public static async updateOrderStatus(
    id: string,
    status: OrderStatus,
    description?: string,
    changedBy: string = "system"
  ): Promise<any> {
    if (!DbService.isValidObjectId(id)) {
      throw new BadRequestError("Invalid order ID");
    }

    return await DbService.executeDbOperation(async () => {
      const order = await Order.findById(id);

      if (!order) {
        throw new NotFoundError("Order not found");
      }

      // Validate status change
      if (order.status === status) {
        throw new BadRequestError("Order status is already set to this value");
      }

      if (order.status === OrderStatus.CANCELLED) {
        throw new BadRequestError("Cannot change status of a cancelled order");
      }

      // Save previous status for email notification
      const previousStatus = order.status;

      const eventDescription = description
        ? `Order status changed from ${order.status} to ${status}. ${description}`
        : `Order status changed from ${order.status} to ${status}`;

      // Create history event for status change
      const statusEvent = {
        type: OrderEventType.STATUS_CHANGE,
        timestamp: new Date(),
        description: eventDescription,
        changedBy,
        metadata: {
          previousStatus: order.status,
          newStatus: status,
        },
      };

      // Add status change event
      order.history.push(statusEvent);

      // Update status
      order.status = status;

      // Save order with updated status
      await order.save();

      // Send status update email
      try {
        await OrderEmailService.sendOrderStatusUpdateEmail(
          order,
          previousStatus
        );

        // Add event to order history for email sent
        order.history.push({
          type: OrderEventType.CUSTOMER_NOTIFIED,
          timestamp: new Date(),
          description: "Order status update email sent to customer",
          changedBy: "system",
        });

        await order.save();
      } catch (error) {
        console.error("Failed to send order status update email:", error);
      }

      return order;
    });
  }

  /**
   * Add note to order history
   * @param id Order ID
   * @param note Note text
   * @param changedBy Who added the note
   * @returns Updated order
   */
  public static async addOrderNote(
    id: string,
    note: string,
    changedBy: string = "system"
  ): Promise<any> {
    if (!DbService.isValidObjectId(id)) {
      throw new BadRequestError("Invalid order ID");
    }

    return await DbService.executeDbOperation(async () => {
      const order = await Order.findById(id);

      if (!order) {
        throw new NotFoundError("Order not found");
      }

      // Add note event
      order.history.push({
        type: OrderEventType.NOTE_ADDED,
        timestamp: new Date(),
        description: note,
        changedBy,
      });

      order.notes = note || undefined;

      // Save and return updated order
      await order.save();
      return order;
    });
  }

  /**
   * Update shipping information for an order
   * @param id Order ID
   * @param shippingData New shipping information
   * @param changedBy Who made the change
   * @returns Updated order
   */
  public static async updateShippingInfo(
    id: string,
    shippingData: Partial<IShippingInfo>,
    changedBy: string = "system"
  ): Promise<any> {
    if (!DbService.isValidObjectId(id)) {
      throw new BadRequestError("Invalid order ID");
    }

    return await DbService.executeDbOperation(async () => {
      const order = await Order.findById(id);

      if (!order) {
        throw new NotFoundError("Order not found");
      }

      if (
        [
          OrderStatus.CANCELLED,
          OrderStatus.DELIVERED,
          OrderStatus.REFUNDED,
        ].includes(order.status)
      ) {
        throw new BadRequestError(
          "Cannot change shipping info for this order status"
        );
      }

      // Save original address for history entry
      const originalAddress = {
        name: order.shipping.name,
        phone: order.shipping.phone,
        address: order.shipping.address,
        city: order.shipping.city,
        state: order.shipping.state,
        zipCode: order.shipping.zipCode,
        country: order.shipping.country,
      };

      // Update shipping information
      order.shipping = {
        ...order.shipping,
        ...shippingData,
      };

      // Create history event for shipping change
      const shippingEvent = {
        type: OrderEventType.SHIPPING_UPDATED,
        timestamp: new Date(),
        description: "Shipping information was updated",
        changedBy,
        metadata: {
          previous: originalAddress,
          new: {
            name: order.shipping.name,
            phone: order.shipping.phone,
            address: order.shipping.address,
            city: order.shipping.city,
            state: order.shipping.state,
            zipCode: order.shipping.zipCode,
            country: order.shipping.country,
          },
        },
      };

      // Add event to history
      order.history.push(shippingEvent);

      // Save and return updated order
      await order.save();
      return order;
    });
  }

  /**
   * Add or update staff notes for an order
   * @param id Order ID
   * @param staffNote Staff note text
   * @param changedBy Who added the note
   * @returns Updated order
   */
  public static async updateStaffNotes(
    id: string,
    staffNote: string,
    changedBy: string = "system"
  ): Promise<any> {
    if (!DbService.isValidObjectId(id)) {
      throw new BadRequestError("Invalid order ID");
    }

    return await DbService.executeDbOperation(async () => {
      const order = await Order.findById(id);

      if (!order) {
        throw new NotFoundError("Order not found");
      }

      // Update staff notes
      const previousNotes = order.staffNotes || "";
      order.staffNotes = staffNote;

      // Add event to history
      order.history.push({
        type: OrderEventType.STAFF_NOTE_ADDED,
        timestamp: new Date(),
        description: "Staff notes updated",
        changedBy,
        metadata: {
          previousNotes,
          newNotes: staffNote,
        },
      });

      // Save and return updated order
      await order.save();
      return order;
    });
  }

  /**
   * Search orders with filtering, sorting and pagination
   */
  public static async searchOrders(params: {
    status?: OrderStatus;
    customerEmail?: string;
    customerName?: string;
    dateFrom?: Date;
    dateTo?: Date;
    minTotal?: number;
    maxTotal?: number;
    notes?: string; // Search in customer notes
    staffNotes?: string; // Search in staff notes
    sort?: string;
    order?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ orders: any[]; totalCount: number }> {
    return await DbService.executeDbOperation(async () => {
      const {
        status,
        customerEmail,
        customerName,
        dateFrom,
        dateTo,
        minTotal,
        maxTotal,
        notes,
        staffNotes,
        sort = "createdAt",
        order = "desc",
        page = 1,
        pageSize = 10,
      } = params;

      // Build filter
      const filter: Record<string, any> = {};

      if (status) {
        filter.status = status;
      }

      if (customerEmail) {
        filter["customer.email"] = { $regex: customerEmail, $options: "i" };
      }

      if (customerName) {
        filter["customer.name"] = { $regex: customerName, $options: "i" };
      }

      // Date range filter
      if (dateFrom || dateTo) {
        filter.createdAt = {};
        if (dateFrom) {
          filter.createdAt.$gte = dateFrom;
        }
        if (dateTo) {
          filter.createdAt.$lte = dateTo;
        }
      }

      // Total amount range filter
      if (minTotal !== undefined || maxTotal !== undefined) {
        filter.total = {};
        if (minTotal !== undefined) {
          filter.total.$gte = minTotal;
        }
        if (maxTotal !== undefined) {
          filter.total.$lte = maxTotal;
        }
      }

      // Add notes search
      if (notes) {
        filter.notes = { $regex: notes, $options: "i" };
      }

      // Add staffNotes search
      if (staffNotes) {
        filter.staffNotes = { $regex: staffNotes, $options: "i" };
      }

      // Validate sort field
      const allowedSortFields = ["createdAt", "total", "status", "orderNumber"];

      const sortField = allowedSortFields.includes(sort) ? sort : "createdAt";
      const sortOrder = order === "asc" ? 1 : -1;

      // Fix: Use the correct type for sort options in Mongoose
      const sortOptions: { [key: string]: 1 | -1 } = {};
      sortOptions[sortField] = sortOrder;

      // Calculate pagination
      const skip = (page - 1) * pageSize;

      // Execute query
      const orders = await Order.find(filter)
        .sort(sortOptions)
        .skip(skip)
        .limit(pageSize)
        .lean();

      const totalCount = await Order.countDocuments(filter);

      return { orders, totalCount };
    });
  }
}
