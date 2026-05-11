import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import oauth2 from '@fastify/oauth2';
import cookie from '@fastify/cookie';
import dotenv from 'dotenv';
import { PrismaClient } from '@devops/db';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type, Static } from '@sinclair/typebox';
import argon2 from 'argon2';
import { OAuth2Namespace } from '@fastify/oauth2';
import { MessagingService, UserRegisteredEvent } from '@devops/messaging';




declare module 'fastify' {
  interface FastifyInstance {
    github: OAuth2Namespace;
    google: OAuth2Namespace;
    messaging: MessagingService;
  }
}


dotenv.config();

export const prisma = new PrismaClient();

export function buildApp() {
  const fastify = Fastify({
    logger: process.env['NODE_ENV'] === 'test' ? false : true,
  }).withTypeProvider<TypeBoxTypeProvider>();

  // Plugins
  fastify.register(cors);
  fastify.register(cookie);
  
  fastify.register(jwt, {
    secret: process.env['JWT_SECRET'] || 'super-secret-development-key',
    sign: {
      expiresIn: '7d',
    },
  });

  // Messaging Setup
  const messaging = new MessagingService();
  fastify.decorate('messaging', messaging);

  fastify.addHook('onReady', async () => {
    await messaging.initProducer();
    fastify.log.info('🚀 Kafka Messaging Ready');
  });

  fastify.addHook('onClose', async () => {
    await messaging.disconnect();
  });


  // GitHub OAuth
  fastify.register(oauth2, {
    name: 'github',
    credentials: {
      client: {
        id: process.env['GITHUB_CLIENT_ID'] || '',
        secret: process.env['GITHUB_CLIENT_SECRET'] || '',
      },
      auth: oauth2.GITHUB_CONFIGURATION,
    },
    startRedirectPath: '/login/github',
    callbackUri: `${process.env['BASE_URL'] || 'http://localhost:3002'}/login/github/callback`,
  });

  // Google OAuth
  fastify.register(oauth2, {
    name: 'google',
    credentials: {
      client: {
        id: process.env['GOOGLE_CLIENT_ID'] || '',
        secret: process.env['GOOGLE_CLIENT_SECRET'] || '',
      },
      auth: oauth2.GOOGLE_CONFIGURATION,
    },
    startRedirectPath: '/login/google',
    callbackUri: `${process.env['BASE_URL'] || 'http://localhost:3002'}/login/google/callback`,
  });

  /**
   * Health Check
   */
  fastify.get('/health', async () => {
    return { status: 'ok', service: 'auth-service' };
  });

  /**
   * Register (Email/Password)
   */
  const RegisterSchema = Type.Object({
    email: Type.String({ format: 'email' }),
    password: Type.String({ minLength: 8 }),
    name: Type.Optional(Type.String()),
  });

  fastify.post('/register', {
    schema: {
      body: RegisterSchema,
    },
  }, async (request, reply) => {
    const { email, password, name } = request.body as Static<typeof RegisterSchema>;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return reply.status(400).send({ error: 'User already exists' });
    }

    const hashedPassword = await argon2.hash(password);
    
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name: name ?? null,
        role: 'LEARNER',
      },
    });

    // Emit Kafka Event
    try {
      await fastify.messaging.emit(new UserRegisteredEvent({
        userId: user.id,
        email: user.email,
        name: user.name,
      }));
    } catch (err) {
      fastify.log.error(err, 'Failed to emit USER_REGISTERED event');
    }



    const token = fastify.jwt.sign({ sub: user.id, email: user.email, role: user.role });
    return { token, user: { id: user.id, email: user.email, role: user.role } };
  });

  /**
   * Login (Email/Password)
   */
  const LoginSchema = Type.Object({
    email: Type.String({ format: 'email' }),
    password: Type.String(),
  });

  fastify.post('/login', {
    schema: {
      body: LoginSchema,
    },
  }, async (request, reply) => {
    const { email, password } = request.body as Static<typeof LoginSchema>;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.password) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const valid = await argon2.verify(user.password, password);
    if (!valid) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const token = fastify.jwt.sign({ sub: user.id, email: user.email, role: user.role });
    return { token, user: { id: user.id, email: user.email, role: user.role } };
  });

  /**
   * GitHub Callback
   */
  fastify.get('/login/github/callback', async (request, reply) => {
    const { token } = await fastify.github.getAccessTokenFromAuthorizationCodeFlow(request);
    
    // Fetch GitHub user profile
    const userResponse = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    const ghUser = await userResponse.json() as { id: number; email: string; name: string };

    let user = await prisma.user.findUnique({ where: { githubId: ghUser.id.toString() } });

    if (!user) {
      // Provision user
      user = await prisma.user.upsert({
        where: { email: ghUser.email },
        update: { githubId: ghUser.id.toString() },
        create: {
          email: ghUser.email,
          name: ghUser.name ?? null,
          githubId: ghUser.id.toString(),
          emailVerified: new Date(), // OAuth emails are trusted
        },
      });
    }

    const jwtToken = fastify.jwt.sign({ sub: user.id, email: user.email, role: user.role });
    return reply.redirect(`${process.env['FRONTEND_URL'] || 'http://localhost:3000'}/auth/callback?token=${jwtToken}`);
  });

  /**
   * Google Callback
   */
  fastify.get('/login/google/callback', async (request, reply) => {
    const { token } = await fastify.google.getAccessTokenFromAuthorizationCodeFlow(request);
    
    const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    const gUser = await userResponse.json() as { id: string; email: string; name: string; verified_email: boolean };

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
    }

    const jwtToken = fastify.jwt.sign({ sub: user.id, email: user.email, role: user.role });
    return reply.redirect(`${process.env['FRONTEND_URL'] || 'http://localhost:3000'}/auth/callback?token=${jwtToken}`);
  });


  return fastify;
}
