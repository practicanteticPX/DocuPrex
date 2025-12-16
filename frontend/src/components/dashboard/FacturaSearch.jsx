import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Input } from '../ui/input';
import { Item, ItemContent, ItemTitle, ItemActions } from '../ui/item';
import { BACKEND_HOST } from '../../config/api';
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
          `${BACKEND_HOST}/api/facturas/search/${encodeURIComponent(trimmed)}`
        );

        const result = await response.json();

        console.log('🔍 Respuesta del backend:', result);
        console.log('📦 Data recibida:', result.data);
        console.log('🏢 CIA recibida del backend:', result.data?.cia);

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
          <h3 className="factura-search-empty-title">No se encontraron facturas</h3>
          <p className="factura-search-empty-text">
            No hay facturas que coincidan con "{numeroControl.trim()}"
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
              className="btn-action-clean"
              onClick={handleEdit}
              title="Seleccionar esta factura"
            >
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M11 4H4C3.46957 4 2.96086 4.21071 2.58579 4.58579C2.21071 4.96086 2 5.46957 2 6V20C2 20.5304 2.21071 21.0391 2.58579 21.4142C2.96086 21.7893 3.46957 22 4 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M18.5 2.50001C18.8978 2.10219 19.4374 1.87869 20 1.87869C20.5626 1.87869 21.1022 2.10219 21.5 2.50001C21.8978 2.89784 22.1213 3.4374 22.1213 4.00001C22.1213 4.56262 21.8978 5.10219 21.5 5.50001L12 15L8 16L9 12L18.5 2.50001Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </ItemActions>
        </Item>
      )}
    </div>
  );
};

export default FacturaSearch;
