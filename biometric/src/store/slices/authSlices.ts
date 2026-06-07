import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { User } from '../../types/domain';

interface AuthState {
  isAuthenticated: boolean;
  currentUser: User | null;
  activeSessionId: string | null;
  sessionSource: 'offline' | 'online' | 'unknown';
}

const initialState: AuthState = {
  isAuthenticated: false,
  currentUser: null,
  activeSessionId: null,
  sessionSource: 'unknown',
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setProfile: (state, action: PayloadAction<User>) => {
      state.currentUser = action.payload;
      state.isAuthenticated = false;
      state.activeSessionId = null;
      state.sessionSource = 'unknown';
    },
    login: (
      state,
      action: PayloadAction<{ user: User; sessionId?: string; source?: 'offline' | 'online' }>
    ) => {
      state.isAuthenticated = true;
      state.currentUser = action.payload.user;
      state.activeSessionId = action.payload.sessionId ?? null;
      state.sessionSource = action.payload.source ?? 'offline';
    },
    logout: (state) => {
      state.isAuthenticated = false;
      state.currentUser = null;
      state.activeSessionId = null;
      state.sessionSource = 'unknown';
    },
  },
});

export const { setProfile, login, logout } = authSlice.actions;
export default authSlice.reducer;
