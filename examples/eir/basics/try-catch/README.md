# EIR Try/Catch Example

This example demonstrates the EIR (Execution IR) `try` expression for error handling with fallback paths.

## Overview

The `try` expression allows you to:
- Evaluate an expression and catch any errors that occur
- Bind the error value to a parameter in the catch handler
- Optionally provide a fallback expression that runs on success

## Syntax

```json
{
  "kind": "try",
  "tryBody": "node-id",      // Node to evaluate
  "catchParam": "error",     // Parameter name for the error
  "catchBody": "handler",    // Node to evaluate on error
  "fallback": "transform"    // Optional: node to evaluate on success
}
```

## Semantics

1. **Evaluate `tryBody`**: The expression in the tryBody node is evaluated
2. **Error Path**: If the result is an error value:
   - The error is bound to `catchParam` in the environment
   - The `catchBody` node is evaluated with this binding
   - The result of `catchBody` is returned
3. **Success Path** (no error):
   - If `fallback` is provided, it is evaluated and returned
   - If no `fallback`, the tryBody result is returned directly

## Example Breakdown

### Success Path with Fallback

The `resultWithFallback` node demonstrates:
- `tryBody` divides 10 by 2, resulting in 5 (success)
- Since it succeeds, `fallback` multiplies 10 by 10, returning 100
- The `catchBody` is never executed

### Error Path

The `errorResult` node demonstrates:
- `tryBody` divides 10 by 0, which causes a DivideByZero error
- The error is bound to `err`
- `catchBody` returns -1
- No fallback is provided, so the catch result is returned

## Running

```bash
pnpm run-example eir/basics/try-catch
```

Expected result: `100` (from the fallback on successful division)

To see the error path, change the result node to `errorResult`:
```json
"result": "errorResult"
```

Expected result: `-1` (from the catch handler)
