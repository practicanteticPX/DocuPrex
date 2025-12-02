import { useState, useEffect } from 'react';
import { X, Edit } from 'lucide-react';
import { Input } from '../ui/input';
import { Item, ItemContent, ItemTitle, ItemActions } from '../ui/item';
import './FacturaSearch.css';

/**
 * FacturaSearch - Buscador de facturas por consecutivo
 *
 * Permite buscar facturas en la tabla T_Facturas por consecutivo
 * y muestra los resultados en una carta. La búsqueda es en tiempo real.
 */
const FacturaSearch = ({ onFacturaSelect }) => {
  const [numeroControl, setNumeroControl] = useState('');
  const [loading, setLoading] = useState(false);
  const [factura, setFactura] = useState(null);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    const searchFactura = async () => {
      const trimmed = numeroControl.trim();

      if (!trimmed) {
        setFactura(null);
        setSearched(false);
        return;
      }

      setLoading(true);
      setSearched(false);

      try {
        const response = await fetch(
          `http://192.168.0.30:5001/api/facturas/search/${encodeURIComponent(trimmed)}`
        );

        const result = await response.json();

        if (response.ok && result.success) {
          setFactura(result.data);
        } else {
          setFactura(null);
        }
      } catch (err) {
        console.error('Error buscando factura:', err);
        setFactura(null);
      } finally {
        setLoading(false);
        setSearched(true);
      }
    };

    const timeoutId = setTimeout(searchFactura, 300);
    return () => clearTimeout(timeoutId);
  }, [numeroControl]);

  const handleClear = () => {
    setNumeroControl('');
    setFactura(null);
    setSearched(false);
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
          className="factura-search-modern-input"
        />
        {numeroControl && (
          <button
            className="factura-search-icon-button"
            onClick={handleClear}
            title="Limpiar búsqueda"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {loading && (
        <div className="factura-search-loading">
          <svg className="factura-search-spinner" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" opacity="0.25"/>
            <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/>
          </svg>
        </div>
      )}

      {!loading && searched && !factura && numeroControl.trim() && (
        <div className="factura-search-empty">
          <div className="factura-search-empty-icon">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/>
              <path d="M21 21L16.65 16.65" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <h3 className="factura-search-empty-title">No se encontraron documentos</h3>
          <p className="factura-search-empty-text">
            No hay documentos que coincidan con "{numeroControl.trim()}"
          </p>
        </div>
      )}

      {!loading && factura && (
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
