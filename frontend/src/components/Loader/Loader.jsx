import './Loader.css';

/**
 * Componente de loader personalizado
 * @param {Object} props - Propiedades del componente
 * @param {string} props.size - Tamaño del loader: 'small' (24px), 'medium' (48px), 'large' (64px)
 * @param {string} props.className - Clase CSS adicional opcional
 */
const Loader = ({ size = 'medium', className = '' }) => {
  return (
    <div className={`custom-loader custom-loader--${size} ${className}`} aria-label="Cargando..."></div>
  );
};

export default Loader;
