export {};

declare global {
  namespace Express {
    interface UserContext {
      id: string;
      email: string;
    }

    interface Request {
      user?: UserContext;
    }
  }
}
