import { Request, Response } from "express";
import ms from "ms";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import logger from "../utils/logger";
import User, { IUser } from "../models/User";

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";
const JWT_EXPIRES_IN = (process.env.JWT_EXPIRES_IN ?? "7d") as ms.StringValue;

const passwordPattern =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

const signToken = (user: IUser) => {
  return jwt.sign({ id: user._id.toString(), email: user.email }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
};

const setAuthCookie = (res: Response, token: string): void => {
  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: ms(JWT_EXPIRES_IN),
    domain: undefined,
    path: "/",
  });
};

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, name } = req.body as {
      email?: string;
      password?: string;
      name?: string;
    };

    if (!email || !password || !name) {
      res
        .status(400)
        .json({ message: "Email, name, and password are required." });
      return;
    }

    if (!passwordPattern.test(password)) {
      res.status(400).json({
        message:
          "Password must be at least 8 characters and include uppercase, lowercase, number, and symbol.",
      });
      return;
    }

    const existing = await User.findOne({ email }).exec();
    if (existing) {
      res.status(409).json({ message: "Email is already in use." });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ email, passwordHash, name });

    const token = signToken(user);
    setAuthCookie(res, token);
    res.status(201).json({
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (err: any) {
    logger.error("Registration failed", { error: err });
    res
      .status(500)
      .json({ message: "Registration failed", error: err.message });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body as {
      email?: string;
      password?: string;
    };

    if (!email || !password) {
      res.status(400).json({ message: "Email and password are required" });
      return;
    }

    const user = await User.findOne({ email }).exec();
    if (!user) {
      res.status(401).json({ message: "Invalid credentials" });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ message: "Invalid credentials" });
      return;
    }

    const token = signToken(user);
    setAuthCookie(res, token);
    res.json({
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (err: any) {
    logger.error("Login failed", { error: err });
    res.status(500).json({ message: "Login failed", error: err.message });
  }
};

export const logout = async (_req: Request, res: Response): Promise<void> => {
  try {
    res.clearCookie("token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });
    res.json({ message: "Logged out" });
  } catch (err: any) {
    logger.error("Logout failed", { error: err });
    res.status(500).json({ message: "Logout failed", error: err.message });
  }
};

export const getMe = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const user = await User.findById(req.user.id).exec();
    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    res.json({
      id: user._id,
      email: user.email,
      name: user.name,
    });
  } catch (err: any) {
    logger.error("Failed to fetch user", { error: err });
    res
      .status(500)
      .json({ message: "Failed to fetch user", error: err.message });
  }
};
