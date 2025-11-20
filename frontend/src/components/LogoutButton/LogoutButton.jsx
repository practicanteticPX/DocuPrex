import './LogoutButton.css';

/**
 * Botón de logout animado con efecto hover
 * @param {Object} props - Propiedades del componente
 * @param {Function} props.onClick - Función a ejecutar al hacer click
 */
const LogoutButton = ({ onClick }) => {
  return (
    <button className="Btn" onClick={onClick} aria-label="Cerrar sesión">
      <div className="sign">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
          <polyline points="16 17 21 12 16 7"></polyline>
          <line x1="21" y1="12" x2="9" y2="12"></line>
        </svg>
      </div>
      <div className="text">Salir</div>
    </button>
  );
};

export default LogoutButton;
