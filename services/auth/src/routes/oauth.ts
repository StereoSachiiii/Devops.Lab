import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@devops/db';
import { UserRegisteredEvent } from '@devops/messaging';

const prisma = new PrismaClient();

interface GithubUser {
  id: number;
  email: string | null;   
  name: string | null;
}

interface GithubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
}

interface GoogleUser {
  id: string;
  email: string;
  name: string;
  verified_email: boolean;
}


async function resolveGithubEmail(accessToken: string, profileEmail: string | null): Promise<string | null> {
  if (profileEmail) return profileEmail;

  const res = await fetch('https://api.github.com/user/emails', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const emails = await res.json() as GithubEmail[];
  const primary = emails.find((e) => e.primary && e.verified);
  return primary?.email ?? null;
}

/**
 * OAuth callback routes:
 *  GET /login/github/callback
 *  GET /login/google/callback
 */
export const oauthRoutes = fp(async (fastify: FastifyInstance) => {
  fastify.get('/login/github/callback', async (request: FastifyRequest, reply: FastifyReply) => {
    const { token } = await fastify.github.getAccessTokenFromAuthorizationCodeFlow(request);

    const userRes = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    const ghUser = await userRes.json() as GithubUser;

    const email = await resolveGithubEmail(token.access_token, ghUser.email);
    if (!email) {
      return reply.status(400).send({
        error: 'Your GitHub account has no verified public email. Please add one or use email/password login.',
      });
    }

    let user = await prisma.user.findUnique({ where: { githubId: ghUser.id.toString() } });

    if (!user) {
      user = await prisma.user.upsert({
        where: { email },
        update: { githubId: ghUser.id.toString() },
        create: {
          email,
          name: ghUser.name ?? null,
          githubId: ghUser.id.toString(),
          emailVerified: new Date(),
        },
      });

      try {
        await fastify.messaging.emit(
          new UserRegisteredEvent({ userId: user.id, email: user.email, name: user.name })
        );
      } catch (err) {
        fastify.log.error(err, 'Failed to emit UserRegisteredEvent for GitHub OAuth user');
      }
    }

    const jwtToken = fastify.jwt.sign({ sub: user.id, email: user.email, role: user.role });
    const frontendUrl = process.env['FRONTEND_URL'] || 'http://localhost:3000';

    return reply
      .setCookie('token', jwtToken, { httpOnly: true, path: '/', sameSite: 'lax', secure: process.env['NODE_ENV'] === 'production' })
      .redirect(`${frontendUrl}/auth/callback?success=true`);
  });

  fastify.get('/login/google/callback', async (request: FastifyRequest, reply: FastifyReply) => {
    const { token } = await fastify.google.getAccessTokenFromAuthorizationCodeFlow(request);

    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    const gUser = await userRes.json() as GoogleUser;

    let user = await prisma.user.findUnique({ where: { googleId: gUser.id } });

    if (!user) {
      user = await prisma.user.upsert({
        where: { email: gUser.email },
        update: { googleId: gUser.id },
        create: {
          email: gUser.email,
          name: gUser.name ?? null,
          googleId: gUser.id,
          emailVerified: gUser.verified_email ? new Date() : null,
        },
      });

      try {
        await fastify.messaging.emit(
          new UserRegisteredEvent({ userId: user.id, email: user.email, name: user.name })
        );
      } catch (err) {
        fastify.log.error(err, 'Failed to emit UserRegisteredEvent for Google OAuth user');
      }
    }

    const jwtToken = fastify.jwt.sign({ sub: user.id, email: user.email, role: user.role });
    const frontendUrl = process.env['FRONTEND_URL'] || 'http://localhost:3000';

    return reply
      .setCookie('token', jwtToken, { httpOnly: true, path: '/', sameSite: 'lax', secure: process.env['NODE_ENV'] === 'production' })
      .redirect(`${frontendUrl}/auth/callback?success=true`);
  });
});
