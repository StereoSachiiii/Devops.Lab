---
title: ADR 002: Aggressive TypeScript Configuration
date: 2026-05-09
status: accepted
---

Context
 aims for high reliability and type safety. The first TypeScript configurations used standard strict settings which allowed several classes of common errors to pass silently.

Decision
have updated all tsconfig.json files across the monorepo to use the most aggressive strictness and rigor flags available in TypeScript.

The following flags have been enabled:
- noUnusedLocals: Prevents dead code and unused variables.
- noUnusedParameters: Ensures function signatures are clean and intentional.
- noImplicitReturns: Guarantees that all code paths in a function return a value.
- noFallthroughCasesInSwitch: Prevents logical errors in switch statements.
- noUncheckedIndexedAccess: Forces safety checks when accessing array elements or object properties via index, returning T | undefined.
- noImplicitOverride: Ensures intentionality when overriding base class members.
- exactOptionalPropertyTypes: Prevents assigning undefined to optional properties that should be omitted.
- noPropertyAccessFromIndexSignature: Requires bracket notation for index signatures to distinguish from known properties.

Consequences
- everyone must now explicitly handle potential undefined values when accessing arrays or dynamic objects (null derefs, undefined). and the compiler will scream at us for not doing so.(literally)
- Unused code will cause compilation errors, requiring immediate cleanup.
- Refactoring becomes safer as the compiler catches more edge cases.
- Initial development speed may slightly decrease due to increased rigor, but long-term maintenance costs will be lower.
