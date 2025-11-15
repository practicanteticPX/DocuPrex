import { useState, useCallback } from 'react';
import { validateFile, validateFiles } from '../utils/validators';
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from '../utils/constants';

/**
 * Hook personalizado para manejar subida de archivos
 * Proporciona funciones para validar y subir archivos
 */
export const useFileUpload = () => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  /**
   * Maneja la selección de un archivo
   */
  const handleFileSelect = useCallback((file) => {
    const validation = validateFile(file);

    if (!validation.valid) {
      setError(validation.error);
      setSelectedFile(null);
      return false;
    }

    setSelectedFile(file);
    setError(null);
    return true;
  }, []);

  /**
   * Maneja la selección de múltiples archivos
   */
  const handleFilesSelect = useCallback((files) => {
    const validation = validateFiles(files);

    if (!validation.valid) {
      setError(validation.errors.join(', '));
      setSelectedFiles([]);
      return false;
    }

    setSelectedFiles(Array.from(files));
    setError(null);
    return true;
  }, []);

  /**
   * Maneja el drag over event
   */
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  /**
   * Maneja el drop event
   */
  const handleDrop = useCallback((e, multiple = false) => {
    e.preventDefault();
    e.stopPropagation();

    const files = Array.from(e.dataTransfer.files);

    if (multiple) {
      return handleFilesSelect(files);
    } else {
      return handleFileSelect(files[0]);
    }
  }, [handleFileSelect, handleFilesSelect]);

  /**
   * Sube un archivo
   */
  const uploadFile = useCallback(async (file, url, additionalData = {}) => {
    if (!file) {
      setError(ERROR_MESSAGES.REQUIRED_FIELD);
      return { success: false, error: ERROR_MESSAGES.REQUIRED_FIELD };
    }

    try {
      setUploading(true);
      setProgress(0);
      setError(null);
      setSuccess(false);

      const formData = new FormData();
      formData.append('file', file);

      // Agregar datos adicionales
      Object.keys(additionalData).forEach(key => {
        formData.append(key, additionalData[key]);
      });

      const xhr = new XMLHttpRequest();

      // Manejar progreso
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percentComplete = (e.loaded / e.total) * 100;
          setProgress(percentComplete);
        }
      });

      // Crear promesa para manejar la respuesta
      const uploadPromise = new Promise((resolve, reject) => {
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const response = JSON.parse(xhr.responseText);
              resolve(response);
            } catch (err) {
              resolve(xhr.responseText);
            }
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        });

        xhr.addEventListener('error', () => {
          reject(new Error(ERROR_MESSAGES.NETWORK_ERROR));
        });

        xhr.addEventListener('abort', () => {
          reject(new Error('Upload aborted'));
        });
      });

      xhr.open('POST', url);
      xhr.send(formData);

      const result = await uploadPromise;

      setSuccess(true);
      setProgress(100);

      return { success: true, data: result };
    } catch (err) {
      const errorMessage = err.message || ERROR_MESSAGES.UPLOAD_FAILED;
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setUploading(false);
    }
  }, []);

  /**
   * Sube múltiples archivos
   */
  const uploadFiles = useCallback(async (files, url, additionalData = {}) => {
    if (!files || files.length === 0) {
      setError(ERROR_MESSAGES.REQUIRED_FIELD);
      return { success: false, error: ERROR_MESSAGES.REQUIRED_FIELD };
    }

    try {
      setUploading(true);
      setProgress(0);
      setError(null);
      setSuccess(false);

      const formData = new FormData();

      // Agregar archivos
      files.forEach((file) => {
        formData.append('files', file);
      });

      // Agregar datos adicionales
      Object.keys(additionalData).forEach(key => {
        formData.append(key, additionalData[key]);
      });

      const xhr = new XMLHttpRequest();

      // Manejar progreso
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percentComplete = (e.loaded / e.total) * 100;
          setProgress(percentComplete);
        }
      });

      // Crear promesa para manejar la respuesta
      const uploadPromise = new Promise((resolve, reject) => {
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const response = JSON.parse(xhr.responseText);
              resolve(response);
            } catch (err) {
              resolve(xhr.responseText);
            }
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        });

        xhr.addEventListener('error', () => {
          reject(new Error(ERROR_MESSAGES.NETWORK_ERROR));
        });

        xhr.addEventListener('abort', () => {
          reject(new Error('Upload aborted'));
        });
      });

      xhr.open('POST', url);
      xhr.send(formData);

      const result = await uploadPromise;

      setSuccess(true);
      setProgress(100);

      return { success: true, data: result };
    } catch (err) {
      const errorMessage = err.message || ERROR_MESSAGES.UPLOAD_FAILED;
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setUploading(false);
    }
  }, []);

  /**
   * Limpia el archivo seleccionado
   */
  const clearFile = useCallback(() => {
    setSelectedFile(null);
    setError(null);
    setSuccess(false);
    setProgress(0);
  }, []);

  /**
   * Limpia los archivos seleccionados
   */
  const clearFiles = useCallback(() => {
    setSelectedFiles([]);
    setError(null);
    setSuccess(false);
    setProgress(0);
  }, []);

  /**
   * Limpia todo el estado
   */
  const reset = useCallback(() => {
    setSelectedFile(null);
    setSelectedFiles([]);
    setUploading(false);
    setProgress(0);
    setError(null);
    setSuccess(false);
  }, []);

  return {
    // Estado
    selectedFile,
    selectedFiles,
    uploading,
    progress,
    error,
    success,

    // Funciones
    handleFileSelect,
    handleFilesSelect,
    handleDragOver,
    handleDrop,
    uploadFile,
    uploadFiles,
    clearFile,
    clearFiles,
    reset
  };
};
