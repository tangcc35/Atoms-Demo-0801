const API_URL = '/api'; // Use relative path for Vercel

let currentAuthMode = 'login';
let token = localStorage.getItem('token');

// DOM Elements
const authSection = document.getElementById('auth-section');
const dashboardSection = document.getElementById('dashboard-section');
const authForm = document.getElementById('auth-form');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const authError = document.getElementById('auth-error');
const itemsList = document.getElementById('items-list');
const suggestionBox = document.getElementById('suggestion-result');
const suggestionMsg = document.getElementById('suggestion-msg');
const suggestionLink = document.getElementById('suggestion-link');

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    if (token) {
        showDashboard();
    }
});

function switchAuthTab(mode) {
    currentAuthMode = mode;
    document.getElementById('tab-login').classList.toggle('active', mode === 'login');
    document.getElementById('tab-register').classList.toggle('active', mode === 'register');
    authSubmitBtn.textContent = mode === 'login' ? 'Login' : 'Register';
    authError.textContent = '';
}

async function handleAuth(e) {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    authError.textContent = '';
    
    try {
        if (currentAuthMode === 'register') {
            const res = await fetch(`${API_URL}/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            
            if (!res.ok) throw new Error(data.detail || 'Registration failed');
            
            // Switch to login after successful registration
            switchAuthTab('login');
            authError.style.color = '#10b981';
            authError.textContent = 'Registration successful! Please login.';
            setTimeout(() => { authError.style.color = 'var(--danger-color)'; authError.textContent = ''; }, 3000);
            
        } else {
            // Login uses OAuth2 Form Data format in FastAPI
            const formData = new URLSearchParams();
            formData.append('username', username);
            formData.append('password', password);
            
            const res = await fetch(`${API_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: formData
            });
            const data = await res.json();
            
            if (!res.ok) throw new Error(data.detail || 'Login failed');
            
            token = data.access_token;
            localStorage.setItem('token', token);
            showDashboard();
        }
    } catch (err) {
        authError.textContent = err.message;
    }
}

function logout() {
    token = null;
    localStorage.removeItem('token');
    authSection.classList.remove('hidden');
    dashboardSection.classList.add('hidden');
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
    suggestionBox.classList.add('hidden');
}

async function showDashboard() {
    authSection.classList.add('hidden');
    dashboardSection.classList.remove('hidden');
    fetchItems();
}

async function handleAddItem(e) {
    e.preventDefault();
    const input = document.getElementById('new-item-name');
    const itemName = input.value.trim();
    if (!itemName) return;
    
    try {
        const res = await fetch(`${API_URL}/items`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ item_name: itemName })
        });
        
        if (res.status === 401) return logout();
        
        input.value = '';
        fetchItems();
        // Hide suggestion if it's open, to encourage recalculation
        suggestionBox.classList.add('hidden');
    } catch (err) {
        console.error('Error adding item', err);
    }
}

async function fetchItems() {
    try {
        const res = await fetch(`${API_URL}/items`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (res.status === 401) return logout();
        const items = await res.json();
        
        itemsList.innerHTML = '';
        
        if (items.length === 0) {
            itemsList.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 20px;">You haven\'t lost anything yet. Great job!</p>';
            return;
        }
        
        items.forEach(item => {
            const date = new Date(item.lost_date).toLocaleDateString(undefined, {
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
            });
            
            const li = document.createElement('li');
            li.className = 'item-card';
            li.innerHTML = `
                <span class="item-name">${item.item_name}</span>
                <span class="item-date">${date}</span>
            `;
            itemsList.appendChild(li);
        });
    } catch (err) {
        console.error('Error fetching items', err);
    }
}

async function getPurchaseSuggestion() {
    try {
        const res = await fetch(`${API_URL}/purchase-suggestion`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (res.status === 401) return logout();
        const data = await res.json();
        
        suggestionBox.classList.remove('hidden');
        suggestionMsg.textContent = data.message;
        
        if (data.link) {
            suggestionLink.style.display = 'inline-block';
            suggestionLink.href = data.link;
        } else {
            suggestionLink.style.display = 'none';
        }
    } catch (err) {
        console.error('Error getting suggestion', err);
    }
}
