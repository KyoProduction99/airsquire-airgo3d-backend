import dotenv from "dotenv";
dotenv.config();

import cors from "cors";
import path from "path";
import express, { Application } from "express";

import connectDB from "./config/db";
import imageRoutes from "./routes/imageRoutes";
import authRoutes from "./routes/authRoutes";

import { requestLogger } from "./middleware/requestLogger";
import logger from "./utils/logger";

const app: Application = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

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
