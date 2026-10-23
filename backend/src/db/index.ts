import { Pool, QueryResult, QueryResultRow } from "pg";
import { config } from "../config/env";

export const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.database,
  user: config.db.user,
  password: config.db.password,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on("error", (err: Error) => {
  console.error("Unexpected error on idle PostgreSQL client:", err.message);
});

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  return pool.query<T>(text, params);
}

export interface DbHealthResult {
  connected: boolean;
  message: string;
}

export async function checkDbConnection(): Promise<DbHealthResult> {
  if (!config.db.password) {
    return {
      connected: false,
      message: "Database password is not configured in backend/.env",
    };
  }

  try {
    const client = await pool.connect();
    try {
      await client.query("SELECT 1 AS healthy");
      return {
        connected: true,
        message: "Database connection established successfully",
      };
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Unknown database connection error";
    // Sanitize error message to ensure no connection strings or credentials leak
    const sanitized = errorMessage.replace(/(password=)[^\s;]+/gi, "$1***");
    return {
      connected: false,
      message: `Database connection failed: ${sanitized}`,
    };
  }
}
