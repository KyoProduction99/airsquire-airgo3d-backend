import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import sharp from "sharp";
import crypto from "crypto";
import OpenAI from "openai";
import { Request, Response } from "express";
import { FilterQuery, Types } from "mongoose";

import logger from "../utils/logger";
import Image, { IImage } from "../models/Image";

const uploadsDirectory = path.join(__dirname, "..", "uploads");
const originalsDirectory = path.join(uploadsDirectory, "originals");
const thumbnailsDirectory = path.join(uploadsDirectory, "thumbnails");

const ensureDirectory = async (dir: string): Promise<void> => {
  await fsPromises.mkdir(dir, { recursive: true });
};

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

interface AIMetadata {
  title?: string;
  description?: string;
  tags?: string[];
}

interface ImageQuery {
  page?: string;
  pageSize?: string;
  sortField?: string;
  sortOrder?: "ascend" | "descend";
  title?: string;
  description?: string;
  tags?: string;
  bookmarked?: string;
}

const callOpenAIMetadata = async (
  base64Image: string,
  mimeType: string,
  lang?: string
): Promise<AIMetadata> => {
  if (!openai) {
    throw new Error("OpenAI is not configured.");
  }

  const languageName = lang?.startsWith("zh")
    ? "Simplified Chinese"
    : "English";

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              `Analyze this image and respond in ${languageName} with ONLY JSON object like: ` +
              '{ "title": string, "description": string, "tags": string[] }' +
              "maximum 5 tags with capitalized first letters, no special characters.",
          },
          {
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${base64Image}`,
            },
          },
        ],
      } as any,
    ],
  } as any);

  const content = completion.choices[0]?.message?.content;
  if (typeof content !== "string") {
    return {};
  }

  const text = content
    .replace(/^```[\s\S]*?\n/, "")
    .replace(/```$/, "")
    .trim();

  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
};

export const getImages = async (
  req: Request<{}, {}, {}, ImageQuery>,
  res: Response
): Promise<void> => {
  try {
    const {
      page = "1",
      pageSize = "10",
      sortField = "createdAt",
      sortOrder = "descend",
      title,
      description,
      tags,
      bookmarked,
    } = req.query;

    const pageNum = parseInt(page, 10) || 1;
    const pageSizeNum = parseInt(pageSize, 10) || 10;

    const filter: FilterQuery<IImage> = {
      user: req.user?.id,
    };

    if (title) {
      filter.title = { $regex: title, $options: "i" };
    }

    if (description) {
      filter.description = { $regex: description, $options: "i" };
    }

    if (tags) {
      const tagList = tags.split(",");
      if (tagList.length > 0) {
        filter.tags = { $in: tagList };
      }
    }

    if (bookmarked) {
      const bookmarkedList = bookmarked
        .split(",")
        .map((bookmark) => bookmark === "true");
      if (bookmarkedList.length > 0) {
        filter.bookmarked = { $in: bookmarkedList };
      }
    }

    const allowedSortFields = [
      "title",
      "fileSize",
      "viewCount",
      "createdAt",
      "updatedAt",
      "bookmarked",
    ];
    const sortFieldSafe = allowedSortFields.includes(sortField)
      ? sortField
      : "createdAt";
    const sortDir = sortOrder === "ascend" ? 1 : -1;
    const sort: Record<string, 1 | -1> = { [sortFieldSafe]: sortDir };

    const [total, images] = await Promise.all([
      Image.countDocuments(filter).exec(),
      Image.find(filter)
        .sort(sort)
        .skip((pageNum - 1) * pageSizeNum)
        .limit(pageSizeNum)
        .exec(),
    ]);

    res.json({
      data: images,
      total,
      page: pageNum,
      pageSize: pageSizeNum,
    });
  } catch (err: any) {
    logger.error("Error fetching images", { error: err });
    res
      .status(500)
      .json({ message: "Error fetching images", error: err.message });
  }
};

export const getImageStats = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const userObjectId = new Types.ObjectId(userId);

    const totalImages = await Image.countDocuments({ user: userId }).exec();

    const sizeAggregation = await Image.aggregate([
      { $match: { user: userObjectId } },
      { $group: { _id: null, totalSize: { $sum: "$fileSize" } } },
    ]);
    const totalSizeBytes = sizeAggregation[0]?.totalSize ?? 0;

    const viewAggregation = await Image.aggregate([
      { $match: { user: userObjectId } },
      { $group: { _id: null, totalViews: { $sum: "$viewCount" } } },
    ]);
    const totalViews = viewAggregation[0]?.totalViews ?? 0;

    const bookmarkAggregation = await Image.aggregate([
      { $match: { user: userObjectId } },
      { $group: { _id: "$bookmarked", count: { $sum: 1 } } },
    ]);

    const { bookmarkedCount = 0, unbookmarkedCount = 0 } =
      bookmarkAggregation.reduce((acc, { _id, count }) => {
        if (_id === true) acc.bookmarkedCount = count;
        else acc.unbookmarkedCount = count;
        return acc;
      }, {});

    res.json({
      totalImages,
      totalSizeBytes,
      totalViews,
      bookmark: {
        bookmarked: bookmarkedCount,
        unbookmarked: unbookmarkedCount,
      },
    });
  } catch (err: any) {
    logger.error("Error fetching stats", { error: err });
    res
      .status(500)
      .json({ message: "Error fetching stats", error: err.message });
  }
};

export const getImageByHash = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { hash } = req.params;
    const { sharePassword } = req.body;

    const image = await Image.findOne({ hash }).exec();

    if (!image) {
      res.status(404).json({ message: "Image not found" });
      return;
    }

    console.log(image.sharePassword, sharePassword);
    if (image.sharePassword != sharePassword) {
      res.status(404).json({ message: "Password not match" });
      return;
    }

    image.viewCount += 1;
    await image.save();

    const imageUrl = `${req.protocol}://${req.get("host")}${image.originalUrl}`;

    res.json({
      id: image._id,
      hash,
      imageUrl,
    });
  } catch (err: any) {
    logger.error("Error fetching image by hash", { error: err });
    res
      .status(500)
      .json({ message: "Error fetching image by hash", error: err.message });
  }
};

export const getAllTags = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const rawTags = await Image.distinct("tags", { user: req.user?.id });
    const tags = (rawTags as string[]).sort((a, b) => a.localeCompare(b));

    res.json(tags);
  } catch (err: any) {
    logger.error("Error fetching tags", { error: err });
    res.status(500).json({
      message: "Error fetching tags",
      error: err.message,
    });
  }
};

export const uploadMultipleImages = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const files = (req as any).files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      res.status(400).json({ message: "No files uploaded" });
      return;
    }

    await Promise.all([
      ensureDirectory(originalsDirectory),
      ensureDirectory(thumbnailsDirectory),
    ]);

    const createdImages: IImage[] = [];

    for (const file of files) {
      const timestamp = Date.now();
      const safeOriginalName = file.originalname.replace(/\s+/g, "_");
      const filename = `${timestamp}_${safeOriginalName}`;

      const originalFsPath = path.join(originalsDirectory, filename);
      const thumbnailFsPath = path.join(thumbnailsDirectory, filename);

      const originalUrl = `/uploads/originals/${filename}`;
      const thumbnailUrl = `/uploads/thumbnails/${filename}`;

      const fileSize = file.size;
      const mimeType = file.mimetype;

      const imageSharp = sharp(file.buffer);
      const metadata = await imageSharp.metadata();
      const resolutionWidth = metadata.width ?? undefined;
      const resolutionHeight = metadata.height ?? undefined;

      const hash = crypto
        .createHash("sha256")
        .update(file.buffer)
        .update(String(Date.now()))
        .digest("hex");

      await Promise.all([
        imageSharp.toFile(originalFsPath),
        sharp(file.buffer)
          .resize(512, 256, { fit: "cover" })
          .toFile(thumbnailFsPath),
      ]);

      const imageDoc = await Image.create({
        user: req.user?.id,
        filename,
        originalUrl,
        thumbnailUrl,
        fileSize,
        mimeType,
        resolutionWidth,
        resolutionHeight,
        hash,
      });

      createdImages.push(imageDoc);
    }

    res.status(201).json(createdImages);
  } catch (err: any) {
    logger.error("Error uploading images", { error: err });
    res
      .status(500)
      .json({ message: "Error uploading images", error: err.message });
  }
};

export const generateAIMetadata = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    if (!openai) {
      res
        .status(500)
        .json({ message: "OpenAI API key not configured on server." });
      return;
    }

    const image = await Image.findOne({
      _id: req.params.id,
      user: req.user?.id,
    }).exec();

    if (!image) {
      res.status(404).json({ message: "Image not found" });
      return;
    }

    const filename = path.basename(image.thumbnailUrl);
    const fsPath = path.join(originalsDirectory, filename);

    const fileBuffer = await fsPromises.readFile(fsPath);
    const base64Image = fileBuffer.toString("base64");

    const suggestions = await callOpenAIMetadata(
      base64Image,
      image.mimeType,
      req.body?.lang
    );

    res.json(suggestions);
  } catch (err: any) {
    logger.error("Error generating AI metadata", { error: err });
    res.status(500).json({
      message: "Error generating AI metadata",
      error: err.message,
    });
  }
};

export const updateImageDetails = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { title, description, tags, sharePassword } = req.body as {
      title?: string;
      description?: string;
      tags?: string[];
      sharePassword?: string;
    };

    const image = await Image.findOne({
      _id: req.params.id,
      user: req.user?.id,
    }).exec();

    if (!image) {
      res.status(404).json({ message: "Image not found" });
      return;
    }

    image.title = title;
    image.description = description;
    image.tags = Array.isArray(tags)
      ? tags.map((tag) => tag.trim()).filter(Boolean)
      : [];
    image.sharePassword = sharePassword;

    await image.save();

    res.json(image);
  } catch (err: any) {
    logger.error("Error updating image details", { error: err });
    res
      .status(500)
      .json({ message: "Error updating image details", error: err.message });
  }
};

export const updateToggleBookmark = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { bookmarked } = req.body as { bookmarked?: boolean };

    const image = await Image.findOne({
      _id: req.params.id,
      user: req.user?.id,
    }).exec();

    if (!image) {
      res.status(404).json({ message: "Image not found" });
      return;
    }

    if (typeof bookmarked === "boolean") {
      image.bookmarked = bookmarked;
    } else {
      image.bookmarked = !image.bookmarked;
    }

    await image.save();
    res.json(image);
  } catch (err: any) {
    logger.error("Error updating bookmark", { error: err });
    res
      .status(500)
      .json({ message: "Error updating bookmark", error: err.message });
  }
};

export const deleteImage = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const image = await Image.findOne({
      _id: req.params.id,
      user: req.user?.id,
    }).exec();

    if (!image) {
      res.status(404).json({ message: "Image not found" });
      return;
    }

    const originalFilename = path.basename(image.originalUrl);
    const thumbnailFilename = path.basename(image.thumbnailUrl);

    const originalFsPath = path.join(originalsDirectory, originalFilename);
    const thumbnailFsPath = path.join(thumbnailsDirectory, thumbnailFilename);

    [originalFsPath, thumbnailFsPath].forEach((path) => {
      fs.access(path, fs.constants.F_OK, (err) => {
        if (!err) {
          fs.unlink(path, () => undefined);
        }
      });
    });

    await image.deleteOne();

    res.json({ message: "Image deleted" });
  } catch (err: any) {
    logger.error("Error deleting image", { error: err });
    res
      .status(500)
      .json({ message: "Error deleting image", error: err.message });
  }
};
