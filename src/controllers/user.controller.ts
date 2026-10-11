import type { Context } from "hono";
import { userService } from "../service/user.service";
import type { CreateUserSchema, ListUserQuerySchema } from "../schemas/user.schema";

export const userController = {
  // Handler endpoint pembuatan user (PM only)
  async createUser(c: Context): Promise<Response> {
    const body = c.get("validatedBody") as CreateUserSchema;
    const user = await userService.createUser(body);
    return c.json({ success: true, response_code: 201, message: "User berhasil dibuat", data: user }, 201);
  },

  // Handler endpoint pencarian dan listing user berpaginasi
  async getUsers(c: Context): Promise<Response> {
    const query = c.get("validatedQuery") as ListUserQuerySchema;
    const { users, totalData, totalPages } = await userService.listUsers(query);
    return c.json({
      success: true,
      response_code: 200,
      message: "OK",
      data: users,
      meta: { page: query.page, rows: query.rows, totalData, totalPages },
    }, 200);
  },
};