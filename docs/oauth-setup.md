# Local Development OAuth Setup Guide

## Overview
This document details the exact configuration required in the Google Cloud Console for local OAuth 2.0 authentication, based on the codebase routing through the Kong API Gateway.

---

## 1. Required Google Cloud Console Values

### **Authorized JavaScript origins**
For requests originating from the browser and API gateway:
- `http://localhost:3000`
- `http://localhost:8005`

### **Authorized redirect URIs**
For callback handling by the web server through Kong API Gateway:
- `http://localhost:8005/api/auth/login/google/callback`

---

## 2. Where `redirect_uri` is Constructed in Code

- **File**: [`services/auth/src/plugins/oauth2.ts`](file:///c:/Users/sachin%20lakshitha/devop/services/auth/src/plugins/oauth2.ts#L11-L37)
- **Construction Logic**:
  ```typescript
  const baseUrl = `${requireEnv("PUBLIC_GATEWAY_URL")}/api/auth`;

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
  ```

---

## 3. Configuration Overrides (Port / Domain Changes)

If the gateway port, domain, or protocol changes in the future:
1. Update `PUBLIC_GATEWAY_URL` in [`.env`](file:///c:/Users/sachin%20lakshitha/devop/.env#L50).
2. Update the **Authorized redirect URIs** in Google Cloud Console to match `${PUBLIC_GATEWAY_URL}/api/auth/login/google/callback`.
