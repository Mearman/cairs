# PIR Timeout and Select Example

This example demonstrates the enhanced PIR `await` and `select` expressions with timeout, fallback, and returnIndex options.

## Features Demonstrated

### 1. Await with Timeout and Fallback

The `await` expression now supports:
- **timeout**: Maximum time to wait (in milliseconds)
- **fallback**: Value to return if timeout occurs
- **returnIndex**: Return `{index: 0/1, value}` instead of just the value

```json
{
  "kind": "await",
  "future": "taskFuture",
  "timeout": "shortTimeout",
  "fallback": "fallbackValue",
  "returnIndex": true
}
```

**Behavior:**
- If the future completes before timeout: returns `{index: 0, value: <result>}`
- If timeout occurs: returns `{index: 1, value: <fallback>}`

### 2. Select with Return Index

The `select` expression now supports:
- **timeout**: Maximum time to wait for any future (in milliseconds)
- **fallback**: Value to return if all futures timeout
- **returnIndex**: Return which future won

```json
{
  "kind": "select",
  "futures": ["slowFuture", "fastFuture"],
  "returnIndex": true
}
```

**Behavior:**
- Returns `{index: <winning-index>, value: <result>}`
- Index 0..n-1 for the winning future
- Index -1 if timeout occurred

## Example Nodes

- `slowFuture`: Takes ~2000ms to complete (42 * 42 = 1764)
- `fastFuture`: Completes quickly (returns 100)
- `shortTimeout`: 100ms
- `longTimeout`: 5000ms
- `fallbackValue`: -1

## Running

```bash
pnpm run-example pir/async/timeout-select
```

### Different Results

Change the `result` field in the JSON to see different behaviors:

1. **`"result": "selectFirstAvailable"`** (default)
   - Returns `{index: 1, value: 100}` - fastFuture wins

2. **`"result": "awaitWithTimeoutSuccess"`**
   - Returns `{index: 0, value: 1764}` - slowFuture completes within 5000ms

3. **`"result": "awaitWithTimeoutFail"`**
   - Returns `{index: 1, value: -1}` - timeout occurs after 100ms

4. **`"result": "selectWithTimeout"`**
   - Returns `{index: -1, value: -1}` - single future times out, fallback used
