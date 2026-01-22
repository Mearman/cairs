# PIR Examples

This directory contains examples demonstrating PIR (Parallel Intermediate Representation) - the async/parallel layer of CAIRS.

## Overview

PIR extends EIR with concurrent and asynchronous execution primitives. It enables:

- **Parallel computation** - Execute multiple branches concurrently
- **Async tasks** - Spawn tasks that run in the background
- **Channel communication** - Go-style buffered channels for coordination
- **Timeout semantics** - Guaranteed completion with fallbacks
- **Race conditions** - Select the first of multiple futures to complete

## Running Examples

```bash
# List all PIR examples
pnpm run-example --list | grep pir

# Run a specific example
pnpm run-example pir/async/spawn-await

# Run with verbose output
pnpm run-example pir/async/timeout-select --verbose
```

PIR examples are evaluated using the async evaluator (`AsyncEvaluator`), which supports concurrent execution.

## Examples by Category

### Async Examples

Basic async task creation and waiting:

- **spawn-await** - Create an async task and wait for its result
- **timeout-select** - Timeout on async operations and race conditions

### Channel Examples

Channel-based communication patterns:

- **producer-consumer** - Basic producer-consumer with buffered channel
- **worker-pool** - Multiple workers processing tasks from a queue
- **fan-in** - Multiple producers sending to a single consumer
- **fan-out** - Single producer broadcasting to multiple consumers

## PIR Expression Reference

### spawn

Create an async task that returns a Future:

```json
{
  "id": "future",
  "expr": {
    "kind": "spawn",
    "task": "taskNode"
  }
}
```

The `spawn` expression creates a new async task that evaluates `taskNode`. It returns a `Future` value containing:
- `taskId`: Unique identifier for the task
- `status`: `"pending"` | `"ready"` | `"error"`
- `value`: The result value (when ready)

### await

Wait for a Future to complete:

```json
{
  "id": "result",
  "expr": {
    "kind": "await",
    "future": "futureNode",
    "timeout": "timeoutNode",     // optional
    "fallback": "fallbackNode",   // optional
    "returnIndex": true           // optional
  }
}
```

- **Without timeout**: Waits indefinitely for the future to complete
- **With timeout**: Returns `fallback` if future doesn't complete within timeout milliseconds
- **With returnIndex**: Returns `{index: n, value: v}` where:
  - `n = 0`: Future completed successfully
  - `n = 1`: Timeout fired, returning fallback value

### channel

Create a channel for communication:

```json
{
  "id": "ch",
  "expr": {
    "kind": "channel",
    "channelType": "spsc",    // "spsc" | "mpsc" | "mpmc" | "broadcast"
    "bufferSize": "bufferNode"  // optional, defaults to 0
  }
}
```

Channel types:
- **spsc**: Single producer, single consumer
- **mpsc**: Multi producer, single consumer
- **mpmc**: Multi producer, multi consumer
- **broadcast**: Multi consumer, each receives all sends

### send / recv

Send and receive values through a channel:

```json
{
  "id": "sendOp",
  "expr": {
    "kind": "send",
    "channel": "ch",
    "value": "valueNode"
  }
}

{
  "id": "received",
  "expr": {
    "kind": "recv",
    "channel": "ch"
  }
}
```

- `send`: Sends a value to the channel (blocks if buffer is full)
- `recv`: Receives a value from the channel (blocks if buffer is empty)

### select

Race multiple futures, return first to complete:

```json
{
  "id": "result",
  "expr": {
    "kind": "select",
    "futures": ["future1", "future2"],
    "timeout": "timeoutNode",    // optional
    "fallback": "fallbackNode",  // optional
    "returnIndex": true          // optional
  }
}
```

- **Without timeout**: Waits for any future to complete
- **With timeout**: Returns `fallback` if no future completes within timeout
- **With returnIndex**: Returns `{index: n, value: v}` where:
  - `n = -1`: Timeout fired
  - `n = 0..k-1`: Future at index `n` completed first

### race

Execute tasks in parallel, return all results:

```json
{
  "id": "results",
  "expr": {
    "kind": "race",
    "tasks": ["task1", "task2", "task3"]
  }
}
```

Returns a list of all task results.

## Timeout and Fallback Patterns

### Basic Timeout

```json
{
  "nodes": [
    { "id": "task", "expr": { "kind": "lit", "type": { "kind": "int" }, "value": 42 } },
    { "id": "future", "expr": { "kind": "spawn", "task": "task" } },
    { "id": "timeout", "expr": { "kind": "lit", "type": { "kind": "int" }, "value": 100 } },
    { "id": "fallback", "expr": { "kind": "lit", "type": { "kind": "int" }, "value": -1 } },
    {
      "id": "result",
      "expr": {
        "kind": "await",
        "future": "future",
        "timeout": "timeout",
        "fallback": "fallback"
      }
    }
  ],
  "result": "result"
}
```

### Timeout with returnIndex

```json
{
  "expr": {
    "kind": "await",
    "future": "future",
    "timeout": "timeout",
    "fallback": "fallback",
    "returnIndex": true
  }
}
```

Returns:
- `{index: 0, value: 42}` if task completes within timeout
- `{index: 1, value: -1}` if timeout fires

## Channel Patterns

### Producer-Consumer

```json
{
  "nodes": [
    { "id": "bufSize", "expr": { "kind": "lit", "type": { "kind": "int" }, "value": 1 } },
    {
      "id": "ch",
      "expr": {
        "kind": "channel",
        "channelType": "spsc",
        "bufferSize": "bufSize"
      }
    },
    { "id": "value", "expr": { "kind": "lit", "type": { "kind": "int" }, "value": 42 } },
    { "id": "send", "expr": { "kind": "send", "channel": "ch", "value": "value" } },
    { "id": "result", "expr": { "kind": "recv", "channel": "ch" } }
  ],
  "result": "result"
}
```

### Fan-Out (Multiple Consumers)

Using `broadcast` channel type to send the same value to multiple consumers:

```json
{
  "channelType": "broadcast"
}
```

### Fan-In (Multiple Producers)

Using `mpsc` channel type for multiple producers sending to a single consumer:

```json
{
  "channelType": "mpsc"
}
```

## Common Pitfalls

### Deadlocks

- Avoid circular dependencies where tasks wait for each other
- Buffered channels can help avoid blocking
- Use `select` with timeout to prevent indefinite blocking

### Memory Leaks

- Completed tasks are cached by the scheduler for multiple awaits
- In long-running computations, consider task cleanup

### Timeout Values

- Timeout values are in milliseconds (node references to integer literals)
- Very short timeouts (e.g., 1ms) may fire before task starts
- Very long timeouts may delay error reporting

## Evaluation Options

PIR evaluation supports additional options:

```typescript
await evaluator.evaluateDocument(doc, {
  concurrency: "parallel",    // "sequential" | "parallel" | "speculative"
  maxSteps: 100000,            // Global step limit
  trace: false,                 // Enable debug output
  scheduler: customScheduler   // Custom task scheduler
});
```

### Concurrency Modes

- **sequential**: Tasks run one at a time (deterministic)
- **parallel**: Tasks run concurrently (default)
- **speculative**: Multiple paths evaluated in parallel

## Learning Path

1. Start with **spawn-await** - Basic async task creation
2. Learn **timeout-select** - Timeout and race conditions
3. Explore **producer-consumer** - Channel-based communication
4. Study **worker-pool** - Advanced parallel patterns

## Related Documentation

- [Main README](../../README.md) - Complete CAIRS specification
- [Examples README](../README.md) - All examples by layer
- [PIR Schema](../../pir.schema.json) - PIR document schema
