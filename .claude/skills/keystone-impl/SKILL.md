# Keystone Implementation Skill

Execute implementation steps from `IMPLEMENTATION_PLAN.md` with validation and state tracking.

## Invocation

```
/keystone-impl
/keystone-impl phase3
```

## Workflow

### 1. STATE RECOVERY (always first)

Read `IMPLEMENTATION_PLAN.md` and parse checkbox state:
- `[ ]` = pending
- `[x]` = completed

Report current position:
```
Phase 1: ✓ complete (6/6)
Phase 2: ◐ in progress (3/6)
  Last completed: 2.3
  Next: 2.4 Update createRelationship() for optional status param
Phase 3-5: ○ blocked (requires Phase 2)
Phase 6: ○ blocked (requires Phase 3-5)
```

### 2. PREREQUISITE CHECK

Before implementing any step:
1. Verify all prior steps marked `[x]`
2. Run validation on last completed phase if at boundary
3. If discrepancy found (marked done but validation fails):
   - Unmark the step in IMPLEMENTATION_PLAN.md
   - Report: "Step X.Y marked complete but validation failed. Unmarking."

### 3. PHASE SELECTION

If at phase boundary, show available phases:

```
Available phases:
  [3] SQLite Extraction Logging
  [4] Failed Document Cleanup
  [5] Coverage Query Endpoints

Phases 3-5 can run in parallel. Select one.
```

Allow user to specify phase or pick next sequential.

### 4. IMPLEMENTATION

For each step:

1. **Implement** the step per IMPLEMENTATION_PLAN.md details
2. **Build check**: Run `bun run build`
3. **On success**:
   - Mark step `[x]` in IMPLEMENTATION_PLAN.md
   - Commit: `impl(phaseN): N.X step description`
4. **On failure**:
   - Report error
   - Do NOT mark complete
   - Ask user how to proceed

### 5. PHASE GATE

At end of phase:
1. Run `bun run validate:phaseN`
2. Must pass before starting next phase
3. If fails, identify which step needs fixing

## Commit Format

```
impl(phase1): 1.1 create ProcedureStep entity
impl(phase2): 2.4 add status param to createRelationship
impl(phase3): 3.1 create BunSQLiteService
```

## Session Recovery

On every invocation:
1. Re-read IMPLEMENTATION_PLAN.md
2. Parse all checkboxes
3. Validate last completed step/phase if uncertain
4. Resume from verified position

## Partial Work Detection

If file exists but is incomplete:
1. Detect partial implementation
2. Report: "Step X.Y partially complete. File exists but missing: [list]"
3. Offer to complete missing parts before marking done

## Dependency Graph

```
Phase 1 → Phase 2 ─┬→ Phase 3 (parallel)
                   ├→ Phase 4 (parallel)
                   └→ Phase 5 (parallel)
                        ↓
                     Phase 6
```

## Validation Commands

- `bun run validate:phase1` - Domain layer
- `bun run validate:phase2` - Service layer
- `bun run validate:phase3` - SQLite extraction
- `bun run validate:phase4` - Cleanup endpoint
- `bun run validate:phase5` - Coverage queries
- `bun run validate:phase6` - Documentation
- `bun run validate:all` - All phases

## Rules

- **No skipping**: Cannot skip steps even with partial validation
- **Build required**: Every step must pass `bun run build`
- **Atomic commits**: One commit per step
- **Checkpoint phases**: Must pass phase validation before moving forward
