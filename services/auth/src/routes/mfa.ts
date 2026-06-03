import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Type, type Static } from '@sinclair/typebox';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { prisma } from '../utils/db';
import { config, errorReply, createSession } from '../utils/session';

// ─── Schemas ──────────────────────────────────────────────────────────────────

const MfaVerifySchema = Type.Object({ code: Type.String() });
const MfaLoginSchema  = Type.Object({ mfaToken: Type.String(), code: Type.String() });

// ─── Route registration ───────────────────────────────────────────────────────

export async function mfaRoutes(fastify: FastifyInstance): Promise<void> {

  // ── Setup — generate secret + QR code ───────────────────────────────────────

  fastify.post(
    '/mfa/setup',
    { onRequest: [async (r) => r.jwtVerify()] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { sub, email } = req.user;
      const user = await prisma.user.findUnique({ where: { id: sub } });

      if (user?.mfaEnabled) {
        return errorReply(reply, 400, 'MFA_ALREADY_ENABLED', 'MFA is already enabled');
      }

      const secret   = authenticator.generateSecret();
      await prisma.user.update({ where: { id: sub }, data: { mfaSecret: secret } });

      const otpauth   = authenticator.keyuri(email, config.mfaAppName, secret);
      const qrCodeUrl = await QRCode.toDataURL(otpauth);

      return reply.send({ secret, qrCodeUrl });
    },
  );

  // ── Verify — confirm TOTP to enable MFA ─────────────────────────────────────

  fastify.post(
    '/mfa/verify',
    { schema: { body: MfaVerifySchema }, onRequest: [async (r) => r.jwtVerify()] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { sub } = req.user;
      const { code } = req.body as Static<typeof MfaVerifySchema>;

      const user = await prisma.user.findUnique({ where: { id: sub } });

      if (!user || !user.mfaSecret) {
        return errorReply(reply, 400, 'MFA_NOT_INITIALIZED', 'MFA setup not initialized');
      }
      if (user.mfaEnabled) {
        return errorReply(reply, 400, 'MFA_ALREADY_ENABLED', 'MFA is already enabled');
      }

      if (!authenticator.verify({ token: code, secret: user.mfaSecret })) {
        return errorReply(reply, 401, 'INVALID_MFA_CODE', 'Invalid MFA code');
      }

      await prisma.user.update({ where: { id: sub }, data: { mfaEnabled: true } });
      return reply.send({ success: true });
    },
  );

  // ── Login with MFA — complete auth after TOTP challenge ──────────────────────

  fastify.post(
    '/login/mfa',
    { schema: { body: MfaLoginSchema } },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { mfaToken, code } = req.body as Static<typeof MfaLoginSchema>;

      try {
        const decoded = fastify.jwt.verify<{ sub: string; pendingMfa: boolean }>(mfaToken);
        if (!decoded.pendingMfa) {
          return errorReply(reply, 401, 'INVALID_MFA_TOKEN', 'Invalid MFA token payload');
        }

        const user = await prisma.user.findUnique({ where: { id: decoded.sub } });
        if (!user || !user.mfaSecret) {
          return errorReply(reply, 401, 'MFA_SETUP_INCOMPLETE', 'MFA setup incomplete');
        }

        if (!authenticator.verify({ token: code, secret: user.mfaSecret })) {
          return errorReply(reply, 401, 'INVALID_MFA_CODE', 'Invalid MFA code');
        }

        return createSession(fastify, reply, user);
      } catch {
        return errorReply(reply, 401, 'INVALID_MFA_TOKEN', 'Invalid or expired MFA token');
      }
    },
  );
}
