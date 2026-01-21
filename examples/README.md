# CAIRS Examples

This directory contains examples demonstrating each Intermediate Representation (IR) layer in CAIRS.

## Quick Start

```bash
# Run a specific example
pnpm run-example air/basics/arithmetic

# List all available examples
pnpm run-example --list

# Run with verbose output
pnpm run-example cir/algorithms/factorial --verbose
```

## IR Layers

| Layer | Description | When to Use |
|-------|-------------|-------------|
| **[AIR](./air/)** | Algebraic IR - pure, declarative expressions | Mathematical relationships, static analysis |
| **[CIR](./cir/)** | Computational IR - adds lambdas and recursion | Algorithms, higher-order functions |
| **EIR** | Execution IR - imperative features (future) | Side effects, mutation, loops |
| **LIR** | Low-level IR - CFG-based (future) | Code generation, optimization |

## Example Structure

Each example is a JSON file following the AIR or CIR document schema:

```json
{
  "version": "1.0.0",
  "airDefs": [...],    // Reusable definitions (AIR only)
  "nodes": [...],       // Expression nodes
  "result": "output"    // Reference to result node
}
```

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
```

### Options

| Flag | Description |
|------|-------------|
| `--list` | List all available examples |
| `--verbose` | Show detailed evaluation output |
| `--validate` | Only validate, don't evaluate |
| `--help` | Show help message |

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

## Learning Path

For those new to CAIRS, we recommend exploring examples in this order:

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

## Expression Kinds

| Kind | AIR | CIR | Description |
|------|-----|-----|-------------|
| `lit` | ✅ | ✅ | Literal value |
| `ref` | ✅ | ✅ | Reference to another node |
| `var` | ✅ | ✅ | Variable reference (scope-local) |
| `call` | ✅ | ✅ | Operator application |
| `if` | ✅ | ✅ | Conditional |
| `let` | ✅ | ✅ | Local binding |
| `airRef` | ✅ | ✅ | Reference to airDef |
| `predicate` | ✅ | ✅ | Predicate value |
| `lambda` | ❌ | ✅ | Anonymous function |
| `callExpr` | ❌ | ✅ | Lambda call |
| `fix` | ❌ | ✅ | Fixpoint |

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
- [CAIRS Repository](../) - Main project documentation
