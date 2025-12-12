import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import logger from "../utils/logger";

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";

export const authMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ message: "No token provided" });
    return;
  }

  const token = authHeader.split(" ")[1];

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
