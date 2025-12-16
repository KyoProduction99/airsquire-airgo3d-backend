import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import logger from "../utils/logger";

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";

export const authMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const cookieToken = (req as any).cookies?.token as string | undefined;
  const authHeader = req.headers.authorization;
  const headerToken =
    authHeader && authHeader.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : undefined;
  const token = cookieToken || headerToken;

  if (!token) {
    res.status(401).json({ message: "No token provided" });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      id: string;
      email: string;
      iat: number;
      exp: number;
    };

    if (!decoded.id) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    req.user = {
      id: decoded.id,
      email: decoded.email,
    };

    next();
  } catch (err) {
    logger.error("JWT verification failed", { error: err });
    res.status(401).json({ message: "Invalid or expired token" });
  }
};
