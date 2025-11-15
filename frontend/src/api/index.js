/**
 * Exportación centralizada del API
 * Punto de entrada único para todas las operaciones GraphQL
 */

export { default as graphqlClient, isAuthError, isNetworkError } from './client';
export * as queries from './queries';
export * as mutations from './mutations';

// Re-exportar el cliente por defecto
import graphqlClient from './client';
export default graphqlClient;
