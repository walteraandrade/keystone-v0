declare module 'pdf-parse/lib/pdf-parse.js' {
  import type { Result } from 'pdf-parse';
  function pdfParse(dataBuffer: Buffer, options?: object): Promise<Result>;
  export default pdfParse;
}
