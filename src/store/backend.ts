import type { Data, TableName } from '../types';

export interface Backend {
  kind: 'local' | 'cloud';
  load(): Promise<Data>;
  upsert<T extends TableName>(table: T, rows: Data[T]): Promise<void>;
  remove(table: TableName, ids: string[]): Promise<void>;
  /** Called when another device changed data. Returns unsubscribe. */
  subscribe?(onChange: () => void): () => void;
}
