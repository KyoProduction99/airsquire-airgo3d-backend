import { Router } from "express";
import multer from "multer";
import {
  getImages,
  getImageStats,
  getImageByHash,
  getAllTags,
  uploadMultipleImages,
  generateAIMetadata,
  updateImageDetails,
  updateToggleBookmark,
  deleteImage,
} from "../controllers/imageController";
import { authMiddleware } from "../middleware/auth";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post("/hash/:hash", getImageByHash);

router.use(authMiddleware);

router.get("/", getImages);
router.get("/stats", getImageStats);
router.get("/tags", getAllTags);

router.post("/upload-multiple", upload.array("images"), uploadMultipleImages);
router.post("/:id/ai-metadata", generateAIMetadata);
router.patch("/:id/details", updateImageDetails);
router.patch("/:id/bookmark", updateToggleBookmark);

router.delete("/:id", deleteImage);

export default router;
