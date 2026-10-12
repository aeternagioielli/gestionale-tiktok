import { z } from "zod";
import { AgentTaskAuditEventType, AgentTaskStatus as PrismaAgentTaskStatus } from "@/generated/prisma/enums";
import {
  assertAgentTaskTransition,
  createAgentTaskSchema,
  initialAgentTaskStatus,
  requiresApproval,
  type AgentId,
  type AgentTaskStatus,
} from "@/server/domain/agent-task-workflow";
import { DomainError } from "@/server/domain/errors";
import { getDatabaseClient } from "@/server/db";

const taskIdSchema = z.string().cuid();
const resultSchema = z.string().trim().min(1).max(4_000).nullable().optional();

export type AgentTaskView = {
  id: string;
  agent: AgentId;
  title: string;
  description: string | null;
  source: "MANUAL" | "AUTOMATIC" | "EVENT";
  priority: number;
  status: AgentTaskStatus;
  requiresApproval: boolean;
  approvalReason: string | null;
  result: string | null;
  executionId: string | null;
  aiInvocationId: string | null;
  parentTaskId: string | null;
  createdAt: string;
  updatedAt: string;
};

type StoredTask = Awaited<ReturnType<typeof findTaskById>>;

function mapTask(task: NonNullable<StoredTask>): AgentTaskView {
  return {
    id: task.id,
    agent: task.agent as AgentId,
    title: task.title,
    description: task.description,
    source: task.source,
    priority: task.priority,
    status: task.status as AgentTaskStatus,
    requiresApproval: task.requiresApproval,
    approvalReason: task.approvalReason,
    result: task.result,
    executionId: task.executionId,
    aiInvocationId: task.aiInvocationId,
    parentTaskId: task.parentTaskId,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

async function findTaskById(id: string) {
  return getDatabaseClient().agentTask.findUnique({ where: { id } });
}

export async function createAgentTask(input: unknown): Promise<{ task: AgentTaskView; created: boolean }> {
  const parsed = createAgentTaskSchema.parse(input);
  const db = getDatabaseClient();

  if (parsed.dedupeKey) {
    const existing = await db.agentTask.findUnique({ where: { dedupeKey: parsed.dedupeKey } });
    if (existing) return { task: mapTask(existing), created: false };
  }

  const status = initialAgentTaskStatus(parsed.risk);
  const needsApproval = requiresApproval(parsed.risk);
  const approvalReason = needsApproval
    ? "Questa attivita richiede un'approvazione esplicita prima di qualsiasi azione esterna."
    : null;

  try {
    const task = await db.$transaction(async (tx) => {
      const created = await tx.agentTask.create({
        data: {
          agent: parsed.agent,
          title: parsed.title,
          description: parsed.description ?? null,
          source: parsed.source,
          priority: parsed.priority,
          status: status as PrismaAgentTaskStatus,
          requiresApproval: needsApproval,
          approvalReason,
          dedupeKey: parsed.dedupeKey ?? null,
          parentTaskId: parsed.parentTaskId ?? null,
          executionId: parsed.executionId ?? null,
          aiInvocationId: parsed.aiInvocationId ?? null,
        },
      });
      await tx.agentTaskAuditEvent.createMany({
        data: [
          { taskId: created.id, eventType: AgentTaskAuditEventType.CREATED, toStatus: status as PrismaAgentTaskStatus },
          { taskId: created.id, eventType: AgentTaskAuditEventType.ASSIGNED, actor: parsed.agent },
          ...(needsApproval
            ? [{ taskId: created.id, eventType: AgentTaskAuditEventType.APPROVAL_REQUESTED, toStatus: status as PrismaAgentTaskStatus }]
            : []),
        ],
      });
      return created;
    });
    return { task: mapTask(task), created: true };
  } catch (error) {
    // A unique index also protects against two simultaneous planning requests.
    if (parsed.dedupeKey) {
      const existing = await db.agentTask.findUnique({ where: { dedupeKey: parsed.dedupeKey } });
      if (existing) return { task: mapTask(existing), created: false };
    }
    throw error;
  }
}

export async function listAgentTasks(input: { agent?: AgentId; limit?: number } = {}): Promise<AgentTaskView[]> {
  const limit = Math.min(Math.max(input.limit ?? 24, 1), 100);
  const tasks = await getDatabaseClient().agentTask.findMany({
    where: input.agent ? { agent: input.agent } : undefined,
    orderBy: [{ status: "asc" }, { priority: "asc" }, { updatedAt: "desc" }],
    take: limit,
  });
  return tasks.map(mapTask);
}

export async function transitionAgentTask(input: {
  taskId: string;
  status: AgentTaskStatus;
  actor?: AgentId;
  result?: string | null;
}): Promise<AgentTaskView> {
  const taskId = taskIdSchema.parse(input.taskId);
  const nextStatus = z.enum(["QUEUED", "RUNNING", "COMPLETED", "FAILED", "AWAITING_APPROVAL", "CANCELLED"]).parse(input.status);
  const result = resultSchema.parse(input.result);
  const existing = await findTaskById(taskId);
  if (!existing) throw new DomainError("Attivita non trovata.", "AGENT_TASK_NOT_FOUND");

  assertAgentTaskTransition(existing.status as AgentTaskStatus, nextStatus);
  if (nextStatus === "COMPLETED" && !result) {
    throw new DomainError("Per completare un'attivita e necessario un risultato sintetico.", "AGENT_TASK_RESULT_REQUIRED");
  }

  const eventType =
    existing.status === "AWAITING_APPROVAL" && nextStatus === "QUEUED"
      ? AgentTaskAuditEventType.APPROVED
      : AgentTaskAuditEventType.STATUS_CHANGED;
  const task = await getDatabaseClient().$transaction(async (tx) => {
    const updated = await tx.agentTask.update({
      where: { id: taskId },
      data: { status: nextStatus as PrismaAgentTaskStatus, ...(result !== undefined ? { result } : {}) },
    });
    await tx.agentTaskAuditEvent.create({
      data: {
        taskId,
        eventType,
        fromStatus: existing.status,
        toStatus: nextStatus as PrismaAgentTaskStatus,
        actor: input.actor,
      },
    });
    if (result) {
      await tx.agentTaskAuditEvent.create({ data: { taskId, eventType: AgentTaskAuditEventType.RESULT_RECORDED } });
    }
    return updated;
  });
  return mapTask(task);
}

/**
 * Explicitly reopens a failed task. The conditional update makes concurrent retry
 * requests safe: only one caller can move FAILED to QUEUED and record the audit event.
 */
export async function retryFailedAgentTask(input: {
  taskId: string;
  actor?: AgentId;
}): Promise<AgentTaskView | null> {
  const taskId = taskIdSchema.parse(input.taskId);
  const task = await getDatabaseClient().$transaction(async (tx) => {
    const reopened = await tx.agentTask.updateMany({
      where: { id: taskId, status: PrismaAgentTaskStatus.FAILED },
      data: { status: PrismaAgentTaskStatus.QUEUED },
    });
    if (reopened.count !== 1) return null;
    await tx.agentTaskAuditEvent.create({
      data: {
        taskId,
        eventType: AgentTaskAuditEventType.STATUS_CHANGED,
        fromStatus: PrismaAgentTaskStatus.FAILED,
        toStatus: PrismaAgentTaskStatus.QUEUED,
        actor: input.actor,
        metadata: { reason: "EXPLICIT_RETRY" },
      },
    });
    return tx.agentTask.findUnique({ where: { id: taskId } });
  });
  return task ? mapTask(task) : null;
}

/**
 * Acquires the right to execute a queued task once. It intentionally returns null
 * when another request already owns or completed the task instead of retrying work.
 */
export async function claimQueuedAgentTask(input: {
  taskId: string;
  actor?: AgentId;
}): Promise<AgentTaskView | null> {
  const taskId = taskIdSchema.parse(input.taskId);
  const task = await getDatabaseClient().$transaction(async (tx) => {
    const claimed = await tx.agentTask.updateMany({
      where: { id: taskId, status: PrismaAgentTaskStatus.QUEUED },
      data: { status: PrismaAgentTaskStatus.RUNNING },
    });
    if (claimed.count !== 1) return null;
    await tx.agentTaskAuditEvent.create({
      data: {
        taskId,
        eventType: AgentTaskAuditEventType.STATUS_CHANGED,
        fromStatus: PrismaAgentTaskStatus.QUEUED,
        toStatus: PrismaAgentTaskStatus.RUNNING,
        actor: input.actor,
        metadata: { reason: "EXECUTION_CLAIMED" },
      },
    });
    return tx.agentTask.findUnique({ where: { id: taskId } });
  });
  return task ? mapTask(task) : null;
}
