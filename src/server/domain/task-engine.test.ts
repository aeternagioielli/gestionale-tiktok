import { describe, expect, it } from "vitest";
import { DomainError } from "@/server/domain/errors";
import {
  completeTask,
  createTask,
  getBlockedTasks,
  getNextPriorityTask,
} from "@/server/domain/task-engine";

describe("Task Engine", () => {
  it("creates an independent task as TODO", () => {
    const task = createTask({ title: "Configura tracking", priority: 1 }, () => "task-1");
    expect(task).toMatchObject({ id: "task-1", status: "TODO", priority: 1 });
  });

  it("creates a locked task when it has a prerequisite", () => {
    const task = createTask(
      { title: "Avvia esperimento", prerequisiteIds: ["task-1"] },
      () => "task-2",
    );
    expect(task.status).toBe("LOCKED");
    expect(getBlockedTasks([task])).toHaveLength(1);
  });

  it("completes a task and unlocks the next one", () => {
    const first = createTask({ title: "Prima task" }, () => "task-1");
    const second = createTask(
      { title: "Seconda task", prerequisiteIds: [first.id] },
      () => "task-2",
    );
    const result = completeTask([first, second], first.id, new Date("2026-01-01"));
    expect(result.completedTask.status).toBe("COMPLETED");
    expect(result.unlockedTaskIds).toEqual([second.id]);
    expect(result.tasks.find((task) => task.id === second.id)?.status).toBe("TODO");
  });

  it("waits for all prerequisites before unlocking", () => {
    const first = createTask({ title: "Prima" }, () => "task-1");
    const second = createTask({ title: "Seconda" }, () => "task-2");
    const third = createTask(
      { title: "Terza", prerequisiteIds: [first.id, second.id] },
      () => "task-3",
    );
    const afterFirst = completeTask([first, second, third], first.id);
    expect(afterFirst.tasks.find((task) => task.id === third.id)?.status).toBe("LOCKED");
    const afterSecond = completeTask(afterFirst.tasks, second.id);
    expect(afterSecond.tasks.find((task) => task.id === third.id)?.status).toBe("TODO");
  });

  it("returns the highest-priority available task", () => {
    const tasks = [
      createTask({ title: "Bassa", priority: 3 }, () => "task-3"),
      createTask({ title: "Alta", priority: 1 }, () => "task-1"),
      createTask({ title: "Bloccata", priority: 0, prerequisiteIds: ["missing"] }, () => "task-2"),
    ];
    expect(getNextPriorityTask(tasks)?.id).toBe("task-1");
  });

  it("does not complete a locked task or a task twice", () => {
    const locked = createTask({ title: "Bloccata", prerequisiteIds: ["task-0"] }, () => "task-1");
    expect(() => completeTask([locked], locked.id)).toThrow(DomainError);
    const ready = createTask({ title: "Pronta" }, () => "task-2");
    const completed = completeTask([ready], ready.id);
    expect(completeTask(completed.tasks, ready.id).alreadyCompleted).toBe(true);
  });

  it("rejects invalid input and unknown task references", () => {
    expect(() => createTask({ title: "" })).toThrow();
    expect(() => completeTask([], "missing")).toThrowError(/non trovata/);
  });

  it("rechecks prerequisites even if a stored task is incorrectly marked TODO", () => {
    const prerequisite = createTask({ title: "Prerequisito" }, () => "task-1");
    const dependent = {
      ...createTask({ title: "Dipendente", prerequisiteIds: [prerequisite.id] }, () => "task-2"),
      status: "TODO" as const,
    };
    expect(() => completeTask([prerequisite, dependent], dependent.id)).toThrowError(
      /prerequisiti/,
    );
  });
});
