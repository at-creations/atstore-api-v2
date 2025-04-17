import { EmailService } from "./email.service";
import { EmailTemplateUtils } from "../utils/email-template.utils";
import { IOrder, OrderStatus } from "../models/order.model";
import config from "../config/env";
import { InternalServerError } from "../middleware/error.middleware";
import { formatDate } from "../utils/date.utils";

/**
 * Service for sending order-related email notifications
 */
export class OrderEmailService {
  private static FROM_EMAIL: string = `orders@${config.DOMAIN}`;
  private static STORE_NAME: string = config.STORE_NAME || "AT Creations";

  /**
   * Send order confirmation email when an order is successfully placed
   * @param order The complete order object
   * @returns Email sending result
   */
  public static async sendOrderConfirmationEmail(order: IOrder): Promise<any> {
    if (!order || !order.customer || !order.customer.email) {
      throw new Error("Invalid order data: Customer email is required");
    }

    const to = order.customer.email;
    const subject = `Order Received - ${this.STORE_NAME} #${order.orderNumber}`;

    // Build plain text version
    const text = this.buildOrderConfirmationPlainText(order);

    // Build HTML version using EmailTemplateUtils
    const htmlContent = this.buildOrderConfirmationHtml(order);

    try {
      return await EmailService.sendEmail(
        to,
        subject,
        text,
        htmlContent,
        this.FROM_EMAIL
      );
    } catch (error) {
      console.error("Failed to send order confirmation email:", error);
      throw new InternalServerError("Failed to send order confirmation email");
    }
  }

  /**
   * Send order status update email when an order status changes
   * @param order The complete order object with updated status
   * @param previousStatus The previous order status
   * @returns Email sending result
   */
  public static async sendOrderStatusUpdateEmail(
    order: IOrder,
    previousStatus: OrderStatus
  ): Promise<any> {
    if (!order || !order.customer || !order.customer.email) {
      throw new Error("Invalid order data: Customer email is required");
    }

    const to = order.customer.email;
    const name = order.customer.name;
    const subject = `Order Status Updated - ${this.STORE_NAME} #${order.orderNumber}`;

    // Build plain text version
    const text = this.buildOrderStatusUpdatePlainText(order, previousStatus);

    // Build HTML version using EmailTemplateUtils
    const htmlContent = this.buildOrderStatusUpdateHtml(order, previousStatus);

    try {
      return await EmailService.sendEmail(
        to,
        subject,
        text,
        htmlContent,
        this.FROM_EMAIL
      );
    } catch (error) {
      console.error("Failed to send order status update email:", error);
      throw new InternalServerError("Failed to send order status update email");
    }
  }

  /**
   * Build plain text content for order confirmation email
   */
  private static buildOrderConfirmationPlainText(order: IOrder): string {
    const orderDate = formatDate(order.createdAt);

    // Format items
    const itemsList = order.items
      .map(
        (item) =>
          `- ${item.name} x ${item.quantity} - $${(item.price * item.quantity).toFixed(2)}`
      )
      .join("\n");

    return `
Order Confirmation - ${this.STORE_NAME}
==========================================================

Hello ${order.customer.name},

Thank you for your order! Your order has been received and is being processed.

ORDER DETAILS:
Order Number: ${order.orderNumber}
Order Access Code: ${order.password}

Use this code to check your order status without signing in.

Date: ${orderDate}

ITEMS:
${itemsList}

SUMMARY:
Subtotal: $${order.subtotal.toFixed(2)}
${order.itemDiscountTotal > 0 ? `Item Discounts: -$${order.itemDiscountTotal.toFixed(2)}` : ""}
${order.orderDiscount > 0 ? `Order Discount: -$${order.orderDiscount.toFixed(2)}` : ""}
Shipping: $${order.shippingCost.toFixed(2)}
Tax: $${order.tax.toFixed(2)}
Total: $${order.total.toFixed(2)}

SHIPPING ADDRESS:
${order.shipping.name}
${order.shipping.address}
${order.shipping.city}, ${order.shipping.state || ""} ${order.shipping.zipCode}
${order.shipping.country}

NEXT STEPS:
We will contact you shortly regarding payment options. Once payment is confirmed, your order will be processed for shipping.

If you have any questions about your order, please contact our customer service team.

Thank you for shopping with us!

Best regards,
The ${this.STORE_NAME} Team
    `.trim();
  }

  /**
   * Build HTML content for order confirmation email
   */
  private static buildOrderConfirmationHtml(order: IOrder): string {
    const orderDate = formatDate(order.createdAt);

    // Create header with greeting
    const greeting = `<p style="margin-bottom: 15px;">Hello ${order.customer.name},</p>`;

    const message = `
      <p style="margin-bottom: 15px;">Thank you for your order! Your order has been received and is being processed.</p>
      <p style="margin-bottom: 25px; font-weight: bold;">Order Number: ${order.orderNumber}</p>
    `;

    // Add order password section
    const passwordSection = `
      <div style="margin-bottom: 25px; padding: 15px; background-color: #f8f9fa; border-left: 4px solid #0071bc; border-radius: 4px;">
        <p style="margin-top: 0; font-weight: bold;">Your Order Access Code: <span style="font-family: monospace; font-size: 18px; letter-spacing: 1px; color: #0071bc;">${order.password}</span></p>
        <p style="margin-bottom: 0;">Use this code to check your order status without signing in.</p>
      </div>
    `;

    // Create order items table
    const itemsTableHeaders = ["Item", "Quantity", "Price", "Total"];
    const itemsTableRows = order.items.map((item) => [
      item.name,
      `${item.quantity}`,
      `$${item.price.toFixed(2)}`,
      `$${(item.price * item.quantity).toFixed(2)}`,
    ]);

    const itemsTable = EmailTemplateUtils.createTable(
      itemsTableHeaders,
      itemsTableRows
    );

    // Create order summary
    const summaryItems: Record<string, string> = {
      Subtotal: `$${order.subtotal.toFixed(2)}`,
    };

    if (order.itemDiscountTotal > 0) {
      summaryItems["Item Discounts"] =
        `-$${order.itemDiscountTotal.toFixed(2)}`;
    }

    if (order.orderDiscount > 0) {
      summaryItems["Order Discount"] = `-$${order.orderDiscount.toFixed(2)}`;
    }

    summaryItems["Shipping"] = `$${order.shippingCost.toFixed(2)}`;
    summaryItems["Tax"] = `$${order.tax.toFixed(2)}`;
    summaryItems["Total"] = `$${order.total.toFixed(2)}`;

    const orderSummary = EmailTemplateUtils.createInfoBlock(summaryItems);

    // Shipping address
    const shippingAddress = `
      <p style="margin-bottom: 5px; font-weight: bold;">Shipping Address:</p>
      <p style="margin-top: 0; margin-bottom: 2px;">${order.shipping.name}</p>
      <p style="margin-top: 0; margin-bottom: 2px;">${order.shipping.address}</p>
      <p style="margin-top: 0; margin-bottom: 2px;">${order.shipping.city}, ${order.shipping.state || ""} ${order.shipping.zipCode}</p>
      <p style="margin-top: 0;">${order.shipping.country}</p>
    `;

    // Payment information notice
    const paymentNotice = EmailTemplateUtils.createMessageBox(
      "We will contact you shortly regarding payment options. Once payment is confirmed, your order will be processed for shipping.",
      "info"
    );

    // Add signature
    const signature = EmailTemplateUtils.createSignature();

    // Combine all sections
    const orderDetailsSection = EmailTemplateUtils.createSection(
      "Order Details",
      `<p style="margin-bottom: 10px;">Date: ${orderDate}</p>${itemsTable}`
    );

    const orderSummarySection = EmailTemplateUtils.createSection(
      "Order Summary",
      orderSummary
    );

    const shippingSection = EmailTemplateUtils.createSection(
      "Shipping Information",
      shippingAddress
    );

    const content = `
      ${greeting}
      ${message}
      ${passwordSection}
      ${orderDetailsSection}
      ${orderSummarySection}
      ${shippingSection}
      ${paymentNotice}
      ${signature}
    `;

    return EmailTemplateUtils.createEmailTemplate(
      `Order Confirmation - ${order.orderNumber}`,
      content
    );
  }

  /**
   * Build plain text content for order status update email
   */
  private static buildOrderStatusUpdatePlainText(
    order: IOrder,
    previousStatus: OrderStatus
  ): string {
    const orderDate = formatDate(order.createdAt);

    // Get status-specific message
    const statusMessage = this.getStatusUpdateMessage(
      order.status,
      previousStatus
    );

    return `
Order Status Update - ${this.STORE_NAME}
==========================================================

Hello ${order.customer.name},

Your order status has been updated.

ORDER DETAILS:
Order Number: ${order.orderNumber}
Date: ${orderDate}
Previous Status: ${previousStatus}
New Status: ${order.status}

${statusMessage}

You can track your order using your order number and email address on our website.

If you have any questions, please contact our customer service team.

Thank you for shopping with us!

Best regards,
The ${this.STORE_NAME} Team
    `.trim();
  }

  /**
   * Build HTML content for order status update email
   */
  private static buildOrderStatusUpdateHtml(
    order: IOrder,
    previousStatus: OrderStatus
  ): string {
    const orderDate = formatDate(order.createdAt);

    // Create header with greeting
    const greeting = `<p style="margin-bottom: 15px;">Hello ${order.customer.name},</p>`;

    const message = `
      <p style="margin-bottom: 15px;">Your order status has been updated.</p>
      <p style="margin-bottom: 25px; font-weight: bold;">Order Number: ${order.orderNumber}</p>
    `;

    // Status update info
    const statusUpdateInfo: Record<string, string> = {
      "Order Date": orderDate,
      "Previous Status": previousStatus,
      "New Status": order.status,
    };

    // Add estimated delivery if available
    if (order.estimatedDelivery) {
      statusUpdateInfo["Estimated Delivery"] = formatDate(
        order.estimatedDelivery
      );
    }

    const statusInfoBlock =
      EmailTemplateUtils.createInfoBlock(statusUpdateInfo);

    // Get status message and type
    const { message: statusMessage, type: statusType } =
      this.getStatusUpdateMessageHtml(order.status, previousStatus);

    // Status message box
    const statusMessageBox = EmailTemplateUtils.createMessageBox(
      statusMessage,
      statusType
    );

    // Add tracking button if available
    let trackingButton = "";
    if (order.shipping.trackingNumber) {
      const trackingUrl = `${config.FRONTEND_URL}/track?order=${order.orderNumber}&email=${encodeURIComponent(order.customer.email)}`;
      trackingButton = EmailTemplateUtils.createButton(
        "Track Your Order",
        trackingUrl
      );
    }

    // Add signature
    const signature = EmailTemplateUtils.createSignature();

    // Combine all sections
    const statusSection = EmailTemplateUtils.createSection(
      "Order Status Update",
      statusInfoBlock
    );

    const content = `
      ${greeting}
      ${message}
      ${statusSection}
      ${statusMessageBox}
      ${trackingButton}
      ${signature}
    `;

    return EmailTemplateUtils.createEmailTemplate(
      `Order Status Update - ${order.orderNumber}`,
      content
    );
  }

  /**
   * Get status update message for plain text emails
   */
  private static getStatusUpdateMessage(
    newStatus: OrderStatus,
    previousStatus: OrderStatus
  ): string {
    switch (newStatus) {
      case OrderStatus.CONFIRMED:
        return "Your order has been confirmed. We've received your payment and are preparing your items for shipment.";

      case OrderStatus.PROCESSING:
        return "We are now processing your order. Your items are being prepared for shipment.";

      case OrderStatus.SHIPPING:
        return "Great news! Your order has been shipped and is on its way to you.";

      case OrderStatus.DELIVERED:
        return "Your order has been delivered. We hope you enjoy your purchase!";

      case OrderStatus.COMPLETED:
        return "Your order has been completed. Thank you for shopping with us!";

      case OrderStatus.CANCELLED:
        return "Your order has been cancelled. If you have any questions, please contact our customer service team.";

      case OrderStatus.REFUNDED:
        return "A refund has been issued for your order. The amount should appear in your account within 5-7 business days.";

      default:
        return "Your order status has been updated. Thank you for your patience.";
    }
  }

  /**
   * Get status update message and type for HTML emails
   */
  private static getStatusUpdateMessageHtml(
    newStatus: OrderStatus,
    previousStatus: OrderStatus
  ): { message: string; type: "info" | "success" | "warning" | "error" } {
    switch (newStatus) {
      case OrderStatus.CONFIRMED:
        return {
          message:
            "Your order has been confirmed. We've received your payment and are preparing your items for shipment.",
          type: "success",
        };

      case OrderStatus.PROCESSING:
        return {
          message:
            "We are now processing your order. Your items are being prepared for shipment.",
          type: "info",
        };

      case OrderStatus.SHIPPING:
        return {
          message:
            "Great news! Your order has been shipped and is on its way to you.",
          type: "success",
        };

      case OrderStatus.DELIVERED:
        return {
          message:
            "Your order has been delivered. We hope you enjoy your purchase!",
          type: "success",
        };

      case OrderStatus.COMPLETED:
        return {
          message:
            "Your order has been completed. Thank you for shopping with us!",
          type: "success",
        };

      case OrderStatus.CANCELLED:
        return {
          message:
            "Your order has been cancelled. If you have any questions, please contact our customer service team.",
          type: "warning",
        };

      case OrderStatus.REFUNDED:
        return {
          message:
            "A refund has been issued for your order. The amount should appear in your account within 5-7 business days.",
          type: "info",
        };

      default:
        return {
          message:
            "Your order status has been updated. Thank you for your patience.",
          type: "info",
        };
    }
  }
}
