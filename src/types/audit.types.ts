// ============================================================
// Audit Domain Types
// ============================================================

export interface AuditLogEntry {
  id: string;
  taskId: string;
  user: {
    id: string;
    name: string;
  };
  column: string;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
}

export interface AuditLogsResult {
  logs: AuditLogEntry[];
  totalData: number;
  totalPages: number;
}
