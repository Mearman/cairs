/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/use-unknown-in-catch-callback-variable */
/* eslint-disable no-useless-catch */

// SPIRAL Task Scheduler
// Cooperative task scheduling for PIR async/parallel execution

import type { Value } from "./types.js";

//==============================================================================
// Task Scheduler Interface
//==============================================================================

/**
 * TaskScheduler manages async task execution in PIR
 * Uses cooperative scheduling with Promise-based execution
 */
export interface TaskScheduler {
	/**
	 * Spawn a new async task
	 * @param taskId - Unique task identifier
	 * @param fn - Async function to execute
	 */
	spawn(taskId: string, fn: () => Promise<Value>): void;

	/**
	 * Await a task's completion
	 * @param taskId - Task identifier to wait for
	 * @returns Promise that resolves with the task's result
	 */
	await(taskId: string): Promise<Value>;

	/**
	 * Get the current task ID
	 */
	readonly currentTaskId: string;

	/**
	 * Check global step limit and yield if needed
	 * Called periodically to ensure cooperative scheduling
	 */
	checkGlobalSteps(): Promise<void>;

	/**
	 * Get the number of active tasks
	 */
	readonly activeTaskCount: number;

	/**
	 * Get the global step counter
	 */
	readonly globalSteps: number;

	/**
	 * Cancel a running task
	 * @param taskId - Task identifier to cancel
	 */
	cancel(taskId: string): void;

	/**
	 * Check if a task is complete
	 * @param taskId - Task identifier to check
	 */
	isComplete(taskId: string): boolean;
}

//==============================================================================
// Default Task Scheduler Implementation
//==============================================================================

interface Task {
	promise: Promise<Value>;
	resolve: (value: Value) => void;
	reject: (error: Error) => void;
	status: "pending" | "completed" | "failed";
	fn?: () => Promise<Value>;
	result?: Value; // Cache the result for multiple awaits
}

export class DefaultTaskScheduler implements TaskScheduler {
	private tasks = new Map<string, Task>();
	private _globalSteps = 0;
	private readonly globalMaxSteps: number;
	private readonly _yieldInterval: number;
	private _currentTaskId = "main";

	constructor(
		options: {
			globalMaxSteps?: number;
			yieldInterval?: number;
		} = {},
	) {
		this.globalMaxSteps = options.globalMaxSteps ?? 1_000_000;
		this._yieldInterval = options.yieldInterval ?? 100;
	}

	get currentTaskId(): string {
		return this._currentTaskId;
	}

	set currentTaskId(taskId: string) {
		this._currentTaskId = taskId;
	}

	get activeTaskCount(): number {
		return this.tasks.size;
	}

	get globalSteps(): number {
		return this._globalSteps;
	}

	spawn(taskId: string, fn: () => Promise<Value>): void {
		let taskResolve: (value: Value) => void = () => {};
		let taskReject: (error: Error) => void = () => {};

		const promise = new Promise<Value>((resolve, reject) => {
			taskResolve = resolve;
			taskReject = reject;
		});

		const task: Task = {
			promise,
			resolve: taskResolve,
			reject: taskReject,
			status: "pending",
			fn,
		};

		this.tasks.set(taskId, task);

		// Eagerly start the task to avoid deadlocks
		// This ensures that producers start running immediately
		fn()
			.then((result) => {
				task.status = "completed";
				task.result = result; // Cache the result for multiple awaits
				task.resolve(result);
			})
			.catch((error) => {
				task.status = "failed";
				task.reject(error);
			});
	}

	async await(taskId: string): Promise<Value> {
		const task = this.tasks.get(taskId);
		if (!task) {
			throw new Error(`Task ${taskId} not found`);
		}

		// If task is already completed, return cached result (for multiple awaits)
		if (task.status === "completed" && task.result !== undefined) {
			return task.result;
		}

		// Task is already started in spawn() - just wait for completion
		const result = await task.promise;
		// Don't delete the task - keep it for potential re-awaits
		return result;
	}

	async checkGlobalSteps(): Promise<void> {
		if (++this._globalSteps > this.globalMaxSteps) {
			throw new Error("Global step limit exceeded");
		}

		// Yield to microtask queue every N steps
		if (this._globalSteps % this._yieldInterval === 0) {
			await Promise.resolve();
		}
	}

	cancel(taskId: string): void {
		const task = this.tasks.get(taskId);
		if (!task) {
			return; // Task already completed or doesn't exist
		}

		task.status = "failed";
		this.tasks.delete(taskId);
	}

	isComplete(taskId: string): boolean {
		const task = this.tasks.get(taskId);
		if (!task) {
			return true; // Task doesn't exist = completed
		}
		return task.status === "completed" || task.status === "failed";
	}
}

//==============================================================================
// Deterministic Scheduler (for testing)
//==============================================================================

export type SchedulerMode = "sequential" | "parallel" | "breadth-first" | "depth-first";

interface QueuedTask {
	id: string;
	fn: () => Promise<Value>;
	resolve: (value: Value) => void;
	reject: (error: Error) => void;
}

export class DeterministicScheduler implements TaskScheduler {
	private taskQueue: QueuedTask[] = [];
	private completedTasks = new Map<string, Value>();
	private _globalSteps = 0;
	private readonly globalMaxSteps: number;
	private _currentTaskId = "main";
	private mode: SchedulerMode;
	private currentTaskRunning = false; // Track if a task is currently running (for sequential mode)
	private breadthFirstRunning = false; // Track if breadth-first execution is in progress
	private depthFirstRunning = false; // Track if depth-first execution is in progress
	private _disposed = false; // Track if scheduler has been disposed (stops polling loops)

	constructor(
		mode: SchedulerMode = "parallel",
		options: {
			globalMaxSteps?: number;
		} = {},
	) {
		this.mode = mode;
		this.globalMaxSteps = options.globalMaxSteps ?? 1_000_000;
	}

	get currentTaskId(): string {
		return this._currentTaskId;
	}

	set currentTaskId(taskId: string) {
		this._currentTaskId = taskId;
	}

	get activeTaskCount(): number {
		return this.taskQueue.length;
	}

	get globalSteps(): number {
		return this._globalSteps;
	}

	setMode(mode: SchedulerMode): void {
		this.mode = mode;
	}

	getMode(): SchedulerMode {
		return this.mode;
	}

	/**
	 * Dispose of the scheduler and stop all pending polling loops.
	 * This should be called when done with the scheduler to prevent
	 * hanging promises that keep the event loop alive.
	 */
	dispose(): void {
		this._disposed = true;
	}

	spawn(taskId: string, fn: () => Promise<Value>): void {
		let taskResolve: (value: Value) => void = () => {};
		let taskReject: (error: Error) => void = () => {};

		// Create promise that will be resolved when task completes
		void new Promise<Value>((resolve, reject) => {
			taskResolve = resolve;
			taskReject = reject;
		});

		this.taskQueue.push({
			id: taskId,
			fn,
			resolve: taskResolve,
			reject: taskReject,
		});

		// In sequential mode, start executing tasks if none is currently running
		if (this.mode === "sequential" && !this.currentTaskRunning) {
			this.runNextTask().catch(() => {
				// Error already handled in runNextTask
			});
		} else if (this.mode === "breadth-first" && !this.breadthFirstRunning) {
			this.runBreadthFirst().catch(() => {
				// Error already handled in runBreadthFirst
			});
		} else if (this.mode === "depth-first" && !this.depthFirstRunning) {
			this.runDepthFirst().catch(() => {
				// Error already handled in runDepthFirst
			});
		}
		// In parallel mode, await() will handle execution
	}

	async await(taskId: string): Promise<Value> {
		// If already completed, return result
		if (this.completedTasks.has(taskId)) {
			const result = this.completedTasks.get(taskId);
			if (!result) {
				throw new Error(`Task ${taskId} not found in completed tasks`);
			}
			return result;
		}

		// In sequential/breadth-first/depth-first modes, wait for background execution
		// In parallel mode, execute the task directly
		if (this.mode === "parallel") {
			while (!this.completedTasks.has(taskId)) {
				const taskIndex = this.taskQueue.findIndex((t) => t.id === taskId);
				if (taskIndex !== -1) {
					const task = this.taskQueue[taskIndex];
					if (!task) {
						throw new Error(`Task at index ${taskIndex} not found in queue`);
					}

					// Remove from queue so we don't execute it twice
					this.taskQueue.splice(taskIndex, 1);

					// Execute the task and return the result
					this._currentTaskId = taskId;
					try {
						const result = await task.fn();
						this.completedTasks.set(taskId, result);
						return result;
					} catch (error) {
						throw error;
					} finally {
						this._currentTaskId = "main";
					}
				}

				// Task not in queue and not completed - wait a bit and try again
				// This handles the case where another await() is currently executing the task
				if (!this.completedTasks.has(taskId)) {
					// Check if scheduler was disposed (e.g., test completed)
					if (this._disposed) {
						throw new Error(`Task ${taskId} not found (scheduler disposed)`);
					}
					// Use setTimeout instead of setImmediate to avoid flooding event loop
					// with microtasks, which causes issues when multiple schedulers poll
					// concurrently (e.g., during parallel test execution)
					await new Promise((resolve) => setTimeout(resolve, 10));
				}
			}
		} else {
			// For sequential/breadth-first/depth-first, wait for background execution
			// Use setTimeout to avoid flooding event loop with microtasks
			while (!this.completedTasks.has(taskId)) {
				// Check if scheduler was disposed (e.g., test completed)
				if (this._disposed) {
					throw new Error(`Task ${taskId} not found (scheduler disposed)`);
				}
				await new Promise((resolve) => setTimeout(resolve, 10));
			}
		}

		const result = this.completedTasks.get(taskId);
		if (!result) {
			throw new Error(`Task ${taskId} not found in completed tasks`);
		}
		return result;
	}

	async checkGlobalSteps(): Promise<void> {
		if (++this._globalSteps > this.globalMaxSteps) {
			throw new Error("Global step limit exceeded");
		}

		// Yield to microtask queue
		await Promise.resolve();
	}

	cancel(taskId: string): void {
		const taskIndex = this.taskQueue.findIndex((t) => t.id === taskId);
		if (taskIndex !== -1) {
			this.taskQueue.splice(taskIndex, 1);
		}
	}

	isComplete(taskId: string): boolean {
		return this.completedTasks.has(taskId);
	}

	private async runNextTask(): Promise<void> {
		if (this.taskQueue.length === 0) {
			this.currentTaskRunning = false;
			return;
		}

		// Set flag at the start to prevent concurrent execution
		this.currentTaskRunning = true;

		const task = this.taskQueue.shift();
		if (!task) {
			this.currentTaskRunning = false;
			throw new Error("No task available in queue");
		}
		this._currentTaskId = task.id;

		try {
			const result = await task.fn();
			this.completedTasks.set(task.id, result);
			task.resolve(result);
		} catch (error) {
			task.reject(error as Error);
		}

		// Continue with next task in queue (sequential mode)
		if (this.taskQueue.length > 0) {
			await this.runNextTask();
		} else {
			// Only clear flag when all tasks are done
			this.currentTaskRunning = false;
		}
	}

	/**
	 * Execute all tasks currently in the queue in parallel (breadth-first)
	 * Newly spawned tasks during execution will be executed in the next batch
	 */
	private async runBreadthFirst(): Promise<void> {
		if (this.taskQueue.length === 0) {
			this.breadthFirstRunning = false;
			return;
		}

		this.breadthFirstRunning = true;

		// Take a snapshot of the current queue (this batch)
		const currentBatch = [...this.taskQueue];
		this.taskQueue = [];

		// Execute all tasks in the current batch in parallel
		await Promise.all(
			currentBatch.map(async (task) => {
				this._currentTaskId = task.id;
				try {
					const result = await task.fn();
					this.completedTasks.set(task.id, result);
					task.resolve(result);
				} catch (error) {
					task.reject(error as Error);
				}
			}),
		);

		// If new tasks were spawned during execution, continue with next batch
		if (this.taskQueue.length > 0) {
			await this.runBreadthFirst();
		} else {
			// Reset globalSteps after all batches complete
			this._globalSteps = 0;
			this.breadthFirstRunning = false;
		}
	}

	/**
	 * Execute tasks depth-first (LIFO - last spawned, first executed)
	 * Each task runs to completion before the next one starts
	 */
	private async runDepthFirst(): Promise<void> {
		this.depthFirstRunning = true;

		try {
			// Execute tasks in LIFO order (last spawned = first executed)
			while (this.taskQueue.length > 0) {
				const task = this.taskQueue.pop(); // pop() removes from end (LIFO)
				if (!task) {
					throw new Error("No task available in queue");
				}
				this._currentTaskId = task.id;

				try {
					const result = await task.fn();
					this.completedTasks.set(task.id, result);
					task.resolve(result);
				} catch (error) {
					task.reject(error as Error);
				}
			}

			// Continue processing if new tasks were added during execution
			if (this.taskQueue.length > 0) {
				await this.runDepthFirst();
			}
		} finally {
			// Only clear flag when we're the top-level call and queue is empty
			if (this.taskQueue.length === 0) {
				this.depthFirstRunning = false;
			}
		}
	}
}

//==============================================================================
// Async Barrier (for fork-join synchronization)
//==============================================================================

export class AsyncBarrier {
	private count: number;
	private waiting: Array<() => void> = [];
	private releaseInProgress = false;

	constructor(count: number) {
		if (count <= 0) {
			throw new Error("Barrier count must be positive");
		}
		this.count = count;
	}

	async wait(): Promise<void> {
		this.count--;

		if (this.count === 0) {
			// Last task to arrive - release all waiting tasks in FIFO order
			if (!this.releaseInProgress) {
				this.releaseInProgress = true;
				// Release all waiters in FIFO order
				const waiters = [...this.waiting];
				this.waiting = [];
				for (const waiter of waiters) {
					waiter();
				}
				this.releaseInProgress = false;
			}
		} else {
			// Wait for the last task to arrive
			return new Promise<void>((resolve) => {
				this.waiting.push(resolve);
			});
		}
	}

	reset(count: number): void {
		if (count <= 0) {
			throw new Error("Barrier count must be positive");
		}
		this.count = count;
		this.waiting = [];
		this.releaseInProgress = false;
	}
}

//==============================================================================
// Factory Functions
//==============================================================================

/**
 * Create a default task scheduler
 */
export function createTaskScheduler(options?: {
	globalMaxSteps?: number;
	yieldInterval?: number;
}): TaskScheduler {
	return new DefaultTaskScheduler(options);
}

/**
 * Create a deterministic scheduler for testing
 */
export function createDeterministicScheduler(
	mode: SchedulerMode = "parallel",
	options?: {
		globalMaxSteps?: number;
	},
): TaskScheduler {
	return new DeterministicScheduler(mode, options);
}
