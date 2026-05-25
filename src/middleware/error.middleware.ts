import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../utils/errors";

function isBodyParserError(error: unknown): error is { status: number; type: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    "type" in error &&
    (error as { status?: unknown }).status === 400 &&
    typeof (error as { type?: unknown }).type === "string"
  );
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (res.headersSent) {
    console.error("Error after response was already sent", error);
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({ message: "Validation failed", issues: error.flatten() });
    return;
  }

  if (isBodyParserError(error)) {
    res.status(400).json({ message: "Malformed request body" });
    return;
  }

  if (error instanceof AppError) {
    res.status(error.statusCode).json({ message: error.message });
    return;
  }

  console.error(error);
  res.status(500).json({ message: "Unexpected server error" });
}
