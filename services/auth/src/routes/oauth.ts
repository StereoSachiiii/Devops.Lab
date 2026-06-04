import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { UserRegisteredEvent } from '@devops/messaging';
import { prisma } from '../utils/db';
import { config } from '../utils/session';

// ─── Provider-specific profile types ──────────────────────────────────────────

interface GithubUser    { id: number; email: string | null; name: string | null }
interface GithubEmail   { email: string; primary: boolean; verified: boolean }
interface GoogleUser    { id: string; email: string; name: string; verified_email: boolean }

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Resolve a verified email from GitHub — the profile email may be null/private. */
async function resolveGithubEmail(accessToken: string, profileEmail: string | null): Promise<string | null> {
  if (profileEmail) return profileEmail;

  const res     = await fetch('https://api.github.com/user/emails', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const emails  = await res.json() as GithubEmail[];
  const primary = emails.find((e) => e.primary && e.verified);
  return primary?.email ?? null;
}

/** Redirect the browser back to the frontend after a successful OAuth login. */
function redirectToFrontend(reply: FastifyReply, token: string): FastifyReply {
  return reply
    .setCookie('token', token, {
      httpOnly: true,
      path:     '/',
      sameSite: 'lax',
      secure:   config.isProd,
    })
    .redirect(`${config.frontendUrl}/auth/callback?success=true`);
}

// ─── Route registration ───────────────────────────────────────────────────────

export async function oauthRoutes(fastify: FastifyInstance): Promise<void> {

  // ── GitHub callback ─────────────────────────────────────────────────────────

  fastify.get('/login/github/callback', async (req: FastifyRequest, reply: FastifyReply) => {
    const { token } = await fastify.github.getAccessTokenFromAuthorizationCodeFlow(req);

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

    const user = await findOrCreateOAuthUser(fastify, {
      provider: 'github',
      providerId: ghUser.id.toString(),
      email,
      name: ghUser.name,
      emailVerified: true,
    });

    const jwtToken = fastify.jwt.sign({ sub: user.id, email: user.email, role: user.role, iss: config.jwtIssuer });
    return redirectToFrontend(reply, jwtToken);
  });

  // ── Google callback ─────────────────────────────────────────────────────────

  fastify.get('/login/google/callback', async (req: FastifyRequest, reply: FastifyReply) => {
    const { token } = await fastify.google.getAccessTokenFromAuthorizationCodeFlow(req);

    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    const gUser = await userRes.json() as GoogleUser;

    const user = await findOrCreateOAuthUser(fastify, {
      provider: 'google',
      providerId: gUser.id,
      email: gUser.email,
      name: gUser.name,
      emailVerified: gUser.verified_email,
    });

    const jwtToken = fastify.jwt.sign({ sub: user.id, email: user.email, role: user.role, iss: config.jwtIssuer });
    return redirectToFrontend(reply, jwtToken);
  });
}

// ─── Shared OAuth logic ───────────────────────────────────────────────────────

interface OAuthProfile {
  provider:      'github' | 'google';
  providerId:    string;
  email:         string;
  name:          string | null;
  emailVerified: boolean;
}

/** Look up an existing user by provider ID or email; create one if not found. */
async function findOrCreateOAuthUser(
  fastify: FastifyInstance,
  profile: OAuthProfile,
) {
  // Try to find by provider-specific ID first.
  let user = profile.provider === 'github'
    ? await prisma.user.findUnique({ where: { githubId: profile.providerId } })
    : await prisma.user.findUnique({ where: { googleId: profile.providerId } });

  if (user) return user;

  // Upsert by email — link the provider ID to an existing account or create new.
  const providerData = profile.provider === 'github'
    ? { githubId: profile.providerId }
    : { googleId: profile.providerId };

  user = await prisma.user.upsert({
    where:  { email: profile.email },
    update: providerData,
    create: {
      email:         profile.email,
      name:          profile.name ?? null,
      ...providerData,
      emailVerified: profile.emailVerified ? new Date() : null,
    },
  });

  // Emit registration event (fire-and-forget — don't fail the login if Kafka is down).
  try {
    await fastify.kafka.emit(
      new UserRegisteredEvent({ userId: user.id, email: user.email, name: user.name }),
    );
  } catch (err) {
    fastify.log.error(err, `Failed to emit UserRegisteredEvent for ${profile.provider} OAuth user`);
  }

  return user;
}
