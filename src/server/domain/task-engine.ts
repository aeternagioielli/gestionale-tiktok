import { z } from "zod";
import { DomainError } from "@/server/domain/errors";

export const taskStatusSchema = z.enum(["LOCKED", "TODO", "IN_PROGRESS", "COMPLETED", "BLOCKED"]);
export const taskCategorySchema = z.enum([
  "DATA",
  "MARKETING",
  "CONTENT",
  "WEBSITE",
  "OPERATIONS",
  "OTHER",
]);
export const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional(),
  completionCriteria: z.string().trim().max(1000).optional(),
  priority: z.number().int().min(0).max(100).default(0),
  category: taskCategorySchema.default("OTHER"),
  goalPhaseId: z.string().trim().min(1).optional(),
  position: z.number().int().min(0).default(0),
  dueDate: z.date().optional(),
  prerequisiteIds: z.array(z.string().trim().min(1)).default([]),
});

export type TaskStatus = z.infer<typeof taskStatusSchema>;
export type TaskCategory = z.infer<typeof taskCategorySchema>;
export type TaskRecord = {
  id: string;
  title: string;
  description?: string;
  completionCriteria?: string;
  status: TaskStatus;
  priority: number;
  category: TaskCategory;
  goalPhaseId?: string;
  position: number;
  dueDate?: Date;
  completedAt?: Date;
  prerequisiteIds: string[];
};
export type CreateTaskInput = z.input<typeof createTaskSchema>;

type TaskEngineResult = {
  tasks: TaskRecord[];
  completedTask: TaskRecord;
  unlockedTaskIds: string[];
  alreadyCompleted: boolean;
};

export function createTask(
  input: CreateTaskInput,
  idFactory: () => string = () => crypto.randomUUID(),
): TaskRecord {
  const data = createTaskSchema.parse(input);
  const uniquePrerequisites = [...new Set(data.prerequisiteIds)];
  return {
    id: idFactory(),
    title: data.title,
    description: data.description,
    completionCriteria: data.completionCriteria,
    status: uniquePrerequisites.length > 0 ? "LOCKED" : "TODO",
    priority: data.priority,
    category: data.category,
    goalPhaseId: data.goalPhaseId,
    position: data.position,
    dueDate: data.dueDate,
    prerequisiteIds: uniquePrerequisites,
  };
}

function prerequisitesAreComplete(task: TaskRecord, tasksById: Map<string, TaskRecord>): boolean {
  return task.prerequisiteIds.every((id) => tasksById.get(id)?.status === "COMPLETED");
}

export function unlockEligibleTasks(tasks: TaskRecord[]): {
  tasks: TaskRecord[];
  unlockedTaskIds: string[];
} {
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const unlockedTaskIds: string[] = [];
  const nextTasks = tasks.map((task) => {
    if (task.status !== "LOCKED" || !prerequisitesAreComplete(task, tasksById)) return task;
    const unlocked = { ...task, status: "TODO" as const };
    unlockedTaskIds.push(task.id);
    return unlocked;
  });
  return { tasks: nextTasks, unlockedTaskIds };
}

export function completeTask(
  tasks: TaskRecord[],
  taskId: string,
  completedAt = new Date(),
): TaskEngineResult {
  const target = tasks.find((task) => task.id === taskId);
  if (!target) throw new DomainError(`Task ${taskId} non trovata.`, "TASK_NOT_FOUND");
  if (target.status === "LOCKED")
    throw new DomainError("Una task bloccata non può essere completata.", "TASK_LOCKED");
  if (target.status === "BLOCKED")
    throw new DomainError(
      "Una task bloccata da un problema non può essere completata.",
      "TASK_BLOCKED",
    );
  if (target.status === "COMPLETED")
    return { tasks, completedTask: target, unlockedTaskIds: [], alreadyCompleted: true };
  if (!prerequisitesAreComplete(target, new Map(tasks.map((task) => [task.id, task]))))
    throw new DomainError(
      "I prerequisiti della task non sono ancora soddisfatti.",
      "TASK_PREREQUISITES_MISSING",
    );

  const completed = { ...target, status: "COMPLETED" as const, completedAt };
  const updated = tasks.map((task) => (task.id === taskId ? completed : task));
  const unlocked = unlockEligibleTasks(updated);
  return {
    tasks: unlocked.tasks,
    completedTask: completed,
    unlockedTaskIds: unlocked.unlockedTaskIds,
    alreadyCompleted: false,
  };
}

export function getNextPriorityTask(tasks: TaskRecord[]): TaskRecord | undefined {
  return [...tasks]
    .filter((task) => task.status === "TODO" || task.status === "IN_PROGRESS")
    .sort((a, b) => a.priority - b.priority || a.position - b.position)[0];
}

export function getBlockedTasks(tasks: TaskRecord[]): TaskRecord[] {
  return tasks.filter((task) => task.status === "LOCKED" || task.status === "BLOCKED");
}
