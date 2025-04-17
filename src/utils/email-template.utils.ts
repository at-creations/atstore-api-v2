import config from "../config/env";

/**
 * Email template utilities for creating responsive HTML emails
 * Using in-line styles for maximum compatibility with email clients
 */
export class EmailTemplateUtils {
  // Main brand color
  private static readonly PRIMARY_COLOR = "#0071bc";
  private static readonly SECONDARY_COLOR = "#f8f9fa";
  private static readonly TEXT_COLOR = "#333333";
  private static readonly LIGHT_TEXT = "#666666";
  private static readonly BORDER_COLOR = "#dddddd";
  private static readonly SUCCESS_COLOR = "#28a745";
  private static readonly WARNING_COLOR = "#ffc107";
  private static readonly DANGER_COLOR = "#dc3545";

  // Logo dimensions
  private static readonly LOGO_HEIGHT = "60px"; // Based on 3:1 ratio

  /**
   * Creates a complete HTML email template
   * @param title Email title (shows in preview)
   * @param content Main email content (can be built with other utility methods)
   * @param footerText Custom footer text
   * @returns Complete HTML email
   */
  public static createEmailTemplate(
    title: string,
    content: string,
    footerText?: string
  ): string {
    const year = new Date().getFullYear();
    const footer =
      footerText || `© ${year} AT Creations. All rights reserved.`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; color: ${this.TEXT_COLOR}; background-color: #f4f4f4; -webkit-font-smoothing: antialiased;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse;">
    <tr>
      <td style="padding: 20px 0;">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="600" style="border-collapse: collapse; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          ${this.createHeader()}
          
          <!-- Content -->
          <tr>
            <td style="padding: 30px 30px 20px 30px;">
              ${content}
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 30px; background-color: ${this.SECONDARY_COLOR}; text-align: center; font-size: 12px; color: ${this.LIGHT_TEXT}; border-top: 1px solid ${this.BORDER_COLOR};">
              ${footer}
              <p style="margin: 10px 0 0 0;">
                <a href="${config.FRONTEND_URL}" style="color: ${this.PRIMARY_COLOR}; text-decoration: none;">Visit our website</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  /**
   * Creates the email header with logo
   * @returns HTML for the email header
   */
  private static createHeader(): string {
    const logoUrl =
      config.LOGO_URL ||
      "https://fakeimg.pl/900x300/ffffff/0071bc?text=AT+Creations&font=lobster&font_size=100";

    return `<tr>
      <td style="padding: 20px 30px; background-color: #ffffff; text-align: center; border-bottom: 1px solid ${this.BORDER_COLOR};">
        <img src="${logoUrl}" alt="AT Creations" height="${this.LOGO_HEIGHT}" style="display: block; margin: 0 auto;">
      </td>
    </tr>`;
  }

  /**
   * Creates a signature block for email
   * @param signatureText Custom signature text (optional)
   * @param signatureName Custom signature name/team (optional)
   * @returns HTML for the signature
   */
  public static createSignature(
    signatureText: string = "Best regards,",
    signatureName: string = "The AT Creations Team"
  ): string {
    return `
    <div style="margin-top: 25px; color: ${this.TEXT_COLOR};">
      <p style="margin-bottom: 5px;">${signatureText}</p>
      <p style="margin-top: 0; font-weight: 500;">${signatureName}</p>
    </div>
  `;
  }

  /**
   * Creates a section with a title
   * @param title Section title
   * @param content Section content
   * @returns HTML for the section
   */
  public static createSection(title: string, content: string): string {
    return `<div style="margin-bottom: 25px;">
      <h2 style="margin: 0 0 15px 0; color: ${this.PRIMARY_COLOR}; font-size: 18px; font-weight: bold;">${title}</h2>
      <div style="line-height: 1.5; font-size: 14px;">
        ${content}
      </div>
    </div>`;
  }

  /**
   * Creates a button for email actions
   * @param text Button text
   * @param url Button URL
   * @param isPrimary Use primary color (true) or secondary color (false)
   * @returns HTML for the button
   */
  public static createButton(
    text: string,
    url: string,
    isPrimary: boolean = true
  ): string {
    const bgColor = isPrimary ? this.PRIMARY_COLOR : this.SECONDARY_COLOR;
    const textColor = isPrimary ? "#ffffff" : this.TEXT_COLOR;
    const borderColor = isPrimary ? this.PRIMARY_COLOR : this.BORDER_COLOR;

    return `<table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 20px 0;">
      <tr>
        <td style="border-radius: 4px; background-color: ${bgColor}; text-align: center;">
          <a href="${url}" target="_blank" style="border: 1px solid ${borderColor}; display: inline-block; padding: 12px 24px; font-size: 16px; color: ${textColor}; text-decoration: none; border-radius: 4px; font-weight: bold;">
            ${text}
          </a>
        </td>
      </tr>
    </table>`;
  }

  /**
   * Creates a list of items for email
   * @param items Array of list items
   * @param ordered Use ordered (true) or unordered (false) list
   * @returns HTML for the list
   */
  public static createList(items: string[], ordered: boolean = false): string {
    const listItems = items
      .map((item) => `<li style="margin-bottom: 8px;">${item}</li>`)
      .join("");

    return `<${ordered ? "ol" : "ul"} style="padding-left: 20px; margin: 15px 0; line-height: 1.5; font-size: 14px;">
      ${listItems}
    </${ordered ? "ol" : "ul"}>`;
  }

  /**
   * Creates a data table for displaying information like order details
   * @param headers Table headers
   * @param rows Table rows (array of arrays matching header length)
   * @returns HTML for the table
   */
  public static createTable(headers: string[], rows: any[][]): string {
    // Create header row
    const headerRow = headers
      .map(
        (header) =>
          `<th style="text-align: left; padding: 10px; border-bottom: 2px solid ${this.BORDER_COLOR}; font-size: 14px; font-weight: bold;">${header}</th>`
      )
      .join("");

    // Create data rows
    const dataRows = rows
      .map((row) => {
        const cells = row
          .map(
            (cell) =>
              `<td style="text-align: left; padding: 10px; border-bottom: 1px solid ${this.BORDER_COLOR}; font-size: 14px;">${cell}</td>`
          )
          .join("");
        return `<tr>${cells}</tr>`;
      })
      .join("");

    return `<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse; margin: 20px 0;">
      <thead>
        <tr>${headerRow}</tr>
      </thead>
      <tbody>
        ${dataRows}
      </tbody>
    </table>`;
  }

  /**
   * Creates a key-value information block (e.g., for order details)
   * @param items Object with key-value pairs to display
   * @returns HTML for the information block
   */
  public static createInfoBlock(items: Record<string, string>): string {
    const rows = Object.entries(items)
      .map(
        ([key, value]) => `<tr>
        <td style="padding: 8px 0; font-weight: bold; width: 40%; vertical-align: top; font-size: 14px; color: ${this.TEXT_COLOR};">${key}:</td>
        <td style="padding: 8px 0; width: 60%; vertical-align: top; font-size: 14px;">${value}</td>
      </tr>`
      )
      .join("");

    return `<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse; margin: 15px 0;">
      <tbody>
        ${rows}
      </tbody>
    </table>`;
  }

  /**
   * Creates a message box for special notices (info, success, warning, etc.)
   * @param message Message to display
   * @param type Message type: 'info', 'success', 'warning', or 'error'
   * @returns HTML for the message box
   */
  public static createMessageBox(
    message: string,
    type: "info" | "success" | "warning" | "error" = "info"
  ): string {
    let color;
    switch (type) {
      case "success":
        color = this.SUCCESS_COLOR;
        break;
      case "warning":
        color = this.WARNING_COLOR;
        break;
      case "error":
        color = this.DANGER_COLOR;
        break;
      default:
        color = this.PRIMARY_COLOR;
    }

    return `<div style="background-color: ${color}10; border-left: 4px solid ${color}; padding: 15px; margin: 20px 0; border-radius: 4px; font-size: 14px;">
      ${message}
    </div>`;
  }

  /**
   * Creates a divider line
   * @returns HTML for a divider
   */
  public static createDivider(): string {
    return `<div style="border-top: 1px solid ${this.BORDER_COLOR}; margin: 25px 0;"></div>`;
  }
}
