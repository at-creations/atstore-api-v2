import { Request, Response } from "express";
import { OrderService } from "../services/order.service";
import { successResponse, paginatedResponse } from "../models/response.model";
import { asyncHandler } from "../utils/async-handler.util";
import { BadRequestError } from "../middleware/error.middleware";
import { OrderStatus, OrderEventType } from "../models/order.model";

/**
 * Create a new order
 */
export const createOrder = asyncHandler(async (req: Request, res: Response) => {
  // Validate required fields
  if (
    !req.body.customer ||
    !req.body.customer.email ||
    !req.body.customer.name
  ) {
    throw new BadRequestError("Customer email and name are required");
  }

  if (
    !req.body.items ||
    !Array.isArray(req.body.items) ||
    req.body.items.length === 0
  ) {
    throw new BadRequestError("Order must include at least one item");
  }

  // Enhanced shipping validation
  if (
    !req.body.shipping ||
    !req.body.shipping.name ||
    !req.body.shipping.phone ||
    !req.body.shipping.address ||
    !req.body.shipping.city ||
    !req.body.shipping.zipCode ||
    !req.body.shipping.country
  ) {
    throw new BadRequestError("Shipping information is incomplete");
  }

  // Prepare order data with any modifications based on authentication
  const orderData = { ...req.body };

  // Check if this is an authenticated user (could be staff or customer)
  if (req.user) {
    // Handle internal actor (staff, manager, admin)
    if (["staff", "manager", "admin"].includes(req.user.role)) {
      // Add metadata to identify this as a staff-created order
      orderData.staffNotes = orderData.staffNotes
        ? `${orderData.staffNotes}\nCreated by ${req.user.role}: ${req.user.name}`
        : `Created by ${req.user.role}: ${req.user.name}`;

      // Set initial status to CONFIRMED for staff-created orders
      orderData.status = OrderStatus.CONFIRMED;

      // Add an event indicating this was created internally
      const internalEvent = {
        type: OrderEventType.OTHER,
        timestamp: new Date(),
        description: `Order created internally by ${req.user.role}`,
        changedBy: req.user.id,
      };

      if (!orderData.history) orderData.history = [];
      orderData.history.push(internalEvent);
    }
    // Handle authenticated customer
    else {
      // Link the order to the customer's user account
      orderData.customer.userId = req.user._id;
    }
  }

  const order = await OrderService.createOrder(orderData);

  return res
    .status(201)
    .json(successResponse("Order created successfully", order));
});

/**
 * Get an order by ID
 */
export const getOrderById = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const order = await OrderService.getOrderById(id);

    return res
      .status(200)
      .json(successResponse("Order retrieved successfully", order));
  }
);

/**
 * Get an order by order number
 */
export const getOrderByNumber = asyncHandler(
  async (req: Request, res: Response) => {
    const { orderNumber } = req.params;
    const order = await OrderService.getOrderByNumber(orderNumber);

    return res
      .status(200)
      .json(successResponse("Order retrieved successfully", order));
  }
);

/**
 * Track order status by order number
 * This endpoint can be public for customers to check their orders
 */
export const trackOrder = asyncHandler(async (req: Request, res: Response) => {
  const { orderNumber } = req.params;
  const { email, password } = req.body;

  // For public access, require email and password
  if (!email) {
    throw new BadRequestError("Email is required to track an order");
  }

  if (!password) {
    throw new BadRequestError("Password is required to track an order");
  }

  // First verify the password
  const order = await OrderService.verifyOrderPassword(
    orderNumber,
    password as string
  );

  // Then verify the email matches
  if (order && order.customer.email.toLowerCase() !== String(email).toLowerCase()) {
    throw new BadRequestError("Email or password is incorrect");
  }

  // Return limited information for tracking
  const trackingInfo = {
    orderNumber: order.orderNumber,
    status: order.status,
    createdAt: order.createdAt,
    estimatedDelivery: order.estimatedDelivery,
    recipient: {
      name: order.shipping.name,
      address: `${order.shipping.city}, ${order.shipping.country}`, // Partial address for privacy
    },
    items: order.items.map((item: any) => ({
      name: item.name,
      quantity: item.quantity,
    })),
  };

  return res
    .status(200)
    .json(
      successResponse("Order tracking information retrieved", trackingInfo)
    );
});

/**
 * Get orders by customer email
 */
export const getOrdersByEmail = asyncHandler(
  async (req: Request, res: Response) => {
    const { email } = req.params;
    const limit =
      parseInt((req.query.limit || req.query.pageSize) as string) || 10;
    const page = parseInt(req.query.page as string) || 1;

    const { orders, totalCount } = await OrderService.getOrdersByEmail(
      email,
      limit,
      page
    );

    return res
      .status(200)
      .json(
        paginatedResponse(
          "Orders retrieved successfully",
          orders,
          page,
          limit,
          totalCount
        )
      );
  }
);

/**
 * Update order status
 */
export const updateOrderStatus = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { status, description } = req.body;

    // Validate status
    if (!status || !Object.values(OrderStatus).includes(status)) {
      throw new BadRequestError("Valid order status is required");
    }

    // Get user ID from authenticated user
    const changedBy = req.user?.id || "system";

    const updatedOrder = await OrderService.updateOrderStatus(
      id,
      status,
      description,
      changedBy
    );

    return res
      .status(200)
      .json(successResponse("Order status updated successfully", updatedOrder));
  }
);

/**
 * Add note to order
 */
export const addOrderNote = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { note } = req.body;

    if (!note) {
      throw new BadRequestError("Note text is required");
    }

    // Get user ID from authenticated user
    const changedBy = req.user?.id || "system";

    const updatedOrder = await OrderService.addOrderNote(id, note, changedBy);

    return res
      .status(200)
      .json(successResponse("Note added to order successfully", updatedOrder));
  }
);

/**
 * Search and filter orders
 */
export const searchOrders = asyncHandler(
  async (req: Request, res: Response) => {
    // Parse query parameters
    const status = req.query.status as OrderStatus;
    const customerEmail = req.query.email as string;
    const customerName = req.query.name as string;

    const dateFrom = req.query.dateFrom
      ? new Date(req.query.dateFrom as string)
      : undefined;

    const dateTo = req.query.dateTo
      ? new Date(req.query.dateTo as string)
      : undefined;

    const minTotal = req.query.minTotal
      ? parseFloat(req.query.minTotal as string)
      : undefined;

    const maxTotal = req.query.maxTotal
      ? parseFloat(req.query.maxTotal as string)
      : undefined;

    const notes = req.query.notes as string;
    const staffNotes = req.query.staffNotes as string;

    const sort = (req.query.sort as string) || "createdAt";
    const order = (req.query.order as string) || "desc";
    const page = parseInt(req.query.page as string) || 1;
    const pageSize =
      parseInt((req.query.limit || req.query.pageSize) as string) || 10;

    const { orders, totalCount } = await OrderService.searchOrders({
      status,
      customerEmail,
      customerName,
      dateFrom,
      dateTo,
      minTotal,
      maxTotal,
      notes,
      staffNotes,
      sort,
      order,
      page,
      pageSize,
    });

    return res.status(200).json(
      paginatedResponse(
        "Orders retrieved successfully",
        orders,
        page,
        pageSize,
        totalCount,
        {
          filters: {
            status,
            customerEmail,
            customerName,
            dateFrom,
            dateTo,
            minTotal,
            maxTotal,
            notes,
            staffNotes,
          },
        }
      )
    );
  }
);

/**
 * Update shipping information for an order
 * This allows admins and managers to modify delivery details
 */
export const updateShippingInfo = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const shippingData = req.body;

    // Basic validation for required shipping fields
    if (
      !shippingData ||
      !shippingData.name ||
      !shippingData.phone ||
      !shippingData.address ||
      !shippingData.city ||
      !shippingData.zipCode ||
      !shippingData.country
    ) {
      throw new BadRequestError("Shipping information is incomplete");
    }

    // Get user ID from authenticated user
    const changedBy = req.user?.id || "system";

    const updatedOrder = await OrderService.updateShippingInfo(
      id,
      shippingData,
      changedBy
    );

    return res
      .status(200)
      .json(
        successResponse(
          "Shipping information updated successfully",
          updatedOrder
        )
      );
  }
);

/**
 * Update staff notes for an order
 */
export const updateStaffNotes = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { staffNotes } = req.body;

    if (staffNotes === undefined) {
      throw new BadRequestError("Staff notes are required");
    }

    // Get user ID from authenticated user
    const changedBy = req.user?.id || "system";

    const updatedOrder = await OrderService.updateStaffNotes(
      id,
      staffNotes,
      changedBy
    );

    return res
      .status(200)
      .json(successResponse("Staff notes updated successfully", updatedOrder));
  }
);
