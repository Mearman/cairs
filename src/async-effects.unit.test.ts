/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint-disable @typescript-eslint/require-await */
 

// CAIRS Async Effects Unit Tests
// Tests for AsyncChannel, AsyncMutex, AsyncRefCell, ConcurrentEffectLog

import { describe, it, before } from "node:test";
import assert from "node:assert";
import {
	createAsyncMutex,
	createAsyncRefCell,
	createAsyncChannel,
	createConcurrentEffectLog,
	createAsyncRefCellStore,
	createAsyncChannelStore,
	AsyncRefCell,
	AsyncChannelImpl,
	ConcurrentEffectLog,
} from "./async-effects.js";
import { intVal, stringVal } from "./types.js";

describe("AsyncMutex", () => {
	it("should acquire and release lock", async () => {
		const mutex = createAsyncMutex();

		assert.ok(!mutex.isLocked(), "lock should not be held initially");

		await mutex.acquire();

		assert.ok(mutex.isLocked(), "lock should be held after acquire");

		mutex.release();

		assert.ok(!mutex.isLocked(), "lock should not be held after release");
	});

	it("should queue waiting acquires", async () => {
		const mutex = createAsyncMutex();
		const results: number[] = [];

		// Acquire lock first
		await mutex.acquire();

		// Spawn tasks that wait for lock
		 
		const task1 = mutex.withLock(async () => {
			results.push(1);
			void Promise.resolve();
		});

		 
		const task2 = mutex.withLock(async () => {
			results.push(2);
			void Promise.resolve();
		});

		// Release initial lock
		mutex.release();

		await Promise.all([task1, task2]);

		assert.deepEqual(results, [1, 2], "tasks should execute in order");
	});

	it("should execute function with withLock", async () => {
		const mutex = createAsyncMutex();
		let executed = false;

		 
		const result = await mutex.withLock(async () => {
			executed = true;
			return 42;
		});

		assert.ok(executed, "function should have executed");
		assert.equal(result, 42);
		assert.ok(!mutex.isLocked(), "lock should be released after withLock");
	});

	it("should release lock even if function throws", async () => {
		const mutex = createAsyncMutex();

		try {
			 
			await mutex.withLock(async () => {
				throw new Error("Test error");
			});
		} catch {
			// Expected
		}

		assert.ok(!mutex.isLocked(), "lock should be released even after error");
	});

	it("should handle concurrent access safely", async () => {
		const mutex = createAsyncMutex();
		let counter = 0;

		const increment = async () => {
			return mutex.withLock(async () => {
				const current = counter;
				// Simulate some async work
				await new Promise((resolve) => setTimeout(resolve, 1));
				counter = current + 1;
				return counter;
			});
		};

		const results = await Promise.all([increment(), increment(), increment(), increment(), increment()]);

		// All increments should be sequential
		assert.deepEqual(results.sort(), [1, 2, 3, 4, 5]);
		assert.equal(counter, 5);
	});
});

describe("AsyncRefCell", () => {
	it("should store and retrieve initial value", async () => {
		const cell = createAsyncRefCell(intVal(42));

		const value = await cell.read();

		assert.equal(value.kind, "int");
		assert.equal((value as { kind: "int"; value: number }).value, 42);
	});

	it("should write new value", async () => {
		const cell = createAsyncRefCell(intVal(1));

		await cell.write(intVal(100));

		const value = await cell.read();
		assert.equal((value as { kind: "int"; value: number }).value, 100);
	});

	it("should update value with function", async () => {
		const cell = createAsyncRefCell(intVal(5));

		await cell.update((v) => {
			if (v.kind === "int") {
				return intVal(v.value * 2);
			}
			return v;
		});

		const value = await cell.read();
		assert.equal((value as { kind: "int"; value: number }).value, 10);
	});

	it("should provide thread-safe operations", async () => {
		const cell = createAsyncRefCell(intVal(0));

		const increment = async () => {
			return cell.update((v) => {
				if (v.kind === "int") {
					return intVal(v.value + 1);
				}
				return v;
			});
		};

		// Run concurrent increments
		await Promise.all([increment(), increment(), increment(), increment(), increment()]);

		const value = await cell.read();
		assert.equal((value as { kind: "int"; value: number }).value, 5);
	});

	it("should support unsafe get/set", () => {
		const cell = createAsyncRefCell(intVal(10));

		assert.equal((cell.getUnsafe() as { kind: "int"; value: number }).value, 10);

		cell.setUnsafe(intVal(20));

		assert.equal((cell.getUnsafe() as { kind: "int"; value: number }).value, 20);
	});
});

describe("AsyncChannel", () => {
	it("should send and receive values", async () => {
		const channel = createAsyncChannel(1);

		const sendPromise = channel.send(intVal(42));
		const recvPromise = channel.recv();

		await Promise.all([sendPromise, recvPromise]);

		const received = await recvPromise;
		assert.equal((received as { kind: "int"; value: number }).value, 42);
	});

	it("should buffer values up to capacity", async () => {
		const channel = createAsyncChannel(3);

		await channel.send(intVal(1));
		await channel.send(intVal(2));
		await channel.send(intVal(3));

		assert.equal(channel.size(), 3, "buffer should contain 3 values");

		const v1 = await channel.recv();
		const v2 = await channel.recv();
		const v3 = await channel.recv();

		assert.equal((v1 as { kind: "int"; value: number }).value, 1);
		assert.equal((v2 as { kind: "int"; value: number }).value, 2);
		assert.equal((v3 as { kind: "int"; value: number }).value, 3);
	});

	it("should block send when buffer is full", async () => {
		const channel = createAsyncChannel(1);

		// Fill the buffer
		await channel.send(intVal(1));

		let sendBlocked = false;
		const sendPromise = channel.send(intVal(2)).then(() => {
			sendBlocked = true;
		});

		// Give some time for send to block
		await new Promise((resolve) => setTimeout(resolve, 10));

		assert.ok(!sendBlocked, "send should be blocked");

		// Receive to make space
		await channel.recv();

		// Now send should complete
		await sendPromise;

		assert.ok(sendBlocked, "send should have completed");
	});

	it("should deliver directly to waiting receiver", async () => {
		const channel = createAsyncChannel(0);

		const recvPromise = channel.recv();
		const sendPromise = channel.send(intVal(42));

		await Promise.all([recvPromise, sendPromise]);

		const received = await recvPromise;
		assert.equal((received as { kind: "int"; value: number }).value, 42);
	});

	it("should wake waiting sender when space becomes available", async () => {
		const channel = createAsyncChannel(1);

		await channel.send(intVal(1));

		let sendCompleted = false;
		const sendPromise = channel.send(intVal(2)).then(() => {
			sendCompleted = true;
		});

		// Receive to make space
		await channel.recv();

		// Send should now complete
		await sendPromise;
		assert.ok(sendCompleted);

		// Verify value was sent
		const value = await channel.recv();
		assert.equal((value as { kind: "int"; value: number }).value, 2);
	});

	it("should support trySend", async () => {
		const channel = createAsyncChannel(1);

		assert.ok(channel.trySend(intVal(1)), "trySend should succeed");
		assert.ok(!channel.trySend(intVal(2)), "trySend should fail when full");

		const value = await channel.recv();
		assert.equal((value as { kind: "int"; value: number }).value, 1);
	});

	it("should support tryRecv", async () => {
		const channel = createAsyncChannel(1);

		assert.strictEqual(channel.tryRecv(), null, "tryRecv should return null when empty");

		await channel.send(intVal(42));

		const value = channel.tryRecv();
		assert.ok(value, "tryRecv should return value");
		assert.equal((value as { kind: "int"; value: number }).value, 42);
	});

	it("should close channel and reject pending operations", async () => {
		const channel = createAsyncChannel(1);

		await channel.send(intVal(1));

		// Start a receive operation
		const recvPromise = channel.recv();

		// Close the channel
		channel.close();

		assert.ok(channel.isClosed(), "channel should be closed");

		// Should be able to receive buffered value
		const value = await recvPromise;
		assert.equal((value as { kind: "int"; value: number }).value, 1);

		// Next receive should fail
		await assert.rejects(
			async () => channel.recv(),
			Error,
			"Should reject receive on closed empty channel",
		);
	});

	it("should reject send on closed channel", async () => {
		const channel = createAsyncChannel(1);

		channel.close();

		await assert.rejects(
			async () => channel.send(intVal(1)),
			Error,
			"Should reject send on closed channel",
		);
	});

	it("should handle multiple producers and consumers", async () => {
		const channel = createAsyncChannel(2);

		const producers = [
			channel.send(intVal(1)),
			channel.send(intVal(2)),
			channel.send(intVal(3)),
		];

		const results = await Promise.all([
			channel.recv(),
			channel.recv(),
			channel.recv(),
		]);

		await Promise.all(producers);

		const values = results
			.map((v) => (v as { kind: "int"; value: number }).value)
			.sort();

		assert.deepEqual(values, [1, 2, 3]);
	});
});

describe("ConcurrentEffectLog", () => {
	let log: ConcurrentEffectLog;

	before(() => {
		log = createConcurrentEffectLog();
	});

	it("should append effects", () => {
		log.append("task1", { op: "write", args: [intVal(42)] });
		log.append("task2", { op: "read", args: [stringVal("x")] });

		assert.equal(log.size(), 2);
	});

	it("should return effects in order", () => {
		log.clear();

		log.append("task1", { op: "op1", args: [] });
		log.append("task2", { op: "op2", args: [] });
		log.append("task1", { op: "op3", args: [] });

		const ordered = log.getOrdered();

		assert.equal(ordered.length, 3);
		assert.equal(ordered[0]?.op, "op1");
		assert.equal(ordered[1]?.op, "op2");
		assert.equal(ordered[2]?.op, "op3");
	});

	it("should filter effects by task", () => {
		log.clear();

		log.append("task1", { op: "op1", args: [] });
		log.append("task2", { op: "op2", args: [] });
		log.append("task1", { op: "op3", args: [] });

		const task1Effects = log.getByTask("task1");

		assert.equal(task1Effects.length, 2);
		assert.equal(task1Effects[0]?.op, "op1");
		assert.equal(task1Effects[1]?.op, "op3");

		const task2Effects = log.getByTask("task2");
		assert.equal(task2Effects.length, 1);
		assert.equal(task2Effects[0]?.op, "op2");
	});

	it("should append effects with results", () => {
		log.clear();

		log.appendWithResult("task1", { op: "add", args: [intVal(1), intVal(2)] }, intVal(3));

		const effects = log.getOrdered();

		assert.equal(effects.length, 1);
		assert.equal(effects[0]?.op, "add");
		assert.equal(effects[0]?.result?.kind, "int");
		assert.equal((effects[0]?.result as { kind: "int"; value: number })?.value, 3);
	});

	it("should append effects with errors", () => {
		log.clear();

		const errorVal = { kind: "error", code: "TestError", message: "Test error" };
		log.appendWithError("task1", { op: "fail", args: [] }, errorVal);

		const effects = log.getOrdered();

		assert.equal(effects.length, 1);
		assert.equal(effects[0]?.op, "fail");
		assert.equal(effects[0]?.error?.kind, "error");
	});

	it("should discard task effects", () => {
		log.clear();

		log.append("task1", { op: "op1", args: [] });
		log.append("task2", { op: "op2", args: [] });
		log.append("task1", { op: "op3", args: [] });

		log.discardTask("task1");

		assert.equal(log.size(), 1);

		const remaining = log.getOrdered();
		assert.equal(remaining[0]?.op, "op2");
	});

	it("should compute statistics", () => {
		log.clear();

		log.append("task1", { op: "read", args: [] });
		log.append("task1", { op: "write", args: [] });
		log.append("task2", { op: "read", args: [] });
		log.append("task3", { op: "write", args: [] });

		const stats = log.getStats();

		assert.equal(stats.total, 4);
		assert.equal(stats.byTask.get("task1"), 2);
		assert.equal(stats.byTask.get("task2"), 1);
		assert.equal(stats.byTask.get("task3"), 1);
		assert.equal(stats.byOp.get("read"), 2);
		assert.equal(stats.byOp.get("write"), 2);
	});

	it("should clear all effects", () => {
		log.append("task1", { op: "op1", args: [] });
		log.append("task2", { op: "op2", args: [] });

		assert.equal(log.size(), 2);

		log.clear();

		assert.equal(log.size(), 0);
		assert.equal(log.getOrdered().length, 0);
	});
});

describe("AsyncRefCellStore", () => {
	it("should create and retrieve ref cells", async () => {
		const store = createAsyncRefCellStore();

		const cell1 = store.getOrCreate("x", intVal(10));
		const cell2 = store.getOrCreate("y", intVal(20));

		assert.ok(cell1 instanceof AsyncRefCell);
		assert.ok(cell2 instanceof AsyncRefCell);

		const value1 = await cell1.read();
		const value2 = await cell2.read();

		assert.equal((value1 as { kind: "int"; value: number }).value, 10);
		assert.equal((value2 as { kind: "int"; value: number }).value, 20);
	});

	it("should return same cell for same name", async () => {
		const store = createAsyncRefCellStore();

		const cell1 = store.getOrCreate("x", intVal(10));
		const cell2 = store.getOrCreate("x", intVal(999)); // Different initial value

		assert.strictEqual(cell1, cell2, "should return same instance");

		// Should have original value
		const value = await cell1.read();
		assert.equal((value as { kind: "int"; value: number }).value, 10);
	});

	it("should get existing cell", async () => {
		const store = createAsyncRefCellStore();

		store.getOrCreate("x", intVal(10));

		const cell = store.get("x");

		assert.ok(cell, "should find cell");

		const value = await cell.read();
		assert.equal((value as { kind: "int"; value: number }).value, 10);
	});

	it("should return undefined for non-existent cell", () => {
		const store = createAsyncRefCellStore();

		assert.strictEqual(store.get("nonexistent"), undefined);
	});

	it("should delete cells", () => {
		const store = createAsyncRefCellStore();

		store.getOrCreate("x", intVal(10));

		assert.ok(store.get("x"), "cell should exist");

		assert.ok(store.delete("x"), "delete should return true");
		assert.strictEqual(store.get("x"), undefined, "cell should be gone");
		assert.ok(!store.delete("x"), "delete should return false for non-existent");
	});

	it("should track size", () => {
		const store = createAsyncRefCellStore();

		assert.equal(store.size(), 0);

		store.getOrCreate("x", intVal(10));
		store.getOrCreate("y", intVal(20));
		store.getOrCreate("z", intVal(30));

		assert.equal(store.size(), 3);

		store.delete("y");

		assert.equal(store.size(), 2);
	});

	it("should clear all cells", () => {
		const store = createAsyncRefCellStore();

		store.getOrCreate("x", intVal(10));
		store.getOrCreate("y", intVal(20));

		assert.equal(store.size(), 2);

		store.clear();

		assert.equal(store.size(), 0);
		assert.strictEqual(store.get("x"), undefined);
		assert.strictEqual(store.get("y"), undefined);
	});
});

describe("AsyncChannelStore", () => {
	it("should create and retrieve channels", () => {
		const store = createAsyncChannelStore();

		const id1 = store.create(10);
		const id2 = store.create(5);

		assert.ok(id1.startsWith("ch_"), "channel ID should have prefix");
		assert.ok(id2.startsWith("ch_"), "channel ID should have prefix");
		assert.notEqual(id1, id2, "IDs should be unique");

		const channel1 = store.get(id1);
		const channel2 = store.get(id2);

		assert.ok(channel1 instanceof AsyncChannelImpl);
		assert.ok(channel2 instanceof AsyncChannelImpl);

		assert.equal(channel1.getCapacity(), 10);
		assert.equal(channel2.getCapacity(), 5);
	});

	it("should get existing channel", () => {
		const store = createAsyncChannelStore();

		const id = store.create(5);

		const channel = store.get(id);

		assert.ok(channel, "should find channel");
		assert.equal(channel.getCapacity(), 5);
	});

	it("should return undefined for non-existent channel", () => {
		const store = createAsyncChannelStore();

		assert.strictEqual(store.get("nonexistent"), undefined);
	});

	it("should delete and close channels", async () => {
		const store = createAsyncChannelStore();

		const id = store.create(5);
		const channel = store.get(id)!;

		await channel.send(intVal(42));

		assert.ok(!channel.isClosed(), "channel should be open");

		assert.ok(store.delete(id), "delete should return true");

		assert.ok(channel.isClosed(), "channel should be closed");
		assert.strictEqual(store.get(id), undefined, "channel should be removed");
	});

	it("should track size", () => {
		const store = createAsyncChannelStore();

		assert.equal(store.size(), 0);

		store.create(1);
		store.create(2);
		store.create(3);

		assert.equal(store.size(), 3);

		store.delete(store.get("ch_0")! ? "ch_0" : "some_id");

		assert.equal(store.size(), 2);
	});

	it("should clear all channels", () => {
		const store = createAsyncChannelStore();

		store.create(1);
		store.create(2);

		assert.equal(store.size(), 2);

		store.clear();

		assert.equal(store.size(), 0);
	});

	it("should close channels when clearing", async () => {
		const store = createAsyncChannelStore();

		const id = store.create(5);
		const channel = store.get(id)!;

		await channel.send(intVal(42));

		store.clear();

		assert.ok(channel.isClosed(), "channel should be closed after clear");
	});
});

describe("Integration: Channel with multiple producers/consumers", () => {
	it("should implement producer-consumer pattern", async () => {
		const channel = createAsyncChannel(5);
		const results: number[] = [];

		// Producer
		const producer = async () => {
			for (let i = 1; i <= 10; i++) {
				await channel.send(intVal(i));
			}
			channel.close();
		};

		// Consumer
		const consumer = async () => {
			try {
				while (true) {
					const value = await channel.recv();
					results.push((value as { kind: "int"; value: number }).value);
				}
			} catch {
				// Channel closed
			}
		};

		await Promise.all([producer(), consumer()]);

		assert.deepEqual(results, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
	});

	it("should support fan-out (multiple consumers)", async () => {
		const channel = createAsyncChannel(10);
		const results1: number[] = [];
		const results2: number[] = [];

		// Producer
		const producer = async () => {
			for (let i = 1; i <= 10; i++) {
				await channel.send(intVal(i));
			}
			channel.close();
		};

		// Consumers
		const consumer1 = async () => {
			try {
				while (true) {
					const value = await channel.recv();
					results1.push((value as { kind: "int"; value: number }).value);
				}
			} catch {
				// Channel closed
			}
		};

		const consumer2 = async () => {
			try {
				while (true) {
					const value = await channel.recv();
					results2.push((value as { kind: "int"; value: number }).value);
				}
			} catch {
				// Channel closed
			}
		};

		await Promise.all([producer(), consumer1(), consumer2()]);

		// All values should be distributed between consumers
		const allResults = [...results1, ...results2].sort();
		assert.deepEqual(allResults, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

		// Both consumers should have received some values
		assert.ok(results1.length > 0, "consumer1 should receive values");
		assert.ok(results2.length > 0, "consumer2 should receive values");
	});
});

describe("Integration: RefCell with Mutex for complex state", () => {
	it("should manage concurrent state updates safely", async () => {
		const counter = createAsyncRefCell(intVal(0));

		const increment = async (count: number) => {
			for (let i = 0; i < count; i++) {
				await counter.update((v) => {
					if (v.kind === "int") {
						return intVal(v.value + 1);
					}
					return v;
				});
			}
		};

		// Run 5 tasks, each incrementing 100 times
		await Promise.all([increment(100), increment(100), increment(100), increment(100), increment(100)]);

		const finalValue = await counter.read();
		assert.equal((finalValue as { kind: "int"; value: number }).value, 500);
	});

	it("should handle concurrent reads and writes", async () => {
		const cell = createAsyncRefCell(intVal(0));
		const readResults: number[] = [];
		const writeCount = 50;

		const reader = async () => {
			for (let i = 0; i < 100; i++) {
				const value = await cell.read();
				readResults.push((value as { kind: "int"; value: number }).value);
				// Small delay to interleave operations
				await new Promise((resolve) => setTimeout(resolve, 1));
			}
		};

		const writer = async () => {
			for (let i = 1; i <= writeCount; i++) {
				await cell.write(intVal(i));
			}
		};

		await Promise.all([reader(), writer()]);

		// Final value should be the last write
		const finalValue = await cell.read();
		assert.equal((finalValue as { kind: "int"; value: number }).value, writeCount);

		// All reads should have seen valid values
		assert.ok(readResults.every((v) => v >= 0 && v <= writeCount));
	});
});
