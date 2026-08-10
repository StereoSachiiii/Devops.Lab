import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import oauth2 from "@fastify/oauth2";
import { requireEnv } from "@devops/observability";

export const oauth2Plugin = fp(async (fastify: FastifyInstance) => {
  const required = (key: string): string => {
    return requireEnv(key);
  };

  const baseUrl = `${required("PUBLIC_GATEWAY_URL")}/api/auth`;

  await fastify.register(oauth2, {
    name: "github",
    credentials: {
      client: {
        id: required("GITHUB_CLIENT_ID"),
        secret: required("GITHUB_CLIENT_SECRET"),
      },
      auth: oauth2.GITHUB_CONFIGURATION,
    },
    startRedirectPath: "/login/github",
    callbackUri: `${baseUrl}/login/github/callback`,
    scope: ["user:email"],
  });

  await fastify.register(oauth2, {
    name: "google",
    credentials: {
      client: {
        id: required("GOOGLE_CLIENT_ID"),
        secret: required("GOOGLE_CLIENT_SECRET"),
      },
      auth: oauth2.GOOGLE_CONFIGURATION,
    },
    startRedirectPath: "/login/google",
    callbackUri: `${baseUrl}/login/google/callback`,
    scope: ["profile", "email"],
  });
});
