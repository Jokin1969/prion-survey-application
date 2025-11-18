import { Dropbox } from 'dropbox';
import fs from 'fs';
import path from 'path';

const DROPBOX_APP_KEY = process.env.DROPBOX_APP_KEY;
const DROPBOX_APP_SECRET = process.env.DROPBOX_APP_SECRET;
const DROPBOX_REFRESH_TOKEN = process.env.DROPBOX_REFRESH_TOKEN;
const DROPBOX_BASE_FOLDER = '/ConnectingPrion/documents';
const DROPBOX_FOLDER_CI = `${DROPBOX_BASE_FOLDER}/CI`;  // Para documentos CI (PDF)
const DROPBOX_FOLDER_IK = `${DROPBOX_BASE_FOLDER}/IK`;  // Para árboles familiares (SVG)

let dbx = null;

/**
 * Initialize Dropbox client
 * The Dropbox SDK automatically handles token refresh with clientId, clientSecret, and refreshToken
 */
function initDropbox() {
  if (!DROPBOX_APP_KEY || !DROPBOX_APP_SECRET || !DROPBOX_REFRESH_TOKEN) {
    console.warn('⚠️  Dropbox OAuth not configured - documents will be stored locally only');
    console.warn('   Missing: DROPBOX_APP_KEY, DROPBOX_APP_SECRET, or DROPBOX_REFRESH_TOKEN');
    return false;
  }

  // Create Dropbox instance if it doesn't exist
  // The SDK will automatically refresh the access token when needed
  if (!dbx) {
    try {
      dbx = new Dropbox({
        clientId: DROPBOX_APP_KEY,
        clientSecret: DROPBOX_APP_SECRET,
        refreshToken: DROPBOX_REFRESH_TOKEN
      });
      console.log('✅ Dropbox client initialized (auto-refresh enabled)');
    } catch (error) {
      console.error('❌ Error initializing Dropbox client:', error);
      return false;
    }
  }

  return true;
}

/**
 * Upload a file to Dropbox
 * @param {string} localFilePath - Path to local file
 * @param {string} filename - Filename to use (e.g., TXPR001 or IK0002)
 * @param {string} subfolder - Subfolder: 'CI' or 'IK' (default: 'CI')
 * @returns {Promise<Object>} Upload result with Dropbox path and share URL
 */
export async function uploadToDropbox(localFilePath, filename, subfolder = 'CI') {
  if (!initDropbox()) {
    throw new Error('Dropbox not configured');
  }

  try {
    const fileContent = fs.readFileSync(localFilePath);
    const ext = path.extname(localFilePath);
    const targetFolder = subfolder === 'IK' ? DROPBOX_FOLDER_IK : DROPBOX_FOLDER_CI;
    const dropboxPath = `${targetFolder}/${filename}${ext}`;

    // Upload file
    const uploadResult = await dbx.filesUpload({
      path: dropboxPath,
      contents: fileContent,
      mode: 'overwrite', // Overwrite if exists
      autorename: false
    });

    console.log(`✅ Uploaded to Dropbox: ${dropboxPath}`);

    // Get shareable link - use temporary link (most reliable, valid for 4 hours)
    let shareUrl;
    try {
      const tempLink = await dbx.filesGetTemporaryLink({ path: dropboxPath });
      shareUrl = tempLink.result.link;
      console.log(`✅ Got temporary link for ${dropboxPath}`);
    } catch (tempError) {
      console.warn('Could not get temporary link, trying shared link:', tempError.message);

      // Fallback to shared link
      try {
        const sharedLinks = await dbx.sharingListSharedLinks({
          path: dropboxPath,
          direct_only: true
        });

        if (sharedLinks.result.links.length > 0) {
          shareUrl = sharedLinks.result.links[0].url;
        } else {
          const shareResult = await dbx.sharingCreateSharedLinkWithSettings({
            path: dropboxPath,
            settings: {
              requested_visibility: 'public',
              audience: 'public',
              access: 'viewer'
            }
          });
          shareUrl = shareResult.result.url;
        }

        // Convert preview URL to direct download URL
        if (shareUrl && shareUrl.includes('?dl=0')) {
          shareUrl = shareUrl.replace('?dl=0', '?dl=1');
        }
      } catch (shareError) {
        console.error('Could not get any link for file:', shareError.message);
        shareUrl = `https://www.dropbox.com/preview${dropboxPath}`;
      }
    }

    return {
      success: true,
      dropboxPath: uploadResult.result.path_display,
      shareUrl: shareUrl,
      size: uploadResult.result.size
    };
  } catch (error) {
    console.error('Error uploading to Dropbox:', error);
    throw error;
  }
}

/**
 * Check if a document exists in Dropbox
 * @param {string} filename - Filename to check (e.g., TXPR001 or IK0002)
 * @param {string} subfolder - Subfolder: 'CI' or 'IK' (default: 'CI')
 * @returns {Promise<Object>} Result with exists flag and share URL if found
 */
export async function checkDocumentInDropbox(filename, subfolder = 'CI') {
  if (!initDropbox()) {
    return { exists: false };
  }

  try {
    // Search in both locations (new subfolder and old documents folder for transition)
    const foldersToCheck = subfolder === 'IK'
      ? [
          '/ConnectingPrion/documents/IK',      // Nueva ubicación IK
          '/ConnectingPrion/documents'          // Ubicación antigua (para migración)
        ]
      : [
          '/ConnectingPrion/documents/CI',      // Nueva ubicación CI
          '/ConnectingPrion/documents'          // Ubicación antigua (para migración)
        ];

    let file = null;

    for (const folder of foldersToCheck) {
      try {
        const searchResult = await dbx.filesListFolder({ path: folder });

        const foundFile = searchResult.result.entries.find(entry => {
          const fileName = path.parse(entry.name).name;
          return fileName === filename;
        });

        if (foundFile) {
          file = foundFile;
          console.log(`📁 Found file in: ${folder}`);
          break; // Found it, stop searching
        }
      } catch (folderError) {
        // Folder might not exist, continue to next
        continue;
      }
    }

    if (!file) {
      return { exists: false };
    }

    // Get shareable link - use temporary link (most reliable)
    let shareUrl;
    try {
      const tempLink = await dbx.filesGetTemporaryLink({ path: file.path_display });
      shareUrl = tempLink.result.link;
    } catch (tempError) {
      console.warn('Could not get temporary link, trying shared link:', tempError.message);

      // Fallback to shared link
      try {
        const sharedLinks = await dbx.sharingListSharedLinks({
          path: file.path_display,
          direct_only: true
        });

        if (sharedLinks.result.links.length > 0) {
          shareUrl = sharedLinks.result.links[0].url;
        } else {
          const shareResult = await dbx.sharingCreateSharedLinkWithSettings({
            path: file.path_display,
            settings: {
              requested_visibility: 'public',
              audience: 'public',
              access: 'viewer'
            }
          });
          shareUrl = shareResult.result.url;
        }

        // Convert preview URL to direct download URL
        if (shareUrl && shareUrl.includes('?dl=0')) {
          shareUrl = shareUrl.replace('?dl=0', '?dl=1');
        }
      } catch (shareError) {
        console.error('Could not get any link for file:', shareError.message);
        shareUrl = `https://www.dropbox.com/preview${file.path_display}`;
      }
    }

    return {
      exists: true,
      filename: file.name,
      shareUrl: shareUrl,
      dropboxPath: file.path_display
    };
  } catch (error) {
    if (error.status === 409) {
      // Folder doesn't exist yet
      return { exists: false };
    }
    console.error('Error checking document in Dropbox:', error);
    throw error;
  }
}

/**
 * Delete a document from Dropbox
 * @param {string} filename - Filename to delete (e.g., TXPR001 or IK0002)
 * @param {string} subfolder - Subfolder: 'CI' or 'IK' (default: 'CI')
 * @returns {Promise<Object>} Result of deletion
 */
export async function deleteFromDropbox(filename, subfolder = 'CI') {
  if (!initDropbox()) {
    throw new Error('Dropbox not configured');
  }

  try {
    // Search in both locations (new subfolder and old documents folder for transition)
    const foldersToCheck = subfolder === 'IK'
      ? [
          '/ConnectingPrion/documents/IK',      // Nueva ubicación IK
          '/ConnectingPrion/documents'          // Ubicación antigua (para migración)
        ]
      : [
          '/ConnectingPrion/documents/CI',      // Nueva ubicación CI
          '/ConnectingPrion/documents'          // Ubicación antigua (para migración)
        ];

    let fileToDelete = null;

    for (const folder of foldersToCheck) {
      try {
        const searchResult = await dbx.filesListFolder({ path: folder });

        const file = searchResult.result.entries.find(entry => {
          const fileName = path.parse(entry.name).name;
          return fileName === filename;
        });

        if (file) {
          fileToDelete = file;
          console.log(`📁 Found file in: ${folder}`);
          break; // Found it, stop searching
        }
      } catch (folderError) {
        // Folder might not exist, continue to next
        continue;
      }
    }

    if (!fileToDelete) {
      const folderType = subfolder === 'IK' ? 'IK' : 'CI';
      throw new Error(`File not found in Dropbox (checked both ${folderType} and documents folders)`);
    }

    // Delete the file
    await dbx.filesDeleteV2({
      path: fileToDelete.path_display
    });

    console.log(`✅ Deleted from Dropbox: ${fileToDelete.path_display}`);

    return {
      success: true,
      message: 'File deleted from Dropbox',
      path: fileToDelete.path_display
    };
  } catch (error) {
    console.error('Error deleting from Dropbox:', error);
    throw error;
  }
}

/**
 * Ensure Dropbox folders exist (creates nested folders if needed)
 * Creates both CI and IK subfolders
 */
export async function ensureDropboxFolder() {
  if (!initDropbox()) {
    return false;
  }

  const foldersToCreate = [DROPBOX_FOLDER_CI, DROPBOX_FOLDER_IK];

  for (const folderPath of foldersToCreate) {
    try {
      await dbx.filesGetMetadata({ path: folderPath });
      console.log(`✅ Dropbox folder exists: ${folderPath}`);
    } catch (error) {
      if (error.status === 409) {
        // Folder doesn't exist, create it (including parent folders)
        try {
          // Split path and create each folder level
          const pathParts = folderPath.split('/').filter(p => p);
          let currentPath = '';

          for (const part of pathParts) {
            currentPath += `/${part}`;

            try {
              await dbx.filesGetMetadata({ path: currentPath });
              console.log(`  ✅ Folder exists: ${currentPath}`);
            } catch (checkError) {
              if (checkError.status === 409) {
                // Folder doesn't exist, create it
                await dbx.filesCreateFolderV2({ path: currentPath });
                console.log(`  ✅ Created folder: ${currentPath}`);
              }
            }
          }

          console.log(`✅ Dropbox folder structure ready: ${folderPath}`);
        } catch (createError) {
          console.error('Error creating Dropbox folder:', createError);
          return false;
        }
      } else {
        console.error('Error checking Dropbox folder:', error);
        return false;
      }
    }
  }

  return true;
}

/**
 * Validate Dropbox configuration and connection
 */
export async function validateDropboxToken() {
  try {
    if (!initDropbox()) {
      return {
        valid: false,
        error: 'Dropbox not configured',
        needsAction: 'Configure DROPBOX_APP_KEY, DROPBOX_APP_SECRET, and DROPBOX_REFRESH_TOKEN in Railway'
      };
    }

    // Try to get account information
    const accountInfo = await dbx.usersGetCurrentAccount();

    return {
      valid: true,
      message: 'Dropbox token valid and working correctly',
      account: {
        name: accountInfo.result.name.display_name,
        email: accountInfo.result.email,
        accountId: accountInfo.result.account_id
      }
    };
  } catch (error) {
    let needsAction = 'Regenerate Dropbox OAuth tokens';
    let errorDetails = error.message;

    if (error.status === 401) {
      errorDetails = 'Token expired, revoked, or invalid';
      needsAction = 'Regenerate OAuth tokens at https://www.dropbox.com/developers/apps';
    } else if (error.status === 429) {
      errorDetails = 'Rate limit exceeded';
      needsAction = 'Wait a few minutes and try again';
    }

    return {
      valid: false,
      error: errorDetails,
      needsAction: needsAction
    };
  }
}
