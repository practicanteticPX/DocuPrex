const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Asegurarse de que la carpeta uploads existe
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

/**
 * Normaliza un nombre para usar como carpeta
 * Elimina caracteres especiales y espacios
 */
const normalizeUserName = (name) => {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Eliminar acentos
    .replace(/[^a-z0-9]/g, '_') // Reemplazar caracteres especiales por _
    .replace(/_+/g, '_') // Reemplazar múltiples _ por uno solo
    .replace(/^_|_$/g, ''); // Eliminar _ al inicio y final
};

/**
 * Obtiene o crea la carpeta del usuario
 */
const getUserUploadDir = (userName) => {
  const normalizedName = normalizeUserName(userName);
  const userDir = path.join(uploadDir, normalizedName);

  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
    console.log(`📁 Carpeta creada para usuario: ${normalizedName}`);
  }

  return userDir;
};

// Configuración de almacenamiento
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Verificar que el usuario esté autenticado
    if (!req.user || !req.user.name) {
      return cb(new Error('Usuario no autenticado'), null);
    }

    // Crear y obtener la carpeta del usuario
    const userDir = getUserUploadDir(req.user.name);
    cb(null, userDir);
  },
  filename: function (req, file, cb) {
    // Generar nombre único: timestamp-random-original.pdf
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const nameWithoutExt = path.basename(file.originalname, ext);
    cb(null, `${nameWithoutExt}-${uniqueSuffix}${ext}`);
  }
});

// Filtro para aceptar solo PDFs
const fileFilter = (req, file, cb) => {
  // Aceptar solo PDFs
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Solo se permiten archivos PDF'), false);
  }
};

// Configurar multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB máximo
  }
});

/**
 * Middleware para manejar la subida de un solo archivo PDF
 */
const uploadSinglePDF = upload.single('file');

/**
 * Middleware para manejar la subida de múltiples archivos PDF
 */
const uploadMultiplePDFs = upload.array('files', 20);

module.exports = {
  uploadSinglePDF,
  uploadMultiplePDFs,
  uploadDir,
  normalizeUserName,
  getUserUploadDir,
};
