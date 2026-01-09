# Strategy Pattern: Document Segmentation

## Pattern Overview

**Strategy Pattern** defines a family of algorithms, encapsulates each one, and makes them interchangeable. Strategy lets the algorithm vary independently from clients that use it.

## Implementation

Each document type (FMEA, IPAR, generic) has a unique segmentation strategy:

```typescript
interface SegmentationStrategy {
  segment(content: string): SemanticSegment[];
}

class FMEASegmentationStrategy implements SegmentationStrategy { ... }
class IPARSegmentationStrategy implements SegmentationStrategy { ... }
class GenericSegmentationStrategy implements SegmentationStrategy { ... }
```

**SemanticChunker** selects strategy based on document type:

```typescript
class SemanticChunker {
  private strategies = new Map<DocumentType, SegmentationStrategy>([
    ['fmea', new FMEASegmentationStrategy()],
    ['ipar', new IPARSegmentationStrategy()],
    ['generic', new GenericSegmentationStrategy()],
  ]);

  chunk(content: string, documentType: DocumentType): TokenizedChunk[] {
    const strategy = this.strategies.get(documentType);
    const segments = strategy.segment(content);
    return segments.flatMap((seg, idx) => this.tokenSplitter.split(seg, idx));
  }
}
```

## Why This Pattern?

- **Extensibility**: Add new document types without modifying existing code
- **Testability**: Test each strategy in isolation
- **Domain alignment**: Each strategy respects document ontology (FMEA rows ≠ paragraphs)
- **Separation of concerns**: Segmentation logic separate from token enforcement

## Adding New Document Types

1. **Create strategy file**: `src/services/chunking/strategies/NewTypeSegmentationStrategy.ts`

```typescript
export class NewTypeSegmentationStrategy implements SegmentationStrategy {
  segment(content: string): SemanticSegment[] {
    // Parse content according to document ontology
    return segments.map(seg => ({
      text: seg.text,
      semanticType: 'newtype_section',  // Unique identifier
      context: seg.heading,              // Human-readable context
      sourceReference: {
        section: seg.heading,
        lineRange: [seg.start, seg.end],
      },
    }));
  }
}
```

2. **Register in SemanticChunker**:

```typescript
// src/services/chunking/SemanticChunker.ts
this.strategies.set('newtype', new NewTypeSegmentationStrategy());
```

3. **Add document type**:

```typescript
// src/domain/entities/Document.ts
export type DocumentType = 'fmea' | 'ipar' | 'generic' | 'newtype';
```

## Keeping It Healthy

### ✅ Do
- Keep strategies **pure functions** (no side effects)
- Preserve document **semantic structure** (tables, findings, sections)
- Include **rich context** (sheet names, section headings, row ranges)
- Return segments that are **semantically complete** (full FMEA row, not half)

### ❌ Don't
- Mix segmentation with token counting (that's TokenSplitter's job)
- Return empty segments (filter them out)
- Lose source references (critical for provenance)
- Make strategies depend on external state

## Testing Strategies

```typescript
test('FMEA strategy groups rows by process', () => {
  const content = '--- Sheet: Test ---\nProcess,Failure\nP1,F1\nP1,F2';
  const strategy = new FMEASegmentationStrategy();
  const segments = strategy.segment(content);

  expect(segments).toHaveLength(1);
  expect(segments[0].semanticType).toBe('fmea_row_group');
  expect(segments[0].context).toContain('Sheet: Test');
});
```

## Architecture Flow

```
Document (FMEA) → SemanticChunker selects FMEASegmentationStrategy
                → Strategy segments into semantic units (rows)
                → TokenSplitter enforces 8192 token limit
                → Chunks stored in Qdrant with semanticType + context
```

## References

- [Strategy Pattern - Refactoring Guru](https://refactoring.guru/design-patterns/strategy)
- Related: `src/services/chunking/TokenSplitter.ts` (token enforcement)
- Related: `src/services/chunking/types.ts` (SemanticSegment interface)
