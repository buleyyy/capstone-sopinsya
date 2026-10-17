import type { ErrorRequestHandler, RequestHandler } from "express";
import { AppError } from "../utils/errors.js";
import { fail } from "../utils/response.js";

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json(fail("NOT_FOUND", `Rute ${req.method} ${req.path} tidak ditemukan`));
};

export function createErrorHandler(opts: { exposeInternal: boolean }): ErrorRequestHandler {
  // Express mengenali error handler dari jumlah argumen (4), jadi `_next` wajib ada.
  return (err, _req, res, _next) => {
    if (res.headersSent) return;

    if (err instanceof AppError) {
      res.status(err.statusCode).json(fail(err.code, err.message, err.details));
      return;
    }

    // Error klien dari body-parser (JSON rusak, payload terlalu besar, dsb.)
    const status = (err as { status?: number }).status;
    if (typeof status === "number" && status >= 400 && status < 500) {
      res.status(status).json(fail("BAD_REQUEST", "Permintaan tidak valid"));
      return;
    }

    console.error("[api] unhandled error:", err);
    res
      .status(500)
      .json(
        fail(
          "INTERNAL_ERROR",
          "Terjadi kesalahan pada server",
          opts.exposeInternal ? { message: String((err as Error)?.message ?? err) } : undefined,
        ),
      );
  };
}
