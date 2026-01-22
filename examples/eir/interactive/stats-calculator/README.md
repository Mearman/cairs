# stats-calculator

**Interactive Example**: Reads 3 integers from input, computes sum and average, then prints both results.

## What This Demonstrates

- **Sequential I/O effects**: Multiple `readInt` effects combined with arithmetic computation
- **Multi-step computation**: Reading inputs, then using them in multiple calculations
- **Sequential output**: Multiple print operations chained with `seq` nodes
- **Arithmetic operations**: Using `core.add`, `core.div`, and `core.max`
- **Effect-value composition**: Using effect results directly in arithmetic operations

## I/O Flow

```
Input phase:
  Read integer (expects: 10)
  Read integer (expects: 20)
  Read integer (expects: 30)

Computation phase:
  sum = 10 + 20 = 30
  sum = 30 + 30 = 60
  average = 60 / 3 = 20

Output phase:
  Print "Sum: "
  Print 60
  Print newline
  Print "Average: "
  Print 20
```

## Running Interactively

```bash
pnpm run-example eir/interactive/stats-calculator
# Input: 10
# Input: 20
# Input: 30
# Output:
# Sum: 60
# Average: 20
```

## Running with Predefined Input

```bash
pnpm run-example eir/interactive/stats-calculator --inputs "10,20,30"
```

Or with JSON array format:

```bash
pnpm run-example eir/interactive/stats-calculator --inputs "[10, 20, 30]"
```

## Using the Fixture File

```bash
pnpm run-example eir/interactive/stats-calculator --inputs-file ./examples/eir/interactive/stats-calculator/stats-calculator.inputs.json
```

## Testing

Tests automatically use the `stats-calculator.inputs.json` fixture:

```bash
pnpm test:examples
```

Expected results:
- Sum: 60
- Average: 20

## EIR Pattern Breakdown

### Direct Effect Usage in Computation

Unlike pure expressions, EIR allows effects to produce values that are immediately used in computation:

```json
{
  "id": "sum12",
  "expr": {
    "kind": "call",
    "ns": "core",
    "name": "add",
    "args": ["readNum1", "readNum2"]
  }
}
```

Here, `readNum1` and `readNum2` are effect nodes that produce integer values, which are then passed to `core.add`.

### Sequential Output via Node Chaining

Output is structured as a chain of sequenced nodes:

```json
{
  "id": "printSum",
  "expr": {
    "kind": "seq",
    "first": "printSumLabel",
    "then": {
      "kind": "effect",
      "op": "printInt",
      "args": ["sum123"]
    }
  }
}
```

This ensures that the label is printed before the value.

### Multi-Input Computation

Each arithmetic operation references previous computations:

```
readNum1 + readNum2 → sum12
sum12 + readNum3 → sum123
max(readNum1, readNum2) → max12
max(max12, readNum3) → maximum
```

This DAG structure allows for efficient computation of multiple statistics from the same input values.

## LIR Equivalent

See `lir/interactive/stats-calculator/` for the CFG-based lowering of this pattern.
