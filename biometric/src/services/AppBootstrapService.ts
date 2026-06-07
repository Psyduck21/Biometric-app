import { dbClient } from '../database/DatabaseClient';
import { MigrationRunner } from '../database/MigrationRunner';
import { ConfigRepository } from '../database/repositories/ConfigRepository';
import { CryptoService } from './CryptoService';

class AppBootstrapService {
    private bootstrapPromise: Promise<void> | null = null;
    private bootstrapped = false;

    async initialize(): Promise<void> {
        if (this.bootstrapped) {
            return;
        }

        if (this.bootstrapPromise) {
            return this.bootstrapPromise;
        }

        this.bootstrapPromise = (async () => {
            let masterKey: string;
            try {
                masterKey = await CryptoService.ensureMasterKey();
            } catch (e: any) {
                const msg = `[AppBootstrap] ensureMasterKey failed: ${e instanceof Error ? e.message : String(e)}`;
                const err = e instanceof Error ? e : new Error(String(e));
                err.message = msg;
                if (e instanceof Error && e.stack) {
                    err.stack = `${msg}\nCaused by: ${e.stack}`;
                }
                console.error(err);
                throw err;
            }

            try {
                await dbClient.initDB(masterKey);
            } catch (e: any) {
                const msg = `[AppBootstrap] initDB failed: ${e instanceof Error ? e.message : String(e)}`;
                const err = e instanceof Error ? e : new Error(String(e));
                err.message = msg;
                if (e instanceof Error && e.stack) {
                    err.stack = `${msg}\nCaused by: ${e.stack}`;
                }
                console.error(err);
                throw err;
            }

            try {
                await MigrationRunner.runMigrations();
            } catch (e: any) {
                const msg = `[AppBootstrap] runMigrations failed: ${e instanceof Error ? e.message : String(e)}`;
                const err = e instanceof Error ? e : new Error(String(e));
                err.message = msg;
                if (e instanceof Error && e.stack) {
                    err.stack = `${msg}\nCaused by: ${e.stack}`;
                }
                console.error(err);
                throw err;
            }

            // Seed Supabase Configuration from Environment Variables
            try {
                if (process.env.EXPO_PUBLIC_SUPABASE_PROJECT_URL) {
                    await ConfigRepository.set('api_base_url', `${process.env.EXPO_PUBLIC_SUPABASE_PROJECT_URL}/rest/v1`);
                }
                if (process.env.EXPO_PUBLIC_SUPABASE_API_KEY) {
                    await ConfigRepository.set('supabase_anon_key', process.env.EXPO_PUBLIC_SUPABASE_API_KEY);
                }
            } catch (e: any) {
                const msg = `[AppBootstrap] seeding config failed: ${e instanceof Error ? e.message : String(e)}`;
                const err = e instanceof Error ? e : new Error(String(e));
                err.message = msg;
                if (e instanceof Error && e.stack) {
                    err.stack = `${msg}\nCaused by: ${e.stack}`;
                }
                console.error(err);
                throw err;
            }

            this.bootstrapped = true;
        })();

        try {
            await this.bootstrapPromise;
        } catch (error: any) {
            this.bootstrapPromise = null;
            console.error('[AppBootstrap] bootstrapPromise rejected', error);
            throw error;
        }
    }
}

export const appBootstrapService = new AppBootstrapService();
