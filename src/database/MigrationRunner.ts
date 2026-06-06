import { dbClient } from "./DatabaseClient";
import { INITIAL_SCHEMA } from "./Schemas";

export class MigrationRunner {
    static async runMigrations() {
        // database connection
        const db = dbClient.getDb();

        // executing sql code in single go using transactions
        try {
            console.log("Starting Database Migration.");
            await db.transaction(async (txc) => {
                await txc.execute(INITIAL_SCHEMA);
            });

            console.log("Migration Completed successfully");
        } catch (e) {
            console.error("Error in migrating database : ", e);
            throw e;
        }

        // ── M004: Add key_algorithm column to device_bindings ──────────────────
        // Runs safely on existing installations. SQLite does not support
        // ADD COLUMN IF NOT EXISTS, so we attempt the ALTER and ignore the
        // "duplicate column" error (SQLITE_ERROR code 1).
        try {
            const db2 = dbClient.getDb();
            await db2.execute(
                `ALTER TABLE device_bindings ADD COLUMN key_algorithm TEXT NOT NULL DEFAULT 'ECDSA_P256'`
            );
            console.log("[MigrationRunner] M004: key_algorithm column added to device_bindings.");
        } catch (e: any) {
            if (String(e?.message ?? e).includes('duplicate column')) {
                console.log("[MigrationRunner] M004: key_algorithm column already present, skipping.");
            } else {
                console.error("[MigrationRunner] M004: Unexpected error adding key_algorithm column:", e);
            }
        }

        try {
            const db2 = dbClient.getDb();
            await db2.execute(
                `ALTER TABLE users ADD COLUMN department TEXT`
            );
            console.log("[MigrationRunner] M005: department column added to users.");
        } catch (e: any) {
            if (String(e?.message ?? e).includes('duplicate column')) {
                console.log("[MigrationRunner] M005: department column already present, skipping.");
            } else {
                console.error("[MigrationRunner] M005: Unexpected error adding department column:", e);
            }
        }
    }
}

