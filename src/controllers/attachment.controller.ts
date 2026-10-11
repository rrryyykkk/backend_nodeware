import type { Context } from "hono";
import { attachmentService } from "../service/attachment.service";
import type { AuthenticatedUser } from "../types/auth.types";
import { ValidationError } from "../error/error.handler";

export const attachmentController = {
  // Handler unggah attachment file task (Staff only)
  async uploadAttachment(c: Context): Promise<Response> {
    const user = c.get("user") as AuthenticatedUser;
    const taskPublicId = c.req.param("id") ?? "";
    const formData = await c.req.parseBody();
    const file = formData.file;

    if (!file || !(file instanceof File)) {
      throw new ValidationError(
        { file: ["File wajib diunggah"] },
        "File tidak ditemukan",
      );
    }

    const attachment = await attachmentService.upload(taskPublicId, user, file);
    return c.json(
      {
        success: true,
        response_code: 201,
        message: "Attachment berhasil diunggah",
        data: attachment,
      },
      201,
    );
  },

  // Handler unduh file attachment task (Staff only)
  async downloadAttachment(c: Context): Promise<Response> {
    const user = c.get("user") as AuthenticatedUser;
    const taskPublicId = c.req.param("id") ?? "";
    const attPublicId = c.req.param("attId") ?? "";
    const { buffer, mimeType, fileName } = await attachmentService.download(
      taskPublicId,
      attPublicId,
      user,
    );
    return new Response(buffer, {
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  },

  // Handler soft-delete attachment (PM atau Uploader)
  async deleteAttachment(c: Context): Promise<Response> {
    const user = c.get("user") as AuthenticatedUser;
    const taskPublicId = c.req.param("id") ?? "";
    const attPublicId = c.req.param("attId") ?? "";
    await attachmentService.delete(taskPublicId, attPublicId, user);
    return c.json(
      {
        success: true,
        response_code: 200,
        message: "Attachment berhasil dihapus",
      },
      200,
    );
  },
};