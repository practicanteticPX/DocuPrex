/**
 * Mutations GraphQL para autenticación
 * Contiene todas las mutaciones relacionadas con autenticación y usuarios
 */

/**
 * Login de usuario
 */
export const LOGIN = `
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      token
      user {
        id
        name
        email
        role
        email_notifications
      }
    }
  }
`;

/**
 * Registro de usuario
 */
export const REGISTER = `
  mutation Register($name: String!, $email: String!, $password: String!) {
    register(name: $name, email: $email, password: $password) {
      token
      user {
        id
        name
        email
        role
      }
    }
  }
`;

/**
 * Actualiza el perfil del usuario
 */
export const UPDATE_PROFILE = `
  mutation UpdateProfile($name: String, $email: String) {
    updateProfile(name: $name, email: $email) {
      id
      name
      email
    }
  }
`;

/**
 * Cambia la contraseña del usuario
 */
export const CHANGE_PASSWORD = `
  mutation ChangePassword($currentPassword: String!, $newPassword: String!) {
    changePassword(currentPassword: $currentPassword, newPassword: $newPassword) {
      success
      message
    }
  }
`;

/**
 * Actualiza las preferencias de notificaciones por email
 */
export const UPDATE_EMAIL_NOTIFICATIONS = `
  mutation UpdateEmailNotifications($enabled: Boolean!) {
    updateEmailNotifications(enabled: $enabled) {
      id
      email_notifications
    }
  }
`;

/**
 * Solicita reseteo de contraseña
 */
export const REQUEST_PASSWORD_RESET = `
  mutation RequestPasswordReset($email: String!) {
    requestPasswordReset(email: $email) {
      success
      message
    }
  }
`;

/**
 * Resetea la contraseña con token
 */
export const RESET_PASSWORD = `
  mutation ResetPassword($token: String!, $newPassword: String!) {
    resetPassword(token: $token, newPassword: $newPassword) {
      success
      message
    }
  }
`;
