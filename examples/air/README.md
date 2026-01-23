# AIR Examples

AIR (Algebraic Intermediate Representation) is the pure, declarative layer of SPIRAL. It expresses mathematical relationships without computation - no lambdas, recursion, or unbounded iteration.

## Expression Reference

| Kind | Description | Example |
|------|-------------|---------|
| `lit` | Literal value | `{"kind": "lit", "type": {"kind": "int"}, "value": 42}` |
| `ref` | Reference to another node | `{"kind": "ref", "id": "someNode"}` |
| `var` | Variable reference (in let/predicate scope) | `{"kind": "var", "name": "x"}` |
| `call` | Operator application | `{"kind": "call", "ns": "core", "name": "add", "args": ["a", "b"]}` |
| `if` | Conditional expression | `{"kind": "if", "cond": "c", "then": "t", "else": "e"}` |
| `let` | Local binding | `{"kind": "let", "name": "x", "value": "v", "body": "b"}` |
| `airRef` | Reference to airDef | `{"kind": "airRef", "name": "defName", "args": ["a"]}` |
| `predicate` | Predicate value constructor | `{"kind": "predicate", "param": "x", "body": "b"}` |

## Type Reference

| Kind | Description | Example |
|------|-------------|---------|
| `int` | Integer | `{"kind": "int"}` |
| `float` | Floating-point | `{"kind": "float"}` |
| `bool` | Boolean | `{"kind": "bool"}` |
| `string` | String | `{"kind": "string"}` |
| `list` | Homogeneous list | `{"kind": "list", "element": {"kind": "int"}}` |
| `set` | Homogeneous set | `{"kind": "set", "element": {"kind": "int"}}` |
| `fn` | Function type | `{"kind": "fn", "params": [...], "returns": {...}}` |

## Domain Operators

### Core (`core.*`)
Arithmetic: `add`, `sub`, `mul`, `div`, `mod`, `pow`, `neg`
Comparison: `eq`, `neq`, `lt`, `lte`, `gt`, `gte`

### Boolean (`bool.*`)
Logic: `and`, `or`, `not`, `xor`

### List (`list.*`)
Operations: `length`, `concat`, `nth`, `reverse`

### Set (`set.*`)
Operations: `union`, `intersect`, `difference`, `contains`, `subset`, `add`, `remove`, `size`

## Examples by Category

### [Basics](./basics/)
Introduction to AIR expressions and operators.
- `literals.air.json` - All literal types (int, float, bool, string, list, set)
- `arithmetic.air.json` - Arithmetic operators (add, sub, mul, div, mod, pow, neg)
- `comparisons.air.json` - Comparison operators (eq, neq, lt, lte, gt, gte)
- `boolean-logic.air.json` - Boolean operators (and, or, not, xor)

### [Control Flow](./control-flow/)
Conditional expressions and local bindings.
- `simple-if.air.json` - Basic if expressions
- `nested-if.air.json` - Multi-way branching with nested conditionals
- `let-bindings.air.json` - Local variable bindings
- `let-scopes.air.json` - Variable scope and shadowing

### [Data Structures](./data-structures/)
Working with lists and sets.
- `list-length.air.json` - List length
- `list-concat.air.json` - List concatenation
- `list-nth.air.json` - List indexing
- `list-reverse.air.json` - List reversal
- `set-union.air.json` - Set union
- `set-intersect.air.json` - Set intersection
- `set-contains.air.json` - Set membership

### [AIR Definitions](./air-defs/)
Reusable definitions via `airDef` and `airRef`.
- `arithmetic.air.json` - Reusable arithmetic functions (double, square)
- `predicates.air.json` - Predicate values (isPositive, isNegative, isZero)
- `composition.air.json` - Function composition

## Running Examples

```bash
# Run a specific example
pnpm run-example air/basics/arithmetic

# List all AIR examples
pnpm run-example --list

# Run with verbose output
pnpm run-example air/basics/arithmetic --verbose
```

## Document Structure

Every AIR document follows this structure:

```json
{
  "version": "1.0.0",
  "airDefs": [
    {
      "id": "functionName",
      "params": ["x"],
      "type": {"kind": "fn", "params": [{"kind": "int"}], "returns": {"kind": "int"}},
      "body": "resultNode"
    }
  ],
  "nodes": [
    {
      "id": "nodeName",
      "expr": { ... }
    }
  ],
  "result": "outputNodeId"
}
```

## Key Concepts

**Purity**: AIR expressions have no side effects. The same input always produces the same output.

**Declarative**: AIR describes *what* something means, not *how* to compute it.

**No Unbounded Computation**: AIR cannot express loops or unbounded recursion. This makes it suitable for static analysis and reasoning.

**airDef**: Reusable definitions that are inlined via `airRef` during evaluation (capture-avoiding substitution).

**Evaluation**: AIR documents are evaluated by first performing `airRef` inlining (substitution), then evaluating nodes in dependency order.
