import { dbClient } from '../DatabaseClient';
import { FaceTemplate } from '../../types/domain';
import type { Transaction } from '@op-engineering/op-sqlite';

/**
 * FaceTemplateRepository
 *
 * Handles all CRUD operations on the `face_templates` table.
 * Embeddings are stored in their encrypted form (cipher + iv + tag) and
 * never decrypted inside this repository — that responsibility belongs to
 * CryptoService and EmbeddingService.
 */
export class FaceTemplateRepository {

    /**
     * Inserts a new face template row for a user.
     *
     * @param template - The fully populated FaceTemplate object to persist.
     * @param tx - Optional transaction.
     * @throws If the INSERT fails (e.g., FK violation, duplicate id).
     */
    static async insert(template: FaceTemplate, tx?: Transaction): Promise<void> {
        const runner = tx || dbClient.getDb();
        const sql = `
            INSERT INTO face_templates (
                id, user_id, embedding_cipher, embedding_iv, embedding_tag,
                quality_score, capture_index, model_version,
                created_at, is_active, sync_status, template_type
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        await runner.execute(sql, [
            template.id,
            template.user_id,
            template.embedding_cipher,
            template.embedding_iv,
            template.embedding_tag,
            template.quality_score,
            template.capture_index,
            template.model_version,
            template.created_at,
            template.is_active,
            template.sync_status,
            template.template_type || 'master',
        ]);
        console.log(`[FaceTemplateRepository] Successfully saved template ${template.id} for user ${template.user_id} to SQLite.`);
    }

    /**
     * Returns all active (is_active = 1) face templates for a given user,
     * or all active templates across all users if no userId is provided.
     *
     * Used by the matching engine during authentication to load the candidate set.
     *
     * @param userId - Optional filter. If omitted, returns templates for all users.
     * @returns Array of active FaceTemplate rows, newest first.
     */
    static async getActive(userId?: string): Promise<FaceTemplate[]> {
        const db = dbClient.getDb();
        let sql: string;
        let params: unknown[];

        if (userId) {
            sql = `
                SELECT * FROM face_templates
                WHERE user_id = ? AND is_active = 1
                ORDER BY created_at ASC
            `;
            params = [userId];
        } else {
            sql = `
                SELECT * FROM face_templates
                WHERE is_active = 1
                ORDER BY user_id, created_at ASC
            `;
            params = [];
        }

        const result = await db.execute(sql, params as string[]);
        const rows = (result.rows ?? []) as unknown as FaceTemplate[];
        console.log(`[FaceTemplateRepository] Retrieved ${rows.length} active templates from SQLite.`);
        return rows;
    }

    /**
     * Marks all face templates belonging to a user as inactive (is_active = 0).
     *
     * Used during re-enrollment to retire old templates before inserting new ones.
     * Does NOT delete rows — the history is preserved for audit purposes.
     *
     * @param userId - The user whose templates should be deactivated.
     * @param tx - Optional transaction.
     */
    static async revokeAllForUser(userId: string, tx?: Transaction): Promise<void> {
        const runner = tx || dbClient.getDb();
        await runner.execute(
            'UPDATE face_templates SET is_active = 0 WHERE user_id = ?',
            [userId]
        );
    }

    /**
     * Marks a single template as synced in the sync_queue ledger.
     *
     * @param templateId - The UUID of the template to mark as synced.
     * @param tx - Optional transaction.
     */
    static async markSynced(templateId: string, tx?: Transaction): Promise<void> {
        const runner = tx || dbClient.getDb();
        await runner.execute(
            "UPDATE face_templates SET sync_status = 'synced' WHERE id = ?",
            [templateId]
        );
    }
}
