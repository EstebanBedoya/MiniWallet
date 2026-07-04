// Maps the API's semantic error codes to friendly Spanish messages. The UI keys
// off `code` (stable contract), never off HTTP status or the raw message.

import { ApiError } from "@/lib/api";

const ERROR_MESSAGES: Record<string, string> = {
  // Auth
  EMAIL_ALREADY_REGISTERED: "Ese email ya está registrado.",
  INVALID_CREDENTIALS: "Email o contraseña incorrectos.",
  UNAUTHORIZED: "Tu sesión expiró. Iniciá sesión de nuevo.",
  FORBIDDEN: "No tenés permisos para esta acción.",
  USER_NOT_FOUND: "No se encontró el usuario.",
  // Transfers
  MISSING_IDEMPOTENCY_KEY: "Faltó la clave de idempotencia de la transferencia.",
  INVALID_AMOUNT: "El monto debe ser mayor a cero.",
  VALIDATION_ERROR: "Revisá los datos ingresados.",
  SELF_TRANSFER_NOT_ALLOWED: "No podés transferirte a vos mismo.",
  RECEIVER_NOT_FOUND: "El destinatario no existe.",
  ACCOUNT_NOT_FOUND: "No se encontró la cuenta.",
  INSUFFICIENT_BALANCE: "Saldo insuficiente para esta transferencia.",
  IDEMPOTENCY_KEY_CONFLICT:
    "Esa clave ya se usó con otros datos. Reintentá con una operación nueva.",
  // Compliance / state machine
  TRANSACTION_NOT_FOUND: "No se encontró la transacción.",
  TRANSACTION_NOT_PENDING_REVIEW: "La transacción ya no está en revisión.",
  TRANSACTION_ALREADY_SETTLED: "La transacción ya fue liquidada.",
  TRANSACTION_ALREADY_REJECTED: "La transacción ya fue rechazada.",
  INVALID_STATE_TRANSITION: "Ese cambio de estado no está permitido.",
  // Infra
  ERROR: "Ocurrió un error. Probá de nuevo.",
  INTERNAL_ERROR: "Error interno del servidor. Probá más tarde.",
};

/** Human-friendly Spanish message for any thrown error. */
export function messageForError(err: unknown): string {
  if (err instanceof ApiError) {
    return ERROR_MESSAGES[err.code] ?? err.message ?? ERROR_MESSAGES.ERROR;
  }
  if (err instanceof Error && err.message) return err.message;
  return ERROR_MESSAGES.ERROR;
}
