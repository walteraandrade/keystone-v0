export interface StoredDocument {
  path: string;
  hash: string;
  size: number;
}

export interface DocumentStorage {
  store(fileName: string, content: Buffer): Promise<StoredDocument>;
  retrieve(path: string): Promise<Buffer>;
  delete(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
}
