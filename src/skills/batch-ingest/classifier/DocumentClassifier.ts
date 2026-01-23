import { readFile } from 'fs/promises';
import * as XLSX from 'xlsx';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { logger } from '../../../utils/logger.js';
import type { LLMService } from '../../../services/llm/LLMService.interface.js';
import type { ClassificationResult } from '../types.js';
import type { DocumentType } from '../../../domain/entities/Document.js';
import { CLASSIFICATION_PROMPT } from './ClassificationPrompt.js';

interface PatternRule {
  type: DocumentType;
  filenamePatterns: RegExp[];
  contentPatterns: RegExp[];
  weight: number;
}

const PATTERN_RULES: PatternRule[] = [
  {
    type: 'fmea',
    filenamePatterns: [/fmea/i],
    contentPatterns: [/failure\s*mode/i, /fmea/i, /modo\s*de\s*falha/i],
    weight: 1.0,
  },
  {
    type: 'ipar',
    filenamePatterns: [/ipar/i],
    contentPatterns: [
      /ipar/i,
      /identificação\s*de\s*perigos/i,
      /investigação\s*de\s*perigo/i,
      /avaliação\s*dos\s*riscos\s*de\s*segurança/i,
    ],
    weight: 1.0,
  },
  {
    type: 'hira',
    filenamePatterns: [/\bhira\b/i, /hazard\s*identification/i],
    contentPatterns: [
      /\bhira\b/i,
      /hazard\s*identification/i,
      /risk\s*assessment/i,
      /identificação\s*de\s*riscos/i,
    ],
    weight: 1.2,
  },
  {
    type: 'alert',
    filenamePatterns: [/alert/i, /gppm/i, /incident/i, /alerta/i],
    contentPatterns: [
      /gppm/i,
      /safety\s*alert/i,
      /alerta\s*de\s*segurança/i,
      /incident\s*report/i,
      /lesson\s*learned/i,
      /lição\s*aprendida/i,
    ],
    weight: 1.1,
  },
  {
    type: 'fps',
    filenamePatterns: [/\bfps\b/i, /safety\s*st\s*\d/i],
    contentPatterns: [
      /\bfps\b/i,
      /procedimento\s*fundamental/i,
      /normas\s*de\s*operações/i,
      /fundamental\s*safety/i,
    ],
    weight: 0.8,
  },
];

const CONFIDENCE_THRESHOLD = 0.8;

export class DocumentClassifier {
  constructor(private llmService?: LLMService) {}

  async classify(filePath: string, fileName: string): Promise<ClassificationResult> {
    const content = await this.extractContent(filePath, fileName);
    const preview = content.slice(0, 500);

    const patternResult = this.classifyByPattern(fileName, preview);

    if (patternResult.confidence >= CONFIDENCE_THRESHOLD) {
      logger.debug({ fileName, type: patternResult.documentType, confidence: patternResult.confidence }, 'Pattern classification');
      return patternResult;
    }

    // LLM classification disabled - pattern matching sufficient for current doc types

    return patternResult;
  }

  private classifyByPattern(fileName: string, content: string): ClassificationResult {
    const lowerName = fileName.toLowerCase();
    const lowerContent = content.toLowerCase();
    const matchedPatterns: string[] = [];

    let bestMatch: { type: DocumentType; score: number; patterns: string[] } = {
      type: 'generic',
      score: 0,
      patterns: [],
    };

    for (const rule of PATTERN_RULES) {
      let score = 0;
      const patterns: string[] = [];

      for (const pattern of rule.filenamePatterns) {
        if (pattern.test(lowerName)) {
          score += 0.5;
          patterns.push(`filename:${pattern.source}`);
        }
      }

      for (const pattern of rule.contentPatterns) {
        if (pattern.test(lowerContent)) {
          score += 0.3;
          patterns.push(`content:${pattern.source}`);
        }
      }

      score *= rule.weight;

      if (score > bestMatch.score) {
        bestMatch = { type: rule.type, score, patterns };
      }
    }

    const confidence = Math.min(bestMatch.score, 1.0);

    return {
      documentType: confidence > 0 ? bestMatch.type : 'generic',
      confidence: confidence || 0.3,
      method: 'pattern',
      patterns: bestMatch.patterns,
    };
  }

  private async classifyByLLM(fileName: string, content: string): Promise<ClassificationResult> {
    if (!this.llmService) {
      throw new Error('LLM service not available');
    }

    const response = await (this.llmService as any).client.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 200,
      temperature: 0,
      system: CLASSIFICATION_PROMPT.system,
      messages: [{ role: 'user', content: CLASSIFICATION_PROMPT.user(fileName, content) }],
    });

    const text = response.content[0]?.text || '';
    const parsed = JSON.parse(text);

    return {
      documentType: parsed.type as DocumentType,
      confidence: parsed.confidence,
      method: 'llm',
    };
  }

  private async extractContent(filePath: string, fileName: string): Promise<string> {
    const extension = fileName.split('.').pop()?.toLowerCase();

    switch (extension) {
      case 'xlsx':
      case 'xls':
        return this.extractExcel(filePath);
      case 'pdf':
        return this.extractPDF(filePath);
      default:
        return this.extractText(filePath);
    }
  }

  private async extractExcel(filePath: string): Promise<string> {
    const buffer = await readFile(filePath);
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    let content = '';
    for (const sheetName of workbook.SheetNames.slice(0, 2)) {
      const sheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(sheet, { RS: '\n' });
      content += csv.slice(0, 2000) + '\n';
    }
    return content;
  }

  private async extractPDF(filePath: string): Promise<string> {
    const buffer = await readFile(filePath);
    const data = await pdfParse(buffer);
    return data.text;
  }

  private async extractText(filePath: string): Promise<string> {
    const buffer = await readFile(filePath);
    return buffer.toString('utf-8');
  }
}
