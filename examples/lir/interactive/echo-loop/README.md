# echo-loop (LIR)

**Low-Level IR Example**: CFG representation of a simple loop, demonstrating the basic structure of loop control flow in CFG form.

## What This Demonstrates

- **Loop control flow in CFG form**: Entry block initializes, loopHeader evaluates condition, loopBody executes, loopIncrement updates
- **Back-edges**: Jump from loopIncrement back to loopHeader creates the loop structure
- **Condition checking**: Loop continuation checked via comparison operation and branch terminator
- **CFG block structure**: Explicit separation of loop setup, condition check, body, increment, and exit
- **Variable threading**: Loop counter updated and used across blocks

## Block Structure

```
entry
  └─→ loopHeader
       ├─ condition = (counter < 3)
       ├─ branch on condition ─────────┐
       │                                │
       ├─ true ─→ loopBody ─────┐      │
       │          (print, execute)     │
       │          └─→ loopIncrement ──┐│
       │             (counter += 1)   ││
       │             └──→ back to ─────┘│
       │                loopHeader      │
       │                                │
       └─ false ─→ loopExit ────────────┘
                   (print done, return)
```

## Execution Trace

### Fixed Iteration: 0 to 3

```
entry:
  counter = 0
  jump to loopHeader

loopHeader (check iteration 0):
  limit = 3
  shouldContinue = (0 < 3) = true
  branch to loopBody

loopBody (iteration 0):
  print "Enter value: "
  iteration = 0
  printInt(0)
  jump to loopIncrement

loopIncrement:
  one = 1
  nextCounter = 0 + 1 = 1
  counter = 1
  jump to loopHeader

loopHeader (check iteration 1):
  shouldContinue = (1 < 3) = true
  branch to loopBody

loopBody (iteration 1):
  print "Enter value: "
  iteration = 1
  printInt(1)
  jump to loopIncrement

loopIncrement:
  nextCounter = 1 + 1 = 2
  counter = 2
  jump to loopHeader

loopHeader (check iteration 2):
  shouldContinue = (2 < 3) = true
  branch to loopBody

loopBody (iteration 2):
  print "Enter value: "
  iteration = 2
  printInt(2)
  jump to loopIncrement

loopIncrement:
  nextCounter = 2 + 1 = 3
  counter = 3
  jump to loopHeader

loopHeader (check after iteration 2):
  shouldContinue = (3 < 3) = false
  branch to loopExit

loopExit:
  doneMessage = "Done."
  print "Done."
  return "Done."
```

## Comparison with EIR

**EIR for loop** (expression-based):
```json
{
  "kind": "for",
  "var": "i",
  "init": "initValue",
  "cond": "condition",
  "update": "update",
  "body": "loopBody"
}
```

**LIR equivalent** (CFG-based):
- `init` → Entry block assignment
- `cond` → loopHeader branch condition
- `body` → loopBody block(s)
- `update` → loopIncrement block(s)
- Loop structure → Back-edge from increment to header

This explicit CFG form makes loop structure **analyzable and optimizable** for compilers and analysis tools.

## Design Note: Simplified I/O

This example omits complex I/O branching to focus on core loop structure. The LIR currently has limitations with threading effect results through conditionals (a known gap in the evaluator). The structure here demonstrates the essential loop pattern: fixed-point iteration with condition checking and back-edges.

For more complex interactive patterns (reading, conditionally branching, echoing), see the [EIR echo-loop](../../eir/interactive/echo-loop/) which has full expression support.

## Related Examples

- [EIR echo-loop](../../eir/interactive/echo-loop/): Expression-based version with full interactive I/O
- [while-cfg](../control-flow/while-cfg/): Similar loop structure with arithmetic operations
- [if-else](../control-flow/if-else/): Basic conditional branching without loops
