export interface PaginationMeta {
  page: number;
  rows: number;
  totalData: number;
  totalPages: number;
}

export interface SuccessEnvelope<T = unknown> {
  success: true;
  response_code: number;
  message: string;
  data?: T;
  meta?: PaginationMeta;
}

export interface ErrorEnvelope {
  success: false;
  response_code: number;
  message: string;
  error: {
    code: string;
    details?: unknown;
  };
}

export type ApiEnvelope<T = unknown> = SuccessEnvelope<T> | ErrorEnvelope;
