# SPIRAL Examples

This directory contains examples demonstrating each Intermediate Representation (IR) layer in SPIRAL.

## Quick Start

Per-example folder layout: each example lives in its own directory alongside a minimal README. Run with the folder path plus the filename (without extension):

```bash
pnpm run-example air/basics/arithmetic/arithmetic

# List all available examples
pnpm run-example --list

# Run with verbose output
pnpm run-example cir/algorithms/factorial/factorial --verbose
```

## IR Layers

| Layer | Description | When to Use |
|-------|-------------|-------------|
| **[AIR](./air/)** | Algebraic IR - pure, declarative expressions | Mathematical relationships, static analysis |
| **[CIR](./cir/)** | Computational IR - adds lambdas and recursion | Algorithms, higher-order functions |
| **[EIR](./eir/)** | Execution IR - imperative features | Side effects, mutation, loops |
| **[PIR](./pir/)** | Parallel IR - async/parallel primitives | Concurrency, async tasks, channels |
| **[LIR](./lir/)** | Low-level IR - CFG-based | Code generation, optimization |

## Example Structure

- Layout: `examples/<layer>/<category>/<example>/<example>.<layer>.json` with a sibling `README.md` describing what the example shows.
- Run path: the portion after `examples/`, minus the `.json` extension. Example: `air/basics/arithmetic/arithmetic` (or just `air/basics/arithmetic` now that directory resolution is supported).
- README content: brief purpose and run command; it does **not** duplicate the JSON contents.
- Validation: examples are covered by `pnpm test:examples`.

## Running Examples

### CLI Runner

```bash
# Run an example
pnpm run-example <path-to-example>

# Examples
pnpm run-example air/basics/literals
pnpm run-example air/control-flow/simple-if
pnpm run-example cir/basics/identity-lambda
pnpm run-example cir/algorithms/factorial
pnpm run-example eir/basics/sequencing
pnpm run-example eir/loops/while-loop
pnpm run-example lir/basics/straight-line
pnpm run-example lir/control-flow/if-else
```

### Options

| Flag | Description |
|------|-------------|
| `--list` | List all available examples |
| `--verbose` | Show detailed evaluation output |
| `--validate` | Only validate, don't evaluate |
| `--synth` | Generate Python code instead of evaluating |
| `--inputs <values>` | Provide comma-separated or JSON inputs for interactive examples |
| `--inputs-file <path>` | Read inputs from a JSON file |
| `--help` | Show help message |

### Interactive Input (EIR/LIR)

Examples using `readLine` or `readInt` effects can accept inputs from multiple sources:

```bash
# Interactive stdin prompt (default on TTY)
pnpm run-example eir/interactive/add-two-ints

# Comma-separated values
pnpm run-example eir/interactive/add-two-ints --inputs "3,4"

# JSON array format
pnpm run-example eir/interactive/add-two-ints --inputs "[3, 4]"

# From a JSON file
pnpm run-example eir/interactive/add-two-ints --inputs-file ./inputs.json
```

**Input precedence:** `--inputs` flag > `--inputs-file` flag > `.inputs.json` fixture > interactive prompt (TTY only)

Fixture files (e.g., `add-two-ints.inputs.json`) enable deterministic testing of interactive examples.

### Python Code Generation

The `--synth` flag generates executable Python code from SPIRAL documents:

```bash
# Generate Python from AIR example
pnpm run-example air/basics/arithmetic --synth

# Generate Python from CIR example
pnpm run-example cir/algorithms/factorial --synth

# Generate Python from EIR example
pnpm run-example eir/loops/while-loop --synth

# Generate Python from LIR example
pnpm run-example lir/control-flow/while-cfg --synth

# Generate Python from PIR example
pnpm run-example pir/async/spawn-await --synth
```

The generated Python code mirrors the structure of the original SPIRAL document:
- AIR/CIR/EIR: Nodes become variable bindings (`v_nodeId`), operators are mapped to Python equivalents
- LIR: Blocks are emitted as a Python dict with an execution engine that interprets the CFG

You can pipe the output directly to Python:

```bash
pnpm run-example air/basics/arithmetic --synth | python3
```

## Test Runner

All examples are validated and evaluated as tests:

```bash
# Run all example tests
pnpm test:examples

# Run with coverage
pnpm test:examples --coverage
```

## Examples by IR Layer

### AIR Examples (18 files)

| Category | Files | Concepts |
|----------|-------|----------|
| [Basics](./air/basics/) | 4 | Literals, arithmetic, comparisons, boolean logic |
| [Control Flow](./air/control-flow/) | 4 | If expressions, let bindings, scoping |
| [Data Structures](./air/data-structures/) | 7 | Lists and sets operations |
| [Definitions](./air/air-defs/) | 3 | airDef, airRef, predicates |

### CIR Examples (17 files)

| Category | Files | Concepts |
|----------|-------|----------|
| [Basics](./cir/basics/) | 4 | Lambdas, currying, closures |
| [Algorithms](./cir/algorithms/) | 4 | Factorial, Fibonacci, GCD, summation |
| [Higher-Order](./cir/higher-order/) | 4 | Map, filter, fold, compose |
| [Fixpoint](./cir/fixpoint/) | 3 | Fix combinator for recursion |
| [Mixed](./cir/mixed/) | 1 | Using airRef within CIR |

### EIR Examples (27 files)

| Category | Files | Concepts |
|----------|-------|----------|
| [Basics](./eir/basics/) | 4 | Sequencing, assignment, refcells, effects |
| [Interactive](./eir/interactive/) | 11 | Input/output patterns, readLine, readInt, print, printInt |
|   - Basic I/O | 6 | hello-world, greeting-sequence, prompt-echo, echo-formats, add-two-ints, calculator |
|   - Complex I/O | 5 | Conditional, loop, accumulative, mixed-cadence patterns |
| [Loops](./eir/loops/) | 4 | While, for, iter, nested loops |
| [Algorithms](./eir/algorithms/) | 4 | Counter, factorial, sum-list, accumulate |
| [Advanced](./eir/advanced/) | 4 | State machine, I/O loop, mutable list, effects |

### PIR Examples (6 files)

| Category | Files | Concepts |
|----------|-------|----------|
| [Async](./pir/async/) | 2 | Spawn/await, timeout and select |
| [Channels](./pir/channels/) | 4 | Producer-consumer, worker pool, fan-in/fan-out |

### LIR Examples (17 files)

| Category | Files | Concepts |
|----------|-------|----------|
| [Basics](./lir/basics/) | 3 | Straight-line, conditional, loop |
| [Control Flow](./lir/control-flow/) | 3 | If-else, while CFG, nested branch |
| [Phi](./lir/phi/) | 2 | Merge phi, loop phi |
| [Algorithms](./lir/algorithms/) | 4 | Factorial, GCD, FizzBuzz, min-max |
| [Interactive](./lir/interactive/) | 5 | Complex I/O patterns in CFG form with branching and loops |

## Learning Path

For those new to SPIRAL, we recommend exploring examples in this order:

1. **Start with AIR basics:**
   - `air/basics/literals.air.json` - Understand literal values
   - `air/basics/arithmetic.air.json` - Operator calls
   - `air/control-flow/simple-if.air.json` - Conditionals

2. **Explore AIR data structures:**
   - `air/data-structures/list-length.air.json` - List operations
   - `air/data-structures/set-union.air.json` - Set operations

3. **Move to CIR lambdas:**
   - `cir/basics/identity-lambda.cir.json` - First lambda
   - `cir/basics/closures.cir.json` - Variable capture

4. **Try CIR algorithms:**
   - `cir/algorithms/gcd.cir.json` - Recursive algorithm
   - `cir/fixpoint/fix-factorial.cir.json` - Fixpoint combinator

5. **Explore higher-order functions:**
   - `cir/higher-order/compose.cir.json` - Function composition
   - `cir/higher-order/fold.cir.json` - Accumulator pattern

6. **Learn EIR imperative features:**
   - `eir/basics/sequencing.eir.json` - Sequential execution
   - `eir/loops/while-loop.eir.json` - While loops
   - `eir/algorithms/factorial.eir.json` - Imperative factorial

7. **Explore interactive I/O patterns:**
   - `eir/interactive/hello-world.eir.json` - No input, single output
   - `eir/interactive/greeting-sequence.eir.json` - No input, multiple outputs
   - `eir/interactive/prompt-echo.eir.json` - Single input, single output (read strings)
   - `eir/interactive/echo-formats.eir.json` - Single input, multiple outputs
   - `eir/interactive/add-two-ints.eir.json` - Multiple inputs, single output (read integers, perform arithmetic)
   - `eir/interactive/calculator.eir.json` - Multiple inputs, multiple outputs (compute and display results)
   - Try with `--inputs` flag: `pnpm run-example eir/interactive/add-two-ints --inputs "3,4"`

8. **Learn PIR async/parallel patterns:**
   - `pir/async/spawn-await.pir.json` - Basic async task creation and waiting
   - `pir/async/timeout-select.pir.json` - Timeout and race conditions
   - `pir/channels/producer-consumer.pir.json` - Channel-based communication
   - Try with PIR evaluation: automatically uses async evaluator

9. **Study LIR CFG representation:**
   - `lir/basics/straight-line.lir.json` - Basic blocks
   - `lir/control-flow/while-cfg.lir.json` - Loops as CFG
   - `lir/phi/loop-phi.lir.json` - Loop-carried variables

## Document Schema

### AIR Document

```typescript
interface AIRDocument {
  version: string;
  airDefs: AirDef[];      // Named, reusable definitions
  nodes: Node[];          // Expression nodes
  result: string;         // ID of result node
}
```

### CIR Document

CIR uses the same structure as AIR but allows additional expression kinds in nodes:
- `lambda` - Anonymous function
- `callExpr` - Call a lambda value
- `fix` - Fixpoint combinator for recursion

### EIR Document

EIR extends CIR with imperative expression kinds:
- `seq` - Sequential execution
- `assign` - Variable mutation
- `while` - While loop
- `for` - C-style for loop
- `iter` - Iterator over list/set
- `effect` - Side effect operation
- `refCell` - Create reference cell
- `deref` - Read from reference cell

### LIR Document

LIR uses a different structure based on control flow graphs:
- `blocks` - Array of basic blocks
- `entry` - ID of entry block
- Each block has `instructions` and a `terminator`
- Phi nodes implement SSA merging

## Expression Kinds

| Kind | AIR | CIR | EIR | LIR | Description |
|------|-----|-----|-----|-----|-------------|
| `lit` | ✅ | ✅ | ✅ | ✅ | Literal value |
| `ref` | ✅ | ✅ | ✅ | ❌ | Reference to another node |
| `var` | ✅ | ✅ | ✅ | ✅ | Variable reference |
| `call` | ✅ | ✅ | ✅ | ❌ | Operator application |
| `if` | ✅ | ✅ | ✅ | ❌ | Conditional (expression) |
| `let` | ✅ | ✅ | ✅ | ❌ | Local binding |
| `airRef` | ✅ | ✅ | ✅ | ❌ | Reference to airDef |
| `predicate` | ✅ | ✅ | ✅ | ❌ | Predicate value |
| `lambda` | ❌ | ✅ | ✅ | ❌ | Anonymous function |
| `callExpr` | ❌ | ✅ | ✅ | ❌ | Lambda call |
| `fix` | ❌ | ✅ | ✅ | ❌ | Fixpoint |
| `seq` | ❌ | ❌ | ✅ | ❌ | Sequential execution |
| `assign` | ❌ | ❌ | ✅ | ✅ | Variable assignment |
| `while` | ❌ | ❌ | ✅ | ❌ | While loop |
| `for` | ❌ | ❌ | ✅ | ❌ | For loop |
| `iter` | ❌ | ❌ | ✅ | ❌ | Iterator loop |
| `effect` | ❌ | ❌ | ✅ | ✅ | Side effect |
| `refCell` | ❌ | ❌ | ✅ | ❌ | Reference cell |
| `deref` | ❌ | ❌ | ✅ | ❌ | Dereference cell |
| `phi` | ❌ | ❌ | ❌ | ✅ | SSA phi node |

### LIR Instructions

LIR uses instructions rather than expressions:
- `assign` - Assign value to variable
- `op` - Operator call
- `call` - Function call
- `phi` - SSA merge
- `effect` - Side effect
- `assignRef` - Assign to reference cell

### LIR Terminators

Each LIR block ends with a terminator:
- `jump` - Unconditional jump
- `branch` - Conditional branch
- `return` - Return value
- `exit` - Exit with code

## Type System

| Type | Description | Example |
|------|-------------|---------|
| `int` | Integer | `42` |
| `float` | Floating-point | `3.14` |
| `bool` | Boolean | `true` |
| `string` | String | `"hello"` |
| `list<T>` | Homogeneous list | `[1, 2, 3]` |
| `set<T>` | Homogeneous set | `{1, 2, 3}` |
| `fn(params) -> returns` | Function type | `(int, int) -> int` |

## Further Reading

- [AIR README](./air/README.md) - Detailed AIR reference
- [CIR README](./cir/README.md) - Detailed CIR reference
- [EIR README](./eir/README.md) - Detailed EIR reference
- [LIR README](./lir/README.md) - Detailed LIR reference
- [SPIRAL Repository](../) - Main project documentation
