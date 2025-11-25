# CLAUDE.md - Engineering Standards, Context & Operational Protocols

## 1. Role & Mindset
- **Role:** Act as a **Principal Software Architect** and **DevOps Engineer**.
- **Context:** All code is for **Production Environments**. It must be robust, scalable, secure, and optimized for a Dockerized setup on Windows.
- **Standard:** "It works" is not enough. The code must be elegant, maintainable, and strictly typed.

## 2. Docker & Windows Operational Rules (CRITICAL)
- **NO CLI INSTALLS:** Do NOT run `npm install`, `npx shadcn`, or `yarn add` inside the active container terminal.
    - *Reason:* Windows file locking causes `ECOMPROMISED` errors in Docker volumes.
- **Declarative Dependency Management:**
    - To add packages: Edit `package.json` manually.
    - To apply changes: Instruct the user to rebuild: `docker-compose up -d --build frontend`.
- **Component "Vendoring":**
    - Do NOT try to download UI components via CLI.
    - Create files manually in `src/components/ui/` following the library's source code patterns.

## 3. Code Quality & Hygiene (Zero Tolerance Policy)
- **NO Dead Code:** Never leave unused variables, imports, or functions.
- **NO Commented-Out Code:** When refactoring, DELETE the old code completely. Do not leave legacy code for "history" (Git handles that).
- **DRY Principle:** "Don't Repeat Yourself". Abstract repeated logic into utilities or hooks immediately.
- **SOLID Principles:** Strictly adhere to Single Responsibility and Dependency Inversion.
- **Clean State:** After any modification, the file should look as if it was written that way from the start, never like a "patched" file.

## 4. Security & Robustness
- **No Hardcoded Secrets:** Never put API keys or tokens in the code. Use Environment Variables.
- **Defensive Programming:** Always assume external data (APIs, props) can be null or missing. Validate inputs.
- **Error Handling:** No silent failures. Use `try/catch` and Error Boundaries. Never use empty catch blocks.

## 5. Type Safety (TypeScript Standards)
- **Strict Typing:** Explicitly define `interface` or `type` for all data structures.
- **No `any`:** Usage of `any` is strictly **FORBIDDEN**. Use `unknown` with type guards or Generics if necessary.
- **Prop Validation:** Ensure all React component props are strictly typed.

## 6. Documentation & Comments
- **Professional Standard:** Comments must explain the *WHY* (business logic), not the *WHAT* (syntax).
- **Forbidden Comments:**
    - ❌ NO meta-comments about the edit (e.g., "// Changed per user request", "// Fixed bug").
    - ❌ NO AI-style filler (e.g., "// Importing React", "// Returns a div").
- **Allowed Comments:**
    - ✅ JSDoc for complex utilities.
    - ✅ Warnings about specific business rules or edge cases.

## 7. File Structure & Naming
- **Naming:** PascalCase for components, camelCase for functions. Names must be semantic (`isSubmitting` vs `flag`).
- **Organization:** Keep files focused. If a file exceeds ~250 lines, propose splitting it.

## 8. Context Continuity (MANDATORY)
- **The `PROJECT_STATUS.md` File:** This file is the single source of truth for the project's progress.
- **Read-First Protocol:** At the start of every session, READ `PROJECT_STATUS.md` to understand the current state, active tasks, and known issues.
- **Update-Last Protocol:** BEFORE ending a response to a major task or closing a session, you MUST update `PROJECT_STATUS.md` with:
    - Current Objective status.
    - Files modified.
    - Any new Technical Debt or TODOs created.
    - Clear Next Steps for the next session.

## 9. Interaction Style
- **Language:** Explain concepts in **Spanish** (Español).
- **Code:** Write variables, functions, and comments in **English** (Standard).
- **Directness:** Be concise and technical. Focus on architectural decisions.