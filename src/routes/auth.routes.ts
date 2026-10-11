import { Hono } from "hono";
import { authController } from "../controllers/auth.controller";
import { validateBody } from "../middleware/validate.middleware";
import { authMiddleware } from "../middleware/auth.middleware";
import { registerSchema, loginSchema } from "../schemas/auth.schema";

export const authRoutes = new Hono();

authRoutes.post(
  "/register",
  validateBody(registerSchema),
  authController.register,
);
authRoutes.post("/login", validateBody(loginSchema), authController.login);
authRoutes.post("/logout", authMiddleware, authController.logout);
authRoutes.get("/me", authMiddleware, authController.me);
