import { prisma } from "../lib/prisma";
import { bumpProject } from "../config/redis";
import {
  AppError,
  NotFoundError,
  ForbiddenError,
} from "../error/error.handler";
import type { AuthenticatedUser } from "../types/auth.types";
import type { AttachmentPublic } from "../types/attachment.types";
import path from "node:path";
import fs from "node:fs/promises";

// MIME types yang diizinkan untuk upload attachment
const ALLOWED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "application/pdf",
  "application/zip",
  "application/x-zip-compressed",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

// Tabel signature header bytes (magic bytes) untuk validasi tipe file sebenarnya
const MAGIC_BYTES: Record<string, string> = {
  "89504e47": "image/png",
  ffd8ffe0: "image/jpeg",
  ffd8ffe1: "image/jpeg",
  ffd8ffe2: "image/jpeg",
  ffd8ffdb: "image/jpeg",
  "504b0304": "application/zip", // zip / docx / xlsx
  "25504446": "application/pdf",
};

// Mendeteksi MIME file berdasarkan 4 byte pertama file
function detectMimeByMagic(buffer: Uint8Array): string | null {
  const hex = Array.from(buffer.slice(0, 4))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return MAGIC_BYTES[hex] ?? null;
}

export const attachmentService = {
  // Mengunggah file attachment baru dengan validasi ukuran, ekstensi, dan magic bytes (Staff only)
  async upload(
    taskPublicId: string,
    user: AuthenticatedUser,
    file: File,
  ): Promise<AttachmentPublic> {
    if (user.role === "CLIENT")
      throw new ForbiddenError("Client tidak diizinkan mengunggah attachment");

    const task = await prisma.task.findFirst({
      where: { public_id: taskPublicId, deletedAt: null },
      include: {
        project: {
          include: {
            members: { where: { deletedAt: null }, select: { userId: true } },
          },
        },
      },
    });
    if (!task) throw new NotFoundError("Task");

    if (user.role !== "PM") {
      const isMember = task.project.members.some((m) => m.userId === user.id);
      if (!isMember) throw new NotFoundError("Task");
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new AppError(
        "Ukuran file melebihi batas 10 MB",
        413,
        "FILE_TOO_LARGE",
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    // Validasi tipe file via magic bytes
    const magicMime = detectMimeByMagic(buffer);

    const declaredMime = file.type;
    const isDocxOrXlsx =
      declaredMime.includes("officedocument") &&
      (magicMime === "application/zip" || magicMime === null);

    const resolvedMime = isDocxOrXlsx
      ? declaredMime
      : (magicMime ?? declaredMime);

    if (!ALLOWED_MIME_TYPES.includes(resolvedMime)) {
      throw new AppError(
        "Tipe file tidak diizinkan",
        415,
        "FILE_TYPE_NOT_ALLOWED",
      );
    }

    // Mengamankan nama file dengan UUID untuk mencegah path traversal
    const ext = path.extname(file.name).replace(/[^a-zA-Z0-9.]/g, "");
    const uniqueFilename = `${crypto.randomUUID()}${ext}`;
    const uploadDir = path.resolve(process.cwd(), "uploads");
    await fs.mkdir(uploadDir, { recursive: true });

    const filePath = path.join(uploadDir, uniqueFilename);
    await fs.writeFile(filePath, buffer);

    const fileUrl = `/uploads/${uniqueFilename}`;

    const attachment = await prisma.$transaction(async (tx) => {
      const att = await tx.attachment.create({
        data: {
          taskId: task.id,
          uploaderId: user.id,
          fileName: path.basename(file.name),
          url: fileUrl,
          mimeType: resolvedMime,
          size: file.size,
        },
      });

      await tx.taskAuditLog.create({
        data: {
          taskId: task.id,
          projectId: task.projectId,
          userId: user.id,
          column: "attachments",
          oldValue: null,
          newValue: `added:${path.basename(file.name)}`,
        },
      });

      return att;
    });

    await bumpProject(task.projectId);

    return {
      id: attachment.public_id,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      size: attachment.size ?? 0,
      url: attachment.url,
    };
  },

  // Mengambil file attachment fisik dari penyimpanan untuk diunduh (Staff only)
  async download(
    taskPublicId: string,
    attPublicId: string,
    user: AuthenticatedUser,
  ): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
    if (user.role === "CLIENT")
      throw new ForbiddenError("Client tidak diizinkan mengunduh attachment");

    const attachment = await prisma.attachment.findFirst({
      where: {
        public_id: attPublicId,
        deletedAt: null,
        task: { public_id: taskPublicId, deletedAt: null },
      },
      include: {
        task: {
          include: {
            project: {
              include: {
                members: {
                  where: { deletedAt: null },
                  select: { userId: true },
                },
              },
            },
          },
        },
      },
    });
    if (!attachment) throw new NotFoundError("Attachment");

    if (user.role !== "PM") {
      const isMember = attachment.task.project.members.some(
        (m) => m.userId === user.id,
      );
      if (!isMember) throw new NotFoundError("Attachment");
    }

    const filename = path.basename(attachment.url);
    const filePath = path.resolve(process.cwd(), "uploads", filename);

    try {
      const buffer = await fs.readFile(filePath);
      return {
        buffer,
        mimeType: attachment.mimeType || "application/octet-stream",
        fileName: attachment.fileName,
      };
    } catch {
      throw new NotFoundError("File fisik attachment");
    }
  },

  // Menghapus attachment secara soft-delete (Hanya PM atau pemilik yang mengunggah)
  async delete(
    taskPublicId: string,
    attPublicId: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    if (user.role === "CLIENT")
      throw new ForbiddenError("Client tidak diizinkan menghapus attachment");

    const attachment = await prisma.attachment.findFirst({
      where: {
        public_id: attPublicId,
        deletedAt: null,
        task: { public_id: taskPublicId, deletedAt: null },
      },
      include: { task: true },
    });
    if (!attachment) throw new NotFoundError("Attachment");

    if (user.role !== "PM" && attachment.uploaderId !== user.id) {
      throw new ForbiddenError(
        "Hanya pengunggah atau PM yang dapat menghapus attachment ini",
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.attachment.update({
        where: { id: attachment.id },
        data: { deletedAt: new Date() },
      });
      await tx.taskAuditLog.create({
        data: {
          taskId: attachment.taskId,
          projectId: attachment.task.projectId,
          userId: user.id,
          column: "attachments",
          oldValue: null,
          newValue: `removed:${attachment.fileName}`,
        },
      });
    });

    await bumpProject(attachment.task.projectId);
  },
};
