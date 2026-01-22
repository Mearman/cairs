# Optional Parameters with Defaults

This example demonstrates CIR's optional parameters with default values.

## The Feature

Like TypeScript, CAIRS CIR supports optional parameters and default values:
- `optional: true` - parameter can be omitted
- `default` - expression evaluated when parameter is omitted

## Example: Greeting Function

The `greet` function has an optional `title` parameter with a default value:

```json
{
  "params": [
    { "name": "name", "type": { "kind": "string" } },
    {
      "name": "title",
      "type": { "kind": "string" },
      "optional": true,
      "default": {
        "kind": "lit",
        "type": { "kind": "string" },
        "value": "Friend"
      }
    }
  ],
  "body": "..."
}
```

## Usage

```bash
pnpm run-example cir/basics/optional-params
```

## Behavior

- `greet("Alice", "Dr.")` → "Hello, Dr. Alice!"
- `greet("Bob")` → "Hello, Friend Bob!" (uses default)
