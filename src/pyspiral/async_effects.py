"""
SPIRAL Async Effects
Async runtime primitives for PIR (Parallel IR)
Provides AsyncChannel, AsyncRefCell, AsyncMutex, and AsyncBarrier
"""

from __future__ import annotations

import asyncio
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Union, Literal
from typing import TypeVar, Coroutine, Generic

from pyspiral.types import Value


T = TypeVar('T')


#==============================================================================
# Async Mutex (mutual exclusion lock)
#==============================================================================

class AsyncMutex:
    """
    AsyncMutex provides cooperative mutual exclusion for async operations.
    Uses a queue-based approach to avoid busy-waiting.
    """

    def __init__(self) -> None:
        self._locked: bool = False
        self._queue: List[asyncio.Future] = []
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        """
        Acquire the lock.
        Returns when lock is acquired.
        """
        async with self._lock:
            if not self._locked:
                self._locked = True
                return

        # Wait in queue for lock to be released
        loop = asyncio.get_event_loop()
        future: asyncio.Future[None] = loop.create_future()

        async with self._lock:
            self._queue.append(future)

        await future

    def release(self) -> None:
        """
        Release the lock.
        Wakes up the next waiting task if any.
        """
        loop = asyncio.get_event_loop()

        async def _release() -> None:
            async with self._lock:
                if self._queue:
                    # Wake up next waiter
                    next_waiter = self._queue.pop(0)
                    if not next_waiter.done():
                        next_waiter.set_result(None)
                else:
                    # No waiters, release lock
                    self._locked = False

        # Schedule release on event loop
        loop.create_task(_release())

    async def with_lock(self, fn: Callable[[], Coroutine[Any, Any, T]]) -> T:
        """
        Execute a function while holding the lock.

        Args:
            fn: Async function to execute

        Returns:
            The function's result
        """
        await self.acquire()
        try:
            return await fn()
        finally:
            self.release()

    def is_locked(self) -> bool:
        """
        Check if lock is currently held.
        """
        return self._locked

    def try_lock(self) -> bool:
        """
        Try to acquire the lock without blocking.

        Returns:
            True if lock was acquired, False otherwise
        """
        async def _try_lock() -> bool:
            async with self._lock:
                if not self._locked:
                    self._locked = True
                    return True
                return False

        loop = asyncio.get_event_loop()
        task = loop.create_task(_try_lock())
        # For non-blocking try, we need to run synchronously
        # This is a limitation - in pure async code, use try_acquire() instead
        try:
            return loop.run_until_complete(task)
        except RuntimeError:
            # No running event loop
            return False

    async def try_acquire(self) -> bool:
        """
        Try to acquire the lock without blocking.

        Returns:
            True if lock was acquired, False otherwise
        """
        async with self._lock:
            if not self._locked:
                self._locked = True
                return True
            return False


#==============================================================================
# Async RefCell (mutable reference cell with locking)
#==============================================================================

class AsyncRefCell:
    """
    AsyncRefCell provides thread-safe mutable state for async operations.
    Uses AsyncMutex to ensure atomic read-modify-write operations.
    """

    def __init__(self, initial_value: Value) -> None:
        self._value: Value = initial_value
        self._mutex = AsyncMutex()

    async def read(self) -> Value:
        """
        Read the current value.

        Returns:
            Promise that resolves with the current value
        """
        return await self._mutex.with_lock(lambda: self._read_async())

    async def _read_async(self) -> Value:
        # Helper to make the lambda actually async
        return self._value

    async def write(self, new_value: Value) -> None:
        """
        Write a new value.

        Args:
            new_value: New value to store
        """
        await self._mutex.with_lock(lambda: self._write_async(new_value))

    async def _write_async(self, new_value: Value) -> None:
        # Helper to make the lambda actually async
        self._value = new_value

    async def modify(self, fn: Callable[[Value], Value]) -> None:
        """
        Update the value using a function.

        Args:
            fn: Function that takes the current value and returns the new value
        """
        await self._mutex.with_lock(lambda: self._modify_async(fn))

    async def _modify_async(self, fn: Callable[[Value], Value]) -> None:
        # Helper to make the lambda actually async
        self._value = fn(self._value)

    # Pythonic aliases

    async def get(self) -> Value:
        """Alias for read()"""
        return await self.read()

    async def set(self, new_value: Value) -> None:
        """Alias for write()"""
        await self.write(new_value)

    async def update(self, fn: Callable[[Value], Value]) -> None:
        """Alias for modify()"""
        await self.modify(fn)

    # Unsafe operations (use with caution)

    def get_unsafe(self) -> Value:
        """
        Get the current value without locking.
        Unsafe, use with caution.
        """
        return self._value

    def set_unsafe(self, value: Value) -> None:
        """
        Set the value without locking.
        Unsafe, use with caution.
        """
        self._value = value


#==============================================================================
# Async Channel (Go-style buffered channels)
#==============================================================================

class AsyncChannel:
    """
    AsyncChannel implements Go-style buffered channels for async communication.
    Supports multiple producers/consumers with configurable buffering.
    """

    def __init__(self, capacity: int,
                 channel_type: Literal["mpsc", "spsc", "mpmc", "broadcast"] = "mpsc") -> None:
        if capacity < 0:
            raise ValueError("Channel capacity must be non-negative")

        self._buffer: List[Value] = []
        self._capacity: int = capacity
        self._closed: bool = False
        self._waiting_senders: List[tuple[Value, asyncio.Future]] = []
        self._waiting_receivers: List[asyncio.Future] = []
        self._channel_type: Literal["mpsc", "spsc", "mpmc", "broadcast"] = channel_type
        self._lock = asyncio.Lock()

    async def send(self, value: Value) -> None:
        """
        Send a value to the channel.
        Blocks if buffer is full, unless channel is closed.

        Args:
            value: Value to send

        Raises:
            RuntimeError: If channel is closed
        """
        if self._closed:
            raise RuntimeError("Cannot send to closed channel")

        async with self._lock:
            # If there's a waiting receiver, deliver directly
            if self._waiting_receivers:
                receiver = self._waiting_receivers.pop(0)
                if not receiver.done():
                    receiver.set_result(value)
                return

            # If buffer has space, add to buffer
            if len(self._buffer) < self._capacity:
                self._buffer.append(value)
                return

        # Buffer is full, wait for space
        loop = asyncio.get_event_loop()
        future: asyncio.Future[None] = loop.create_future()

        async with self._lock:
            self._waiting_senders.append((value, future))

        await future

    def try_send(self, value: Value) -> bool:
        """
        Try to send without blocking.

        Args:
            value: Value to send

        Returns:
            True if send succeeded, False if channel is full

        Raises:
            RuntimeError: If channel is closed
        """
        if self._closed:
            raise RuntimeError("Cannot send to closed channel")

        # Check if we can deliver immediately
        if self._waiting_receivers:
            loop = asyncio.get_event_loop()
            loop.call_soon(self._deliver_to_receiver, value)
            return True

        if len(self._buffer) < self._capacity:
            self._buffer.append(value)
            return True

        return False

    def _deliver_to_receiver(self, value: Value) -> None:
        """Helper to deliver value to waiting receiver"""
        if self._waiting_receivers:
            receiver = self._waiting_receivers.pop(0)
            if not receiver.done():
                receiver.set_result(value)

    async def receive(self) -> Value:
        """
        Receive a value from the channel.
        Blocks if buffer is empty, until a value arrives or channel is closed.

        Returns:
            Promise that resolves with the received value

        Raises:
            RuntimeError: If channel is closed and empty
        """
        async with self._lock:
            # If buffer has value, return immediately
            if self._buffer:
                value = self._buffer.pop(0)

                # Wake up a waiting sender if any
                if self._waiting_senders:
                    send_value, sender_future = self._waiting_senders.pop(0)
                    self._buffer.append(send_value)
                    if not sender_future.done():
                        sender_future.set_result(None)

                return value

            # If channel is closed and buffer is empty
            if self._closed:
                raise RuntimeError("Cannot receive from closed channel")

            # If there's a waiting sender (rendezvous for unbuffered channels)
            if self._waiting_senders:
                send_value, sender_future = self._waiting_senders.pop(0)
                # Resolve the sender's promise (so send() completes)
                if not sender_future.done():
                    sender_future.set_result(None)
                # Return the value the sender was trying to send
                return send_value

        # Wait for a value
        loop = asyncio.get_event_loop()
        future: asyncio.Future[Value] = loop.create_future()

        async with self._lock:
            self._waiting_receivers.append(future)

        return await future

    async def recv(self) -> Value:
        """Alias for receive()"""
        return await self.receive()

    def try_receive(self) -> Optional[Value]:
        """
        Try to receive without blocking.

        Returns:
            Received value or None if channel is empty

        Raises:
            RuntimeError: If channel is closed
        """
        if self._buffer:
            value = self._buffer.pop(0)

            # Wake up a waiting sender if any
            if self._waiting_senders:
                send_value, sender_future = self._waiting_senders.pop(0)
                self._buffer.append(send_value)
                loop = asyncio.get_event_loop()
                if not sender_future.done():
                    loop.call_soon(sender_future.set_result, None)

            return value

        # Channel is empty
        if self._closed:
            raise RuntimeError("Cannot receive from closed channel")

        return None

    def try_recv(self) -> Optional[Value]:
        """Alias for try_receive()"""
        return self.try_receive()

    def close(self) -> None:
        """
        Close the channel.
        No more sends will be allowed, pending receivers will be rejected.
        """
        if self._closed:
            return

        self._closed = True

        # Reject all waiting receivers
        for receiver in self._waiting_receivers:
            if not receiver.done():
                receiver.set_exception(RuntimeError("Channel closed"))
        self._waiting_receivers.clear()

        # Reject all waiting senders
        for _, sender in self._waiting_senders:
            if not sender.done():
                sender.set_exception(RuntimeError("Channel closed"))
        self._waiting_senders.clear()

    def is_closed(self) -> bool:
        """
        Check if channel is closed.
        """
        return self._closed

    def size(self) -> int:
        """
        Get current buffer size.
        """
        return len(self._buffer)

    def get_capacity(self) -> int:
        """
        Get channel capacity.
        """
        return self._capacity

    def get_channel_type(self) -> Literal["mpsc", "spsc", "mpmc", "broadcast"]:
        """
        Get the channel type.
        """
        return self._channel_type


#==============================================================================
# Async Barrier (fork-join synchronization)
#==============================================================================

class AsyncBarrier:
    """
    AsyncBarrier provides fork-join synchronization for parallel tasks.
    Allows waiting for a set of tasks to complete before continuing.
    """

    def __init__(self, count: int = 0) -> None:
        self._count: int = count
        self._tasks: Dict[str, asyncio.Task] = {}
        self._results: Dict[str, Any] = {}
        self._errors: Dict[str, Exception] = {}
        self._lock = asyncio.Lock()
        self._completion_event: Optional[asyncio.Event] = None

    async def fork(self, task_id: str, coro: Coroutine[Any, Any, T]) -> str:
        """
        Fork a new async task.

        Args:
            task_id: Unique identifier for the task
            coro: Coroutine to execute

        Returns:
            The task ID
        """
        async def _wrapped() -> None:
            try:
                result = await coro
                async with self._lock:
                    self._results[task_id] = result
            except Exception as e:
                async with self._lock:
                    self._errors[task_id] = e
            finally:
                async with self._lock:
                    if task_id in self._tasks:
                        del self._tasks[task_id]
                    self._check_completion()

        async with self._lock:
            self._count += 1
            task = asyncio.create_task(_wrapped())
            self._tasks[task_id] = task

        return task_id

    async def join(self, timeout: Optional[float] = None) -> Dict[str, Any]:
        """
        Wait for all forked tasks to complete.

        Args:
            timeout: Optional timeout in seconds

        Returns:
            Dictionary mapping task IDs to their results

        Raises:
            TimeoutError: If timeout is exceeded
            RuntimeError: If any task raised an exception
        """
        # Create completion event if not exists
        async with self._lock:
            if not self._completion_event:
                self._completion_event = asyncio.Event()
            completion_event = self._completion_event

        # Check if already complete
        async with self._lock:
            if not self._tasks:
                return self._results.copy()

        # Wait for completion or timeout
        if timeout:
            try:
                await asyncio.wait_for(completion_event.wait(), timeout)
            except asyncio.TimeoutError:
                raise TimeoutError(f"Barrier join timeout after {timeout}s")
        else:
            await completion_event.wait()

        # Check for errors
        async with self._lock:
            if self._errors:
                error_msg = "; ".join(
                    f"{tid}: {err}" for tid, err in self._errors.items()
                )
                raise RuntimeError(f"Tasks failed: {error_msg}")

            return self._results.copy()

    async def wait(self) -> Dict[str, Any]:
        """
        Alias for join() without timeout.
        """
        return await self.join()

    def add_task(self, task_id: str, task: asyncio.Task) -> None:
        """
        Add an existing task to the barrier.

        Args:
            task_id: Unique identifier for the task
            task: The asyncio task to track
        """
        async def _track() -> None:
            try:
                result = await task
                async with self._lock:
                    self._results[task_id] = result
            except Exception as e:
                async with self._lock:
                    self._errors[task_id] = e
            finally:
                async with self._lock:
                    if task_id in self._tasks:
                        del self._tasks[task_id]
                    self._check_completion()

        async def _add_and_track() -> None:
            async with self._lock:
                self._count += 1
                self._tasks[task_id] = task
            await _track()

        loop = asyncio.get_event_loop()
        loop.create_task(_add_and_track())

    def _check_completion(self) -> None:
        """Check if all tasks are complete and signal if so"""
        if not self._tasks and self._completion_event:
            self._completion_event.set()

    @property
    def count(self) -> int:
        """Get the number of tasks tracked by this barrier"""
        return self._count

    @property
    def pending(self) -> int:
        """Get the number of pending tasks"""
        return len(self._tasks)

    @property
    def completed(self) -> int:
        """Get the number of completed tasks"""
        return len(self._results)

    @property
    def failed(self) -> int:
        """Get the number of failed tasks"""
        return len(self._errors)

    def reset(self) -> None:
        """Reset the barrier for reuse"""
        async def _reset() -> None:
            async with self._lock:
                self._count = 0
                self._tasks.clear()
                self._results.clear()
                self._errors.clear()
                self._completion_event = None

        loop = asyncio.get_event_loop()
        loop.create_task(_reset())


#==============================================================================
# Concurrent Effect Log
#==============================================================================

@dataclass
class Effect:
    """Effect represents a side effect operation"""
    op: str
    args: List[Value]
    result: Optional[Value] = None
    error: Optional[Exception] = None


@dataclass
class ConcurrentEffect:
    """ConcurrentEffect represents an effect with task metadata"""
    task_id: str
    seq_num: int
    timestamp: int
    effect: Effect


class ConcurrentEffectLog:
    """
    ConcurrentEffectLog tracks effects across concurrent tasks.
    Uses sequence numbers and timestamps for ordering.
    """

    def __init__(self) -> None:
        self._effects: List[ConcurrentEffect] = []
        self._seq_counter: int = 0
        self._start_time: int = int(time.time() * 1000)

    def append(self, task_id: str, effect: Effect) -> None:
        """
        Append an effect to the log.

        Args:
            task_id: Task that generated the effect
            effect: Effect to log
        """
        self._effects.append(ConcurrentEffect(
            task_id=task_id,
            seq_num=self._seq_counter,
            timestamp=int(time.time() * 1000) - self._start_time,
            effect=effect,
        ))
        self._seq_counter += 1

    def append_with_result(self, task_id: str, effect: Effect, result: Value) -> None:
        """
        Append an effect with result.

        Args:
            task_id: Task that generated the effect
            effect: Effect to log
            result: Result of the effect
        """
        effect_with_result = Effect(
            op=effect.op,
            args=effect.args,
            result=result,
            error=effect.error
        )
        self._effects.append(ConcurrentEffect(
            task_id=task_id,
            seq_num=self._seq_counter,
            timestamp=int(time.time() * 1000) - self._start_time,
            effect=effect_with_result,
        ))
        self._seq_counter += 1

    def append_with_error(self, task_id: str, effect: Effect, error: Exception) -> None:
        """
        Append an effect with error.

        Args:
            task_id: Task that generated the effect
            effect: Effect to log
            error: Error from the effect
        """
        effect_with_error = Effect(
            op=effect.op,
            args=effect.args,
            result=effect.result,
            error=error
        )
        self._effects.append(ConcurrentEffect(
            task_id=task_id,
            seq_num=self._seq_counter,
            timestamp=int(time.time() * 1000) - self._start_time,
            effect=effect_with_error,
        ))
        self._seq_counter += 1

    def get_ordered(self) -> List[Effect]:
        """
        Get all effects ordered by sequence number.

        Returns:
            List of effects in order
        """
        return [e.effect for e in sorted(self._effects, key=lambda x: x.seq_num)]

    def get_by_task(self, task_id: str) -> List[Effect]:
        """
        Get all effects for a specific task.

        Args:
            task_id: Task ID to filter by

        Returns:
            List of effects for the task, ordered by sequence number
        """
        task_effects = [e for e in self._effects if e.task_id == task_id]
        return [e.effect for e in sorted(task_effects, key=lambda x: x.seq_num)]

    def discard_task(self, task_id: str) -> None:
        """
        Discard all effects from a task (e.g., on cancellation).

        Args:
            task_id: Task ID whose effects to discard
        """
        self._effects = [e for e in self._effects if e.task_id != task_id]

    def clear(self) -> None:
        """Clear all effects"""
        self._effects.clear()
        self._seq_counter = 0
        self._start_time = int(time.time() * 1000)

    def size(self) -> int:
        """
        Get the number of effects logged.
        """
        return len(self._effects)

    def get_stats(self) -> Dict[str, Any]:
        """
        Get effect statistics.

        Returns:
            Dictionary with total, byTask, and byOp statistics
        """
        by_task: Dict[str, int] = {}
        by_op: Dict[str, int] = {}

        for e in self._effects:
            by_task[e.task_id] = by_task.get(e.task_id, 0) + 1
            by_op[e.effect.op] = by_op.get(e.effect.op, 0) + 1

        return {
            "total": len(self._effects),
            "byTask": by_task,
            "byOp": by_op,
        }


#==============================================================================
# Async RefCell Store (map of named ref cells)
#==============================================================================

class AsyncRefCellStore:
    """AsyncRefCellStore manages a collection of named reference cells"""

    def __init__(self) -> None:
        self._cells: Dict[str, AsyncRefCell] = {}

    def get_or_create(self, name: str, initial_value: Value) -> AsyncRefCell:
        """
        Get or create a ref cell by name.

        Args:
            name: Cell identifier
            initial_value: Initial value if creating new cell

        Returns:
            The ref cell
        """
        if name not in self._cells:
            self._cells[name] = AsyncRefCell(initial_value)
        return self._cells[name]

    def get(self, name: str) -> Optional[AsyncRefCell]:
        """
        Get an existing ref cell.

        Args:
            name: Cell identifier

        Returns:
            The ref cell or None if not found
        """
        return self._cells.get(name)

    def delete(self, name: str) -> bool:
        """
        Delete a ref cell.

        Args:
            name: Cell identifier

        Returns:
            True if cell was deleted, False if not found
        """
        if name in self._cells:
            del self._cells[name]
            return True
        return False

    def clear(self) -> None:
        """Clear all cells"""
        self._cells.clear()

    def size(self) -> int:
        """Get the number of cells"""
        return len(self._cells)


#==============================================================================
# Async Channel Store (map of named channels)
#==============================================================================

class AsyncChannelStore:
    """AsyncChannelStore manages a collection of named channels"""

    def __init__(self) -> None:
        self._channels: Dict[str, AsyncChannel] = {}
        self._next_id: int = 0

    def create(self, capacity: int,
               channel_type: Literal["mpsc", "spsc", "mpmc", "broadcast"] = "mpsc") -> str:
        """
        Create a new channel.

        Args:
            capacity: Channel buffer capacity
            channel_type: Type of channel (mpsc, spsc, mpmc, broadcast)

        Returns:
            Channel ID
        """
        chan_id = f"ch_{self._next_id}"
        self._next_id += 1
        self._channels[chan_id] = AsyncChannel(capacity, channel_type)
        return chan_id

    def get(self, chan_id: str) -> Optional[AsyncChannel]:
        """
        Get an existing channel.

        Args:
            chan_id: Channel identifier

        Returns:
            The channel or None if not found
        """
        return self._channels.get(chan_id)

    def delete(self, chan_id: str) -> bool:
        """
        Delete and close a channel.

        Args:
            chan_id: Channel identifier

        Returns:
            True if channel was deleted, False if not found
        """
        if chan_id in self._channels:
            self._channels[chan_id].close()
            del self._channels[chan_id]
            return True
        return False

    def clear(self) -> None:
        """Clear all channels"""
        for channel in self._channels.values():
            channel.close()
        self._channels.clear()

    def size(self) -> int:
        """Get the number of channels"""
        return len(self._channels)


#==============================================================================
# Factory Functions
#==============================================================================

def create_async_mutex() -> AsyncMutex:
    """Create an async mutex"""
    return AsyncMutex()


def create_async_ref_cell(initial_value: Value) -> AsyncRefCell:
    """Create an async ref cell"""
    return AsyncRefCell(initial_value)


def create_async_channel(capacity: int,
                         channel_type: Literal["mpsc", "spsc", "mpmc", "broadcast"] = "mpsc"
                         ) -> AsyncChannel:
    """Create an async channel"""
    return AsyncChannel(capacity, channel_type)


def create_async_barrier(count: int = 0) -> AsyncBarrier:
    """Create an async barrier"""
    return AsyncBarrier(count)


def create_concurrent_effect_log() -> ConcurrentEffectLog:
    """Create a concurrent effect log"""
    return ConcurrentEffectLog()


def create_async_ref_cell_store() -> AsyncRefCellStore:
    """Create an async ref cell store"""
    return AsyncRefCellStore()


def create_async_channel_store() -> AsyncChannelStore:
    """Create an async channel store"""
    return AsyncChannelStore()


#==============================================================================
# Utility Functions
#==============================================================================

async def gather_futures(*futures: Coroutine[Any, Any, T],
                         return_exceptions: bool = False) -> List[T]:
    """
    Gather multiple futures, similar to asyncio.gather but with better error handling.

    Args:
        *futures: Coroutine futures to gather
        return_exceptions: If True, exceptions are returned instead of raised

    Returns:
        List of results from the futures
    """
    tasks = [asyncio.create_task(f) for f in futures]
    results = []

    for task in tasks:
        try:
            result = await task
            results.append(result)
        except Exception as e:
            if return_exceptions:
                results.append(e)  # type: ignore
            else:
                # Cancel remaining tasks
                for t in tasks:
                    if not t.done():
                        t.cancel()
                raise

    return results


async def select_first(*futures: Coroutine[Any, Any, T]) -> tuple[int, T]:
    """
    Select the first future to complete from a set of futures.

    Args:
        *futures: Coroutine futures to select from

    Returns:
        Tuple of (index, result) for the first completed future
    """
    tasks = [asyncio.create_task(f) for f in futures]

    done, pending = await asyncio.wait(
        tasks,
        return_when=asyncio.FIRST_COMPLETED
    )

    # Cancel pending tasks
    for task in pending:
        task.cancel()

    # Get the result
    done_task = list(done)[0]
    index = tasks.index(done_task)
    result = await done_task

    return (index, result)


async def with_timeout(coro: Coroutine[Any, Any, T],
                       timeout: float,
                       default: Optional[T] = None) -> Optional[T]:
    """
    Execute a coroutine with a timeout.

    Args:
        coro: Coroutine to execute
        timeout: Timeout in seconds
        default: Default value to return on timeout

    Returns:
        Result of coroutine or default value on timeout
    """
    try:
        return await asyncio.wait_for(coro, timeout)
    except asyncio.TimeoutError:
        return default
