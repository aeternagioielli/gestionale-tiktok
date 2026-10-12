-- Additive registry for the first multi-agent operational phase.
-- No existing records or tables are altered or removed.
CREATE TYPE "AgentId" AS ENUM ('LORENZO', 'MARCO', 'GIULIA', 'ALESSANDRO', 'MATTEO', 'FRANCESCA');
CREATE TYPE "AgentTaskSource" AS ENUM ('MANUAL', 'AUTOMATIC', 'EVENT');
CREATE TYPE "AgentTaskStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'AWAITING_APPROVAL', 'CANCELLED');
CREATE TYPE "AgentTaskAuditEventType" AS ENUM ('CREATED', 'ASSIGNED', 'STATUS_CHANGED', 'APPROVAL_REQUESTED', 'APPROVED', 'REJECTED', 'RESULT_RECORDED', 'DUPLICATE_SKIPPED');

CREATE TABLE "AgentTask" (
    "id" TEXT NOT NULL,
    "agent" "AgentId" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "source" "AgentTaskSource" NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 50,
    "status" "AgentTaskStatus" NOT NULL DEFAULT 'QUEUED',
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "approvalReason" TEXT,
    "result" TEXT,
    "dedupeKey" VARCHAR(160),
    "executionId" VARCHAR(128),
    "aiInvocationId" TEXT,
    "parentTaskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AgentTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentTaskAuditEvent" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "eventType" "AgentTaskAuditEventType" NOT NULL,
    "fromStatus" "AgentTaskStatus",
    "toStatus" "AgentTaskStatus",
    "actor" "AgentId",
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentTaskAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentTask_dedupeKey_key" ON "AgentTask"("dedupeKey");
CREATE INDEX "AgentTask_agent_status_priority_idx" ON "AgentTask"("agent", "status", "priority");
CREATE INDEX "AgentTask_status_updatedAt_idx" ON "AgentTask"("status", "updatedAt");
CREATE INDEX "AgentTask_parentTaskId_idx" ON "AgentTask"("parentTaskId");
CREATE INDEX "AgentTask_aiInvocationId_idx" ON "AgentTask"("aiInvocationId");
CREATE INDEX "AgentTaskAuditEvent_taskId_createdAt_idx" ON "AgentTaskAuditEvent"("taskId", "createdAt");
CREATE INDEX "AgentTaskAuditEvent_createdAt_idx" ON "AgentTaskAuditEvent"("createdAt");

ALTER TABLE "AgentTask" ADD CONSTRAINT "AgentTask_parentTaskId_fkey" FOREIGN KEY ("parentTaskId") REFERENCES "AgentTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentTask" ADD CONSTRAINT "AgentTask_aiInvocationId_fkey" FOREIGN KEY ("aiInvocationId") REFERENCES "AiInvocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentTaskAuditEvent" ADD CONSTRAINT "AgentTaskAuditEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "AgentTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
