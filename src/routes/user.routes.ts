import { Hono } from "hono";
import { userController } from "../controllers/user.controller";
import { authMiddleware } from "../middleware/auth.middleware";
import { requireRole } from "../middleware/guard.middleware";
import { validateBody, validateQuery } from "../middleware/validate.middleware";
import { createUserSchema, listUserQuerySchema } from "../schemas/user.schema";

export const userRoutes = new Hono();

userRoutes.use("*", authMiddleware, requireRole("PM"));

userRoutes.post("/", validateBody(createUserSchema), userController.createUser);
userRoutes.get(
  "/",
  validateQuery(listUserQuerySchema),
  userController.getUsers,
);
