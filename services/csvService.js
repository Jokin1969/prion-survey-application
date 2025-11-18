import fs from 'fs';
import { promisify } from 'util';

const readFile = promisify(fs.readFile);

/**
 * Parse CSV file and return array of objects
 * @param {string} filePath - Path to CSV file
 * @returns {Promise<Array>} Array of parsed CSV rows
 */
export async function readCSV(filePath) {
  try {
    const fileContent = await readFile(filePath, 'utf-8');
    const lines = fileContent.split('\n').filter(line => line.trim());

    if (lines.length === 0) {
      return [];
    }

    const headers = lines[0].split(',').map(h => h.trim());
    const data = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (values.length === headers.length) {
        const row = {};
        headers.forEach((header, index) => {
          row[header] = values[index].trim();
        });
        data.push(row);
      }
    }

    return data;
  } catch (error) {
    console.error(`Error reading CSV file ${filePath}:`, error.message);
    throw new Error(`Failed to read CSV file: ${error.message}`);
  }
}

/**
 * Parse a CSV line handling quoted values
 * @param {string} line - CSV line to parse
 * @returns {Array<string>} Array of values
 */
function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current);
  return values;
}

/**
 * Search individuals by query string
 * @param {Array} individuals - Array of individual objects
 * @param {string} query - Search query
 * @returns {Array} Filtered array of individuals
 */
export function searchIndividuals(individuals, query) {
  if (!query || query.trim() === '') {
    return individuals;
  }

  const searchTerm = query.toLowerCase().trim();

  return individuals.filter(individual => {
    // Search across all fields
    return Object.values(individual).some(value => {
      if (value === null || value === undefined) return false;
      return String(value).toLowerCase().includes(searchTerm);
    });
  });
}

/**
 * Sort individuals by field
 * @param {Array} individuals - Array of individual objects
 * @param {string} field - Field to sort by
 * @param {string} direction - Sort direction ('asc' or 'desc')
 * @returns {Array} Sorted array of individuals
 */
export function sortIndividuals(individuals, field, direction = 'asc') {
  return [...individuals].sort((a, b) => {
    let aVal = a[field] || '';
    let bVal = b[field] || '';

    // Try to parse as numbers if possible
    const aNum = parseFloat(aVal);
    const bNum = parseFloat(bVal);

    if (!isNaN(aNum) && !isNaN(bNum)) {
      return direction === 'asc' ? aNum - bNum : bNum - aNum;
    }

    // String comparison
    aVal = String(aVal).toLowerCase();
    bVal = String(bVal).toLowerCase();

    if (direction === 'asc') {
      return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    } else {
      return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
    }
  });
}

/**
 * Load credentials from CSV file
 * @param {string} filePath - Path to credentials CSV
 * @returns {Promise<Array>} Array of credential objects
 */
export async function loadCredentials(filePath) {
  try {
    return await readCSV(filePath);
  } catch (error) {
    console.error('Error loading credentials:', error.message);
    return [];
  }
}

/**
 * Authenticate user
 * @param {Array} credentials - Array of credential objects
 * @param {string} username - Username
 * @param {string} password - Password
 * @returns {Object|null} User object if authenticated, null otherwise
 */
export function authenticateUser(credentials, username, password) {
  const user = credentials.find(
    cred => cred.user === username && cred.password === password
  );

  if (user) {
    // Remove password from returned object
    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  return null;
}
