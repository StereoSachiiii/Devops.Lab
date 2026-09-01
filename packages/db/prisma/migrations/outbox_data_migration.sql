-- Migration to split OutboxEvent into CoreOutboxEvent and AuthOutboxEvent

-- 1. Move Auth events
INSERT INTO "AuthOutboxEvent" (id, "eventType", payload, processed, "createdAt")
SELECT id, "eventType", payload, processed, "createdAt"
FROM "OutboxEvent"
WHERE "eventType" IN ('UserRegisteredEvent', 'EmailVerificationRequestedEvent', 'PasswordResetRequestedEvent', 'UserDeletedEvent');

-- 2. Move Core events
INSERT INTO "CoreOutboxEvent" (id, "eventType", payload, processed, "createdAt")
SELECT id, "eventType", payload, processed, "createdAt"
FROM "OutboxEvent"
WHERE "eventType" IN ('SessionStartedEvent', 'SessionEndedEvent');

-- 3. Delete old table
DROP TABLE "OutboxEvent";
