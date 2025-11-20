// Application State
const state = {
    user: null,
    individuals: [],
    filteredIndividuals: [],
    translations: {},
    currentLang: 'es',
    sortField: null,
    sortDirection: 'asc'
};

// Field definitions for table columns
const FIELDS = [
    'id', 'id_osakidetza', 'id_clinic', 'name', 'last_names',
    'dni', 'birth_date', 'age', 'gender', 'prion_disease',
    'mutation', 'death_date', 'symptoms', 'samples'
];

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

async function initializeApp() {
    try {
        // Load translations
        await loadTranslations();

        // Check if user is already logged in
        const user = await checkAuth();
        if (user) {
            state.user = user;
            state.currentLang = user.lang || 'es';
            showApp();
        } else {
            showLogin();
        }

        // Setup event listeners
        setupEventListeners();
    } catch (error) {
        console.error('Initialization error:', error);
        showLogin();
    }
}

// Load translations from server
async function loadTranslations() {
    try {
        const response = await fetch('/api/translations');
        const data = await response.json();
        if (data.success) {
            state.translations = data.translations;
        }
    } catch (error) {
        console.error('Error loading translations:', error);
    }
}

// Check if user is authenticated
async function checkAuth() {
    try {
        const response = await fetch('/api/user');
        if (response.ok) {
            const data = await response.json();
            return data.user;
        }
        return null;
    } catch (error) {
        return null;
    }
}

// Setup event listeners
function setupEventListeners() {
    // Login form
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    // Language selector
    const langSelect = document.getElementById('language');
    if (langSelect) {
        langSelect.addEventListener('change', (e) => {
            state.currentLang = e.target.value;
            updateLoginTexts();
        });
    }

    // Logout button
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }

    // Search input
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(handleSearch, 300));
    }

    // Clear search button
    const clearSearchBtn = document.getElementById('btn-clear-search');
    if (clearSearchBtn) {
        clearSearchBtn.addEventListener('click', clearSearch);
    }
}

// Handle login
async function handleLogin(e) {
    e.preventDefault();

    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const language = document.getElementById('language').value;

    const errorDiv = document.getElementById('login-error');
    errorDiv.textContent = '';

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (data.success) {
            state.user = data.user;
            state.currentLang = data.user.lang || language;
            showApp();
        } else {
            errorDiv.textContent = translate('login.error');
        }
    } catch (error) {
        console.error('Login error:', error);
        errorDiv.textContent = translate('login.error');
    }
}

// Handle logout
async function handleLogout() {
    try {
        await fetch('/api/logout', { method: 'POST' });
        state.user = null;
        state.individuals = [];
        state.filteredIndividuals = [];
        showLogin();
    } catch (error) {
        console.error('Logout error:', error);
    }
}

// Handle search
function handleSearch(e) {
    const query = e.target.value.trim().toLowerCase();

    if (!query) {
        state.filteredIndividuals = [...state.individuals];
    } else {
        state.filteredIndividuals = state.individuals.filter(individual => {
            return Object.values(individual).some(value => {
                if (value === null || value === undefined) return false;
                return String(value).toLowerCase().includes(query);
            });
        });
    }

    renderTable();
    updateSearchResultsCount();
}

// Clear search
function clearSearch() {
    const searchInput = document.getElementById('search-input');
    searchInput.value = '';
    state.filteredIndividuals = [...state.individuals];
    renderTable();
    updateSearchResultsCount();
}

// Load individuals data
async function loadIndividuals() {
    showLoading();

    try {
        const response = await fetch('/api/individuals');
        const data = await response.json();

        if (data.success) {
            state.individuals = data.data;
            state.filteredIndividuals = [...data.data];
            renderTable();
            updateSearchResultsCount();
        } else {
            showNoResults();
        }
    } catch (error) {
        console.error('Error loading individuals:', error);
        showNoResults();
    } finally {
        hideLoading();
    }
}

// Render table
function renderTable() {
    const tableHeaders = document.getElementById('table-headers');
    const tableBody = document.getElementById('table-body');

    // Clear existing content
    tableHeaders.innerHTML = '';
    tableBody.innerHTML = '';

    if (state.filteredIndividuals.length === 0) {
        showNoResults();
        return;
    }

    hideNoResults();

    // Render headers
    FIELDS.forEach(field => {
        const th = document.createElement('th');
        th.textContent = translate(`table.${field}`);
        th.dataset.field = field;
        th.classList.add('sortable');

        if (state.sortField === field) {
            th.classList.add(state.sortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
        }

        th.addEventListener('click', () => handleSort(field));
        tableHeaders.appendChild(th);
    });

    // Add ID CI header
    const thCI = document.createElement('th');
    thCI.textContent = 'ID CI';
    thCI.classList.add('th-ci');
    tableHeaders.appendChild(thCI);

    // Add ID Familia header
    const thFamily = document.createElement('th');
    thFamily.textContent = 'ID Familia';
    thFamily.classList.add('th-family');
    tableHeaders.appendChild(thFamily);

    // Render rows
    state.filteredIndividuals.forEach(individual => {
        const tr = document.createElement('tr');

        FIELDS.forEach(field => {
            const td = document.createElement('td');
            let value = individual[field] || '';

            // Special formatting
            if (field === 'id' || field === 'id_osakidetza') {
                td.classList.add('cell-id');
            } else if (field === 'samples') {
                if (value.toLowerCase() === 'yes' || value.toLowerCase() === 'sí') {
                    td.classList.add('cell-samples-yes');
                    value = '✓';
                } else {
                    td.classList.add('cell-samples-no');
                    value = '—';
                }
            } else if (field === 'gender') {
                value = translate(`gender.${value}`) || value;
            }

            // Check if value is a URL
            if (isURL(value)) {
                const link = document.createElement('a');
                link.href = value;
                link.textContent = value;
                link.target = '_blank';
                link.classList.add('cell-link');
                td.appendChild(link);
            } else {
                td.textContent = value;
            }

            tr.appendChild(td);
        });

        // Add ID CI cell
        const tdCI = document.createElement('td');
        tdCI.classList.add('td-ci');
        renderCICell(tdCI, individual);
        tr.appendChild(tdCI);

        // Add ID Familia cell
        const tdFamily = document.createElement('td');
        tdFamily.classList.add('td-family');
        renderFamilyCell(tdFamily, individual);
        tr.appendChild(tdFamily);

        tableBody.appendChild(tr);
    });
}

// Handle sorting
function handleSort(field) {
    if (state.sortField === field) {
        // Toggle direction
        state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        state.sortField = field;
        state.sortDirection = 'asc';
    }

    sortIndividuals();
    renderTable();
}

// Sort individuals
function sortIndividuals() {
    state.filteredIndividuals.sort((a, b) => {
        let aVal = a[state.sortField] || '';
        let bVal = b[state.sortField] || '';

        // Try to parse as numbers
        const aNum = parseFloat(aVal);
        const bNum = parseFloat(bVal);

        if (!isNaN(aNum) && !isNaN(bNum)) {
            return state.sortDirection === 'asc' ? aNum - bNum : bNum - aNum;
        }

        // String comparison
        aVal = String(aVal).toLowerCase();
        bVal = String(bVal).toLowerCase();

        if (state.sortDirection === 'asc') {
            return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        } else {
            return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
        }
    });
}

// Update search results count
function updateSearchResultsCount() {
    const countDiv = document.getElementById('search-results-count');
    const count = state.filteredIndividuals.length;
    const total = state.individuals.length;

    if (count === total) {
        countDiv.textContent = `${count} ${translate('search.results')}`;
    } else {
        countDiv.textContent = `${count} / ${total} ${translate('search.results')}`;
    }
}

// Show/hide screens
function showLogin() {
    document.getElementById('login-screen').classList.add('active');
    document.getElementById('app-screen').classList.remove('active');
    updateLoginTexts();
}

function showApp() {
    document.getElementById('login-screen').classList.remove('active');
    document.getElementById('app-screen').classList.add('active');
    updateAppTexts();
    loadIndividuals();
}

// Update UI texts
function updateLoginTexts() {
    document.getElementById('login-title').textContent = translate('app.title');
    document.getElementById('login-subtitle').textContent = translate('app.subtitle');
    document.getElementById('label-username').textContent = translate('login.username');
    document.getElementById('label-password').textContent = translate('login.password');
    document.getElementById('label-language').textContent = translate('login.language');
    document.getElementById('btn-login').textContent = translate('login.submit');
}

function updateAppTexts() {
    document.getElementById('app-title').textContent = translate('app.title');
    document.getElementById('btn-logout').textContent = translate('nav.logout');

    const searchInput = document.getElementById('search-input');
    searchInput.placeholder = translate('search.placeholder');

    const userInfo = document.getElementById('user-info');
    if (state.user) {
        userInfo.textContent = `${translate('login.welcome')}, ${state.user.full_name}`;
    }
}

// Translation helper
function translate(key) {
    const keys = key.split('.');
    let value = state.translations[state.currentLang];

    for (const k of keys) {
        if (value && typeof value === 'object' && k in value) {
            value = value[k];
        } else {
            return key;
        }
    }

    return value || key;
}

// Render CI cell with upload/download functionality
async function renderCICell(td, individual) {
    const idOsakidetza = individual.id_osakidetza;
    const idCi = individual.id_ci;

    if (!idOsakidetza) {
        td.textContent = '—';
        return;
    }

    // Check if document exists (using id_osakidetza as filename)
    try {
        const response = await fetch(`/api/check-document/${idOsakidetza}?docType=CI`, {
            credentials: 'same-origin'
        });
        const data = await response.json();

        // Update cache
        state.documentStatus[idOsakidetza] = data.success && data.exists;

        if (data.success && data.exists) {
            // Document exists - show link and delete button
            const container = document.createElement('div');
            container.classList.add('ci-container');

            const link = document.createElement('a');
            link.href = data.url;
            link.textContent = idCi; // Display CI ID in the UI
            link.target = '_blank';
            link.classList.add('ci-link', 'ci-has-file');
            container.appendChild(link);

            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = '🗑️';
            deleteBtn.classList.add('ci-delete-btn');
            deleteBtn.title = translate('documents.delete');
            deleteBtn.onclick = (e) => {
                e.preventDefault();
                handleCIDelete(idOsakidetza, td, individual);
            };
            container.appendChild(deleteBtn);

            td.appendChild(container);
        } else {
            // No document - show upload button
            const uploadBtn = document.createElement('button');
            uploadBtn.textContent = translate('documents.noFile');
            uploadBtn.classList.add('ci-upload-btn', 'ci-no-file');
            uploadBtn.title = translate('documents.upload');
            uploadBtn.onclick = () => handleCIUpload(idOsakidetza, td, individual);
            td.appendChild(uploadBtn);
        }
    } catch (error) {
        console.error('Error checking document:', error);
        td.textContent = translate('documents.noFile');
        td.classList.add('ci-no-file');
    }
}

// Handle CI document upload
async function handleCIUpload(idOsakidetza, td, individual) {
    // Create file input
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.pdf,.jpg,.jpeg,.png,.doc,.docx';
    fileInput.style.display = 'none';

    fileInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Show uploading state
        td.innerHTML = `<span class="ci-uploading">${translate('documents.uploading')}</span>`;

        try {
            const formData = new FormData();
            formData.append('document', file);
            formData.append('filename', idOsakidetza);
            formData.append('docType', 'CI');

            const response = await fetch(`/api/upload-document`, {
                method: 'POST',
                credentials: 'same-origin',
                body: formData
            });

            const data = await response.json();

            if (data.success) {
                // Update cache - document now exists
                state.documentStatus[idOsakidetza] = true;

                // Re-render the cell with the new document
                td.innerHTML = '';
                await renderCICell(td, individual);
            } else {
                alert(translate('documents.uploadError'));
                td.innerHTML = '';
                await renderCICell(td, individual);
            }
        } catch (error) {
            console.error('Upload error:', error);
            alert(translate('documents.uploadError'));
            td.innerHTML = '';
            await renderCICell(td, individual);
        }
    };

    fileInput.click();
}

// Handle CI document delete
async function handleCIDelete(idOsakidetza, td, individual) {
    if (!confirm(translate('documents.deleteConfirm'))) {
        return;
    }

    // Show deleting state
    td.innerHTML = `<span class="ci-uploading">Eliminando...</span>`;

    try {
        console.log(`🗑️ Starting delete for: ${idOsakidetza}`);

        const response = await fetch(`/api/delete-document/${idOsakidetza}?docType=CI`, {
            method: 'DELETE',
            credentials: 'same-origin'
        });

        console.log(`📡 Delete response status: ${response.status}`);

        // Check if response is ok (status 200-299)
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('Delete failed:', response.status, errorData);
            throw new Error(errorData.error || `Server error: ${response.status}`);
        }

        const data = await response.json();
        console.log(`📦 Delete response data:`, data);

        if (data.success) {
            // Update cache - document no longer exists
            state.documentStatus[idOsakidetza] = false;

            // Re-render the cell without the document
            td.innerHTML = '';
            await renderCICell(td, individual);

            console.log(`✅ Document deleted successfully: ${idOsakidetza}`);
        } else {
            throw new Error('Delete failed - no success response');
        }
    } catch (error) {
        console.error('❌ Delete error:', error);
        alert(`${translate('documents.deleteError')}\n\nError: ${error.message}`);

        // Re-render properly instead of using innerHTML (which loses event handlers)
        td.innerHTML = '';
        await renderCICell(td, individual);
    }
}

// ============ ID FAMILIA (IK) FUNCTIONS ============

// Render ID Familia cell with upload/download functionality for .svg files
async function renderFamilyCell(td, individual) {
    const idOsakidetza = individual.id_osakidetza;
    console.log(`🌳 renderFamilyCell called for: ${idOsakidetza}`, individual);

    if (!idOsakidetza) {
        console.log(`⚠️ No idOsakidetza found`);
        td.textContent = '—';
        return;
    }

    // First, get the IK code for this TXPR
    try {
        console.log(`📡 Fetching TXPR->IK mapping for: ${idOsakidetza}`);
        const mappingResponse = await fetch(`/api/txpr-ik-mapping/${idOsakidetza}`, {
            credentials: 'same-origin'
        });

        console.log(`📡 Mapping response status: ${mappingResponse.status}`);

        if (!mappingResponse.ok) {
            console.log(`✗ No mapping found for ${idOsakidetza}`);
            td.textContent = 'No mapping';
            return;
        }

        const mappingData = await mappingResponse.json();
        console.log(`📦 Mapping data received:`, mappingData);
        const ikCode = mappingData.ik;
        console.log(`✓ IK code for ${idOsakidetza}: ${ikCode}`);

        // Now check if the IK document exists
        console.log(`📡 Checking if IK document exists: ${ikCode}`);
        const response = await fetch(`/api/check-document/${ikCode}?docType=IK`, {
            credentials: 'same-origin'
        });
        const data = await response.json();
        console.log(`📦 Check document response:`, data);

        // Update cache
        state.documentStatus[`${idOsakidetza}_family`] = data.success && data.exists;

        if (data.success && data.exists) {
            // Document exists - show link and delete button
            const container = document.createElement('div');
            container.classList.add('ci-container');

            const link = document.createElement('a');
            link.href = data.url;
            link.textContent = ikCode;
            link.target = '_blank';
            link.classList.add('ci-link', 'ci-has-file');
            container.appendChild(link);

            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = '🗑️';
            deleteBtn.classList.add('ci-delete-btn');
            deleteBtn.title = translate('documents.delete');
            deleteBtn.onclick = (e) => {
                e.preventDefault();
                handleFamilyDelete(ikCode, td, individual);
            };
            container.appendChild(deleteBtn);

            td.appendChild(container);
        } else {
            // No document - show upload button
            const uploadBtn = document.createElement('button');
            uploadBtn.textContent = translate('documents.noFile');
            uploadBtn.classList.add('ci-upload-btn', 'ci-no-file');
            uploadBtn.title = translate('documents.upload');
            uploadBtn.onclick = () => handleFamilyUpload(ikCode, td, individual);
            td.appendChild(uploadBtn);
        }
    } catch (error) {
        console.error('Error checking family document:', error);
        td.textContent = 'Error';
    }
}

// Handle ID Familia document upload (.svg)
async function handleFamilyUpload(ikCode, td, individual) {
    // Create file input
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.svg';
    fileInput.style.display = 'none';

    fileInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Show uploading state
        td.innerHTML = `<span class="ci-uploading">${translate('documents.uploading')}</span>`;

        try {
            const formData = new FormData();
            formData.append('document', file);
            formData.append('filename', ikCode);
            formData.append('docType', 'IK');

            const response = await fetch(`/api/upload-document`, {
                method: 'POST',
                credentials: 'same-origin',
                body: formData
            });

            const data = await response.json();

            if (data.success) {
                // Update cache - document now exists
                state.documentStatus[`${individual.id_osakidetza}_family`] = true;

                // Re-render the cell with the new document
                td.innerHTML = '';
                await renderFamilyCell(td, individual);
            } else {
                alert(translate('documents.uploadError'));
                td.innerHTML = '';
                await renderFamilyCell(td, individual);
            }
        } catch (error) {
            console.error('Upload error:', error);
            alert(translate('documents.uploadError'));
            td.innerHTML = '';
            await renderFamilyCell(td, individual);
        }
    };

    fileInput.click();
}

// Handle ID Familia document delete
async function handleFamilyDelete(ikCode, td, individual) {
    if (!confirm(translate('documents.deleteConfirm'))) {
        return;
    }

    // Show deleting state
    td.innerHTML = `<span class="ci-uploading">Eliminando...</span>`;

    try {
        console.log(`🗑️ Starting delete for IK: ${ikCode}`);

        const response = await fetch(`/api/delete-document/${ikCode}?docType=IK`, {
            method: 'DELETE',
            credentials: 'same-origin'
        });

        console.log(`📡 Delete response status: ${response.status}`);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('Delete failed:', response.status, errorData);
            throw new Error(errorData.error || `Server error: ${response.status}`);
        }

        const data = await response.json();
        console.log(`📦 Delete response data:`, data);

        if (data.success) {
            // Update cache - document no longer exists
            state.documentStatus[`${individual.id_osakidetza}_family`] = false;

            // Re-render the cell without the document
            td.innerHTML = '';
            await renderFamilyCell(td, individual);

            console.log(`✅ Document deleted successfully: ${ikCode}`);
        } else {
            throw new Error('Delete failed - no success response');
        }
    } catch (error) {
        console.error('❌ Delete error:', error);
        alert(`${translate('documents.deleteError')}\n\nError: ${error.message}`);

        // Re-render properly instead of using innerHTML (which loses event handlers)
        td.innerHTML = '';
        await renderFamilyCell(td, individual);
    }
}

// Utility functions
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function isURL(str) {
    try {
        const url = new URL(str);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

function showLoading() {
    document.getElementById('loading').classList.remove('hidden');
}

function hideLoading() {
    document.getElementById('loading').classList.add('hidden');
}

function showNoResults() {
    document.getElementById('no-results').classList.remove('hidden');
}

function hideNoResults() {
    document.getElementById('no-results').classList.add('hidden');
}
