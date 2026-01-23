import type { SemanticSegment, SegmentationOptions } from '../types.js';
import type { SemanticSegmentationStrategy } from './SemanticSegmentationStrategy.js';

export class FMEASegmentationStrategy implements SemanticSegmentationStrategy {
  async segment(content: string, _options?: SegmentationOptions): Promise<SemanticSegment[]> {
    const segments: SemanticSegment[] = [];
    const sheetPattern = /--- Sheet: (.*?) ---/g;
    const sheets = content.split(sheetPattern);

    if (sheets.length === 1) {
      return this.segmentSingleSheet(content, 'FMEA');
    }

    for (let i = 1; i < sheets.length; i += 2) {
      const sheetName = sheets[i].trim();
      const csvContent = sheets[i + 1];

      if (!csvContent?.trim()) continue;

      const sheetSegments = this.segmentSingleSheet(csvContent, sheetName);
      segments.push(...sheetSegments);
    }

    return segments;
  }

  private segmentSingleSheet(csvContent: string, sheetName: string): SemanticSegment[] {
    const rows = this.parseCSVRows(csvContent);

    if (rows.length === 0) return [];

    const header = rows[0];
    const dataRows = rows.slice(1);
    const segments: SemanticSegment[] = [];

    const processColumnIndex = this.findColumnIndex(header, ['process', 'processo', 'component']);

    let currentGroup: string[] = [];
    let currentProcess: string | null = null;
    let groupStartRow = 1;

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];

      if (this.isEmptyRow(row)) {
        if (currentGroup.length > 0) {
          segments.push(
            this.createSegment(header, currentGroup, sheetName, groupStartRow, groupStartRow + currentGroup.length - 1)
          );
          currentGroup = [];
        }
        continue;
      }

      const processValue = processColumnIndex >= 0 ? row[processColumnIndex]?.trim() : null;

      if (processValue && processValue !== currentProcess) {
        if (currentGroup.length > 0) {
          segments.push(
            this.createSegment(header, currentGroup, sheetName, groupStartRow, groupStartRow + currentGroup.length - 1)
          );
        }
        currentGroup = [this.formatRow(header, row)];
        currentProcess = processValue;
        groupStartRow = i + 2;
      } else {
        currentGroup.push(this.formatRow(header, row));
      }
    }

    if (currentGroup.length > 0) {
      segments.push(
        this.createSegment(header, currentGroup, sheetName, groupStartRow, groupStartRow + currentGroup.length - 1)
      );
    }

    return segments;
  }

  private parseCSVRows(csvContent: string): string[][] {
    const lines = csvContent.trim().split('\n');
    return lines.map(line => this.parseCSVLine(line));
  }

  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    result.push(current.trim());
    return result;
  }

  private findColumnIndex(header: string[], candidates: string[]): number {
    for (const candidate of candidates) {
      const index = header.findIndex(col =>
        col.toLowerCase().includes(candidate.toLowerCase())
      );
      if (index >= 0) return index;
    }
    return -1;
  }

  private isEmptyRow(row: string[]): boolean {
    return row.every(cell => !cell || cell.trim() === '');
  }

  private formatRow(header: string[], row: string[]): string {
    const pairs: string[] = [];
    for (let i = 0; i < Math.min(header.length, row.length); i++) {
      const value = row[i]?.trim();
      if (value) {
        pairs.push(`${header[i]}: ${value}`);
      }
    }
    return pairs.join(' | ');
  }

  private createSegment(
    header: string[],
    rows: string[],
    sheetName: string,
    startRow: number,
    endRow: number
  ): SemanticSegment {
    const text = rows.join('\n');
    const context = endRow === startRow
      ? `Sheet: ${sheetName}, Row ${startRow}`
      : `Sheet: ${sheetName}, Row ${startRow}-${endRow}`;

    return {
      text,
      semanticType: 'fmea_row_group',
      context,
      sourceReference: {
        section: `Sheet: ${sheetName}`,
        lineRange: [startRow, endRow],
      },
    };
  }
}
