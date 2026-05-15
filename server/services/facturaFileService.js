const path = require('path');
const fs = require('fs').promises;
const { normalizeUserName } = require('../utils/fileUpload');

const UPLOADS_BASE = path.join(__dirname, '..', 'uploads');
const SIN_CAUSAR_BASE = path.join(UPLOADS_BASE, 'Facturas sin causar');
const ARCHIVO_CONTABLE_BASE = path.join(UPLOADS_BASE, 'archivo-contable');

// UNC path on the Windows host — the sync script reads from ARCHIVO_CONTABLE_BASE and writes here
const S_DRIVE_BASE = 'S:\\Z. Adtiva y Financiera\\_Qprex Adtiva y Financiera\\Archivo Contable';

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Moves a file cross-device safely (copy + delete fallback when rename fails EXDEV).
 */
async function moveFile(srcPath, destPath) {
  try {
    await fs.rename(srcPath, destPath);
  } catch (err) {
    if (err.code === 'EXDEV') {
      await fs.copyFile(srcPath, destPath);
      await fs.unlink(srcPath);
    } else {
      throw err;
    }
  }
}

/**
 * Moves a newly uploaded FV file from the default Multer path to
 * uploads/Facturas sin causar/{creatorName}/{nit}_{numeroFactura}.pdf
 *
 * @param {string} currentAbsPath - absolute path where Multer saved the file
 * @param {string} nit            - supplier NIT from T_Facturas
 * @param {string} numeroFactura  - invoice number
 * @param {string} creatorName    - uploader's display name (not normalized)
 * @returns {{ newRelativePath: string, newFileName: string }}
 */
async function moveToSinCausar(currentAbsPath, nit, numeroFactura, creatorName) {
  const normalizedName = normalizeUserName(creatorName);
  const destDir = path.join(SIN_CAUSAR_BASE, normalizedName);
  await ensureDir(destDir);

  const baseName = `${nit}_${numeroFactura}`;
  let finalFileName = `${baseName}.pdf`;
  let counter = 1;

  while (await fileExists(path.join(destDir, finalFileName))) {
    finalFileName = `${baseName}_${counter}.pdf`;
    counter++;
  }

  const destPath = path.join(destDir, finalFileName);
  await moveFile(currentAbsPath, destPath);

  console.log(`📂 FV sin causar guardada: ${destPath}`);

  return {
    newRelativePath: `uploads/Facturas sin causar/${normalizedName}/${finalFileName}`,
    newFileName: finalFileName
  };
}

/**
 * Moves a causada FV file from its current location to
 * uploads/archivo-contable/{cia}/{year}/Causaciones/{month}/{numeroCausacion}_{nit}_{numeroFactura}.pdf
 *
 * The sync script (scripts/sync-causados.ps1) is responsible for moving this
 * folder's contents to S:\Z. Adtiva y Financiera\...\Archivo Contable\.
 *
 * @param {string} currentRelativePath - value of documents.file_path
 * @param {string} cia                 - company code (PX, PT, PY)
 * @param {string} nit                 - supplier NIT
 * @param {string} numeroFactura       - invoice number
 * @param {string} numeroCausacion     - causacion number entered by the causacion group
 * @param {Date}   [fechaCausacion]    - date of causacion (defaults to today)
 * @returns {{ newRelativePath: string, newFileName: string }}
 */
async function moveToCausado(currentRelativePath, cia, nit, numeroFactura, numeroCausacion, fechaCausacion = new Date()) {
  const year = String(fechaCausacion.getFullYear());
  const month = String(fechaCausacion.getMonth() + 1).padStart(2, '0');

  const destDir = path.join(ARCHIVO_CONTABLE_BASE, cia, year, 'Causaciones', month);
  await ensureDir(destDir);

  const newFileName = `${numeroCausacion}_${nit}_${numeroFactura}.pdf`;
  const destPath = path.join(destDir, newFileName);

  // Resolve source: relative paths are relative to uploads base parent (server/)
  const srcPath = path.isAbsolute(currentRelativePath)
    ? currentRelativePath
    : path.join(UPLOADS_BASE, '..', currentRelativePath);

  if (!(await fileExists(srcPath))) {
    console.warn(`⚠️  Archivo FV no encontrado para mover a causados: ${srcPath}`);
    return null;
  }

  await moveFile(srcPath, destPath);

  const newRelativePath = `uploads/archivo-contable/${cia}/${year}/Causaciones/${month}/${newFileName}`;
  console.log(`📂 FV causada movida: ${newRelativePath}`);

  return { newRelativePath, newFileName };
}

module.exports = {
  moveToSinCausar,
  moveToCausado,
  S_DRIVE_BASE,
  ARCHIVO_CONTABLE_BASE
};
