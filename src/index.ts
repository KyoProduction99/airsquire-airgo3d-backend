import dotenv from "dotenv";
dotenv.config();

import cors from "cors";
import path from "path";
import cookieParser from "cookie-parser";
import express, { Application } from "express";

import connectDB from "./config/db";
import imageRoutes from "./routes/imageRoutes";
import authRoutes from "./routes/authRoutes";

import { requestLogger } from "./middleware/requestLogger";
import logger from "./utils/logger";

const app: Application = express();
const PORT = process.env.PORT || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

const uploadsPath = path.join(__dirname, "uploads");
app.use("/uploads", express.static(uploadsPath));

app.use(requestLogger);

app.use("/api/auth", authRoutes);
app.use("/api/images", imageRoutes);

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      logger.info(`Server started on port ${PORT}`);
    });
  })
  .catch((err) => {
    logger.error("Failed to connect to DB", err);
    process.exit(1);
  });
