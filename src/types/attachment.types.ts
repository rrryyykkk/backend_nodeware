// ============================================================
// Attachment Domain Types
// ============================================================

export interface AttachmentPublic {
  id: string; // public_id
  fileName: string;
  mimeType: string | null;
  size: number;
  url: string;
}
