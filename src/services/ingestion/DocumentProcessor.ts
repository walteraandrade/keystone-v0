import { readFile } from 'fs/promises';
import * as XLSX from 'xlsx';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { logger } from '../../utils/logger.js';
import { ValidationError } from '../../utils/errors.js';
import type { DocumentType } from '../../domain/entities/Document.js';

export interface ProcessedDocument {
  type: DocumentType;
  content: string;
  metadata: {
    fileName: string;
    fileSize: number;
    pageCount?: number;
    sheetCount?: number;
  };
}

export class DocumentProcessor {
  async processFile(filePath: string, fileName: string): Promise<ProcessedDocument> {
    const extension = fileName.split('.').pop()?.toLowerCase();

    switch (extension) {
      case 'xlsx':
      case 'xls':
        return this.processExcel(filePath, fileName);
      case 'pdf':
        return this.processPDF(filePath, fileName);
      default:
        return this.processText(filePath, fileName);
    }
  }

  private async processExcel(filePath: string, fileName: string): Promise<ProcessedDocument> {
    try {
      const buffer = await readFile(filePath);
      const workbook = XLSX.read(buffer, { type: 'buffer' });

      let content = '';
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const csv = XLSX.utils.sheet_to_csv(sheet);
        content += `\n\n--- Sheet: ${sheetName} ---\n${csv}`;
      }

      const type = this.detectType(fileName, content);

      logger.debug({ fileName, type, sheetCount: workbook.SheetNames.length }, 'Processed Excel');

      return {
        type,
        content: content.trim(),
        metadata: {
          fileName,
          fileSize: buffer.length,
          sheetCount: workbook.SheetNames.length,
        },
      };
    } catch (error) {
      logger.error({ error, fileName }, 'Excel processing failed');
      throw new ValidationError('Failed to process Excel file', error);
    }
  }

  private async processPDF(filePath: string, fileName: string): Promise<ProcessedDocument> {
    try {
      const buffer = await readFile(filePath);
      const data = await pdfParse(buffer);

      const type = this.detectType(fileName, data.text);

      logger.debug({ fileName, type, pageCount: data.numpages }, 'Processed PDF');

      return {
        type,
        content: data.text,
        metadata: {
          fileName,
          fileSize: buffer.length,
          pageCount: data.numpages,
        },
      };
    } catch (error) {
      logger.error({ error, fileName }, 'PDF processing failed');
      throw new ValidationError('Failed to process PDF file', error);
    }
  }

  private async processText(filePath: string, fileName: string): Promise<ProcessedDocument> {
    try {
      const buffer = await readFile(filePath);
      const content = buffer.toString('utf-8');

      const type = this.detectType(fileName, content);

      logger.debug({ fileName, type, size: buffer.length }, 'Processed text file');

      return {
        type,
        content,
        metadata: {
          fileName,
          fileSize: buffer.length,
        },
      };
    } catch (error) {
      logger.error({ error, fileName }, 'Text processing failed');
      throw new ValidationError('Failed to process text file', error);
    }
  }

  private detectType(fileName: string, content: string): DocumentType {
    const lowerName = fileName.toLowerCase();
    const lowerContent = content.toLowerCase();

    if (lowerName.includes('fmea') || lowerContent.includes('failure mode')) {
      return 'fmea';
    }

    if (lowerName.includes('ipar') || lowerContent.includes('investigação de perigo')) {
      return 'ipar';
    }

    return 'generic';
  }
}
