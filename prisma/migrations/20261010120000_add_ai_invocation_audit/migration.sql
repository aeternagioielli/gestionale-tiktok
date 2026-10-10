-- Stores AI operational metadata only; prompts, outputs and secrets are never persisted.
CREATE TABLE "AiInvocation" (
    "id" TEXT NOT NULL,
    "taskType" VARCHAR(64) NOT NULL,
    "model" VARCHAR(128) NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "totalTokens" INTEGER,
    "errorCode" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiInvocation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AiInvocation_createdAt_idx" ON "AiInvocation"("createdAt");
CREATE INDEX "AiInvocation_taskType_status_idx" ON "AiInvocation"("taskType", "status");
