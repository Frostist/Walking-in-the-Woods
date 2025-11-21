declare module 'sql.js' {
  export class Statement {
    bind(values?: any[] | { [key: string]: any }): boolean;
    step(): boolean;
    get(): any[];
    getAsObject(): { [key: string]: any };
    getColumnNames(): string[];
    reset(): void;
    free(): void;
  }

  export class Database {
    constructor(data?: Uint8Array);
    run(sql: string, params?: any[]): void;
    exec(sql: string, params?: any[]): QueryExecResult[];
    prepare(sql: string): Statement;
    export(): Uint8Array;
    close(): void;
  }

  export interface QueryExecResult {
    columns: string[];
    values: any[][];
  }

  export interface InitSqlJsConfig {
    locateFile?: (file: string) => string;
  }

  export interface SqlJsStatic {
    Database: typeof Database;
  }

  function initSqlJs(config?: InitSqlJsConfig): Promise<SqlJsStatic>;
  
  const defaultExport: typeof initSqlJs;
  export default defaultExport;
}

