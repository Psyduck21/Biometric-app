import { CryptoService } from './CryptoService';
import { deviceBindingService } from './DeviceBindingService';
import { sessionService } from './SessionService';
import { SyncQueueRepository } from '../database/repositories/SyncQueueRepository';
import { SyncQueueItem } from '../types/domain';
import { UserRepository } from '../database/repositories/UserRepository';
import { User } from '../types/domain';
import { FaceTemplateRepository } from '../database/repositories/FaceTemplateRepository';

export interface LaunchState {
  route: '/' | '/enrollment' | '/scanner' | '/home';
  user: User | null;
  sessionId: string | null;
  isAuthenticated: boolean;
  isEnrollmentIncomplete: boolean;
}

export interface RegistrationInput {
  fullName: string;
  employeeId: string;
  email: string;
}

export class AppSessionService {
  async resolveLaunchState(): Promise<LaunchState> {
    const binding = await deviceBindingService.getBindingForCurrentDevice();
    if (!binding) {
      return {
        route: '/',
        user: null,
        sessionId: null,
        isAuthenticated: false,
        isEnrollmentIncomplete: false,
      };
    }

    const user = await UserRepository.getUserById(binding.user_id);
    if (!user) {
      return {
        route: '/',
        user: null,
        sessionId: null,
        isAuthenticated: false,
        isEnrollmentIncomplete: false,
      };
    }

    const templates = await FaceTemplateRepository.getActive(user.id);
    if (templates.length === 0) {
      return {
        route: '/enrollment',
        user: user as User,
        sessionId: null,
        isAuthenticated: false,
        isEnrollmentIncomplete: true,
      };
    }

    const activeSession = await sessionService.getActiveSession(user.id);
    if (activeSession) {
      return {
        route: '/home',
        user: user as User,
        sessionId: activeSession.id,
        isAuthenticated: true,
        isEnrollmentIncomplete: false,
      };
    }

    return {
      route: '/',
      user: user as User,
      sessionId: null,
      isAuthenticated: false,
      isEnrollmentIncomplete: false,
    };
  }

  async registerUser(input: RegistrationInput): Promise<User> {
    const now = Date.now();
    const employeeId = input.employeeId.trim();
    const normalizedEmail = input.email.trim().toLowerCase();
    // 1. Check Cloud Supabase DB for authoritative record
    let cloudUser: any = null;
    try {
      // Inline apiService call without explicit import if it's not at the top,
      // actually we need to import apiService if it's not imported.
      // Wait, let's just use the apiService.
      const { apiService } = require('./network/ApiService');
      const response = await apiService.get(`/users?employee_id=eq.${employeeId}`);
      if (response.success && response.data && response.data.length > 0) {
        cloudUser = response.data[0];
        console.log(`[AppSessionService] Found existing cloud user with ID: ${cloudUser.id}`);
      }
    } catch (e) {
      console.warn('[AppSessionService] Could not check cloud for existing user', e);
    }

    const existingLocalUser = await UserRepository.getUserByEmployeeId(employeeId);

    // Scenario A: User exists locally
    if (existingLocalUser) {
      if (!cloudUser) {
        // Cloud is missing the user. Force sync!
        console.log('[AppSessionService] Cloud is missing the user. Forcing re-sync.');
        await this.enqueueUserSync(existingLocalUser as unknown as User);
      } else if (cloudUser.id !== existingLocalUser.id) {
        // Mismatch! Adopt cloud UUID to prevent foreign key errors.
        console.log(`[AppSessionService] UUID Mismatch! Cloud: ${cloudUser.id}, Local: ${existingLocalUser.id}. Resetting local user...`);
        await UserRepository.deleteUser(existingLocalUser.id);
        
        existingLocalUser.id = cloudUser.id;
        existingLocalUser.enrolled_at = cloudUser.enrolled_at || existingLocalUser.enrolled_at;
        existingLocalUser.sync_status = 'synced';
        await UserRepository.createUser(existingLocalUser);
      }
      
      await deviceBindingService.bindDevice(existingLocalUser.id);
      return existingLocalUser as User;
    }

    // Scenario B & C: User does NOT exist locally
    const user: User = {
      id: cloudUser ? cloudUser.id : CryptoService.uuid(),
      employee_id: employeeId,
      full_name: cloudUser ? cloudUser.full_name : input.fullName.trim(),
      role: cloudUser ? cloudUser.role : 'employee',
      department: cloudUser ? cloudUser.department : 'Workspace',
      status: cloudUser ? cloudUser.status : 'active',
      enrolled_at: cloudUser ? (cloudUser.enrolled_at || now) : now,
      updated_at: cloudUser ? (cloudUser.updated_at || now) : now,
      sync_status: cloudUser ? 'synced' : 'pending',
      metadata: cloudUser ? cloudUser.metadata : JSON.stringify({ email: normalizedEmail }),
    };

    await UserRepository.createUser(user);
    await deviceBindingService.bindDevice(user.id);
    
    if (!cloudUser) {
      await this.enqueueUserSync(user);
    }

    return user;
  }

  private async enqueueUserSync(user: User) {
    try {
      const now = Date.now();
      const masterKey = await CryptoService.getMasterKey();
      if (!masterKey) throw new Error('Master key not found for user sync');
      const payloadJson = JSON.stringify(user);
      const { cipher, iv, tag } = await CryptoService.encrypt(payloadJson, masterKey);
      
      const syncItem: SyncQueueItem = {
        id: CryptoService.uuid(),
        entity_type: 'user',
        entity_id: user.id,
        operation: 'create',
        payload_cipher: cipher,
        payload_iv: iv,
        payload_tag: tag,
        idempotency_key: CryptoService.uuid(),
        status: 'pending',
        priority: 1, // High priority so it syncs before attendance records
        created_at: now,
        attempt_count: 0
      };
      
      await SyncQueueRepository.insert(syncItem);
    } catch (e) {
      console.warn('[AppSessionService] Failed to enqueue user sync item:', e);
    }
  }

  async createVerifiedSession(userId: string, similarityScore = 0.98, livenessScore = 0.99) {
    return sessionService.createSession(userId, 'liveness', similarityScore, livenessScore);
  }

  async signOut(sessionId?: string | null): Promise<void> {
    if (sessionId) {
      await sessionService.invalidateSession(sessionId);
    }
  }
}

export const appSessionService = new AppSessionService();
