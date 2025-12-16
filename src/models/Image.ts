import { Document, model, Schema, Types } from "mongoose";

export interface IImage extends Document {
  user: Types.ObjectId;
  filename: string;
  originalUrl: string;
  thumbnailUrl: string;
  fileSize: number;
  mimeType: string;
  resolutionWidth?: number;
  resolutionHeight?: number;

  title?: string;
  description?: string;
  tags: string[];
  bookmarked: boolean;
  viewCount: number;
  hash: string;
  sharePassword: string;
  createdAt: Date;
  updatedAt: Date;
}

const imageSchema = new Schema<IImage>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    filename: { type: String, required: true },
    originalUrl: { type: String, required: true },
    thumbnailUrl: { type: String, required: true },
    fileSize: { type: Number, required: true },
    mimeType: { type: String, required: true },
    resolutionWidth: { type: Number },
    resolutionHeight: { type: Number },

    title: { type: String },
    description: { type: String },
    tags: { type: [String], default: [] },
    bookmarked: { type: Boolean, default: false },
    viewCount: { type: Number, default: 0 },
    hash: { type: String, required: true, unique: true },
    sharePassword: { type: String },
  },
  { timestamps: true }
);

const Image = model<IImage>("Image", imageSchema);

export default Image;
