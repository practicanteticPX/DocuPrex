import { useState } from 'react';
import { Search, Edit } from 'lucide-react';
import { Input } from '../ui/input';
import { Item, ItemContent, ItemTitle, ItemActions } from '../ui/item';
import './FacturaSearch.css';

/**
 * FacturaSearch - Buscador de facturas por consecutivo
 *
 * Permite buscar facturas en la tabla T_Facturas por consecutivo
 * y muestra los resultados en una carta.
 */
const FacturaSearch = ({ onFacturaSelect }) => {
  const [numeroControl, setNumeroControl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [factura, setFactura] = useState(null);

  const handleSearch = async () => {
    if (!numeroControl.trim()) {
      setError('Ingresa un consecutivo');
      return;
    }

    setLoading(true);
    setError('');
    setFactura(null);

    try {
      const response = await fetch(
        `http://192.168.0.30:5001/api/facturas/search/${encodeURIComponent(numeroControl.trim())}`
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        setError(result.message || 'No se encontró la factura');
        setLoading(false);
        return;
      }

      setFactura(result.data);
      setError('');
    } catch (err) {
      console.error('Error buscando factura:', err);
      setError('Error al buscar la factura. Intenta nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleEdit = () => {
    if (factura && onFacturaSelect) {
      onFacturaSelect(factura);
    }
  };

  return (
    <div className="factura-search-container">
      <div className="factura-search-header">
        <label htmlFor="numero-control-input" className="factura-search-label">
          Buscar Factura
        </label>
      </div>

      <div className="factura-search-input-wrapper">
        <Input
          id="numero-control-input"
          type="text"
          placeholder="Ingresa el consecutivo..."
          value={numeroControl}
          onChange={(e) => setNumeroControl(e.target.value)}
          onKeyPress={handleKeyPress}
          disabled={loading}
          className="factura-search-modern-input"
        />
        <button
          className="factura-search-icon-button"
          onClick={handleSearch}
          disabled={loading || !numeroControl.trim()}
          title="Buscar"
        >
          {loading ? (
            <svg className="factura-search-spinner" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" opacity="0.25"/>
              <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/>
            </svg>
          ) : (
            <Search size={18} />
          )}
        </button>
      </div>

      {error && (
        <div className="factura-search-error">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 8V12M12 16H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span>{error}</span>
        </div>
      )}

      {factura && (
        <Item variant="outline">
          <ItemContent>
            <ItemTitle>
              FV - {factura.proveedor} - {factura.numero_factura}
            </ItemTitle>
          </ItemContent>
          <ItemActions>
            <button
              className="factura-action-btn"
              onClick={handleEdit}
              title="Seleccionar esta factura"
            >
              <Edit size={20} />
            </button>
          </ItemActions>
        </Item>
      )}
    </div>
  );
};

export default FacturaSearch;
