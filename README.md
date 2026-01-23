# CAIRS (**Computational Algebraic & Iterative Representation System**)

[![npm](https://img.shields.io/npm/v/cairs)](https://www.npmjs.com/package/cairs)
[![Node](https://img.shields.io/node/v/cairs)](https://nodejs.org)

CAIRS is a JSON-first intermediate representation spanning AIR, CIR, EIR, PIR, and LIR. All layers support expression and CFG block forms (hybrid documents).

## Layers & Computational Classes

| Layer | Name | Computational Class | Key Feature |
|-------|------|---------------------|-------------|
| **AIR** | Algebraic IR | Primitive Recursive (bounded) | Pure, no recursion, always terminates |
| **CIR** | Computational IR | Turing-Complete | Lambdas, `fix` combinator for recursion |
| **EIR** | Execution IR | Turing-Complete | Sequencing, mutation, loops, effects |
| **PIR** | Parallel IR | Turing-Complete | Async/parallel primitives (`spawn`, `await`, channels) |
| **LIR** | Low-Level IR | Turing-Complete | CFG-based, SSA with phi nodes |

See [wiki/Architecture.md](wiki/Architecture.md) for details.

## Quick start
```bash
pnpm install
pnpm build
pnpm test
```

Run examples (folder or file stem):
```bash
pnpm run-example air/basics/arithmetic
pnpm run-example air/basics/arithmetic/arithmetic
```

## Wiki
- Wiki home & navigation: [wiki/Home.md](wiki/Home.md)
- Quick start: [wiki/Quick-Start.md](wiki/Quick-Start.md)
- Examples & learning path: [wiki/Examples.md](wiki/Examples.md)
- Architecture (layers, expression/CFG hybrids): [wiki/Architecture.md](wiki/Architecture.md)
- Specification (sections): [wiki/Specification.md](wiki/Specification.md)
- Appendices: [wiki/Appendices.md](wiki/Appendices.md)
- Schemas and references: [wiki/Schemas-and-References.md](wiki/Schemas-and-References.md)
