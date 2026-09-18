/** Tipos propios de la interfaz (no vienen del contrato de API). */

import type { ReactNode } from 'react';
import type { AiChatSource } from './api';

export type Theme = 'dark' | 'light';

export type SortOrder = 'asc' | 'desc';

export interface SortState {
  sort: string;
  order: SortOrder;
}

export interface Column<T> {
  /** Identificador estable; se usa para ocultar columnas y para `sort`. */
  key: string;
  header: string;
  /** Campo del servidor por el que ordenar. Si falta, la columna no ordena. */
  sortField?: string;
  render: (row: T) => ReactNode;
  /** Clases extra para la celda. */
  className?: string;
  /** Si es true, la columna no puede ocultarse. */
  required?: boolean;
  /** En tarjetas (móvil) se muestra como título principal. */
  primary?: boolean;
  /** Ocultar de la vista de tarjetas. */
  hideOnCard?: boolean;
}

export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
}

export interface PromptOptions {
  title: string;
  message?: ReactNode;
  label: string;
  placeholder?: string;
  initialValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Obligatorio por defecto: las acciones destructivas exigen motivo. */
  required?: boolean;
  multiline?: boolean;
  minLength?: number;
  tone?: 'default' | 'danger';
}

export interface ChatMessage {
  role: 'user' | 'ai';
  text: string;
  timestamp: number;
  pending?: boolean;
  error?: boolean;
  /** Citas del evento SSE `sources` (contrato de IA). */
  sources?: AiChatSource[];
}

export type UploadItemStatus = 'pending' | 'hashing' | 'uploading' | 'done' | 'error';

export interface UploadItem {
  id: string;
  file: File;
  title: string;
  type: string;
  category: string;
  subcategory: string;
  tags: string[];
  sha256: string | null;
  progress: number;
  status: UploadItemStatus;
  error: string | null;
  documentId: string | null;
}
