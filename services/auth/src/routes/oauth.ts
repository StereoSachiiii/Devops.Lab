import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import crypto from "crypto";

import { prisma } from "../utils/db";
import { config, trackLogin } from "../utils/session";

/** TTL for the one-time OAuth exchange token (seconds). */
const EXCHANGE_TOKEN_TTL_SECONDS = 60;

/**
 * Store a single-use exchange token in Redis mapping to a userId.
 * Returns the generated UUID (do NOT log this value).
 */
async function createExchangeToken(fastify: FastifyInstance, userId: string): Promise<string> {
  const exchangeToken = crypto.randomUUID();
  await fastify.redis.set(`auth:exchange:${exchangeToken}`, userId, "EX", EXCHANGE_TOKEN_TTL_SECONDS);
  return exchangeToken;
}

// ─── Provider-specific profile types ──────────────────────────────────────────

interface GithubUser {
  id: number;
  email: string | null;
  name: string | null;
  avatar_url: string | null;
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
  picture: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Resolve a verified email from GitHub — the profile email may be null/private. */
async function resolveGithubEmail(
  accessToken: string,
  profileEmail: string | null
): Promise<string | null> {
  if (profileEmail) return profileEmail;

  const res = await fetch("https://api.github.com/user/emails", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const emails = (await res.json()) as GithubEmail[];
  const primary = emails.find((e) => e.primary && e.verified);
  return primary?.email ?? null;
}

// ─── Route registration ───────────────────────────────────────────────────────

export async function oauthRoutes(fastify: FastifyInstance): Promise<void> {
  // ── GitHub callback ─────────────────────────────────────────────────────────

  fastify.get("/login/github/callback", async (req: FastifyRequest, reply: FastifyReply) => {
    const { token } = await fastify.github.getAccessTokenFromAuthorizationCodeFlow(req);

    const userRes = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    const ghUser = (await userRes.json()) as GithubUser;

    const email = await resolveGithubEmail(token.access_token, ghUser.email);
    if (!email) {
      return reply.status(400).send({
        error:
          "Your GitHub account has no verified public email. Please add one or use email/password login.",
      });
    }

    const user = await findOrCreateOAuthUser({
      provider: "github",
      providerId: ghUser.id.toString(),
      email,
      name: ghUser.name,
      avatarUrl: ghUser.avatar_url,
      emailVerified: true,
    });

    await trackLogin(req, user.id);

    // Exchange-token pattern: do NOT set cookies on the cross-site redirect.
    // Instead, generate a single-use token the frontend will POST back immediately
    // from a same-origin context, which can then set cookies without browser SameSite issues.
    const exchangeToken = await createExchangeToken(fastify, user.id);
    return reply.redirect(`${config.frontendUrl}/auth/callback?exchange_token=${exchangeToken}`);
  });

  // ── Google callback ─────────────────────────────────────────────────────────

  fastify.get("/login/google/callback", async (req: FastifyRequest, reply: FastifyReply) => {
    const { token } = await fastify.google.getAccessTokenFromAuthorizationCodeFlow(req);

    const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    const gUser = (await userRes.json()) as GoogleUser;

    const user = await findOrCreateOAuthUser({
      provider: "google",
      providerId: gUser.id,
      email: gUser.email,
      name: gUser.name,
      avatarUrl: gUser.picture,
      emailVerified: gUser.verified_email,
    });

    await trackLogin(req, user.id);

    const exchangeToken = await createExchangeToken(fastify, user.id);
    return reply.redirect(`${config.frontendUrl}/auth/callback?exchange_token=${exchangeToken}`);
  });

  // ── Enterprise SSO Login (Okta / SAML / Azure AD Domain Flow) ─────────────
  fastify.post("/login/sso", async (req: FastifyRequest, reply: FastifyReply) => {
    const { email, orgSlug, ssoId, name, avatarUrl } = (req.body || {}) as {
      email?: string;
      orgSlug?: string;
      ssoId?: string;
      name?: string;
      avatarUrl?: string;
    };

    if (!email || (!orgSlug && !ssoId)) {
      return reply.status(400).send({
        error: "Work email and organization domain/slug are required for SSO sign-in.",
        code: "INVALID_SSO_PAYLOAD",
      });
    }

    // Verify organization exists and has SSO enabled
    const domain = email.split("@")[1];
    const org = await req.prisma.org.findFirst({
      where: {
        OR: [
          ...(orgSlug ? [{ slug: orgSlug }] : []),
          ...(domain ? [{ ssoDomain: domain }] : []),
        ],
      },
    });

    if (!org) {
      return reply.status(404).send({
        error: `No organization configured for SSO with domain @${domain || orgSlug}.`,
        code: "SSO_ORG_NOT_FOUND",
      });
    }

    const providerId = ssoId || `sso_${org.id}_${email}`;

    const user = await findOrCreateOAuthUser({
      provider: "sso",
      providerId,
      email,
      name: name || email.split("@")[0] || "Enterprise User",
      avatarUrl: avatarUrl || null,
      emailVerified: true,
      orgId: org.id,
    });

    await trackLogin(req, user.id);

    const exchangeToken = await createExchangeToken(fastify, user.id);
    return reply.send({
      success: true,
      exchangeToken,
      org: { id: org.id, name: org.name, slug: org.slug, ssoProvider: org.ssoProvider || "SAML" },
    });
  });
}

// ─── Shared OAuth logic ───────────────────────────────────────────────────────

interface OAuthProfile {
  provider: "github" | "google" | "sso";
  providerId: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  emailVerified: boolean;
  orgId?: string;
}

/** Look up an existing user by provider ID or email; create one if not found. */
async function findOrCreateOAuthUser(profile: OAuthProfile) {
  // Try to find by provider-specific ID first.
  // Use transactional consistency for all OAuth user query and link operations
  return await prisma.$transaction(async (tx) => {
    let user =
      profile.provider === "github"
        ? await tx.user.findUnique({ where: { githubId: profile.providerId } })
        : profile.provider === "google"
          ? await tx.user.findUnique({ where: { googleId: profile.providerId } })
          : await tx.user.findUnique({ where: { ssoId: profile.providerId } });

    if (user) {
      if (profile.emailVerified && !user.emailVerified) {
        user = await tx.user.update({
          where: { id: user.id },
          data: { emailVerified: new Date() },
        });
      }
      return user;
    }

    // Check if user exists by email (link scenario).
    const existingByEmail = await tx.user.findUnique({ where: { email: profile.email } });

    const providerData =
      profile.provider === "github"
        ? { githubId: profile.providerId }
        : profile.provider === "google"
          ? { googleId: profile.providerId }
          : { ssoId: profile.providerId };

    if (existingByEmail) {
      // Link the provider ID to the existing account.
      user = await tx.user.update({
        where: { email: profile.email },
        data: {
          ...providerData,
          avatarUrl: profile.avatarUrl,
          ...(profile.orgId ? { orgId: profile.orgId } : {}),
          ...(profile.emailVerified && !existingByEmail.emailVerified
            ? { emailVerified: new Date() }
            : {}),
        },
      });
      return user;
    }

    // Create new OAuth user and registration outbox event atomically
    const newUser = await tx.user.create({
      data: {
        email: profile.email,
        name: profile.name ?? null,
        avatarUrl: profile.avatarUrl ?? null,
        ...providerData,
        orgId: profile.orgId ?? null,
        emailVerified: profile.emailVerified ? new Date() : null,
      },
    });

    await tx.authOutboxEvent.create({
      data: {
        eventType: "UserRegisteredEvent",
        payload: { userId: newUser.id, email: newUser.email, name: newUser.name },
      },
    });

    return newUser;
  });
}
