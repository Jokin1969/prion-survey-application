import { Dropbox } from 'dropbox';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Dropbox configuration
const DROPBOX_APP_KEY = process.env.DROPBOX_APP_KEY;
const DROPBOX_APP_SECRET = process.env.DROPBOX_APP_SECRET;
const DROPBOX_REFRESH_TOKEN = process.env.DROPBOX_REFRESH_TOKEN;
const DROPBOX_CSV_FOLDER = '/ConnectingPrion/databases';

/**
 * Download CSV files from Dropbox to local data folder
 */
export async function syncCSVFromDropbox() {
  // Check if Dropbox is configured
  if (!DROPBOX_APP_KEY || !DROPBOX_APP_SECRET || !DROPBOX_REFRESH_TOKEN) {
    console.warn('⚠️  Dropbox not configured for CSV sync - using local example files');
    return false;
  }

  console.log('📥 Syncing CSV files from Dropbox...');

  try {
    const dbx = new Dropbox({
      clientId: DROPBOX_APP_KEY,
      clientSecret: DROPBOX_APP_SECRET,
      refreshToken: DROPBOX_REFRESH_TOKEN
    });

    const dataDir = path.join(__dirname, '../data');

    // List of CSV files to download
    const csvFiles = [
      'credentials.csv',
      '1_individuals.csv',
      '2_individuals.csv',
      '3_individuals.csv',
      '4_individuals.csv',
      '5_individuals.csv',
      '6_individuals.csv',
      'TXPR_IK.csv'  // Mapeo de TXPR a códigos IK para árboles familiares
    ];

    let downloadedCount = 0;

    for (const fileName of csvFiles) {
      try {
        const dropboxPath = `${DROPBOX_CSV_FOLDER}/${fileName}`;
        const localPath = path.join(dataDir, fileName);

        console.log(`  📄 Downloading ${fileName}...`);

        // Download file from Dropbox
        const response = await dbx.filesDownload({ path: dropboxPath });

        // Write to local file
        fs.writeFileSync(localPath, response.result.fileBinary, 'binary');

        downloadedCount++;
        console.log(`  ✅ Downloaded ${fileName}`);
      } catch (fileError) {
        // If file doesn't exist in Dropbox, try to use example file
        if (fileError.error?.error_summary?.includes('not_found')) {
          console.warn(`  ⚠️  ${fileName} not found in Dropbox`);

          // Try to copy from example file
          const examplePath = path.join(dataDir, fileName.replace('.csv', '.example.csv'));
          const localPath = path.join(dataDir, fileName);

          if (fs.existsSync(examplePath) && !fs.existsSync(localPath)) {
            fs.copyFileSync(examplePath, localPath);
            console.log(`  📋 Using example file for ${fileName}`);
          }
        } else {
          console.error(`  ❌ Error downloading ${fileName}:`, fileError.message);
        }
      }
    }

    console.log(`✅ CSV sync complete - downloaded ${downloadedCount}/${csvFiles.length} files`);
    return true;

  } catch (error) {
    console.error('❌ Error syncing CSV files from Dropbox:', error.message);
    console.warn('⚠️  Falling back to local example files');
    return false;
  }
}

/**
 * Upload CSV file to Dropbox
 */
export async function uploadCSVToDropbox(fileName) {
  if (!DROPBOX_APP_KEY || !DROPBOX_APP_SECRET || !DROPBOX_REFRESH_TOKEN) {
    throw new Error('Dropbox not configured');
  }

  try {
    const dbx = new Dropbox({
      clientId: DROPBOX_APP_KEY,
      clientSecret: DROPBOX_APP_SECRET,
      refreshToken: DROPBOX_REFRESH_TOKEN
    });

    const dataDir = path.join(__dirname, '../data');
    const localPath = path.join(dataDir, fileName);

    if (!fs.existsSync(localPath)) {
      throw new Error(`File not found: ${fileName}`);
    }

    const fileContent = fs.readFileSync(localPath);
    const dropboxPath = `${DROPBOX_CSV_FOLDER}/${fileName}`;

    await dbx.filesUpload({
      path: dropboxPath,
      contents: fileContent,
      mode: 'overwrite'
    });

    console.log(`✅ Uploaded ${fileName} to Dropbox`);
    return true;

  } catch (error) {
    console.error(`❌ Error uploading ${fileName} to Dropbox:`, error.message);
    throw error;
  }
}
