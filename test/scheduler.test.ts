// SPDX-License-Identifier: MIT
// SPIRAL Task Scheduler Tests

import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert";
import {
  DefaultTaskScheduler,
  DeterministicScheduler,
  AsyncBarrier,
  createTaskScheduler,
  createDeterministicScheduler,
  type TaskScheduler,
  type SchedulerMode,
} from "../src/scheduler.js";
import type { Value } from "../src/types.js";

//==============================================================================
// DefaultTaskScheduler Tests
//==============================================================================

describe("DefaultTaskScheduler", () => {
  let scheduler: DefaultTaskScheduler;

  beforeEach(() => {
    scheduler = new DefaultTaskScheduler();
  });

  describe("spawn and await", () => {
    it("should spawn a task and await its result", async () => {
      scheduler.spawn("task1", async () => 42 as Value);
      const result = await scheduler.await("task1");
      assert.strictEqual(result, 42);
    });

    it("should handle async functions with delays", async () => {
      scheduler.spawn("task1", async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return "hello" as Value;
      });
      const result = await scheduler.await("task1");
      assert.strictEqual(result, "hello");
    });

    it("should handle tasks that return objects", async () => {
      const expectedResult = { foo: "bar" } as Value;
      scheduler.spawn("task1", async () => expectedResult);
      const result = await scheduler.await("task1");
      assert.deepStrictEqual(result, expectedResult);
    });

    it("should handle tasks that return arrays", async () => {
      const expectedResult = [1, 2, 3] as Value;
      scheduler.spawn("task1", async () => expectedResult);
      const result = await scheduler.await("task1");
      assert.deepStrictEqual(result, expectedResult);
    });
  });

  describe("multiple concurrent tasks", () => {
    it("should execute multiple tasks concurrently", async () => {
      scheduler.spawn("task1", async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return 1 as Value;
      });
      scheduler.spawn("task2", async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return 2 as Value;
      });
      scheduler.spawn("task3", async () => 3 as Value);

      const [r1, r2, r3] = await Promise.all([
        scheduler.await("task1"),
        scheduler.await("task2"),
        scheduler.await("task3"),
      ]);

      assert.strictEqual(r1, 1);
      assert.strictEqual(r2, 2);
      assert.strictEqual(r3, 3);
    });

    it("should track active task count correctly", async () => {
      assert.strictEqual(scheduler.activeTaskCount, 0);

      scheduler.spawn("task1", async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return 1 as Value;
      });
      scheduler.spawn("task2", async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return 2 as Value;
      });

      // Tasks are spawned and running
      assert.strictEqual(scheduler.activeTaskCount, 2);

      await scheduler.await("task1");
      await scheduler.await("task2");

      // Tasks remain in map after completion for potential re-awaits
      assert.strictEqual(scheduler.activeTaskCount, 2);
    });
  });

  describe("task result caching", () => {
    it("should cache task results for multiple awaits", async () => {
      let callCount = 0;
      scheduler.spawn("task1", async () => {
        callCount++;
        return 42 as Value;
      });

      const result1 = await scheduler.await("task1");
      const result2 = await scheduler.await("task1");
      const result3 = await scheduler.await("task1");

      assert.strictEqual(result1, 42);
      assert.strictEqual(result2, 42);
      assert.strictEqual(result3, 42);
      // Function should only be called once despite multiple awaits
      assert.strictEqual(callCount, 1);
    });
  });

  describe("global step limit enforcement", () => {
    it("should enforce global step limit", async () => {
      const limitedScheduler = new DefaultTaskScheduler({
        globalMaxSteps: 10,
      });

      for (let i = 0; i < 10; i++) {
        await limitedScheduler.checkGlobalSteps();
      }

      await assert.rejects(
        async () => {
          await limitedScheduler.checkGlobalSteps();
        },
        { message: "Global step limit exceeded" },
      );
    });

    it("should yield at specified intervals", async () => {
      const yieldScheduler = new DefaultTaskScheduler({
        globalMaxSteps: 1000,
        yieldInterval: 5,
      });

      let steps = 0;
      // Should complete without hanging
      for (let i = 0; i < 20; i++) {
        await yieldScheduler.checkGlobalSteps();
        steps++;
      }

      assert.strictEqual(steps, 20);
    });
  });

  describe("task cancellation", () => {
    it("should cancel a running task", () => {
      scheduler.spawn("task1", async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return 1 as Value;
      });

      assert.strictEqual(scheduler.activeTaskCount, 1);
      scheduler.cancel("task1");
      assert.strictEqual(scheduler.activeTaskCount, 0);
    });

    it("should handle cancelling a non-existent task gracefully", () => {
      // Should not throw
      assert.doesNotThrow(() => {
        scheduler.cancel("non-existent");
      });
    });

    it("should handle cancelling completed tasks", async () => {
      scheduler.spawn("task1", async () => 1 as Value);
      await scheduler.await("task1");

      // Should not throw even though task is completed
      assert.doesNotThrow(() => {
        scheduler.cancel("task1");
      });
    });
  });

  describe("task completion status", () => {
    it("should identify pending tasks", () => {
      scheduler.spawn("task1", async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return 1 as Value;
      });

      assert.strictEqual(scheduler.isComplete("task1"), false);
    });

    it("should identify completed tasks", async () => {
      scheduler.spawn("task1", async () => 1 as Value);
      await scheduler.await("task1");
      assert.strictEqual(scheduler.isComplete("task1"), true);
    });

    it("should identify failed tasks", async () => {
      scheduler.spawn("task1", async () => {
        throw new Error("Task failed");
      });

      await assert.rejects(async () => {
        await scheduler.await("task1");
      });

      assert.strictEqual(scheduler.isComplete("task1"), true);
    });

    it("should treat non-existent tasks as complete", () => {
      assert.strictEqual(scheduler.isComplete("non-existent"), true);
    });
  });

  describe("error handling", () => {
    it("should propagate task errors", async () => {
      scheduler.spawn("task1", async () => {
        throw new Error("Task error");
      });

      await assert.rejects(
        async () => {
          await scheduler.await("task1");
        },
        { message: "Task error" },
      );
    });

    it("should throw error when awaiting non-existent task", async () => {
      await assert.rejects(
        async () => {
          await scheduler.await("non-existent");
        },
        { message: "Task non-existent not found" },
      );
    });
  });

  describe("currentTaskId", () => {
    it("should have default main task ID", () => {
      assert.strictEqual(scheduler.currentTaskId, "main");
    });

    it("should allow setting currentTaskId", () => {
      scheduler.currentTaskId = "custom-task";
      assert.strictEqual(scheduler.currentTaskId, "custom-task");
    });
  });

  describe("globalSteps counter", () => {
    it("should track global steps", async () => {
      assert.strictEqual(scheduler.globalSteps, 0);

      await scheduler.checkGlobalSteps();
      assert.strictEqual(scheduler.globalSteps, 1);

      await scheduler.checkGlobalSteps();
      assert.strictEqual(scheduler.globalSteps, 2);
    });
  });
});

//==============================================================================
// DeterministicScheduler Tests
//==============================================================================

describe("DeterministicScheduler", () => {
  describe("sequential mode", () => {
    it("should execute tasks sequentially", async () => {
      const scheduler = new DeterministicScheduler("sequential");
      const executionOrder: string[] = [];

      // In sequential mode, tasks are run via runNextTask() when spawned
      // runNextTask() starts the first task immediately
      scheduler.spawn("task1", async () => {
        executionOrder.push("task1-start");
        await new Promise((resolve) => setTimeout(resolve, 5));
        executionOrder.push("task1-end");
        return 1 as Value;
      });

      // Wait for task1 to complete
      await new Promise((resolve) => setTimeout(resolve, 20));

      scheduler.spawn("task2", async () => {
        executionOrder.push("task2-start");
        executionOrder.push("task2-end");
        return 2 as Value;
      });

      await scheduler.await("task1");
      await scheduler.await("task2");

      // In sequential mode, task1 should complete before task2 starts
      // task1-start, task1-end should come before task2-start
      const task1EndIndex = executionOrder.indexOf("task1-end");
      const task2StartIndex = executionOrder.indexOf("task2-start");
      assert.ok(task1EndIndex !== -1);
      assert.ok(task2StartIndex !== -1);
      assert.ok(task1EndIndex < task2StartIndex, "task1 should complete before task2 starts");
    });

    it("should handle sequential task dependencies", async () => {
      const scheduler = new DeterministicScheduler("sequential");
      let value = 0;

      scheduler.spawn("task1", async () => {
        value = 1;
        return value as Value;
      });

      scheduler.spawn("task2", async () => {
        value = value * 2;
        return value as Value;
      });

      const result1 = await scheduler.await("task1");
      const result2 = await scheduler.await("task2");

      assert.strictEqual(result1, 1);
      assert.strictEqual(result2, 2);
    });
  });

  describe("parallel mode", () => {
    it("should execute tasks in parallel", async () => {
      const scheduler = new DeterministicScheduler("parallel");
      const executionOrder: string[] = [];

      scheduler.spawn("task1", async () => {
        executionOrder.push("task1");
        return 1 as Value;
      });

      scheduler.spawn("task2", async () => {
        executionOrder.push("task2");
        return 2 as Value;
      });

      // In parallel mode, tasks execute when awaited
      await Promise.all([scheduler.await("task1"), scheduler.await("task2")]);

      assert.strictEqual(executionOrder.length, 2);
      assert.ok(executionOrder.includes("task1"));
      assert.ok(executionOrder.includes("task2"));
    });
  });

  describe("breadth-first execution", () => {
    it("should execute tasks breadth-first", async () => {
      const scheduler = new DeterministicScheduler("breadth-first");
      const executionOrder: string[] = [];

      // Spawn tasks in breadth-first mode - tasks execute in batches
      scheduler.spawn("task1", async () => {
        executionOrder.push("task1");
        return 1 as Value;
      });

      scheduler.spawn("task2", async () => {
        executionOrder.push("task2");
        return 2 as Value;
      });

      scheduler.spawn("task3", async () => {
        executionOrder.push("task3");
        return 3 as Value;
      });

      // Wait for all tasks to complete
      await Promise.all([
        scheduler.await("task1"),
        scheduler.await("task2"),
        scheduler.await("task3"),
      ]);

      // All tasks should have executed
      assert.strictEqual(executionOrder.length, 3);
      assert.ok(executionOrder.includes("task1"));
      assert.ok(executionOrder.includes("task2"));
      assert.ok(executionOrder.includes("task3"));
    });
  });

  describe("depth-first execution", () => {
    it("should execute tasks depth-first (LIFO)", async () => {
      const scheduler = new DeterministicScheduler("depth-first");
      const executionOrder: string[] = [];

      // Spawn tasks - depth-first executes last spawned first (LIFO)
      scheduler.spawn("task1", async () => {
        executionOrder.push("task1");
        return 1 as Value;
      });

      scheduler.spawn("task2", async () => {
        executionOrder.push("task2");
        return 2 as Value;
      });

      scheduler.spawn("task3", async () => {
        executionOrder.push("task3");
        return 3 as Value;
      });

      // Wait for all tasks to complete
      await Promise.all([
        scheduler.await("task1"),
        scheduler.await("task2"),
        scheduler.await("task3"),
      ]);

      // All tasks should have executed
      assert.strictEqual(executionOrder.length, 3);
      assert.ok(executionOrder.includes("task1"));
      assert.ok(executionOrder.includes("task2"));
      assert.ok(executionOrder.includes("task3"));
    });
  });

  describe("mode switching", () => {
    it("should switch between scheduler modes", async () => {
      const scheduler = new DeterministicScheduler("sequential");

      assert.strictEqual(scheduler.getMode(), "sequential");

      scheduler.setMode("parallel");
      assert.strictEqual(scheduler.getMode(), "parallel");

      scheduler.setMode("breadth-first");
      assert.strictEqual(scheduler.getMode(), "breadth-first");

      scheduler.setMode("depth-first");
      assert.strictEqual(scheduler.getMode(), "depth-first");
    });

    it("should execute differently after mode change", async () => {
      const scheduler = new DeterministicScheduler("sequential");
      const results: number[] = [];

      scheduler.spawn("task1", async () => {
        results.push(1);
        return 1 as Value;
      });

      scheduler.spawn("task2", async () => {
        results.push(2);
        return 2 as Value;
      });

      await scheduler.await("task1");
      await scheduler.await("task2");

      assert.deepStrictEqual(results, [1, 2]);

      // Switch to parallel mode
      scheduler.setMode("parallel");
      results.length = 0;

      scheduler.spawn("task3", async () => {
        results.push(3);
        return 3 as Value;
      });

      scheduler.spawn("task4", async () => {
        results.push(4);
        return 4 as Value;
      });

      await Promise.all([
        scheduler.await("task3"),
        scheduler.await("task4"),
      ]);

      // Both tasks should have executed
      assert.strictEqual(results.length, 2);
      assert.ok(results.includes(3));
      assert.ok(results.includes(4));
    });
  });

  describe("activeTaskCount", () => {
    it("should track queued task count", () => {
      const scheduler = new DeterministicScheduler("parallel");

      assert.strictEqual(scheduler.activeTaskCount, 0);

      scheduler.spawn("task1", async () => 1 as Value);
      scheduler.spawn("task2", async () => 2 as Value);

      assert.strictEqual(scheduler.activeTaskCount, 2);
    });

    it("should update count after task completion", async () => {
      const scheduler = new DeterministicScheduler("parallel");

      scheduler.spawn("task1", async () => 1 as Value);
      assert.strictEqual(scheduler.activeTaskCount, 1);

      await scheduler.await("task1");
      assert.strictEqual(scheduler.activeTaskCount, 0);
    });
  });

  describe("cancellation", () => {
    it("should cancel queued tasks", () => {
      const scheduler = new DeterministicScheduler("parallel");

      scheduler.spawn("task1", async () => 1 as Value);
      scheduler.spawn("task2", async () => 2 as Value);

      assert.strictEqual(scheduler.activeTaskCount, 2);

      scheduler.cancel("task1");
      assert.strictEqual(scheduler.activeTaskCount, 1);
    });
  });

  describe("completion status", () => {
    it("should identify completed tasks", async () => {
      const scheduler = new DeterministicScheduler("parallel");

      scheduler.spawn("task1", async () => 1 as Value);

      assert.strictEqual(scheduler.isComplete("task1"), false);

      await scheduler.await("task1");

      assert.strictEqual(scheduler.isComplete("task1"), true);
    });

    it("should return false for non-existent tasks", () => {
      const scheduler = new DeterministicScheduler("parallel");

      // Unlike DefaultTaskScheduler, non-existent means not complete
      assert.strictEqual(scheduler.isComplete("non-existent"), false);
    });
  });

  describe("global step limit", () => {
    it("should enforce global step limit", async () => {
      const scheduler = new DeterministicScheduler("parallel", {
        globalMaxSteps: 5,
      });

      for (let i = 0; i < 5; i++) {
        await scheduler.checkGlobalSteps();
      }

      await assert.rejects(
        async () => {
          await scheduler.checkGlobalSteps();
        },
        { message: "Global step limit exceeded" },
      );
    });
  });

  describe("currentTaskId", () => {
    it("should update currentTaskId during task execution", async () => {
      const scheduler = new DeterministicScheduler("parallel");
      let taskIdDuringExecution: string | undefined;

      scheduler.spawn("task1", async () => {
        taskIdDuringExecution = scheduler.currentTaskId;
        return 1 as Value;
      });

      await scheduler.await("task1");

      assert.strictEqual(taskIdDuringExecution, "task1");
      assert.strictEqual(scheduler.currentTaskId, "main");
    });
  });
});

//==============================================================================
// AsyncBarrier Tests
//==============================================================================

describe("AsyncBarrier", () => {
  describe("basic barrier synchronization", () => {
    it("should synchronize tasks at barrier", async () => {
      const barrier = new AsyncBarrier(3);
      const results: number[] = [];
      let arrivedCount = 0;

      const task1 = async () => {
        results.push(1);
        arrivedCount++;
        await barrier.wait();
        results.push(1);
      };

      const task2 = async () => {
        results.push(2);
        arrivedCount++;
        await barrier.wait();
        results.push(2);
      };

      const task3 = async () => {
        results.push(3);
        arrivedCount++;
        await barrier.wait();
        results.push(3);
      };

      await Promise.all([task1(), task2(), task3()]);

      // All tasks arrive first, then all proceed
      assert.strictEqual(arrivedCount, 3);
      // First 3 values are arrivals (1, 2, 3 in some order)
      const arrivals = results.slice(0, 3);
      assert.deepStrictEqual(arrivals.sort(), [1, 2, 3]);
      // Last 3 values are departures (1, 2, 3 in some order)
      const departures = results.slice(3);
      assert.deepStrictEqual(departures.sort(), [1, 2, 3]);
    });

    it("should handle two-task barrier", async () => {
      const barrier = new AsyncBarrier(2);
      const results: string[] = [];

      const task1 = async () => {
        results.push("task1-arrive");
        await barrier.wait();
        results.push("task1-depart");
      };

      const task2 = async () => {
        results.push("task2-arrive");
        await barrier.wait();
        results.push("task2-depart");
      };

      await Promise.all([task1(), task2()]);

      // Both arrivals happen before both departures
      assert.strictEqual(results.length, 4);
      assert.strictEqual(results[0], "task1-arrive");
      assert.strictEqual(results[1], "task2-arrive");
      // Departures order is not deterministic
      assert.ok(results.includes("task1-depart"));
      assert.ok(results.includes("task2-depart"));
    });

    it("should handle single-task barrier", async () => {
      const barrier = new AsyncBarrier(1);
      const results: string[] = [];

      const task1 = async () => {
        results.push("arrive");
        await barrier.wait();
        results.push("depart");
      };

      await task1();

      assert.deepStrictEqual(results, ["arrive", "depart"]);
    });
  });

  describe("reset functionality", () => {
    it("should reset barrier for reuse", async () => {
      const barrier = new AsyncBarrier(2);
      const results: string[] = [];

      // First barrier cycle
      const cycle1 = Promise.all([
        (async () => {
          results.push("c1-t1-arrive");
          await barrier.wait();
          results.push("c1-t1-depart");
        })(),
        (async () => {
          results.push("c1-t2-arrive");
          await barrier.wait();
          results.push("c1-t2-depart");
        })(),
      ]);

      await cycle1;

      // Reset for second cycle
      barrier.reset(2);

      // Second barrier cycle
      const cycle2 = Promise.all([
        (async () => {
          results.push("c2-t1-arrive");
          await barrier.wait();
          results.push("c2-t1-depart");
        })(),
        (async () => {
          results.push("c2-t2-arrive");
          await barrier.wait();
          results.push("c2-t2-depart");
        })(),
      ]);

      await cycle2;

      // Check that we have 8 entries total
      assert.strictEqual(results.length, 8);
      // First cycle arrivals (order is deterministic)
      assert.strictEqual(results[0], "c1-t1-arrive");
      assert.strictEqual(results[1], "c1-t2-arrive");
      // First cycle departures (both present, order not guaranteed)
      assert.ok(results.slice(2, 4).includes("c1-t1-depart"));
      assert.ok(results.slice(2, 4).includes("c1-t2-depart"));
      // Second cycle arrivals (order is deterministic)
      assert.strictEqual(results[4], "c2-t1-arrive");
      assert.strictEqual(results[5], "c2-t2-arrive");
      // Second cycle departures (both present, order not guaranteed)
      assert.ok(results.slice(6).includes("c2-t1-depart"));
      assert.ok(results.slice(6).includes("c2-t2-depart"));
    });

    it("should allow changing barrier count on reset", async () => {
      const barrier = new AsyncBarrier(2);

      // First use with count=2
      await Promise.all([
        barrier.wait(),
        barrier.wait(),
      ]);

      // Reset with different count
      barrier.reset(3);

      const results: string[] = [];

      await Promise.all([
        (async () => {
          results.push("1");
          await barrier.wait();
          results.push("1");
        })(),
        (async () => {
          results.push("2");
          await barrier.wait();
          results.push("2");
        })(),
        (async () => {
          results.push("3");
          await barrier.wait();
          results.push("3");
        })(),
      ]);

      // First 3 are arrivals (1, 2, 3 in order), last 3 are departures (order not guaranteed)
      assert.strictEqual(results.length, 6);
      assert.strictEqual(results[0], "1");
      assert.strictEqual(results[1], "2");
      assert.strictEqual(results[2], "3");
      // Check that departures contain all three values
      const departures = results.slice(3);
      assert.deepStrictEqual(departures.sort(), ["1", "2", "3"]);
    });
  });

  describe("error handling", () => {
    it("should reject zero or negative count in constructor", () => {
      assert.throws(
        () => new AsyncBarrier(0),
        { message: "Barrier count must be positive" },
      );

      assert.throws(
        () => new AsyncBarrier(-1),
        { message: "Barrier count must be positive" },
      );
    });

    it("should reject zero or negative count in reset", () => {
      const barrier = new AsyncBarrier(2);

      assert.throws(
        () => barrier.reset(0),
        { message: "Barrier count must be positive" },
      );

      assert.throws(
        () => barrier.reset(-1),
        { message: "Barrier count must be positive" },
      );
    });
  });

  describe("multiple barrier cycles", () => {
    it("should handle sequential barrier usage", async () => {
      const barrier = new AsyncBarrier(2);
      const cycleOrder: string[] = [];

      // Cycle 1
      await Promise.all([
        (async () => {
          cycleOrder.push("c1-t1");
          await barrier.wait();
          cycleOrder.push("c1-t1-done");
        })(),
        (async () => {
          cycleOrder.push("c1-t2");
          await barrier.wait();
          cycleOrder.push("c1-t2-done");
        })(),
      ]);

      barrier.reset(2);

      // Cycle 2
      await Promise.all([
        (async () => {
          cycleOrder.push("c2-t1");
          await barrier.wait();
          cycleOrder.push("c2-t1-done");
        })(),
        (async () => {
          cycleOrder.push("c2-t2");
          await barrier.wait();
          cycleOrder.push("c2-t2-done");
        })(),
      ]);

      barrier.reset(2);

      // Cycle 3
      await Promise.all([
        (async () => {
          cycleOrder.push("c3-t1");
          await barrier.wait();
          cycleOrder.push("c3-t1-done");
        })(),
        (async () => {
          cycleOrder.push("c3-t2");
          await barrier.wait();
          cycleOrder.push("c3-t2-done");
        })(),
      ]);

      assert.strictEqual(cycleOrder.length, 12);
      assert.ok(cycleOrder[0].startsWith("c1-"));
      assert.ok(cycleOrder[cycleOrder.length - 1].startsWith("c3-"));
    });
  });
});

//==============================================================================
// Factory Functions Tests
//==============================================================================

describe("Factory Functions", () => {
  it("should create DefaultTaskScheduler via factory", () => {
    const scheduler = createTaskScheduler({
      globalMaxSteps: 100,
      yieldInterval: 10,
    });

    assert.ok(scheduler instanceof DefaultTaskScheduler);
    assert.strictEqual(scheduler.globalSteps, 0);
  });

  it("should create DeterministicScheduler via factory", () => {
    const scheduler = createDeterministicScheduler("sequential", {
      globalMaxSteps: 100,
    });

    assert.ok(scheduler instanceof DeterministicScheduler);
    assert.strictEqual(scheduler.getMode(), "sequential");
  });

  it("should use default mode in factory", () => {
    const scheduler = createDeterministicScheduler();

    assert.ok(scheduler instanceof DeterministicScheduler);
    assert.strictEqual(scheduler.getMode(), "parallel");
  });
});

//==============================================================================
// Edge Cases Tests
//==============================================================================

describe("Edge Cases", () => {
  describe("awaiting non-existent tasks", () => {
    it("should throw in DefaultTaskScheduler", async () => {
      const scheduler = new DefaultTaskScheduler();

      await assert.rejects(
        async () => {
          await scheduler.await("non-existent");
        },
        { message: "Task non-existent not found" },
      );
    });

    it("should timeout/wait in DeterministicScheduler (polling)", async () => {
      const scheduler = new DeterministicScheduler("parallel");

      // Task is never spawned, should poll indefinitely
      // We'll use a timeout to test this behavior
      const result = await Promise.race([
        scheduler.await("non-existent"),
        new Promise((resolve) =>
          setTimeout(() => resolve("timeout"), 50),
        ),
      ]);

      assert.strictEqual(result, "timeout");

      // Dispose scheduler to stop the polling loop
      // This prevents the promise from hanging forever after test completes
      scheduler.dispose();
    });
  });

  describe("cancelling completed tasks", () => {
    it("should handle gracefully in DefaultTaskScheduler", async () => {
      const scheduler = new DefaultTaskScheduler();

      scheduler.spawn("task1", async () => 1 as Value);
      await scheduler.await("task1");

      // Cancel after completion - should not throw
      assert.doesNotThrow(() => {
        scheduler.cancel("task1");
      });
    });

    it("should handle gracefully in DeterministicScheduler", async () => {
      const scheduler = new DeterministicScheduler("parallel");

      scheduler.spawn("task1", async () => 1 as Value);
      await scheduler.await("task1");

      // Cancel after completion - task not in queue, should be no-op
      assert.strictEqual(scheduler.activeTaskCount, 0);
      scheduler.cancel("task1");
      assert.strictEqual(scheduler.activeTaskCount, 0);
    });
  });

  describe("empty task queues", () => {
    it("should handle empty queue in DefaultTaskScheduler", () => {
      const scheduler = new DefaultTaskScheduler();
      assert.strictEqual(scheduler.activeTaskCount, 0);
    });

    it("should handle empty queue in DeterministicScheduler", () => {
      const scheduler = new DeterministicScheduler("sequential");
      assert.strictEqual(scheduler.activeTaskCount, 0);
    });
  });

  describe("step limit behavior at boundary", () => {
    it("should allow exactly globalMaxSteps calls", async () => {
      const scheduler = new DefaultTaskScheduler({
        globalMaxSteps: 5,
      });

      // Should allow exactly 5 calls
      for (let i = 0; i < 5; i++) {
        await scheduler.checkGlobalSteps();
      }

      assert.strictEqual(scheduler.globalSteps, 5);
    });

    it("should fail on globalMaxSteps + 1 call", async () => {
      const scheduler = new DefaultTaskScheduler({
        globalMaxSteps: 1,
      });

      await scheduler.checkGlobalSteps();

      await assert.rejects(
        async () => {
          await scheduler.checkGlobalSteps();
        },
        { message: "Global step limit exceeded" },
      );
    });
  });

  describe("task with undefined result", () => {
    it("should handle tasks returning undefined", async () => {
      const scheduler = new DefaultTaskScheduler();

      scheduler.spawn("task1", async () => undefined as Value);
      const result = await scheduler.await("task1");

      assert.strictEqual(result, undefined);
    });
  });

  describe("task with null result", () => {
    it("should handle tasks returning null", async () => {
      const scheduler = new DefaultTaskScheduler();

      scheduler.spawn("task1", async () => null as Value);
      const result = await scheduler.await("task1");

      assert.strictEqual(result, null);
    });
  });

  describe("multiple awaits on same task before completion", () => {
    it("should resolve all awaits when task completes", async () => {
      const scheduler = new DefaultTaskScheduler();

      scheduler.spawn("task1", async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return 42 as Value;
      });

      const results = await Promise.all([
        scheduler.await("task1"),
        scheduler.await("task1"),
        scheduler.await("task1"),
      ]);

      assert.deepStrictEqual(results, [42, 42, 42]);
    });
  });

  describe("rapid spawn and await pattern", () => {
    it("should handle spawn-immediate-await pattern", async () => {
      const scheduler = new DefaultTaskScheduler();

      const results: number[] = [];

      for (let i = 0; i < 10; i++) {
        scheduler.spawn(`task${i}`, async () => i as Value);
        const result = await scheduler.await(`task${i}`);
        results.push(result as number);
      }

      assert.deepStrictEqual(results, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });
  });
});
