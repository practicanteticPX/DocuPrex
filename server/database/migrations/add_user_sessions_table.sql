-- Tabla para registrar sesiones de usuario con hora exacta de login
-- Permite validar desde el backend que no han pasado más de 8 horas

CREATE TABLE IF NOT EXISTS user_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    login_time TIMESTAMP NOT NULL DEFAULT NOW(),
    logout_time TIMESTAMP,
    token_hash VARCHAR(64) NOT NULL UNIQUE, -- Hash del token para identificar sesión
    ip_address VARCHAR(45), -- IPv4 o IPv6
    user_agent TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Índice para búsquedas rápidas por usuario y token
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token_hash ON user_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_user_sessions_is_active ON user_sessions(is_active);
CREATE INDEX IF NOT EXISTS idx_user_sessions_login_time ON user_sessions(login_time);

-- Comentarios para documentación
COMMENT ON TABLE user_sessions IS 'Registra todas las sesiones de login de usuarios con hora exacta para validación de expiración de 8 horas';
COMMENT ON COLUMN user_sessions.login_time IS 'Hora exacta en la que el usuario hizo login (fuente de verdad para las 8 horas)';
COMMENT ON COLUMN user_sessions.logout_time IS 'Hora exacta en la que el usuario hizo logout o la sesión expiró';
COMMENT ON COLUMN user_sessions.token_hash IS 'SHA-256 hash del JWT para identificar la sesión única';
COMMENT ON COLUMN user_sessions.is_active IS 'false si la sesión expiró o el usuario hizo logout';
