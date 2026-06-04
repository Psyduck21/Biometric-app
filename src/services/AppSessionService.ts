import { CryptoService } from './CryptoService';
import { deviceBindingService } from './DeviceBindingService';
import { sessionService } from './SessionService';
import { SyncQueueRepository } from '../database/repositories/SyncQueueRepository';
import { SyncQueueItem } from '../types/domain';
import { UserRepository } from '../database/repositories/UserRepository';
import { User } from '../types/domain';

export interface LaunchState {
  route: '/' | '/enrollment' | '/scanner' | '/home';
  user: User | null;
  sessionId: string | null;
  isAuthenticated: boolean;
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
      };
    }

    const user = await UserRepository.getUserById(binding.user_id);
    if (!user) {
      return {
        route: '/',
        user: null,
        sessionId: null,
        isAuthenticated: false,
      };
    }

    const activeSession = await sessionService.getActiveSession(user.id);
    if (activeSession) {
      return {
        route: '/home',
        user: user as User,
        sessionId: activeSession.id,
        isAuthenticated: true,
      };
    }

    return {
      route: '/',
      user: user as User,
      sessionId: null,
      isAuthenticated: false,
    };
  }

  async registerUser(input: RegistrationInput): Promise<User> {
    const now = Date.now();
    const employeeId = input.employeeId.trim();
    const normalizedEmail = input.email.trim().toLowerCase();
    const existingUser = await UserRepository.getUserByEmployeeId(employeeId);

    if (existingUser) {
      await deviceBindingService.bindDevice(existingUser.id);
      return existingUser as User;
    }

    const user: User = {
      id: CryptoService.uuid(),
      employee_id: employeeId,
      full_name: input.fullName.trim(),
      role: 'employee',
      department: 'Workspace',
      status: 'active',
      enrolled_at: now,
      updated_at: now,
      sync_status: 'pending',
      metadata: JSON.stringify({ email: normalizedEmail }),
    };

    await UserRepository.createUser(user);
    await deviceBindingService.bindDevice(user.id);

    // Enqueue the new user for cloud sync
    try {
      const masterKey = await CryptoService.getMasterKey();
      if (!masterKey) throw new Error('Master key not found for user sync');
      const payloadJson = JSON.stringify(user);
      const { cipher, iv } = await CryptoService.encrypt(payloadJson, masterKey);
      
      const syncItem: SyncQueueItem = {
        id: CryptoService.uuid(),
        entity_type: 'user',
        entity_id: user.id,
        operation: 'create',
        payload_cipher: cipher,
        payload_iv: iv,
        payload_tag: '',
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

    return user;
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
