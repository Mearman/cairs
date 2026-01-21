# CIR Examples

CIR (Computational Intermediate Representation) extends AIR with computational capabilities: lambdas, higher-order functions, and fixpoint recursion.

> **Note:** The current CIR implementation has limitations. The validator does not understand lambda parameter contexts, so it reports parameters as "non-existent nodes." The evaluator supports lambda parameters in `call` expression arguments, but `var` expressions in lambda bodies are not yet supported.

## Additional Expression Types (Beyond AIR)

| Kind | Description | Example |
|------|-------------|---------|
| `lambda` | Anonymous function | `{"kind": "lambda", "params": ["x"], "body": "b", type: {...}}` |
| `callExpr` | Higher-order function call | `{"kind": "callExpr", "fn": "f", "args": ["a"]}` |
| `fix` | Fixpoint combinator for recursion | `{"kind": "fix", "fn": "f", type: {...}}` |

## Key Differences from AIR

| Feature | AIR | CIR |
|---------|-----|-----|
| Lambdas | ❌ No | ✅ `lambda(params, body)` |
| Higher-order functions | ❌ No | ✅ `callExpr` for calling lambdas |
| Recursion | ❌ No | ✅ `fix` combinator |
| Purity | ✅ Pure | ✅ Preserves AIR purity |
| AIR definitions | ✅ Yes | ✅ Can reference via `airRef` |

## Examples by Category

### [Basics](./basics/)
Introduction to CIR lambda expressions.
- `identity-lambda.cir.json` - Identity function
- `add-one-lambda.cir.json` - Simple transformation lambda
- `currying.cir.json` - Multi-parameter lambdas and currying
- `closures.cir.json` - Variable capture in lambdas

### [Algorithms](./algorithms/)
Classic algorithms expressed with CIR.
- `factorial.cir.json` - Factorial via lambda structure
- `fibonacci.cir.json` - Fibonacci sequence
- `gcd.cir.json` - Greatest common divisor (Euclid's algorithm)
- `summation.cir.json` - Recursive list summation

### [Higher-Order](./higher-order/)
Functions that take functions as arguments.
- `map.cir.json` - Map a function over a list
- `filter.cir.json` - Filter a list with a predicate
- `fold.cir.json` - Fold/reduce a list to a single value
- `compose.cir.json` - Function composition

### [Fixpoint](./fixpoint/)
The fix combinator enables general recursion.
- `fix-factorial.cir.json` - Factorial using fix
- `fix-fibonacci.cir.json` - Fibonacci using fix
- `fix-iter.cir.json` - Iterative summation with fix

### [Mixed](./mixed/)
Using AIR and CIR together.
- `cir-with-airdefs.cir.json` - Using airRef within CIR computations

## Running Examples

```bash
# Run a specific example
pnpm run-example cir/basics/identity-lambda

# List all CIR examples
pnpm run-example --list

# Run with verbose output
pnpm run-example cir/algorithms/factorial --verbose
```

## Lambda Expressions

CIR adds first-class functions via the `lambda` expression:

```json
{
  "id": "addOne",
  "expr": {
    "kind": "lambda",
    "params": ["x"],
    "body": "result",
    "type": {
      "kind": "fn",
      "params": [{"kind": "int"}],
      "returns": {"kind": "int"}
    }
  }
}
```

## Calling Lambdas

Use `callExpr` to call a lambda:

```json
{
  "id": "apply",
  "expr": {
    "kind": "callExpr",
    "fn": "addOne",
    "args": ["five"]
  }
}
```

## The Fix Combinator

The fix combinator enables recursion by allowing a function to reference itself:

```json
{
  "id": "factorialRec",
  "expr": {
    "kind": "lambda",
    "params": ["rec"],
    "body": "factorialInner",
    "type": {
      "kind": "fn",
      "params": [{"kind": "fn", ...}],
      "returns": {"kind": "fn", ...}
    }
  }
}
```

Then apply fix:

```json
{
  "id": "factorialFixed",
  "expr": {
    "kind": "fix",
    "fn": "factorialRec",
    "type": {"kind": "fn", "params": [{"kind": "int"}], "returns": {"kind": "int"}}
  }
}
```

## Closures

CIR supports closures - lambdas can capture variables from their enclosing scope:

```json
{
  "id": "multiplier",
  "expr": {"kind": "lit", "type": {"kind": "int"}, "value": 3}
},
{
  "id": "multiplyBy",
  "expr": {
    "kind": "lambda",
    "params": ["x"],
    "body": "product",
    "type": {...}
  }
}
```

The lambda captures `multiplier` from its environment.

## Higher-Order Functions

CIR supports higher-order functions - functions that take other functions as arguments:

```json
{
  "id": "map",
  "expr": {
    "kind": "lambda",
    "params": ["f", "xs"],
    "body": "mapBody",
    "type": {...}
  }
}
```

Call with a lambda argument:

```json
{
  "id": "double",
  "expr": {"kind": "lambda", "params": ["x"], "body": "doubled", "type": {...}}
},
{
  "id": "result",
  "expr": {
    "kind": "callExpr",
    "fn": "map",
    "args": ["double", "numbers"]
  }
}
```

## Key Concepts

**First-class functions**: Lambdas are values that can be passed as arguments, returned from functions, and stored in data structures.

**Closures**: Lambdas capture their enclosing environment, allowing them to reference variables from outer scopes.

**Fixpoint combinator**: The `fix` expression enables recursion by computing the least fixed point of a function, effectively allowing a function to reference itself.

**Type system**: CIR uses function types `(T1, T2, ...) -> R` to express the types of lambda expressions.

**Evaluation**: CIR evaluation extends AIR with closure values and the fixpoint semantics for enabling recursion.
