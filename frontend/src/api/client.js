/**
 * Cliente GraphQL centralizado
 * Proporciona una interfaz unificada para realizar consultas GraphQL
 */

import { getLocalStorage } from '../utils/helpers';
import { STORAGE_KEYS, ERROR_MESSAGES } from '../utils/constants';

/**
 * URL del API GraphQL
 */
const API_URL = import.meta.env.VITE_API_URL || 'http://192.168.0.30:5001/graphql';

/**
 * Clase para manejar cliente GraphQL
 */
class GraphQLClient {
  constructor(url) {
    this.url = url;
  }

  /**
   * Obtiene el token de autenticación
   */
  getToken() {
    return getLocalStorage(STORAGE_KEYS.AUTH_TOKEN);
  }

  /**
   * Realiza una query o mutation GraphQL
   */
  async request(query, variables = {}, options = {}) {
    try {
      const token = options.token || this.getToken();

      const headers = {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` }),
        ...options.headers
      };

      const response = await fetch(this.url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query,
          variables
        })
      });

      // Manejar errores HTTP
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      // Manejar errores GraphQL
      if (result.errors && result.errors.length > 0) {
        const error = result.errors[0];
        throw new GraphQLError(error.message, error.extensions);
      }

      return result.data;
    } catch (error) {
      // Re-throw el error para que pueda ser manejado por el llamador
      throw error;
    }
  }

  /**
   * Realiza una query GraphQL
   */
  async query(query, variables = {}, options = {}) {
    return this.request(query, variables, options);
  }

  /**
   * Realiza una mutation GraphQL
   */
  async mutate(mutation, variables = {}, options = {}) {
    return this.request(mutation, variables, options);
  }

  /**
   * Realiza múltiples queries en paralelo
   */
  async batchQuery(queries) {
    try {
      const promises = queries.map(({ query, variables, options }) =>
        this.query(query, variables, options)
      );

      return await Promise.all(promises);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Cambia la URL del API
   */
  setUrl(url) {
    this.url = url;
  }
}

/**
 * Clase personalizada para errores GraphQL
 */
class GraphQLError extends Error {
  constructor(message, extensions = {}) {
    super(message);
    this.name = 'GraphQLError';
    this.extensions = extensions;
  }
}

/**
 * Instancia singleton del cliente GraphQL
 */
export const graphqlClient = new GraphQLClient(API_URL);

/**
 * Helper para detectar errores de autenticación
 */
export const isAuthError = (error) => {
  if (!error) return false;

  const message = error.message?.toLowerCase() || '';

  return (
    message.includes('autenticado') ||
    message.includes('authenticated') ||
    message.includes('no autenticado') ||
    message.includes('unauthorized') ||
    error.extensions?.code === 'UNAUTHENTICATED'
  );
};

/**
 * Helper para detectar errores de red
 */
export const isNetworkError = (error) => {
  if (!error) return false;

  return (
    error.message?.includes('fetch') ||
    error.message?.includes('network') ||
    error.message?.includes('NetworkError') ||
    error.message?.includes('HTTP error')
  );
};

/**
 * Exportar el cliente por defecto
 */
export default graphqlClient;
