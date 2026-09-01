> [!WARNING]
> **Historical / Stale Document**
> This audit was performed prior to significant frontend refactoring. The codebase has since evolved (e.g., `src/app/page.tsx` has been heavily modularized, directory paths have changed). This document is preserved for historical context only and its metrics should not be considered accurate for the current codebase.

# Frontend Code Quality Audit Results

Per the code-quality refactor plan, a mechanical audit was run against all frontend files (`apps/web/src`) longer than 300 lines.

The audit counted three anti-patterns:

1. **`dangerouslySetInnerHTML`**: Misused CSS-in-a-string injections.
2. **`var(--*, ...)` Fallbacks**: Hardcoded color fallbacks indicating missing centralized Tailwind tokens.
3. **`style={{...}}` Inline Objects**: Bypassing Tailwind utilities for static styling.

## The Hit List (Ranked by Total Issues)

| File                                               | Total Lines | `style={{...}}` | `var()` Fallbacks | `dangerouslySet...` | Total Issues |
| :------------------------------------------------- | :---------- | :-------------- | :---------------- | :------------------ | :----------- |
| **`src/app/(workspace)/challenges/[id]/page.tsx`** | 1,888       | 133             | 73                | 0                   | **206**      |
| **`src/app/(workspace)/roadmaps/[slug]/page.tsx`** | 1,020       | 78              | 90                | 1                   | **169**      |
| **`src/app/page.tsx`** (Landing Page)              | 801         | 78              | 71                | 1                   | **150**      |
| **`src/app/login/page.tsx`**                       | 840         | 69              | 66                | 1                   | **136**      |
| **`src/app/(dashboard)/quizzes/[slug]/page.tsx`**  | 871         | 60              | 73                | 2                   | **135**      |
| **`src/app/register/page.tsx`**                    | 759         | 52              | 54                | 3                   | **109**      |
| **`src/app/(dashboard)/quizzes/page.tsx`**         | 629         | 41              | 64                | 1                   | **106**      |
| **`src/components/dashboard/CatalogToolbar.tsx`**  | 588         | 38              | 66                | 0                   | **104**      |
| **`src/components/layout/Navbar.tsx`**             | 453         | 33              | 39                | 0                   | **72**       |
| **`src/utils/landing.tsx`**                        | 521         | 29              | 33                | 1                   | **63**       |
| **`src/app/(dashboard)/challenges/page.tsx`**      | 451         | 24              | 31                | 1                   | **56**       |
| **`src/components/dashboard/ChallengeCard.tsx`**   | 334         | 23              | 28                | 0                   | **51**       |
| **`src/app/(dashboard)/roadmaps/page.tsx`**        | 310         | 20              | 26                | 1                   | **47**       |

## Key Takeaways

1. The **Challenge Workspace (`challenges/[id]/page.tsx`)** is by far the worst offender, clocking in at nearly 1,900 lines of code with over 200 inline style and token fallback violations. It should be the absolute top priority for component extraction and Tailwind migration.
2. The **Landing Page (`page.tsx`)**, which was the subject of the original refactor plan, ranks 3rd on the list.
3. The auth pages (`login` and `register`) are massive monoliths (840 and 759 lines respectively) carrying over 100 anti-patterns each.

**Next Step**: Recommend starting with `page.tsx` to establish the new Tailwind tokens in `globals.css` (as outlined in Step 1 of the refactor plan), and then moving immediately to the massive 1888-line `challenges/[id]/page.tsx`.
