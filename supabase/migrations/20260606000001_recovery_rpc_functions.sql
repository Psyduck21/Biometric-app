-- Migration: Account Recovery System RPCs & Tables

-- 1. Create temporary tables for OTP and Recovery Tokens
CREATE TABLE IF NOT EXISTS otp_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id text NOT NULL,
    otp_code text NOT NULL,
    expires_at timestamptz NOT NULL,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recovery_tokens (
    token text PRIMARY KEY,
    user_id uuid NOT NULL,
    employee_id text NOT NULL,
    expires_at timestamptz NOT NULL,
    created_at timestamptz DEFAULT now()
);


-- 3. verify_recovery_otp
CREATE OR REPLACE FUNCTION verify_recovery_otp(p_employee_id text, p_otp_code text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id uuid;
    v_token text;
BEGIN
    -- Validate OTP
    IF NOT EXISTS (
        SELECT 1 FROM otp_requests 
        WHERE employee_id = p_employee_id 
        AND otp_code = p_otp_code 
        AND expires_at > now()
    ) THEN
        RETURN json_build_object('success', false, 'error', 'Invalid or expired OTP');
    END IF;

    -- Delete used OTPs for this employee
    DELETE FROM otp_requests WHERE employee_id = p_employee_id;

    -- Get user_id
    SELECT id INTO v_user_id FROM users WHERE employee_id = p_employee_id LIMIT 1;

    -- Generate Recovery Token
    v_token := encode(gen_random_bytes(32), 'hex');
    
    INSERT INTO recovery_tokens (token, user_id, employee_id, expires_at)
    VALUES (v_token, v_user_id, p_employee_id, now() + interval '15 minutes');

    RETURN json_build_object('success', true, 'data', json_build_object('recovery_token', v_token));
END;
$$;

-- 4. authorize_recovery (Biometric Gate)
CREATE OR REPLACE FUNCTION authorize_recovery(p_recovery_token text, p_embedding vector(192))
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_token_record record;
    v_master_embedding vector(192);
    v_similarity float;
    v_templates json;
BEGIN
    -- Validate Token
    SELECT * INTO v_token_record FROM recovery_tokens 
    WHERE token = p_recovery_token AND expires_at > now();

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Invalid or expired recovery token');
    END IF;

    -- Biometric Match: Get active master template
    SELECT embedding INTO v_master_embedding 
    FROM face_templates 
    WHERE user_id = v_token_record.user_id AND is_active = TRUE 
    ORDER BY created_at DESC LIMIT 1;

    IF v_master_embedding IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'No active template found. Contact Admin for Hard Reset.');
    END IF;

    -- Calculate Cosine Similarity (pgvector: 1 - cosine_distance)
    v_similarity := 1 - (v_master_embedding <=> p_embedding);

    IF v_similarity < 0.65 THEN
        -- IMPORTANT: Do not delete token immediately to allow multiple attempts? 
        -- Actually, for security, invalidating after 3 tries would be better, but we'll just return fail for now.
        RETURN json_build_object('success', false, 'error', 'Face mismatch (Score: ' || coalesce(v_similarity::text, 'null') || '). If you believe this is an error, contact IT for a Hard Reset.');
    END IF;

    -- If matched, consume token
    DELETE FROM recovery_tokens WHERE token = p_recovery_token;

    -- Revoke any existing active device bindings for this user so they can bind the new device
    UPDATE device_bindings 
    SET is_active = FALSE 
    WHERE user_id = v_token_record.user_id AND is_active = TRUE;

    -- Fetch all templates for the user to download to the new device
    SELECT json_agg(json_build_object(
        'id', id,
        'embedding', embedding::text, -- Will be re-encrypted by client
        'capture_index', capture_index
    )) INTO v_templates
    FROM face_templates
    WHERE user_id = v_token_record.user_id AND is_active = TRUE;

    RETURN json_build_object('success', true, 'data', json_build_object(
        'user_id', v_token_record.user_id,
        'employee_id', v_token_record.employee_id,
        'templates', v_templates
    ));
END;
$$;
