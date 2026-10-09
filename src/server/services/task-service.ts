import { AuditAction, TaskStatus as PrismaTaskStatus } from "@/generated/prisma/enums";
import { getDatabaseClient } from "@/server/db";
import {
  completeTask,
  createTask,
  type CreateTaskInput,
  type TaskRecord,
} from "@/server/domain/task-engine";

export function toDomainTask(task: {
  id: string;
  title: string;
  description: string | null;
  completionCriteria: string | null;
  status: string;
  priority: number;
  category: string;
  goalPhaseId: string | null;
  position: number;
  dueDate: Date | null;
  completedAt: Date | null;
  prerequisiteLinks: { prerequisiteId: string; prerequisite?: { title: string; status: string } }[];
}): TaskRecord {
  return {
    id: task.id,
    title: task.title,
    description: task.description ?? undefined,
    completionCriteria: task.completionCriteria ?? undefined,
    status: task.status as TaskRecord["status"],
    priority: task.priority,
    category: task.category as TaskRecord["category"],
    goalPhaseId: task.goalPhaseId ?? undefined,
    position: task.position,
    dueDate: task.dueDate ?? undefined,
    completedAt: task.completedAt ?? undefined,
    prerequisiteIds: task.prerequisiteLinks.map((dependency) => dependency.prerequisiteId),
  };
}

const taskInclude = {
  prerequisiteLinks: {
    select: { prerequisiteId: true, prerequisite: { select: { title: true, status: true } } },
  },
} as const;

export async function listPersistedTasks() {
  return getDatabaseClient().task.findMany({
    include: taskInclude,
    orderBy: [{ priority: "asc" }, { position: "asc" }],
  });
}

export async function createPersistedTask(input: CreateTaskInput) {
  const task = createTask(input);
  const db = getDatabaseClient();
  return db.$transaction(async (transaction) => {
    await transaction.task.create({
      data: {
        id: task.id,
        title: task.title,
        description: task.description,
        completionCriteria: task.completionCriteria,
        status: task.status as PrismaTaskStatus,
        priority: task.priority,
        category: task.category,
        goalPhaseId: task.goalPhaseId,
        position: task.position,
        dueDate: task.dueDate,
        prerequisiteLinks:
          task.prerequisiteIds.length > 0
            ? {
                createMany: {
                  data: task.prerequisiteIds.map((prerequisiteId) => ({ prerequisiteId })),
                },
              }
            : undefined,
      },
    });
    await transaction.auditLog.create({
      data: { action: AuditAction.TASK_CREATED, entityType: "Task", entityId: task.id },
    });
    return transaction.task.findUniqueOrThrow({ where: { id: task.id }, include: taskInclude });
  });
}

export async function completePersistedTask(taskId: string) {
  const db = getDatabaseClient();
  const persistedTasks = await db.task.findMany({ include: taskInclude });
  const result = completeTask(persistedTasks.map(toDomainTask), taskId);
  const unlockedIds = new Set(result.unlockedTaskIds);
  return db.$transaction(async (transaction) => {
    await transaction.task.update({
      where: { id: taskId },
      data: { status: PrismaTaskStatus.COMPLETED, completedAt: result.completedTask.completedAt },
    });
    if (unlockedIds.size > 0)
      await transaction.task.updateMany({
        where: { id: { in: [...unlockedIds] }, status: PrismaTaskStatus.LOCKED },
        data: { status: PrismaTaskStatus.TODO },
      });
    await transaction.auditLog.create({
      data: {
        action: AuditAction.TASK_COMPLETED,
        entityType: "Task",
        entityId: taskId,
        metadata: { unlockedTaskIds: [...unlockedIds] },
      },
    });
    return transaction.task.findUniqueOrThrow({ where: { id: taskId }, include: taskInclude });
  });
}
