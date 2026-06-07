import { configureStore } from "@reduxjs/toolkit";
import authReducer from "./slices/authSlices";

// configure the store
export const store = configureStore({
    reducer: {
        auth: authReducer,
        // layer attendanceReducer, syncReducer etc
    },
});

// export types
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;