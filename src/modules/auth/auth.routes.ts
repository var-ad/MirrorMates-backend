import { Router } from "express";
import { validate } from "../../middleware/validate";
import { googleLoginController, loginController, logoutController, refreshController, signupController } from "./auth.controller";
import { googleLoginSchema, loginSchema, logoutSchema, refreshSchema, signupSchema } from "./auth.validators";

export const authRouter = Router();

authRouter.post("/signup", validate({ body: signupSchema }), signupController);
authRouter.post("/login", validate({ body: loginSchema }), loginController);
authRouter.post("/google", validate({ body: googleLoginSchema }), googleLoginController);
authRouter.post("/refresh", validate({ body: refreshSchema }), refreshController);
authRouter.post("/logout", validate({ body: logoutSchema }), logoutController);
