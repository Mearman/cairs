# CAIRS (**Computational Algebraic & Iterative Representation System**)

A TypeScript implementation of a portable, JSON-based intermediate representation for mathematical and logical expressions.

[![npm](https://img.shields.io/npm/v/cairs)](https://www.npmjs.com/package/cairs)
[![Node](https://img.shields.io/node/v/cairs)](https://nodejs.org)

## Quick Start

```bash
pnpm install
pnpm build
pnpm test
```

## Overview

CAIRS provides a layered representation system:

- **AIR** — Algebraic IR: Pure, declarative expressions (no lambdas/recursion)
- **CIR** — Computational IR: Extends AIR with lambdas, recursion, fixpoints
- **EIR** — Execution IR: Expression-based, adds sequencing, mutation, loops, effects
- **LIR** — Low-level IR: CFG-based with basic blocks, explicit control flow (code generation target)

## Features

- Zero runtime dependencies
- JSON Schema validation for AIR and CIR documents
- Static type checking with inference rules
- Big-step operational semantics
- Capture-avoiding substitution for `airRef` in CIR
- Extensible domain modules (core, bool, list, set, ...)

## Documentation

- [AIR Schema](./air.schema.json) — JSON Schema for AIR documents
- [CIR Schema](./cir.schema.json) — JSON Schema for CIR documents
- [EIR Schema](./eir.schema.json) — JSON Schema for EIR documents (expression-based execution)
- [LIR Schema](./lir.schema.json) — JSON Schema for LIR documents (CFG-based low-level)
- [Formal Specification](#specification) — Complete semantics and inference rules

---

## Specification

1. [Introduction](#1-introduction)
2. [Conventions and Terminology](#2-conventions-and-terminology)
3. [Design Goals](#3-design-goals)
4. [System Architecture](#4-system-architecture)
5. [AIR - Algebraic Intermediate Representation](#5-air---algebraic-intermediate-representation)
6. [CIR - Computational Intermediate Representation](#6-cir---computational-intermediate-representation)
7. [EIR - Execution Intermediate Representation](#7-eir---execution-intermediate-representation)
8. [LIR - Low-Level Intermediate Representation](#8-lir---low-level-intermediate-representation)
9. [Validation and Serialisation](#9-validation-and-serialisation)
10. [Formal Semantics](#10-formal-semantics)
11. [Error Handling](#11-error-handling)
12. [Program Evaluation](#12-program-evaluation)
13. [Capture-Avoiding Substitution](#13-capture-avoiding-substitution)
14. [JSON Schema Reference](#14-json-schema-reference)
15. [Non-Goals](#15-non-goals)

---

## 1. Introduction

Many systems require a portable, precise way to describe mathematical and logical operations without committing to a specific programming language or execution strategy. Existing representations frequently conflate semantics with execution, limiting portability, analysability, and reuse.

CAIRS addresses this by defining a layered representation system that:

- expresses mathematical meaning declaratively,
- allows computation to be layered explicitly when required,
- remains serialisable and structurally verifiable,
- avoids dependence on a particular runtime or evaluation model.

CAIRS separates **algebraic meaning** from **computational process**, enabling declarative specification with optional computational extension. The system consists of:

- **AIR (Algebraic Intermediate Representation)** — pure, declarative algebraic expressions
- **CIR (Computational Intermediate Representation)** — extends AIR with computational constructs
- **EIR (Execution Intermediate Representation)** — extends CIR with imperative features
- **LIR (Low-Level Intermediate Representation)** — CFG-based representation for code generation

---

## 2. Conventions and Terminology

### 2.1 Normative Language

The key words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** are to be interpreted as described in RFC 2119.

### 2.2 Terminology

| Term              | Definition                                                                   |
| ----------------- | ---------------------------------------------------------------------------- |
| **CAIRS**         | Computational Algebraic & Iterative Representation System                    |
| **AIR**           | Algebraic Intermediate Representation                                        |
| **CIR**           | Computational Intermediate Representation                                    |
| **EIR**           | Execution Intermediate Representation                                        |
| **LIR**           | Low-Level Intermediate Representation                                        |
| **Expression**    | A structured representation that evaluates to a value                        |
| **Operator**      | A named, typed transformation over values                                    |
| **Domain module** | A namespaced collection of operators and types (e.g. `bool`, `set`, `graph`) |

### 2.3 Notation

- **Typing judgement:** `Γ ⊢ e : τ` (under type environment Γ, expression e has type τ)
- **Evaluation judgement:** `ρ ⊢ e ⇓ v` (under value environment ρ, expression e evaluates to value v)
- **Operator application:** `⟦op⟧(v̄) = v` (semantic function provided by domain module)

---

## 3. Design Goals

A conforming CAIRS implementation MUST support:

1. Declarative representation of mathematical and logical expressions
2. Explicit separation of semantics from computation
3. Structural validation using JSON Schema
4. Domain extensibility without modification of core semantics
5. Compatibility across programming languages and runtimes

CAIRS explicitly prioritises correctness, clarity, and portability over execution performance.

---

## 4. System Architecture

CAIRS is a layered system:

```
CAIRS
 ├── AIR  (Algebraic IR)
 ├── CIR  (Computational IR)
 ├── EIR  (Execution IR)
 └── LIR  (Low-Level IR)
```

Each layer is a semantic superset of the layer above it.

---

## 5. AIR - Algebraic Intermediate Representation

### 5.1 Purpose

AIR defines **algebraic meaning**. AIR is used to represent mathematical objects, logical formulas, and domain-specific algebraic operations independently of computation strategy.

### 5.2 Core Properties

AIR expressions:

- **MUST** be side-effect free
- **MUST** be referentially transparent
- **MUST NOT** include user-defined recursion
- **MUST NOT** include unbounded iteration
- **MUST** be evaluable without CIR

AIR defines _what_ an expression means, not _how_ it is computed.

### 5.3 AIR Constructs

AIR supports the following constructs:

**Primitive values:**

- Boolean: `bool`
- Integer: `int`
- Float: `float`
- String: `string`

**Composite values:**

- Set: `set<T>`
- List: `list<T>`
- Map: `map<K, V>`
- Option: `option<T>`
- Opaque: `opaque<name>`

**Expressions:**

- `lit(v)` — literal value
- `ref(x)` — reference to a node id
- `var(x)` — reference to a parameter/local variable
- `call(ns, name, args)` — operator call
- `if(cond, then, else)` — conditional expression
- `let(name, value, body)` — local binding
- `airRef(name, args)` — reference to an AIR definition
- `predicate(name, value)` — predicate value

**AIR Definitions (`airDef`):**

- Named algebraic definitions
- Parameterised
- Non-recursive
- Reusable

AIR definitions behave as named algebraic expressions and MUST NOT introduce computational behaviour.

### 5.4 Domains and Operators

AIR is domain-agnostic. Operators are introduced via **namespaced domains**, for example:

- `core.*` — arithmetic and comparison operators
- `bool.*` — boolean algebra
- `set.*` — set algebra
- `graph.*` — graph-theoretic algebra
- `linalg.*` — linear algebra

Domain modules MAY be added without modifying AIR itself.

### 5.5 AIR Semantics

Formally, AIR defines a **many-sorted algebra**:

```
(Value × Operator) → Value
```

All operators MUST declare:

- Input types
- Output type
- Purity (side-effect free)

AIR expressions MAY be symbolically analysed, rewritten, or normalised.

---

## 6. CIR - Computational Intermediate Representation

### 6.1 Purpose

CIR extends AIR to support **computation**. CIR is required when expressing:

- Algorithms
- Iteration or recursion
- Procedural traversal
- Convergence-based processes

### 6.2 Relationship to AIR

CIR is a **strict superset** of AIR:

- Every valid AIR document MUST be a valid CIR document
- CIR MUST preserve AIR semantics
- CIR MUST NOT redefine the meaning of AIR operators or definitions

### 6.3 CIR Extensions

CIR introduces:

- **Lambda expressions** (`lambda(params, body)`)
- **Higher-order function application** (`callExpr(fn, args)`)
- **Fixpoint/recursion constructs** (`fix(fn)`)
- **Explicit control over evaluation structure**

### 6.4 Invariants

The following invariants MUST hold:

1. AIR definitions remain pure and immutable
2. CIR computations MAY reference AIR definitions
3. CIR MUST NOT introduce side effects into AIR expressions
4. CIR semantics MUST be reducible to AIR meaning

---

## 7. EIR - Execution Intermediate Representation

### 7.1 Purpose

EIR extends CIR with **imperative features** while maintaining an expression-based structure. EIR is required when expressing:

- Sequential execution with explicit ordering
- Mutable state and side effects
- Loops and iteration constructs
- I/O and effectful operations

### 7.2 Relationship to CIR

EIR is a **strict superset** of CIR:

- Every valid CIR document MUST be a valid EIR document
- EIR MUST preserve CIR semantics
- EIR adds execution mechanisms without breaking algebraic foundations

### 7.3 EIR Extensions

EIR introduces the following expression kinds:

| Kind                           | Description                                          |
| ------------------------------ | ---------------------------------------------------- |
| `seq(first, then)`             | Sequential execution (evaluate `first`, then `then`) |
| `assign(target, value)`        | Mutable assignment to `target`                       |
| `loop({while\|for\|iter}(...)` | Loops: while, C-style for, iterator-based            |
| `effect(op, args)`             | Side-effect operation (I/O, state mutation)          |
| `refCell(target)`              | Reference to a mutable cell                          |

### 7.4 Evaluation Order

EIR defines **strict left-to-right evaluation** within `seq` expressions:

- `seq(a, b)` means "evaluate `a` for effects, then evaluate `b`"
- The value of `seq` is the value of its last expression

### 7.5 Mutable Cells

Mutable cells are created via `assign` and referenced via `refCell`:

- `assign` creates/updates a cell identified by `target`
- `refCell` reads the current value of a cell
- Cells are lexically scoped within the EIR document

---

## 8. LIR - Low-Level Intermediate Representation

### 8.1 Purpose

LIR provides a **control-flow graph** representation suitable for code generation and optimization. LIR is the target for lowering CIR/EIR for execution.

### 8.2 Structure

LIR replaces the expression DAG with basic blocks:

```json
{
	"blocks": [
		{
			"id": "block1",
			"instructions": [
				{ "kind": "assign", "target": "x", "value": "..." },
				{
					"kind": "op",
					"target": "y",
					"ns": "core",
					"name": "add",
					"args": ["x", "1"]
				}
			],
			"terminator": { "kind": "jump", "to": "block2" }
		}
	],
	"entry": "block1"
}
```

### 8.3 Instructions

| Kind                         | Description                                       |
| ---------------------------- | ------------------------------------------------- |
| `assign(target, value)`      | Assign result of `value` to `target`              |
| `call(target, callee, args)` | Call function with args, store result in `target` |
| `op(target, ns, name, args)` | Apply operator, store result in `target`          |
| `phi(target, sources)`       | Phi node (SSA-style) from predecessor blocks      |

### 8.4 Terminators

| Kind                       | Description                                |
| -------------------------- | ------------------------------------------ |
| `jump(to)`                 | Unconditional jump to block                |
| `branch(cond, then, else)` | Conditional branch based on `cond`         |
| `return(value)`            | Return from computation (optional `value`) |

### 8.5 Relationship to CIR/EIR

LIR is **not expression-based** — it represents a different paradigm (CFG vs expressions). Lowering from CIR/EIR to LIR involves:

- Converting expressions to instructions
- Building basic blocks from control flow structures
- Inserting phi nodes at join points

---

## 9. Formal Semantics

### 9.1 Semantic Domains

#### 9.1.1 Values

AIR values are:

| Constructor                         | Description                   |
| ----------------------------------- | ----------------------------- |
| `Bool(b)`                           | `b ∈ {true, false}`           |
| `Int(n)`                            | `n ∈ ℤ` (or bounded integers) |
| `Float(r)`                          | `r ∈ ℝ` (typically IEEE-754)  |
| `String(s)`                         | `s ∈ Σ*`                      |
| `List([v1,…,vk])`                   | Ordered list of values        |
| `Set({v1,…,vk})`                    | Set of values                 |
| `Map({k1↦v1,…,km↦vm})`              | Key-value map                 |
| `Option(None)` or `Option(Some(v))` | Optional value                |
| `Opaque(tag, payload)`              | Domain-specific value         |

CIR adds:

| Constructor          | Description                      |
| -------------------- | -------------------------------- |
| `Closure(ρ, x̄:τ̄, e)` | Lambda with captured environment |

#### 9.1.2 Operator Semantics

Each AIR operator `op` has a semantic function:

```
⟦op⟧ : Val^n → Val
```

Subject to:

- **Purity**: `⟦op⟧` MUST be total or explicitly partial, and MUST be side-effect free
- **Type-safety**: if `op : (τ1,…,τn) → τ`, then for all `vi ∈ ⟦τi⟧`, `⟦op⟧(v̄) ∈ ⟦τ⟧`

---

### 9.2 AIR Typing Rules

#### T-Lit (Literal)

```
───────────────────
Γ ⊢ lit(v) : typeOf(v)
```

#### T-Var (Variable)

```
Γ(x) = τ
─────────────
Γ ⊢ var(x) : τ
```

#### T-Ref (Reference)

```
Γ(x) = τ
─────────────
Γ ⊢ ref(x) : τ
```

#### T-Let (Let Binding)

```
Γ ⊢ e1 : τ1    Γ[x↦τ1] ⊢ e2 : τ2
─────────────────────────────────
Γ ⊢ let(x, e1, e2) : τ2
```

#### T-If (Conditional)

```
Γ ⊢ e : Bool    Γ ⊢ e1 : τ    Γ ⊢ e2 : τ
───────────────────────────────────────
Γ ⊢ if(e, e1, e2) : τ
```

#### T-Call (Operator Call)

Let `Sig(op) = (τ1,…,τn) → τ`.

```
∀i. Γ ⊢ ei : τi
──────────────────────────────
Γ ⊢ call(op, e1,…,en) : τ
```

#### T-AirRef (AIR Definition Reference)

Let `Def(f) = (x1:σ1,…,xn:σn) ⇒ body : τ`.

```
∀i. Γ ⊢ ei : σi
─────────────────────────────────
Γ ⊢ airRef(f, e1,…,en) : τ
```

#### T-Pred (Predicate)

```
Γ[x↦σ] ⊢ e : Bool
──────────────────────────
Γ ⊢ predicate(x, e) : Pred(σ)
```

`Pred(σ)` is an abstract predicate type that domain operators may accept.

---

### 9.3 AIR Evaluation Rules

Judgement: `ρ ⊢ e ⇓ v`

#### E-Lit (Literal)

```
──────────────
ρ ⊢ lit(v) ⇓ v
```

#### E-Var (Variable)

```
ρ(x) = v
──────────────
ρ ⊢ var(x) ⇓ v
```

#### E-Ref (Reference)

```
ρ(x) = v
──────────────
ρ ⊢ ref(x) ⇓ v
```

#### E-Let (Let Binding)

```
ρ ⊢ e1 ⇓ v1    ρ[x↦v1] ⊢ e2 ⇓ v2
────────────────────────────────
ρ ⊢ let(x, e1, e2) ⇓ v2
```

#### E-IfT (If - True Branch)

```
ρ ⊢ e ⇓ Bool(true)    ρ ⊢ e1 ⇓ v
────────────────────────────────
ρ ⊢ if(e, e1, e2) ⇓ v
```

#### E-IfF (If - False Branch)

```
ρ ⊢ e ⇓ Bool(false)    ρ ⊢ e2 ⇓ v
─────────────────────────────────
ρ ⊢ if(e, e1, e2) ⇓ v
```

#### E-Call (Operator Call)

```
∀i. ρ ⊢ ei ⇓ vi    ⟦op⟧(v1,…,vn) = v
────────────────────────────────────
ρ ⊢ call(op, e1,…,en) ⇓ v
```

#### E-AirRef (AIR Definition Reference - Inlining)

Let `Def(f) = (x1,…,xn, body)`.

```
∀i. ρ ⊢ ei ⇓ vi    ρ[x1↦v1,…,xn↦vn] ⊢ body ⇓ v
────────────────────────────────────────────
ρ ⊢ airRef(f, e1,…,en) ⇓ v
```

**AIR constraint:** `airDef` MUST be non-recursive.

#### E-Pred (Predicate Denotation)

```
──────────────────────────────────────
ρ ⊢ predicate(x, e) ⇓ PredVal(ρ, x, e)
```

---

### 9.4 CIR Typing Rules

CIR includes all AIR typing rules plus:

#### T-Λ (Lambda)

```
Γ[x1↦τ1,…,xn↦τn] ⊢ body : τ
───────────────────────────────────────────────────
Γ ⊢ lambda((x1:τ1,…,xn:τn), body) : Fn(τ1,…,τn → τ)
```

#### T-CallExpr (Call with Expression Callee)

```
Γ ⊢ callee : Fn(τ1,…,τn → τ)    ∀i. Γ ⊢ ei : τi
──────────────────────────────────────────────────
Γ ⊢ callExpr(callee, e1,…,en) : τ
```

#### T-Fix (Fixpoint)

```
Γ ⊢ f : Fn(τ → τ)
─────────────────
Γ ⊢ fix(f) : τ
```

---

### 9.5 CIR Evaluation Rules

CIR uses the AIR rules plus:

#### E-Λ (Lambda Value)

```
────────────────────────────────────────────────────
ρ ⊢ lambda((x1:τ1,…,xn:τn), body) ⇓ Closure(ρ, (x1,…,xn), body)
```

#### E-CallExpr (Call Expression)

```
ρ ⊢ callee ⇓ Closure(ρc, (x1,…,xn), body)
∀i. ρ ⊢ ei ⇓ vi
ρc[x1↦v1,…,xn↦vn] ⊢ body ⇓ v
───────────────────────────────────────────
ρ ⊢ callExpr(callee, e1,…,en) ⇓ v
```

#### E-Fix (Fixpoint Unrolling)

```
ρ ⊢ f ⇓ vf    ρ ⊢ callExpr(lit(vf), fix(lit(vf))) ⇓ v
────────────────────────────────────────────────
ρ ⊢ fix(f) ⇓ v
```

---

### 9.6 EIR Semantic Domains

EIR extends CIR values with:

| Constructor  | Description            |
| ------------ | ---------------------- |
| `Void`       | Unit value             |
| `RefCell(v)` | Mutable reference cell |

EIR evaluation state is a 4-tuple:

```
EvalState = (ρ, σ, ε, n)
```

Where:

- `ρ : ValueEnv` — variable bindings (as in CIR)
- `σ : Map<String, Value>` — reference cell store
- `ε : Effect[]` — recorded effects
- `n : Int` — step counter (for termination checking)

---

### 9.7 EIR Typing Rules

EIR includes all CIR typing rules plus:

#### T-Seq (Sequence)

```
Γ ⊢ first : τ₁    Γ ⊢ then : τ₂
────────────────────────────────
Γ ⊢ seq(first, then) : τ₂
```

#### T-Assign (Assignment)

```
Γ ⊢ value : τ
─────────────────────────────
Γ ⊢ assign(target, value) : Void
```

#### T-While (While Loop)

```
Γ ⊢ cond : Bool    Γ ⊢ body : τ
────────────────────────────────
Γ ⊢ while(cond, body) : Void
```

#### T-For (C-Style For Loop)

```
Γ ⊢ init : τ₁    Γ ⊢ cond : Bool    Γ ⊢ update : τ₂    Γ ⊢ body : τ₃
─────────────────────────────────────────────────────────────────────
Γ ⊢ for(var, init, cond, update, body) : Void
```

#### T-Iter (Iterator Loop)

```
Γ ⊢ iter : List(τ)    Γ[var↦τ] ⊢ body : τ'
───────────────────────────────────────────
Γ ⊢ iter(var, iter, body) : Void
```

#### T-Effect (Side Effect)

Let `effect_op : (τ₁,…,τₙ) → τ`.

```
∀i. Γ ⊢ argᵢ : τᵢ
──────────────────────────────
Γ ⊢ effect(op, arg₁,…,argₙ) : τ
```

#### T-RefCell (Reference Cell)

```
Γ ⊢ target : τ
──────────────────────────
Γ ⊢ refCell(target) : Ref(τ)
```

#### T-Deref (Dereference)

```
Γ ⊢ target : Ref(τ)
────────────────────
Γ ⊢ deref(target) : τ
```

---

### 9.8 EIR Evaluation Rules

EIR evaluation threads state through computations:

```
ρ, σ ⊢ e ⇓ v, σ'
```

Expression `e` under environment `ρ` and store `σ` evaluates to value `v`, producing updated store `σ'`.

#### E-Seq (Sequence)

```
ρ, σ ⊢ first ⇓ v₁, σ₁    ρ, σ₁ ⊢ then ⇓ v₂, σ₂
──────────────────────────────────────────────
ρ, σ ⊢ seq(first, then) ⇓ v₂, σ₂
```

#### E-Assign (Assignment)

```
ρ, σ ⊢ value ⇓ v, σ'
────────────────────────────────────────
ρ, σ ⊢ assign(target, value) ⇓ Void, σ'[target↦v]
```

#### E-WhileT (While - True)

```
ρ, σ ⊢ cond ⇓ Bool(true), σ₁
ρ, σ₁ ⊢ body ⇓ v, σ₂
ρ, σ₂ ⊢ while(cond, body) ⇓ v', σ₃
─────────────────────────────────────
ρ, σ ⊢ while(cond, body) ⇓ v', σ₃
```

#### E-WhileF (While - False)

```
ρ, σ ⊢ cond ⇓ Bool(false), σ'
────────────────────────────────────
ρ, σ ⊢ while(cond, body) ⇓ Void, σ'
```

#### E-For (For Loop)

```
ρ, σ ⊢ init ⇓ v₀, σ₀
ρ[var↦v₀], σ₀ ⊢ forLoop(cond, update, body) ⇓ v, σ'
────────────────────────────────────────────────────
ρ, σ ⊢ for(var, init, cond, update, body) ⇓ v, σ'
```

Where `forLoop` iterates: check condition, execute body, execute update, repeat.

#### E-Iter (Iterator)

```
ρ, σ ⊢ iter ⇓ List([v₁,…,vₙ]), σ₀
ρ[var↦v₁], σ₀ ⊢ body ⇓ _, σ₁
...
ρ[var↦vₙ], σₙ₋₁ ⊢ body ⇓ _, σₙ
────────────────────────────────────
ρ, σ ⊢ iter(var, iter, body) ⇓ Void, σₙ
```

#### E-Effect (Effect Execution)

```
∀i. ρ, σᵢ₋₁ ⊢ argᵢ ⇓ vᵢ, σᵢ
execute_effect(op, v₁,…,vₙ) = (v, eff)
────────────────────────────────────────
ρ, σ ⊢ effect(op, arg₁,…,argₙ) ⇓ v, σₙ ∪ {eff}
```

#### E-RefCell (Create Reference)

```
σ(target) = v
────────────────────────────
ρ, σ ⊢ refCell(target) ⇓ RefCell(v), σ
```

#### E-Deref (Read Reference)

```
ρ, σ ⊢ target ⇓ RefCell(v), σ'
─────────────────────────────
ρ, σ ⊢ deref(target) ⇓ v, σ'
```

---

### 9.9 LIR Semantic Domains

LIR uses a different execution model based on control-flow graphs.

LIR execution state is a 4-tuple:

```
LIRState = (V, r, ε, n)
```

Where:

- `V : Map<String, Value>` — SSA variable bindings
- `r : Option<Value>` — return value (when computation terminates)
- `ε : Effect[]` — recorded effects
- `n : Int` — step counter

A basic block is a triple:

```
Block = (id, instructions, terminator)
```

Where:

- `id : String` — unique block identifier
- `instructions : Instruction[]` — sequence of instructions
- `terminator : Terminator` — control flow decision

---

### 9.10 LIR Execution Semantics

#### Block Execution

Block transitions:

```
⟨B, V⟩ → ⟨B', V'⟩    (block B with vars V transitions to block B' with vars V')
⟨B, V⟩ → v           (block B with vars V terminates with value v)
```

#### Instruction Semantics

##### I-Assign (Assignment)

```
V' = V[target ↦ eval(value, V)]
───────────────────────────────
⟨assign(target, value) :: rest, V⟩ → ⟨rest, V'⟩
```

##### I-Op (Operator Application)

```
v = ⟦op⟧(V(arg₁), …, V(argₙ))
V' = V[target ↦ v]
────────────────────────────────────────
⟨op(target, ns, name, args) :: rest, V⟩ → ⟨rest, V'⟩
```

##### I-Phi (Phi Node)

```
sourceᵢ.block = predecessor
V' = V[target ↦ V(sourceᵢ.id)]
──────────────────────────────────────────
⟨phi(target, sources) :: rest, V, pred⟩ → ⟨rest, V'⟩
```

##### I-Effect (Effect Instruction)

```
execute_effect(op, V(arg₁), …, V(argₙ)) = (v, eff)
V' = V[target ↦ v]    ε' = ε ∪ {eff}
─────────────────────────────────────────────────
⟨effect(target, op, args) :: rest, V, ε⟩ → ⟨rest, V', ε'⟩
```

##### I-AssignRef (Reference Assignment)

```
σ' = σ[target ↦ V(value)]
─────────────────────────────────────────
⟨assignRef(target, value) :: rest, V, σ⟩ → ⟨rest, V, σ'⟩
```

#### Terminator Semantics

##### T-Jump (Unconditional Jump)

```
──────────────────────────
⟨jump(to), V⟩ → ⟨block(to), V⟩
```

##### T-Branch (Conditional Branch)

```
V(cond) = Bool(true)
───────────────────────────────────
⟨branch(cond, then, else), V⟩ → ⟨block(then), V⟩
```

```
V(cond) = Bool(false)
───────────────────────────────────
⟨branch(cond, then, else), V⟩ → ⟨block(else), V⟩
```

##### T-Return (Return)

```
v = V(value)    (or Void if value absent)
─────────────────────────────────────────
⟨return(value), V⟩ → v
```

##### T-Exit (Exit with Code)

```
v = V(code)    (or Void if code absent)
─────────────────────────────────────────
⟨exit(code), V⟩ → v
```

#### Phi Node Resolution

Phi nodes select values based on the predecessor block:

```
φ((b₁, x₁), …, (bₙ, xₙ)) = V(xᵢ)    where bᵢ was immediate predecessor
```

This is critical for SSA form: when control flows from block `bᵢ` to the current block, the phi node resolves to the value `V(xᵢ)` associated with that predecessor.

---

## 10. Error Handling

### 10.1 Error Domain

Extend the value domain with an explicit error value:

```
Err(code, message?, meta?)
```

Where:

- `code : String` (MUST be non-empty)
- `message : String` (MAY be absent)
- `meta : Map<String, Value>` (MAY be absent)

### 10.2 Distinguished Error Codes (Recommended)

Implementations SHOULD support at least:

- `TypeError`
- `ArityError`
- `DomainError` (e.g. `sqrt(-1)` in reals)
- `DivideByZero`
- `UnknownOperator`
- `UnknownDefinition`
- `UnboundIdentifier`
- `NonTermination` (CIR only)

### 10.3 Error Propagation Rules

Unless otherwise specified by an operator's semantics, **errors MUST be strict** (propagate):

#### E-LetErr

```
ρ ⊢ e1 ⇓ Err(…)
──────────────────────
ρ ⊢ let(x, e1, e2) ⇓ Err(…)
```

#### E-IfCondErr

```
ρ ⊢ e ⇓ Err(…)
─────────────────────────
ρ ⊢ if(e, e1, e2) ⇓ Err(…)
```

#### E-IfTypeErr

```
ρ ⊢ e ⇓ v    v ≠ Bool(true)    v ≠ Bool(false)
────────────────────────────────────────────────
ρ ⊢ if(e, e1, e2) ⇓ Err(TypeError, …)
```

#### E-CallArgErr

```
ρ ⊢ ek ⇓ Err(…)
────────────────────────────────
ρ ⊢ call(op, e1,…,en) ⇓ Err(…)
```

---

## 11. Program Evaluation

### 11.1 Program Structure

A **Program** is a tuple:

```
P = (Defs, Nodes, resultId)
```

Where:

- `Defs` is a finite map from definition names to AIR definitions
- `Nodes` is an ordered list of node bindings: `(idi, τi, expri)`
- `resultId` is the id of a node in `Nodes`

### 11.2 Well-Formedness Constraints

A program is well-formed iff:

1. **Unique node ids**: all `idi` are distinct
2. **Result exists**: `resultId ∈ ids(Nodes)`
3. **Acyclic references**: for any `ref(x)` in `expri`, `x` MUST refer only to:
   - a node id `idj` with `j < i`, or
   - a defined input binding in the initial environment
4. **Definitions are resolvable**: any `airRef(f, …)` MUST have `f ∈ dom(Defs)`
5. **AIR non-recursion**: AIR definitions MUST not be recursive

### 11.3 Node Evaluation

```
Defs; ρ ⊢ [] ⇓ ρ                    (P-Nil)
─────────────────────────────────────────────────────────────
Defs; ρ ⊢ expr ⇓ v    Defs; ρ[id↦v] ⊢ Nodes ⇓ ρ'
─────────────────────────────────────────────────────────────
Defs; ρ ⊢ [(id, τ, expr) :: Nodes] ⇓ ρ'                   (P-Cons)
```

### 11.4 Program Result

```
Defs; ρ0 ⊢ Nodes ⇓ ρf    ρf(resultId) = v
────────────────────────────────────────────
Defs; ρ0 ⊢ (Defs, Nodes, resultId) ⇓ v                (P-Result)
```

---

## 12. Capture-Avoiding Substitution

### 12.1 Core Principle

**AIR definitions are closed under their own parameters**, but may be referenced inside CIR contexts that introduce binders (`lambda`, `let`, predicate parameter). Therefore, expanding or interpreting `airRef` MUST be **capture-avoiding**.

### 12.2 Free Variables

Let `FV(e)` be the set of free variable names in expression `e`, treating binders (`let`, `predicate`, and in CIR `lambda`) as binding occurrences.

### 12.3 Capture-Avoiding `airRef` Evaluation

Let an AIR definition be:

```
Defs(f) = (x̄, body)
```

where `x̄ = (x1,…,xn)` are its parameters.

```
Defs(f) = (x1,…,xn, body)
∀i. Defs; ρ ⊢ ei ⇓ vi
y1,…,yn fresh w.r.t. binder context
body' = α(body, xi↦yi)
Defs; ρ[y1↦v1,…,yn↦vn] ⊢ body' ⇓ v
────────────────────────────────────────
Defs; ρ ⊢ airRef(f, e1,…,en) ⇓ v             (E-AirRef_CA)
```

Where `α(body, xi↦yi)` is the α-renaming of bound parameter names in `body` from `x̄` to `ȳ`.

**Note:** "binder context" refers to the surrounding CIR expression where the `airRef` occurs. In an implementation, it is sufficient to generate globally fresh names (e.g. `__air_123`) to satisfy the side condition.

---

## 13. JSON Schema Reference

The JSON schemas for all CAIRS layers are defined in separate files at the repository root:

- [`air.schema.json`](./air.schema.json) — AIR document schema
- [`cir.schema.json`](./cir.schema.json) — CIR document schema (extends AIR)
- [`eir.schema.json`](./eir.schema.json) — EIR document schema (expression-based execution)
- [`lir.schema.json`](./lir.schema.json) — LIR document schema (CFG-based low-level)

### 13.1 Document Structure

AIR, CIR, EIR, and LIR documents share a common structure:

```json
{
  "version": "string",           // Semver format
  "capabilities": ["string"],    // Optional capability declarations
  "functionSigs": [...],         // Optional operator signatures
  "airDefs": [...],              // AIR definitions
  "nodes": [...],                // Expression nodes
  "result": "string"             // Result node reference
}
```

### 13.2 Node Structure

```json
{
  "id": "string",      // Unique identifier
  "type": { ... },     // Type annotation
  "expr": { ... }      // Expression
}
```

### 13.3 Expression Kinds

| Kind        | AIR | CIR | Description              |
| ----------- | --- | --- | ------------------------ |
| `lit`       | ✓   | ✓   | Literal value            |
| `ref`       | ✓   | ✓   | Node reference           |
| `var`       | ✓   | ✓   | Variable reference       |
| `call`      | ✓   | ✓   | Operator call            |
| `if`        | ✓   | ✓   | Conditional              |
| `let`       | ✓   | ✓   | Local binding            |
| `airRef`    | ✓   | ✓   | AIR definition reference |
| `predicate` | ✓   | ✓   | Predicate value          |
| `lambda`    | ✗   | ✓   | Lambda expression        |
| `callExpr`  | ✗   | ✓   | Higher-order call        |
| `fix`       | ✗   | ✓   | Fixpoint                 |

---

## 14. Non-Goals

CAIRS explicitly does **not** aim to be:

- A general-purpose programming language
- A workflow or pipeline engine
- A UI or visual modelling format
- A replacement for existing execution runtimes

CAIRS is a **representation system**, not a runtime.

---

## Appendix A: Layering Invariants (Normative)

### A.1 AIR Purity

All AIR operators and AIR definitions MUST be pure and MUST NOT depend on evaluation order.

### A.2 AIR Non-Recursion

AIR definitions MUST NOT be recursive (directly or indirectly).

### A.3 CIR Superset

Every AIR expression and document MUST be a valid CIR expression and document.

### A.4 CIR Respect for AIR Semantics

CIR MUST NOT alter the meaning of AIR operators or AIR definitions.

### A.5 EIR Superset

Every CIR expression and document MUST be a valid EIR expression and document.

### A.6 LIR Lowering Correctness

EIR documents MAY be lowered to LIR. The lowering MUST preserve observable behavior:

- Same final result value
- Same sequence of effects

---

## Appendix B: Standard Operators (Non-Normative)

### B.1 Core Domain (`core.*`)

Arithmetic:

- `add(x, y)` — addition
- `sub(x, y)` — subtraction
- `mul(x, y)` — multiplication
- `div(x, y)` — division
- `mod(x, y)` — modulo
- `pow(x, y)` — exponentiation
- `neg(x)` — negation

Comparison:

- `eq(x, y)` — equality
- `neq(x, y)` — inequality
- `lt(x, y)` — less than
- `lte(x, y)` — less than or equal
- `gt(x, y)` — greater than
- `gte(x, y)` — greater than or equal

### B.2 Boolean Domain (`bool.*`)

- `and(x, y)` — logical conjunction
- `or(x, y)` — logical disjunction
- `not(x)` — logical negation
- `xor(x, y)` — exclusive or

### B.3 List Domain (`list.*`)

- `length(xs)` — list length
- `concat(xs, ys)` — concatenation
- `nth(xs, n)` — element at index
- `reverse(xs)` — reversed list
- `map(xs, f)` — transform (CIR)
- `filter(xs, p)` — filter (CIR)
- `fold(xs, init, f)` — left fold (CIR)

### B.4 Set Domain (`set.*`)

- `union(s1, s2)` — set union
- `intersect(s1, s2)` — set intersection
- `difference(s1, s2)` — set difference
- `contains(s, x)` — membership test
- `subset(s1, s2)` — subset test
- `add(s, x)` — add element
- `remove(s, x)` — remove element
- `size(s)` — cardinality
