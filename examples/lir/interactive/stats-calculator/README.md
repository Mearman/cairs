# stats-calculator (LIR)

**Low-Level IR Example**: CFG-based stats calculator in a single block. Demonstrates arithmetic operations and sequential effects in basic block form.

## What This Demonstrates

- **Single-block CFG**: All computation in one basic block
- **Instruction sequencing**: Assignments, arithmetic operations, and effects in order
- **Effect instructions**: Using `effect` kind instructions for I/O operations
- **Arithmetic operations**: Using `op` instructions for add and divide
- **Data flow**: Computing sum from individual values, then average from sum

## CFG Structure

```
┌──────────────────────────┐
│       entry block        │
│                          │
│  n1 = 10                 │
│  n2 = 20                 │
│  n3 = 30                 │
│  sum12 = n1 + n2 = 30    │
│  sum = sum12 + n3 = 60   │
│  three = 3               │
│  average = sum / 3 = 20  │
│                          │
│  print "Sum: "           │
│  print sum               │
│  print newline           │
│  print "Average: "       │
│  print average           │
│  → return                │
└──────────────────────────┘
```

## Block Breakdown

### entry Block (Single Block)

Performs all computation and I/O in sequence:

```
instructions:
  1. assign n1 = 10
  2. assign n2 = 20
  3. assign n3 = 30
  4. op sum12 = core.add(n1, n2) → 30
  5. op sum = core.add(sum12, n3) → 60
  6. assign three = 3
  7. op average = core.div(sum, three) → 20

  Output phase:
  8. assign sumLabel = "Sum: "
  9. effect print1 = print(sumLabel)
  10. effect print2 = print(sum)
  11. assign newline = "\n"
  12. effect print3 = print(newline)
  13. assign avgLabel = "Average: "
  14. effect print4 = print(avgLabel)
  15. effect print5 = print(average)

terminator: return
```

**Data flow:**
- Inputs: n1=10, n2=20, n3=30 (assigned as literals)
- Intermediate: sum12 = 30, sum = 60
- Results: average = 20
- Output: prints both sum and average

## Running

```bash
pnpm run-example lir/interactive/stats-calculator
```

Expected output:
```
Sum: 60
Average: 20
```

Note: This LIR example uses literal values (10, 20, 30) rather than reading from input. For interactive input, see the EIR version.

## LIR vs. EIR

| Aspect | EIR | LIR |
|--------|-----|-----|
| **Input handling** | Multiple `readInt` effect nodes | Literal assignments |
| **Computation** | Call nodes referencing effect/call results | Op instructions sequenced |
| **Output** | Seq nodes chaining print effects | Sequential effect instructions |
| **Value flow** | Implicit in node DAG | Explicit via SSA-style variable bindings |
| **Structure** | Expression-based DAG | Instruction-based CFG |

## Testing

Tests use the `stats-calculator.inputs.json` fixture (though EIR example uses it, LIR example uses literals):

```bash
pnpm test:examples
```

Expected computations:
- Sum: 10 + 20 + 30 = 60
- Average: 60 / 3 = 20
