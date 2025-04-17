import sgMail from "@sendgrid/mail";
import config from "../config/env";
import {
  BadRequestError,
  InternalServerError,
} from "../middleware/error.middleware";
import { EmailTemplateUtils } from "../utils/email-template.utils";

sgMail.setApiKey(config.SENDGRID_API_KEY as string);

export class EmailService {
  private static DOMAIN: string = config.DOMAIN as string;

  /**
   * Send a simple email
   * @param to Recipient email address or array of addresses
   * @param subject Email subject
   * @param text Plain text content
   * @param html HTML content (optional)
   * @param from Sender email address (optional)
   * @param cc CC recipients (optional)
   * @param bcc BCC recipients (optional)
   * @returns SendGrid response
   */
  public static async sendEmail(
    to: string | string[],
    subject: string,
    text: string,
    html?: string,
    from?: string,
    cc?: string | string[],
    bcc?: string | string[]
  ): Promise<any> {
    if (!config.SENDGRID_API_KEY) {
      throw new InternalServerError("SendGrid API key is not configured");
    }

    // Validate primary recipient(s)
    if (!to) {
      throw new BadRequestError("Recipient email address is required");
    }

    // Convert single recipient to array for consistent handling
    const toAddresses = Array.isArray(to) ? to : [to];

    // Validate all recipient addresses
    for (const email of toAddresses) {
      if (!this.isValidEmail(email)) {
        throw new BadRequestError(`Invalid recipient email address: ${email}`);
      }
    }

    // Create the email message
    const msg: sgMail.MailDataRequired = {
      to: toAddresses,
      from: from || `no-reply@${this.DOMAIN}`,
      subject,
      text,
      html: html || text,
    };

    // Add CC recipients if provided
    if (cc) {
      const ccAddresses = Array.isArray(cc) ? cc : [cc];

      // Validate CC addresses
      for (const email of ccAddresses) {
        if (!this.isValidEmail(email)) {
          throw new BadRequestError(`Invalid CC email address: ${email}`);
        }
      }

      msg.cc = ccAddresses;
    }

    // Add BCC recipients if provided
    if (bcc) {
      const bccAddresses = Array.isArray(bcc) ? bcc : [bcc];

      // Validate BCC addresses
      for (const email of bccAddresses) {
        if (!this.isValidEmail(email)) {
          throw new BadRequestError(`Invalid BCC email address: ${email}`);
        }
      }

      msg.bcc = bccAddresses;
    }

    try {
      const response = await sgMail.send(msg);
      return response;
    } catch (error: any) {
      console.error("Email sending error:", error);
      if (error.response) {
        console.error("Error details:", error.response.body);
      }
      throw new InternalServerError("Failed to send email");
    }
  }

  /**
   * Send account verification email
   * @param to User's email address
   * @param name User's name
   * @param token Verification token
   * @param from Sender email address (optional)
   * @param frontendUrl Frontend URL for verification link (optional)
   * @param cc CC recipients (optional)
   * @param bcc BCC recipients (optional)
   * @returns SendGrid response
   */
  public static async sendVerificationEmail(
    to: string,
    name: string,
    token: string,
    from?: string,
    frontendUrl?: string,
    cc?: string | string[],
    bcc?: string | string[]
  ): Promise<any> {
    if (!this.isValidEmail(to)) {
      throw new BadRequestError("Invalid recipient email address");
    }

    // Use defaults if not provided
    const siteUrl = frontendUrl || config.ADMIN_PAGE_URL;
    const fromAddress = from || `no-reply@${this.DOMAIN}`;
    const verificationUrl = `${siteUrl}?token=${token}`;
    const subject = "Verify Your Email Address - AT Creations";

    // Plain text version for email clients that don't support HTML
    const text = `
Hello ${name},

Thank you for registering with AT Creations. Please verify your email address by clicking the link below:

${verificationUrl}

This link will expire in 3 hours.

If you did not create an account, you can safely ignore this email.

Best regards,
The AT Creations Team
    `.trim();

    // Build HTML version using EmailTemplateUtils
    const greeting = `<p style="margin-bottom: 15px;">Hello ${name},</p>`;

    const message = `
    <p style="margin-bottom: 15px;">Thank you for registering with AT Creations. Please verify your email address by clicking the button below:</p>
    `;

    const button = EmailTemplateUtils.createButton(
      "Verify Email Address",
      verificationUrl,
      true
    );

    const note = EmailTemplateUtils.createMessageBox(
      "This link will expire in 3 hours. If you did not create an account, you can safely ignore this email.",
      "info"
    );

    // Add signature
    const signature = EmailTemplateUtils.createSignature();

    const content = `${greeting}${message}${button}${note}${signature}`;

    const htmlContent = EmailTemplateUtils.createEmailTemplate(
      subject,
      content
    );

    try {
      return await this.sendEmail(
        to,
        subject,
        text,
        htmlContent,
        fromAddress,
        cc,
        bcc
      );
    } catch {
      throw new InternalServerError("Failed to send verification email");
    }
  }

  /**
   * Send password reset email
   * @param to User's email address
   * @param name User's name
   * @param token Reset token
   * @param from Sender email address (optional)
   * @param frontendUrl Frontend URL for reset link (optional)
   * @param cc CC recipients (optional)
   * @param bcc BCC recipients (optional)
   * @returns SendGrid response
   */
  public static async sendPasswordResetEmail(
    to: string,
    name: string,
    token: string,
    from?: string,
    frontendUrl?: string,
    cc?: string | string[],
    bcc?: string | string[]
  ): Promise<any> {
    if (!this.isValidEmail(to)) {
      throw new BadRequestError("Invalid recipient email address");
    }

    // Use defaults if not provided
    const siteUrl = frontendUrl || config.ADMIN_PAGE_URL;
    const fromAddress = from || `no-reply@${this.DOMAIN}`;
    const resetUrl = `${siteUrl}?token=${token}`;
    const subject = "Reset Your Password - AT Creations";

    // Plain text version for email clients that don't support HTML
    const text = `
Hello ${name},

You recently requested to reset your password for your AT Creations account. Click the link below to reset it:

${resetUrl}

This link will expire in 1 hour.

If you did not request a password reset, please ignore this email or contact support if you have concerns.

Best regards,
The AT Creations Team
    `.trim();

    // Build HTML version using EmailTemplateUtils
    const greeting = `<p style="margin-bottom: 15px;">Hello ${name},</p>`;

    const message = `
    <p style="margin-bottom: 15px;">You recently requested to reset your password for your AT Creations account. Click the button below to reset it:</p>
    `;

    const button = EmailTemplateUtils.createButton(
      "Reset Password",
      resetUrl,
      true
    );

    const noteText = `This link will expire in 1 hour.<br><br>If you did not request a password reset, please ignore this email or contact support if you have concerns.`;

    const note = EmailTemplateUtils.createMessageBox(noteText, "warning");

    // Add signature
    const signature = EmailTemplateUtils.createSignature();

    const content = `${greeting}${message}${button}${note}${signature}`;

    const htmlContent = EmailTemplateUtils.createEmailTemplate(
      subject,
      content
    );

    return await this.sendEmail(
      to,
      subject,
      text,
      htmlContent,
      fromAddress,
      cc,
      bcc
    );
  }

  /**
   * Simple email validation check
   * @param email Email address to validate
   * @returns True if email format is valid
   */
  public static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate URL format
   * @param url URL to validate
   */
  public static isValidUrl(url: string): boolean {
    const urlRegex = /^(https?:\/\/)?((localhost)|([a-z0-9-]+\.)+[a-z]{2,})(:\d+)?(\/[^\s]*)?$/i;
    return urlRegex.test(url);
  }
}
