-- Migration: Add Device Binding Constraint
-- Purpose: Prevent multiple active users from binding to the same physical device concurrently
-- thereby preventing device reassignment hijacking.

CREATE UNIQUE INDEX IF NOT EXISTS one_active_user_per_device 
ON device_bindings (device_id) 
WHERE is_active = 1;
