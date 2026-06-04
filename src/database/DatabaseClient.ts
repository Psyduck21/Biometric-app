import { open } from '@op-engineering/op-sqlite';
import type { DB } from '@op-engineering/op-sqlite';

class DatabaseClient {
    // private data members
    private db: DB | null = null;
    /*
    initDB -> This function will be called in the splash screen where the app is loading and the keys are being loaded from secure key store

    args : encryptionkey -> The key which is used to encrypt the database

    returns : void

    throws : Error
    */
    async initDB(encryptionkey: string) {
        if (this.db) {
            return;
        }

        try {
            this.db = open({
                name: 'biometric.sqlite',
                encryptionKey: encryptionkey,
            });
            console.log('Database initialized successfully');
        } catch (error) {
            console.error('Failed to initialize database : ', error);
            throw error;
        }
    }
    // Public properties
    getDb(): DB {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        return this.db;
    }
}

export const dbClient = new DatabaseClient();
