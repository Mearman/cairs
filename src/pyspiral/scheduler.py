"""
SPIRAL Task Scheduler for Python
Cooperative task scheduling for PIR async/parallel execution

This module provides task scheduling infrastructure for PIR (Parallel IR) execution,
including both default and deterministic schedulers with support for sequential,
parallel, breadth-first, and depth-first execution modes.
"""

from __future__ import annotations
import asyncio
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import (
    Callable,
    Optional,
    Dict,
    List,
    Any,
    Union,
    Coroutine,
    TypeAlias,
)
from types import coroutine

# Import Value type from types module
from pyspiral.types import Value


#==============================================================================
# Task Scheduler Interface
#==============================================================================

class TaskScheduler(ABC):
    """
    TaskScheduler manages async task execution in PIR
    Uses cooperative scheduling with async/await-based execution
    """

    @abstractmethod
    async def spawn(self, task_id: str, fn: Callable[[], Coroutine[Any, Any, Value]]) -> None:
        """
        Spawn a new async task
        :param task_id: Unique task identifier
        :param fn: Async function to execute
        """
        pass

    @abstractmethod
    async def await_task(self, task_id: str) -> Value:
        """
        Await a task's completion
        :param task_id: Task identifier to wait for
        :returns: The task's result
        """
        pass

    @property
    @abstractmethod
    def current_task_id(self) -> str:
        """Get the current task ID"""
        pass

    @current_task_id.setter
    @abstractmethod
    def current_task_id(self, task_id: str) -> None:
        """Set the current task ID"""
        pass

    @abstractmethod
    async def check_global_steps(self) -> None:
        """
        Check global step limit and yield if needed
        Called periodically to ensure cooperative scheduling
        """
        pass

    @property
    @abstractmethod
    def active_task_count(self) -> int:
        """Get the number of active tasks"""
        pass

    @property
    @abstractmethod
    def global_steps(self) -> int:
        """Get the global step counter"""
        pass

    @abstractmethod
    def cancel(self, task_id: str) -> None:
        """
        Cancel a running task
        :param task_id: Task identifier to cancel
        """
        pass

    @abstractmethod
    def is_complete(self, task_id: str) -> bool:
        """
        Check if a task is complete
        :param task_id: Task identifier to check
        """
        pass


#==============================================================================
# Task Status and Internal Task Representation
#==============================================================================

class TaskStatus(str, Enum):
    """Task execution status"""
    PENDING = "pending"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class Task:
    """Internal task representation"""
    task_id: str
    future: asyncio.Future[Value]
    status: TaskStatus
    fn: Optional[Callable[[], Coroutine[Any, Any, Value]]] = None
    result: Optional[Value] = None  # Cache result for multiple awaits


#==============================================================================
# Default Task Scheduler Implementation
#==============================================================================

class DefaultTaskScheduler(TaskScheduler):
    """
    Default task scheduler using eager execution with asyncio

    Tasks are started immediately when spawned to avoid deadlocks.
    Multiple awaits on the same task return cached results.
    """

    def __init__(
        self,
        global_max_steps: int = 1_000_000,
        yield_interval: int = 100,
    ):
        """
        Initialize the scheduler

        :param global_max_steps: Maximum steps before error (prevents infinite loops)
        :param yield_interval: Steps between cooperative yields
        """
        self._tasks: Dict[str, Task] = {}
        self._global_steps = 0
        self._global_max_steps = global_max_steps
        self._yield_interval = yield_interval
        self._current_task_id = "main"
        self._loop = asyncio.get_event_loop()

    @property
    def current_task_id(self) -> str:
        return self._current_task_id

    @current_task_id.setter
    def current_task_id(self, task_id: str) -> None:
        self._current_task_id = task_id

    @property
    def active_task_count(self) -> int:
        return len(self._tasks)

    @property
    def global_steps(self) -> int:
        return self._global_steps

    async def spawn(
        self,
        task_id: str,
        fn: Callable[[], Coroutine[Any, Any, Value]]
    ) -> None:
        """
        Spawn a new async task

        Creates a task that starts executing immediately (eager execution).
        This prevents deadlocks by ensuring producers start running.

        :param task_id: Unique task identifier
        :param fn: Async function to execute
        """
        # Create a future for the task
        future: asyncio.Future[Value] = self._loop.create_future()

        # Create task object
        task = Task(
            task_id=task_id,
            future=future,
            status=TaskStatus.PENDING,
            fn=fn,
        )

        self._tasks[task_id] = task

        # Eagerly start the task to avoid deadlocks
        # This ensures that producers start running immediately
        async def run_task():
            try:
                result = await fn()
                task.status = TaskStatus.COMPLETED
                task.result = result  # Cache for multiple awaits
                if not future.done():
                    future.set_result(result)
            except Exception as error:
                task.status = TaskStatus.FAILED
                if not future.done():
                    future.set_exception(error)

        # Start task in background
        asyncio.create_task(run_task())

    async def await_task(self, task_id: str) -> Value:
        """
        Await a task's completion

        If the task is already completed, returns the cached result.
        Otherwise waits for the task to complete.

        :param task_id: Task identifier to wait for
        :returns: The task's result
        :raises: Error if task not found
        """
        task = self._tasks.get(task_id)
        if task is None:
            raise ValueError(f"Task {task_id} not found")

        # If task is already completed, return cached result (for multiple awaits)
        if task.status == TaskStatus.COMPLETED and task.result is not None:
            return task.result

        # Task is already started in spawn() - just wait for completion
        result = await task.future
        # Don't delete the task - keep it for potential re-awaits
        return result

    async def check_global_steps(self) -> None:
        """
        Check global step limit and yield if needed

        Increments the global step counter and raises an error if the limit
        is exceeded. Yields control to the event loop periodically.

        :raises: RuntimeError if global step limit exceeded
        """
        self._global_steps += 1
        if self._global_steps > self._global_max_steps:
            raise RuntimeError("Global step limit exceeded")

        # Yield to event loop every N steps
        if self._global_steps % self._yield_interval == 0:
            await asyncio.sleep(0)

    def cancel(self, task_id: str) -> None:
        """
        Cancel a running task

        :param task_id: Task identifier to cancel
        """
        task = self._tasks.get(task_id)
        if task is None:
            return  # Task already completed or doesn't exist

        task.status = TaskStatus.FAILED
        if not task.future.done():
            task.future.cancel()
        del self._tasks[task_id]

    def is_complete(self, task_id: str) -> bool:
        """
        Check if a task is complete

        :param task_id: Task identifier to check
        :returns: True if task is completed, failed, or doesn't exist
        """
        task = self._tasks.get(task_id)
        if task is None:
            return True  # Task doesn't exist = completed
        return task.status in (TaskStatus.COMPLETED, TaskStatus.FAILED)


#==============================================================================
# Deterministic Scheduler (for testing)
#==============================================================================

class SchedulerMode(str, Enum):
    """Deterministic scheduler execution modes"""
    SEQUENTIAL = "sequential"
    PARALLEL = "parallel"
    BREADTH_FIRST = "breadth-first"
    DEPTH_FIRST = "depth-first"


@dataclass
class QueuedTask:
    """Task in the deterministic scheduler queue"""
    id: str
    fn: Callable[[], Coroutine[Any, Any, Value]]
    future: asyncio.Future[Value]


class DeterministicScheduler(TaskScheduler):
    """
    Deterministic scheduler for testing with controllable execution modes

    Supports:
    - sequential: Tasks run one at a time in FIFO order
    - parallel: Tasks run concurrently (on-demand execution)
    - breadth-first: Tasks run in batches by generation
    - depth-first: Newest tasks run first (LIFO)
    """

    def __init__(
        self,
        mode: SchedulerMode = SchedulerMode.PARALLEL,
        global_max_steps: int = 1_000_000,
    ):
        """
        Initialize the deterministic scheduler

        :param mode: Execution mode (sequential/parallel/breadth-first/depth-first)
        :param global_max_steps: Maximum steps before error
        """
        self._task_queue: List[QueuedTask] = []
        self._completed_tasks: Dict[str, Value] = {}
        self._global_steps = 0
        self._global_max_steps = global_max_steps
        self._current_task_id = "main"
        self._mode = mode
        self._current_task_running = False  # For sequential mode
        self._breadth_first_running = False
        self._depth_first_running = False
        self._disposed = False  # Track if scheduler has been disposed
        self._loop = asyncio.get_event_loop()

    @property
    def current_task_id(self) -> str:
        return self._current_task_id

    @current_task_id.setter
    def current_task_id(self, task_id: str) -> None:
        self._current_task_id = task_id

    @property
    def active_task_count(self) -> int:
        return len(self._task_queue)

    @property
    def global_steps(self) -> int:
        return self._global_steps

    def set_mode(self, mode: SchedulerMode) -> None:
        """Change the execution mode"""
        self._mode = mode

    def get_mode(self) -> SchedulerMode:
        """Get the current execution mode"""
        return self._mode

    def dispose(self) -> None:
        """
        Dispose of the scheduler and stop all pending polling loops

        This should be called when done with the scheduler to prevent
        hanging tasks that keep the event loop alive.
        """
        self._disposed = True
        # Cancel all pending futures
        for task in self._task_queue:
            if not task.future.done():
                task.future.cancel()
        self._task_queue.clear()

    async def spawn(
        self,
        task_id: str,
        fn: Callable[[], Coroutine[Any, Any, Value]]
    ) -> None:
        """
        Spawn a new async task

        In sequential/breadth-first/depth-first modes, background execution
        is triggered. In parallel mode, tasks are queued for on-demand execution.

        :param task_id: Unique task identifier
        :param fn: Async function to execute
        """
        # Create a future for the task
        future: asyncio.Future[Value] = self._loop.create_future()

        # Add to queue
        self._task_queue.append(QueuedTask(
            id=task_id,
            fn=fn,
            future=future,
        ))

        # Trigger background execution based on mode
        if self._mode == SchedulerMode.SEQUENTIAL and not self._current_task_running:
            asyncio.create_task(self._run_next_task())
        elif self._mode == SchedulerMode.BREADTH_FIRST and not self._breadth_first_running:
            asyncio.create_task(self._run_breadth_first())
        elif self._mode == SchedulerMode.DEPTH_FIRST and not self._depth_first_running:
            asyncio.create_task(self._run_depth_first())
        # In parallel mode, await_task() will handle execution

    async def await_task(self, task_id: str) -> Value:
        """
        Await a task's completion

        :param task_id: Task identifier to wait for
        :returns: The task's result
        :raises: ValueError if task not found or scheduler disposed
        """
        # If already completed, return result
        if task_id in self._completed_tasks:
            result = self._completed_tasks[task_id]
            return result

        # In parallel mode, execute the task directly
        if self._mode == SchedulerMode.PARALLEL:
            while task_id not in self._completed_tasks:
                # Find task in queue
                task_index = next((i for i, t in enumerate(self._task_queue) if t.id == task_id), None)

                if task_index is not None:
                    task = self._task_queue.pop(task_index)

                    # Execute the task and return the result
                    self._current_task_id = task_id
                    try:
                        result = await task.fn()
                        self._completed_tasks[task_id] = result
                        if not task.future.done():
                            task.future.set_result(result)
                        return result
                    except Exception as error:
                        if not task.future.done():
                            task.future.set_exception(error)
                        raise
                    finally:
                        self._current_task_id = "main"
                else:
                    # Task not in queue and not completed - wait and retry
                    # This handles the case where another await_task() is currently executing the task
                    if self._disposed:
                        raise ValueError(f"Task {task_id} not found (scheduler disposed)")
                    await asyncio.sleep(0.01)  # 10ms delay

        # For sequential/breadth-first/depth-first, wait for background execution
        while task_id not in self._completed_tasks:
            if self._disposed:
                raise ValueError(f"Task {task_id} not found (scheduler disposed)")
            await asyncio.sleep(0.01)  # 10ms delay

        result = self._completed_tasks[task_id]
        return result

    async def check_global_steps(self) -> None:
        """
        Check global step limit and yield if needed

        :raises: RuntimeError if global step limit exceeded
        """
        self._global_steps += 1
        if self._global_steps > self._global_max_steps:
            raise RuntimeError("Global step limit exceeded")

        # Yield to event loop
        await asyncio.sleep(0)

    def cancel(self, task_id: str) -> None:
        """
        Cancel a running task

        :param task_id: Task identifier to cancel
        """
        task_index = next((i for i, t in enumerate(self._task_queue) if t.id == task_id), None)
        if task_index is not None:
            task = self._task_queue.pop(task_index)
            if not task.future.done():
                task.future.cancel()

    def is_complete(self, task_id: str) -> bool:
        """
        Check if a task is complete

        :param task_id: Task identifier to check
        :returns: True if task is completed
        """
        return task_id in self._completed_tasks

    async def _run_next_task(self) -> None:
        """
        Run the next task in the queue (sequential mode)

        Tasks are executed one at a time in FIFO order.
        Continues processing until the queue is empty.
        """
        if len(self._task_queue) == 0:
            self._current_task_running = False
            return

        # Set flag at the start to prevent concurrent execution
        self._current_task_running = True

        task = self._task_queue.pop(0)  # FIFO (pop from front)
        self._current_task_id = task.id

        try:
            result = await task.fn()
            self._completed_tasks[task.id] = result
            if not task.future.done():
                task.future.set_result(result)
        except Exception as error:
            if not task.future.done():
                task.future.set_exception(error)

        # Continue with next task in queue (sequential mode)
        if len(self._task_queue) > 0:
            await self._run_next_task()
        else:
            # Only clear flag when all tasks are done
            self._current_task_running = False

    async def _run_breadth_first(self) -> None:
        """
        Execute all tasks currently in the queue in parallel (breadth-first)

        Newly spawned tasks during execution will be executed in the next batch.
        This implements a generational (breadth-first) execution strategy.
        """
        if len(self._task_queue) == 0:
            self._breadth_first_running = False
            return

        self._breadth_first_running = True

        # Take a snapshot of the current queue (this batch)
        current_batch = list(self._task_queue)
        self._task_queue = []

        # Execute all tasks in the current batch in parallel
        tasks = []
        for task in current_batch:
            async def run_task(t=task):
                self._current_task_id = t.id
                try:
                    result = await t.fn()
                    self._completed_tasks[t.id] = result
                    if not t.future.done():
                        t.future.set_result(result)
                except Exception as error:
                    if not t.future.done():
                        t.future.set_exception(error)
            tasks.append(run_task())

        await asyncio.gather(*tasks, return_exceptions=True)

        # If new tasks were spawned during execution, continue with next batch
        if len(self._task_queue) > 0:
            await self._run_breadth_first()
        else:
            # Reset global_steps after all batches complete
            self._global_steps = 0
            self._breadth_first_running = False

    async def _run_depth_first(self) -> None:
        """
        Execute tasks depth-first (LIFO - last spawned, first executed)

        Each task runs to completion before the next one starts.
        Newest tasks are executed first.
        """
        self._depth_first_running = True

        try:
            # Execute tasks in LIFO order (last spawned = first executed)
            while len(self._task_queue) > 0:
                task = self._task_queue.pop()  # pop() removes from end (LIFO)
                self._current_task_id = task.id

                try:
                    result = await task.fn()
                    self._completed_tasks[task.id] = result
                    if not task.future.done():
                        task.future.set_result(result)
                except Exception as error:
                    if not task.future.done():
                        task.future.set_exception(error)

            # Continue processing if new tasks were added during execution
            if len(self._task_queue) > 0:
                await self._run_depth_first()
        finally:
            # Only clear flag when we're the top-level call and queue is empty
            if len(self._task_queue) == 0:
                self._depth_first_running = False


#==============================================================================
# Async Barrier (for fork-join synchronization)
#==============================================================================

class AsyncBarrier:
    """
    Async barrier for fork-join synchronization

    A barrier allows multiple tasks to synchronize at a specific point.
    All tasks must wait at the barrier before any can proceed.
    """

    def __init__(self, count: int):
        """
        Initialize the barrier

        :param count: Number of tasks that must wait before releasing
        :raises: ValueError if count is not positive
        """
        if count <= 0:
            raise ValueError("Barrier count must be positive")
        self._count = count
        self._waiting: List[asyncio.Future[None]] = []
        self._release_in_progress = False

    async def wait(self) -> None:
        """
        Wait at the barrier

        The last task to arrive releases all waiting tasks in FIFO order.

        :returns: When all tasks have arrived at the barrier
        """
        self._count -= 1

        if self._count == 0:
            # Last task to arrive - release all waiting tasks in FIFO order
            if not self._release_in_progress:
                self._release_in_progress = True
                # Release all waiters in FIFO order
                waiters = list(self._waiting)
                self._waiting = []
                for waiter in waiters:
                    if not waiter.done():
                        waiter.set_result(None)
                self._release_in_progress = False
        else:
            # Wait for the last task to arrive
            loop = asyncio.get_event_loop()
            future: asyncio.Future[None] = loop.create_future()
            self._waiting.append(future)
            await future

    def reset(self, count: int) -> None:
        """
        Reset the barrier with a new count

        :param count: New count value
        :raises: ValueError if count is not positive
        """
        if count <= 0:
            raise ValueError("Barrier count must be positive")
        self._count = count
        self._waiting = []
        self._release_in_progress = False


#==============================================================================
# Factory Functions
#==============================================================================

def create_task_scheduler(
    global_max_steps: int = 1_000_000,
    yield_interval: int = 100,
) -> TaskScheduler:
    """
    Create a default task scheduler

    :param global_max_steps: Maximum steps before error
    :param yield_interval: Steps between cooperative yields
    :returns: A new DefaultTaskScheduler instance
    """
    return DefaultTaskScheduler(
        global_max_steps=global_max_steps,
        yield_interval=yield_interval,
    )


def create_deterministic_scheduler(
    mode: SchedulerMode = SchedulerMode.PARALLEL,
    global_max_steps: int = 1_000_000,
) -> TaskScheduler:
    """
    Create a deterministic scheduler for testing

    :param mode: Execution mode (sequential/parallel/breadth-first/depth-first)
    :param global_max_steps: Maximum steps before error
    :returns: A new DeterministicScheduler instance
    """
    return DeterministicScheduler(
        mode=mode,
        global_max_steps=global_max_steps,
    )
