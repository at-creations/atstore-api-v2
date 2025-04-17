import { S3Client } from "@aws-sdk/client-s3";
import { config } from "./env";

const r2Client = new S3Client({
  region: "auto",
  endpoint: config.R2_URL,
  credentials: {
    accessKeyId: config.R2_ACCESS_KEY_ID as string,
    secretAccessKey: config.R2_SECRET_ACCESS_KEY as string,
  },
});

export { r2Client };
export {
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
