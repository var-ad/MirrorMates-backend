import rateLimit from "express-rate-limit";

export const inviteSubmissionRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many invite submissions. Try again later." }
});
