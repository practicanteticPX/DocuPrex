/**
 * Queries GraphQL para usuarios
 * Contiene todas las consultas relacionadas con usuarios
 */

/**
 * Fragment común de usuario
 */
export const USER_FRAGMENT = `
  fragment UserFields on User {
    id
    name
    email
    role
    created_at
  }
`;

/**
 * Obtiene el usuario autenticado
 */
export const GET_ME = `
  query GetMe {
    me {
      id
      name
      email
      role
      created_at
      email_notifications
    }
  }
`;

/**
 * Obtiene todos los usuarios
 */
export const GET_USERS = `
  query GetUsers {
    users {
      id
      name
      email
      role
      created_at
    }
  }
`;

/**
 * Obtiene un usuario por ID
 */
export const GET_USER_BY_ID = `
  query GetUserById($id: Int!) {
    user(id: $id) {
      id
      name
      email
      role
      created_at
      email_notifications
    }
  }
`;

/**
 * Busca usuarios por nombre o email
 */
export const SEARCH_USERS = `
  query SearchUsers($searchTerm: String!) {
    searchUsers(searchTerm: $searchTerm) {
      id
      name
      email
      role
    }
  }
`;

/**
 * Obtiene usuarios por rol
 */
export const GET_USERS_BY_ROLE = `
  query GetUsersByRole($role: String!) {
    usersByRole(role: $role) {
      id
      name
      email
      role
    }
  }
`;
