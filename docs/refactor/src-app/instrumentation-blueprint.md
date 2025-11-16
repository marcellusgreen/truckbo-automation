# Instrumentation Blueprint (Retired – 2025-10-20)

The temporary refactor instrumentation (`isRefactorDebugEnabled`, `refactorDebugLog`, event-bus mirrors) has been removed from the runtime codebase. Centralized hooks/adapters now provide the required observability and refresh behaviour.

## Notes
- API/service logging continues to flow through the shared `logger` utilities.
- If future diagnostics are needed, prefer targeted devtools traces or scoped console logging guarded by feature flags.
- Historical guidance has been preserved in version control should we need to revisit the refactor baseline strategy.
