# echo-loop

**Interactive Example**: Demonstrates a for loop with interleaved I/O effects, reading integers and echoing them back.

## What This Demonstrates

- **For loop with effects**: Fixed-count iteration (3 iterations) with I/O operations in loop body
- **Interleaved I/O pattern**: Each iteration prompts, reads, checks, and prints in sequence
- **Conditional logic within loops**: Uses `if` to branch on quit signal (-1)
- **Sequence composition**: `seq` chaining multiple effects (print → read → conditional output)
- **Variable scoping**: Loop variable `i` available in condition and update expressions

## Design Rationale: For Loop vs While Loop

EIR while loops require pre-computed conditions that must be evaluated and bound before the loop begins. This makes interactive while loops awkward—you'd need to read the initial value before entering the loop, creating asymmetry.

The **C-style for loop** (`for init; cond; update; body`) is better suited for interactive patterns because:

1. **Fixed structure**: init → condition → body → update → repeat is explicit
2. **Cleaner semantics**: No need to bind a pre-computed sentinel value
3. **Natural streaming**: Each iteration can have independent I/O without coordination
4. **Deterministic testing**: With a fixed iteration count (3), test fixtures are predictable

This example uses a fixed count (3) for deterministic testing, but the pattern extends naturally to conditions like `counter < limit` or `!eof()` in real interactive programs.

## Running Interactively

```bash
pnpm run-example eir/interactive/echo-loop
# Prompts three times:
# Enter value: 5
# Received: 5
# Enter value: 10
# Received: 10
# Enter value: -1
# Quit signal received.
# Done.
```

## Running with Predefined Input

```bash
pnpm run-example eir/interactive/echo-loop --inputs "5,10,-1"
```

Or with JSON format:

```bash
pnpm run-example eir/interactive/echo-loop --inputs "[5, 10, -1]"
```

## Using a Custom Input File

```bash
pnpm run-example eir/interactive/echo-loop --inputs-file my-inputs.json
```

Where `my-inputs.json` contains:

```json
[5, 10, -1]
```

## Execution Trace

Given inputs `[5, 10, -1]`:

```
Iteration 0 (i=0):
  print "Enter value: "
  read → 5
  eq(5, -1) = false
  seq(print "Received: ", printInt 5)

Iteration 1 (i=1):
  print "Enter value: "
  read → 10
  eq(10, -1) = false
  seq(print "Received: ", printInt 10)

Iteration 2 (i=2):
  print "Enter value: "
  read → -1
  eq(-1, -1) = true
  print "Quit signal received."

After loop:
  print "Done."

Result: "Done."
```

## Testing

Tests automatically use the `echo-loop.inputs.json` fixture:

```bash
pnpm test:examples
```

The fixture provides `[5, 10, -1]` for deterministic output validation.

## Related Examples

- [prompt-echo](../prompt-echo/): Simple read-echo pattern without loops
- [add-two-ints](../add-two-ints/): Sequential reads and computation without loops
- [greeting-sequence](../greeting-sequence/): Multiple prompts and conditional responses
