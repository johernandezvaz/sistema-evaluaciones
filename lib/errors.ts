export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
    public readonly data?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "No tienes permiso para realizar esta acción") {
    super("PROHIBIDO", message, 403);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends AppError {
  constructor(what: string) {
    super("NO_ENCONTRADO", `${what} no existe`, 404);
    this.name = "NotFoundError";
  }
}
