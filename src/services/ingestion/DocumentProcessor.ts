import { readFile, stat } from 'fs/promises';
import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as XLSX from 'xlsx';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { logger } from '../../utils/logger.js';
import { ValidationError } from '../../utils/errors.js';
import type { DocumentType } from '../../domain/entities/Document.js';

export interface PDFElement {
  type: 'Title' | 'NarrativeText' | 'ListItem' | 'Table';
  text: string;
  page: number;
  rows?: number;
  cols?: number;
}

export interface StructuredPDFExtraction {
  filename: string;
  filepath: string;
  pages: number;
  element_count: number;
  tables_found: number;
  elements: PDFElement[];
}

export interface ProcessedDocument {
  type: DocumentType;
  content: string;
  metadata: {
    fileName: string;
    fileSize: number;
    pageCount?: number;
    sheetCount?: number;
  };
  structuredElements?: PDFElement[];
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
      
      const structured = await this.extractPDFStructured(filePath);
      
      if (structured) {
        const content = structured.elements
          .map(el => el.text)
          .join('\n\n');
        
        const type = this.detectType(fileName, content);
        
        logger.debug({ 
          fileName, 
          type, 
          pageCount: structured.pages,
          elementCount: structured.element_count 
        }, 'Processed PDF with structured extraction');
        
        return {
          type,
          content,
          metadata: {
            fileName,
            fileSize: buffer.length,
            pageCount: structured.pages,
          },
          structuredElements: structured.elements,
        };
      }
      
      logger.debug({ fileName }, 'Falling back to pdf-parse extraction');
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

  private async extractPDFStructured(filePath: string): Promise<StructuredPDFExtraction | null> {
    const scriptPath = join(
      dirname(fileURLToPath(import.meta.url)),
      '../../../scripts/extract-pdf.py'
    );
    
    try {
      await stat(scriptPath);
    } catch {
      logger.debug({ scriptPath }, 'Python extraction script not found, skipping');
      return null;
    }
    
    return new Promise((resolve) => {
      const proc = spawn('python3', [scriptPath, filePath], {
        timeout: 60000,
      });
      
      let stdout = '';
      let stderr = '';
      
      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      proc.on('close', (code) => {
        if (code !== 0) {
          logger.warn({ code, stderr }, 'Python extraction failed, will fallback');
          resolve(null);
          return;
        }
        
        try {
          const result = JSON.parse(stdout) as StructuredPDFExtraction;
          resolve(result);
        } catch (e) {
          logger.warn({ error: e }, 'Failed to parse Python extraction output');
          resolve(null);
        }
      });
      
      proc.on('error', (err) => {
        logger.warn({ error: err }, 'Failed to spawn Python process');
        resolve(null);
      });
    });
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

    const iparPatterns = [
      'ipar',
      'identificação de perigos',
      'investigação de perigo',
      'avaliação dos riscos de segurança',
    ];
    if (lowerName.includes('ipar') || iparPatterns.some(p => lowerContent.includes(p))) {
      return 'ipar';
    }

    const hiraPatterns = [
      'hira',
      'hazard identification',
      'risk assessment',
      'identificação de riscos',
    ];
    if (lowerName.includes('hira') || hiraPatterns.some(p => lowerContent.includes(p))) {
      return 'hira';
    }

    const alertPatterns = [
      'gppm',
      'safety alert',
      'alerta de segurança',
      'incident report',
      'lesson learned',
      'lição aprendida',
    ];
    if (['alert', 'gppm', 'incident', 'alerta'].some(p => lowerName.includes(p)) || alertPatterns.some(p => lowerContent.includes(p))) {
      return 'alert';
    }

    const fpsPatterns = [
      'fps',
      'safety st',
      'am safety',
      'procedimento fundamental',
      'normas de operações',
    ];
    if (fpsPatterns.some(p => lowerName.includes(p)) || fpsPatterns.some(p => lowerContent.includes(p))) {
      return 'fps';
    }

    return 'generic';
  }
}
