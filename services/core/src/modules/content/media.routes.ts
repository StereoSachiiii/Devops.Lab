import type { FastifyInstance } from "fastify";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const MEDIA_DIR = process.env["MEDIA_DIR"] || "/data/media";

export async function mediaRoutes(fastify: FastifyInstance) {
  // Ensure storage directory exists synchronously or on plugin load
  if (!fs.existsSync(MEDIA_DIR)) {
    try {
      fs.mkdirSync(MEDIA_DIR, { recursive: true });
    } catch (err) {
      fastify.log.warn({ err }, "Could not create MEDIA_DIR locally; will create on write if permitted");
    }
  }

  // GET /api/media/:id — stream stored media asset with appropriate mime-type and cache headers
  fastify.get("/media/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      const media = await request.prisma.media.findUnique({
        where: { id },
      });

      if (!media) {
        return reply.code(404).send({ error: "Media not found", code: "NOT_FOUND" });
      }

      if (!fs.existsSync(media.storagePath)) {
        fastify.log.error({ mediaId: id, path: media.storagePath }, "Media file missing from persistent volume");
        return reply.code(404).send({ error: "Media file missing on storage volume", code: "FILE_MISSING" });
      }

      const stream = fs.createReadStream(media.storagePath);
      reply.header("Content-Type", media.mimeType || "application/octet-stream");
      reply.header("Content-Length", media.sizeBytes);
      reply.header("Cache-Control", "public, max-age=31536000, immutable");
      return reply.send(stream);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: "Failed to read media", code: "MEDIA_READ_ERROR" });
    }
  });

  // POST /api/media/upload — upload raw base64 or binary media
  fastify.post(
    "/media/upload",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const user = request.user;
      const userId = user?.id || user?.sub;

      const body = request.body as {
        filename?: string;
        mimeType?: string;
        data?: string; // base64 payload
      };

      if (!body || !body.data) {
        return reply.code(400).send({ error: "Missing required media data", code: "VALIDATION_ERROR" });
      }

      try {
        const rawBuffer = Buffer.from(body.data, "base64");
        const filename = body.filename || `upload-${Date.now()}.png`;
        const mimeType = body.mimeType || "image/png";
        const fileExt = path.extname(filename) || ".png";
        const uniqueFilename = `${crypto.randomUUID()}${fileExt}`;
        const targetPath = path.join(MEDIA_DIR, uniqueFilename);

        await fs.promises.mkdir(MEDIA_DIR, { recursive: true });
        await fs.promises.writeFile(targetPath, rawBuffer);

        const media = await request.prisma.media.create({
          data: {
            filename,
            mimeType,
            sizeBytes: rawBuffer.length,
            storagePath: targetPath,
            url: `/api/media/${uniqueFilename}`,
            uploadedBy: userId || null,
          },
        });

        // Set url with generated DB id
        const finalUrl = `/api/media/${media.id}`;
        const updated = await request.prisma.media.update({
          where: { id: media.id },
          data: { url: finalUrl },
        });

        return reply.code(201).send({
          id: updated.id,
          url: updated.url,
          filename: updated.filename,
          mimeType: updated.mimeType,
          sizeBytes: updated.sizeBytes,
          createdAt: updated.createdAt,
        });
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({ error: "Failed to upload media", code: "UPLOAD_ERROR" });
      }
    }
  );
}
