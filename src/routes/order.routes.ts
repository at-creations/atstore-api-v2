import { Router } from "express";
import {
  authenticate,
  authorize,
  optionalAuthenticate,
} from "../middleware/auth.middleware";
import {
  createOrder,
  getOrderById,
  getOrderByNumber,
  trackOrder,
  getOrdersByEmail,
  updateOrderStatus,
  addOrderNote,
  searchOrders,
  updateShippingInfo,
  updateStaffNotes,
} from "../controllers/order.controller";

const router = Router();

// Public routes with optional authentication
router.post("/", optionalAuthenticate, createOrder); // Allow both guests and authenticated users
router.get("/track/:orderNumber", trackOrder); // Public order tracking

// Staff-only routes - require authentication
router.use(authenticate);

// Admin and staff routes
const staffRoles = ["admin", "manager", "staff"];
const managerRoles = ["admin", "manager"];

router.get("/", authorize(staffRoles), searchOrders);
router.get("/id/:id", authorize(staffRoles), getOrderById);
router.get("/number/:orderNumber", authorize(staffRoles), getOrderByNumber);
router.get("/email/:email", authorize(staffRoles), getOrdersByEmail);
router.patch("/:id/status", authorize(staffRoles), updateOrderStatus);
router.post("/:id/notes", authorize(staffRoles), addOrderNote);
router.post("/:id/staff-notes", authorize(staffRoles), updateStaffNotes);

// Higher privilege routes - admin and manager only
router.patch("/:id/shipping", authorize(managerRoles), updateShippingInfo);

export default router;
