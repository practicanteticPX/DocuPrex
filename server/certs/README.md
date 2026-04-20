# Certificados SSL para Conexiones a BD Externas

Este directorio debe contener los certificados SSL necesarios para conectar con las bases de datos externas SERV_QPREX y DB_QPREX.

## Certificados Requeridos

Coloca los siguientes archivos en este directorio:

### Para SERV_QPREX (Facturas):
- `admin-key.pk8` - Clave privada del cliente
- `admin-cert.pem` - Certificado del cliente
- `ca-cert.pem` - Certificado de la Autoridad Certificadora

### Para DB_QPREX (Cuentas):
- `admin-key.pk8` - Clave privada del cliente
- `admin-cert.pem` - Certificado del cliente
- `ca-cert.pem` - Certificado de la Autoridad Certificadora

## Instalación

1. **Coloca los certificados en `server/certs/`:**
   ```bash
   # En Windows
   copy "ruta\a\tus\certificados\*" "d:\DocuPrex\server\certs\"
   
   # En Linux/Mac
   cp /ruta/a/tus/certificados/* ~/DocuPrex/server/certs/
   ```

2. **Reconstruye la imagen Docker:**
   ```bash
   docker-compose down
   docker-compose build --no-cache server
   docker-compose up -d
   ```

3. **Verifica los logs:**
   ```bash
   docker-compose logs server | grep "Certificados"
   ```

## Comportamiento del Sistema

- **Con certificados presentes:** Usa validación SSL completa (`rejectUnauthorized: true`)
- **Sin certificados:** Usa SSL sin validación como fallback (`rejectUnauthorized: false`)

El sistema emitirá un warning si los certificados no se encuentran, pero seguirá funcionando con SSL básico.

## Notas de Seguridad

- En producción, siempre usa certificados válidos
- El fallback a SSL sin validación es solo para desarrollo
- Los certificados deben estar en formato PEM

## Troubleshooting

Si ves el error `ENOENT: no such file or directory`:
1. Verifica que los certificados estén en `server/certs/`
2. Usa los nombres de archivo correctos (sensibles a mayúsculas)
3. Reconstruye la imagen: `docker-compose build --no-cache server`
4. Reinicia: `docker-compose up -d`
