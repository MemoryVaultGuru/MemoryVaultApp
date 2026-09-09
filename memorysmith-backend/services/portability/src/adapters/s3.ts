/**
 * S3ArchiveStore: where an export lands, and how the person who asked for it
 * reaches the bytes (architecture-guide.md, section 16).
 *
 * The archive lives under the SAME subscription prefix as everything else,
 * `s/{subscriptionId}/exports/`, so the first rule of the design holds here
 * too: every key of this system begins with the subscription.
 *
 * The bucket blocks public access, so the download is a pre-signed URL,
 * short-lived and issued for that one object. Nothing else about the export is
 * reachable, and a link that leaks stops working within the quarter of an hour
 * the use case declares.
 *
 * Every archive is written with the `lifecycle=export` tag. That tag is what
 * the bucket rule expires on: an export is a derived artefact, rebuildable
 * from the vault at any moment, and keeping it forever would be paying storage
 * for a copy of something we already store.
 */

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { ArchiveStore } from '../application/ExportVault.js';
import type { UploadStore } from '../application/ImportVault.js';

export const EXPORT_LIFECYCLE_TAG = { key: 'lifecycle', value: 'export' } as const;

export class S3ArchiveStore implements ArchiveStore {
  constructor(
    private readonly s3: S3Client,
    private readonly bucket: string,
  ) {}

  async put(key: string, archive: Buffer): Promise<void> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: archive,
        ContentType: 'application/zip',
        Tagging: `${EXPORT_LIFECYCLE_TAG.key}=${EXPORT_LIFECYCLE_TAG.value}`,
      }),
    );
  }

  async presign(key: string, expiresInSeconds: number): Promise<string> {
    return getSignedUrl(
      this.s3,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        // The browser is navigating to this URL, so what it does with the
        // response is decided here: a file named after the vault, saved
        // rather than rendered.
        ResponseContentDisposition: `attachment; filename="${filenameOf(key)}"`,
      }),
      { expiresIn: expiresInSeconds },
    );
  }
}

function filenameOf(key: string): string {
  return key.split('/').pop() ?? 'export.zip';
}

/**
 * S3UploadStore: where a `.vault` arrives before it becomes a vault.
 *
 * It lives under the same subscription prefix as everything else,
 * `s/{subscriptionId}/imports/`, and it wears the same `lifecycle=export` tag:
 * an upload is as derived as an export — the vault it describes is either
 * written or it is not, and either way the file has done its job.
 *
 * The bucket blocks public access, so the upload is a pre-signed PUT, issued
 * for that one key and expiring with the use case that asked for it.
 */
export class S3UploadStore implements UploadStore {
  constructor(
    private readonly s3: S3Client,
    private readonly bucket: string,
  ) {}

  async presignUpload(key: string, expiresInSeconds: number): Promise<string> {
    return getSignedUrl(
      this.s3,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: 'application/zip',
        Tagging: `${EXPORT_LIFECYCLE_TAG.key}=${EXPORT_LIFECYCLE_TAG.value}`,
      }),
      { expiresIn: expiresInSeconds },
    );
  }

  async read(key: string): Promise<Buffer | null> {
    try {
      const found = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      const bytes = await found.Body?.transformToByteArray();
      return bytes ? Buffer.from(bytes) : null;
    } catch {
      // An upload that never happened and one that expired are the same
      // answer: there is nothing at that key.
      return null;
    }
  }

  async discard(key: string): Promise<void> {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
