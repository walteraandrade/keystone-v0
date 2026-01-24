# Testing

## Unit Tests

- Mock dependencies via interfaces
- Test pure functions directly

## Integration Tests

- Use real database connections
- Located alongside unit tests or in `__tests__/`

## Validation

```bash
bun run build              # must pass before marking complete
bun run validate:phaseN    # run at phase boundaries
```
