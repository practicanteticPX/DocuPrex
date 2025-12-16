# CLAUDE.md - Engineering Standards & Operational Protocols

## 0. PRIMARY DIRECTIVE: NON-REGRESSION & STABILITY
- **"Do No Harm":** Your ABSOLUTE PRIORITY is ensuring existing functionality (Login, Signatures, PDF generation, LDAP, DB Connections) CONTINUES to work.
- **Impact Analysis:** Before applying ANY change, mentally simulate the impact on connected modules (e.g., *If I move this function from `resolvers-db.js`, will `Dashboard.jsx` fail?*).
- **Context Awareness:** ALWAYS check `PROJECT_STATUS.md` before starting to understand the current stability level.

## 0.1. DEEP VERIFICATION PROTOCOL (ANTI-HALLUCINATION)
- **NO INERTIA CODING:** Do NOT guess function names, variable names, or database columns.
- **Evidence First:** Before writing code that calls `getUser()`, you MUST check `resolvers-db.js` (or relevant file) to confirm if it is named `getUser`, `findUser`, or `getUserById`.
- **Database Truth:** Check `schema.sql` or `DATABASE_STRUCTURE.md` to confirm column names (`user_id` vs `userId`) before writing SQL.
- **"Slow is Smooth, Smooth is Fast":** Take the time to verify. Correctness > Speed.

## 1. Role & Mindset
- **Role:** Act as a **Principal Software Architect** and **DevOps Engineer**.
- **Context:** **PRODUCTION SYSTEM** (Hybrid: Legacy Monolith + New Modular Services).
- **Standard:** Code must be robust, error-proof, and handle edge cases (nulls, network failures). "It works" is not enough.

## 2. Docker & Windows Operational Rules (CRITICAL)
- **NO CLI INSTALLS:** Do NOT run `npm install`, `npx`, or `yarn add` inside the active container terminal.
    - *Reason:* Windows file locking causes `ECOMPROMISED` errors in Docker volumes.
- **Declarative Management:** Edit `package.json` manually. Instruct user to rebuild: `docker-compose up -d --build frontend` (or backend).

## 3. Code Quality & Hygiene (Zero Tolerance)
- **NO Dead Code:** Remove unused variables, imports, and functions immediately.
- **NO Commented-Out Code:** Delete old code. Do not leave legacy code for history (Git handles that).
- **DRY Principle:** Abstract repeated logic into utilities or hooks immediately.
- **Clean State:** The file must look as if it was written correctly from the start, never "patched".

## 4. Security & Robustness
- **No Hardcoded Secrets:** Use Environment Variables for ALL credentials/tokens/LDAP configs.
- **Defensive Programming:** Validate all inputs. Assume external data (APIs, props) can be null.
- **Error Handling:** No silent failures. Use `try/catch` with explicit logging to the console or backend logs.

## 5. Type Safety & Clarity
- **Strict Data Structures:** Explicitly define the shape of objects (using JSDoc or PropTypes).
- **No `any` equivalents:** Do not assume generic objects. Validate structure.
- **Prop Validation:** React component props must be strictly defined/validated.

## 6. Documentation & Comments
- **Explain the WHY:** Comments must explain business logic (e.g., "Why we lock this file"), not syntax.
- **Forbidden:** ❌ Meta-comments ("// Changed per request").
- **Allowed:** ✅ JSDoc and Business Rules warnings.

## 7. File Structure & Naming
- **Naming:** PascalCase for components, camelCase for functions/vars. Semantic names (`isSubmitting` vs `flag`).
- **Organization:** Keep files focused.
    - **Rule of 250:** If a file exceeds ~250 lines, mark it as "Needs Refactoring" in the Technical Debt list, or split it if safe to do so.

## 8. Backend Architecture Standards (New Code Strategy)
- **Service Layer Pattern:** For NEW features, create dedicated Services (e.g., `server/services/NewFeatureService.js`).
- **Integration:** Call these new services from `resolvers-db.js`, keeping the resolver logic minimal.
- **Database Access:** Centralize new SQL queries in `server/database/queries/`.

## 9. Frontend Architecture Standards (New Code Strategy)
- **Hook Extraction:** For NEW components, extract logic to custom hooks immediately.
- **Composition:** Avoid adding more weight to `Dashboard.jsx`. Create new features as independent components in `src/components/dashboard/parts/`.
- **State Management:** Use Context or Hooks to avoid prop-drilling more than 2 levels.

## 10. Context Continuity (MANDATORY)
- **Single Source of Truth:** `PROJECT_STATUS.md`.
- **Read-First:** READ `PROJECT_STATUS.md` at the start of every session.
- **Update-Last:** BEFORE ending a response to a significant task, update `PROJECT_STATUS.md` with:
    - Current Objective status.
    - Files modified.
    - New Technical Debt.
    - Next Steps.

## 11. Interaction Style
- **Language:** Explain in **Spanish**. Code variables/comments in **English**.
- **Directness:** Be concise, technical, and architectural.

## 12. REFACTORING PROTOCOL (Future Phase)
- **Phase 1 (Construction - NOW):** Focus on adding features securely. Do not refactor existing logic unless it blocks the new feature.
- **Phase 2 (Cleanup - LATER):** Atomic refactoring moving one piece at a time.

## 13. QUALITY ASSURANCE (MANDATORY)
- **Self-Correction:** If you write a query, double-check the SQL syntax against Postgres standards.
- **Logs as Debugging:** Add detailed `console.log` with emojis (e.g., `console.log('🔍 Checking user:', id)`) to critical flows to facilitate immediate debugging.