const promptForm = document.getElementById('prompt-form');
const promptInput = document.getElementById('prompt-input');
const chatHistory = document.getElementById('chat-history');
const previewFrame = document.getElementById('preview-frame');
const codeDisplay = document.getElementById('code-display');
const loadingOverlay = document.getElementById('loading-overlay');
const generateBtn = document.getElementById('generate-btn');
const btnText = document.querySelector('.btn-text');
const btnLoader = document.querySelector('.btn-loader');
const tabs = document.querySelectorAll('.tab');

let currentCode = "";
let codeVersions = [];
let isCodeView = false;
let pendingDesignPlan = "";
let currentUser = localStorage.getItem('currentUser');

// We will load user data dynamically based on login state


// Initialize preview with some default content
const initialContent = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { margin: 0; font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background: #f9fafb; color: #374151; }
        .empty-state { text-align: center; max-width: 400px; }
        h1 { font-size: 1.5rem; margin-bottom: 0.5rem; color: #111827; }
        p { color: #6b7280; line-height: 1.5; }
        .icon { font-size: 3rem; margin-bottom: 1rem; }
    </style>
</head>
<body>
    <div class="empty-state">
        <div class="icon">✨</div>
        <h1>Workspace Ready</h1>
        <p>Type a prompt on the left to start generating your interactive application.</p>
    </div>
</body>
</html>
`;
// initial preview set handled in loadUserData

promptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        promptForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    }
});

promptForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const prompt = promptInput.value.trim();
    if (!prompt) return;

    addMessageToChat('user', prompt);
    promptInput.value = '';

    // Remove old action buttons if any
    const oldBtns = document.querySelectorAll('.action-buttons');
    oldBtns.forEach(b => b.remove());

    if (pendingDesignPlan) {
        await requestDesign(prompt, pendingDesignPlan);
    } else {
        await requestDesign(prompt, "");
    }
});

async function requestDesign(prompt, previousPlan) {
    setLoading(true, "Designer agent is planning...");
    try {
        const response = await fetch('/api/design', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: prompt, current_plan: previousPlan, current_code: currentCode })
        });
        
        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Failed to generate design plan: ${response.status} ${errText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        pendingDesignPlan = "";
        
        const msgDiv = addMessageToChat('system', `<strong>Designer Agent:</strong>\n\n<span class="stream-content"></span>`);
        const streamContainer = msgDiv.querySelector('.stream-content');

        let buffer = "";
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                if (buffer.trim()) processDesignLine(buffer.trim(), streamContainer);
                break;
            }
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                if (line.trim()) processDesignLine(line.trim(), streamContainer);
            }
        }
        addActionButtons();
    } catch (e) {
        console.error('Design error:', e);
        addMessageToChat('system', `Error: ${e.message}. Please try again.`);
    } finally {
        setLoading(false);
    }
}

function processDesignLine(line, streamContainer) {
    try {
        const parsed = JSON.parse(line);
        if (parsed.error) {
            addMessageToChat('system', `❌ <strong>Error:</strong> ${parsed.error}`);
            setLoading(false);
            return;
        }
        if (parsed.chunk) {
            pendingDesignPlan += parsed.chunk;
            if (typeof marked !== 'undefined') {
                streamContainer.innerHTML = marked.parse(pendingDesignPlan);
            } else {
                streamContainer.innerHTML = pendingDesignPlan.replace(/\n/g, '<br>');
            }
            chatHistory.scrollTop = chatHistory.scrollHeight;
        }
    } catch(e) {}
}

function addActionButtons() {
    const btnDiv = document.createElement('div');
    btnDiv.className = 'message system-msg action-buttons';
    btnDiv.innerHTML = `
        <div class="content" style="background: transparent; border: none; display: flex; gap: 10px; padding: 0;">
            <button onclick="approveBuild()" class="primary-btn">Approve & Build</button>
            <span style="color: var(--text-secondary); font-size: 0.85rem; align-self: center;">Or type modifications below</span>
        </div>
    `;
    chatHistory.appendChild(btnDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

window.approveBuild = async function() {
    const btns = document.querySelectorAll('.action-buttons');
    btns.forEach(b => b.remove());

    addMessageToChat('user', "Looks good! Approve & Build.");
    
    setLoading(true, "Coder agent is reading the plan...");
    try {
        const response = await fetch('/api/build', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ design_plan: pendingDesignPlan, current_code: currentCode })
        });
        
        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Failed to build code: ${response.status} ${errText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        currentCode = "";

        let buffer = "";
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                if (buffer.trim()) processBuildLine(buffer.trim());
                break;
            }
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                if (line.trim()) processBuildLine(line.trim());
            }
        }
        
        // Clean markdown backticks if present
        let cleanCode = currentCode.trim();
        if (cleanCode.startsWith("```html")) cleanCode = cleanCode.substring(7);
        if (cleanCode.startsWith("```")) cleanCode = cleanCode.substring(3);
        if (cleanCode.endsWith("```")) cleanCode = cleanCode.substring(0, cleanCode.length - 3);
        
        currentCode = cleanCode.trim();
        updatePreview(currentCode);
        pendingDesignPlan = ""; // Reset for next project
        
        // Save version
        codeVersions.push({ time: new Date().toLocaleTimeString(), code: currentCode });
        if (currentUser) {
            localStorage.setItem(`codeVersions_${currentUser}`, JSON.stringify(codeVersions));
            localStorage.setItem(`currentCode_${currentUser}`, currentCode);
        }
        updateVersionSelect();
        
        addMessageToChat('system', 'Build and QA complete! Check out the live preview.');
    } catch (e) {
        console.error('Build error:', e);
        addMessageToChat('system', `Error: ${e.message}.`);
    } finally {
        setLoading(false);
    }
}

function processBuildLine(line) {
    try {
        const parsed = JSON.parse(line);
        if (parsed.error) {
            addMessageToChat('system', `❌ <strong>Error:</strong> ${parsed.error}`);
            setLoading(false);
            return;
        }
        if (parsed.status) {
            setLoading(true, parsed.status);
        }
        if (parsed.reset_code) {
            currentCode = "";
        }
        if (parsed.code_chunk) {
            currentCode += parsed.code_chunk;
            updateLiveCodeDisplay(currentCode);
        }
    } catch(e) {}
}

function updateLiveCodeDisplay(code) {
    let cleanCode = code.trim();
    if (cleanCode.startsWith("```html")) cleanCode = cleanCode.substring(7);
    if (cleanCode.startsWith("```")) cleanCode = cleanCode.substring(3);
    
    const escapedCode = cleanCode.replace(/&/g, '&amp;')
                                .replace(/</g, '&lt;')
                                .replace(/>/g, '&gt;')
                                .replace(/"/g, '&quot;')
                                .replace(/'/g, '&#039;');
    codeDisplay.innerHTML = escapedCode;
    const codeView = document.getElementById('code-view');
    if (codeView) {
        codeView.scrollTop = codeView.scrollHeight;
    }
}

function addMessageToChat(role, content) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role === 'user' ? 'user-msg' : 'system-msg'}`;
    
    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = role === 'user' ? '👤' : '🤖';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'content';
    
    // Check if content already contains HTML (like our stream container)
    if (content.includes('<span class="stream-content"></span>')) {
        contentDiv.innerHTML = content;
    } else {
        // Use marked for markdown rendering if available
        if (typeof marked !== 'undefined') {
            contentDiv.innerHTML = marked.parse(content);
        } else {
            contentDiv.innerHTML = content.replace(/\n/g, '<br>');
        }
    }
    
    // Style markdown elements inside content
    const lists = contentDiv.querySelectorAll('ul, ol');
    lists.forEach(l => {
        l.style.paddingLeft = '20px';
        l.style.marginBottom = '10px';
    });
    
    msgDiv.appendChild(avatar);
    msgDiv.appendChild(contentDiv);
    
    chatHistory.appendChild(msgDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight;
    if (currentUser) localStorage.setItem(`chatHistory_${currentUser}`, chatHistory.innerHTML);
    
    return msgDiv; // Return the DOM element so we can update stream content
}

function updatePreview(code) {
    // Update Iframe
    previewFrame.srcdoc = code;
    
    // Update Code View
    // Escape HTML for display
    const escapedCode = code.replace(/&/g, '&amp;')
                            .replace(/</g, '&lt;')
                            .replace(/>/g, '&gt;')
                            .replace(/"/g, '&quot;')
                            .replace(/'/g, '&#039;');
    codeDisplay.innerHTML = escapedCode;
}

function setLoading(isLoading, text = "Generating your application...") {
    if (isLoading) {
        loadingOverlay.classList.remove('hidden');
        document.querySelector('.generating-text').textContent = text;
        generateBtn.disabled = true;
        btnText.classList.add('hidden');
        btnLoader.classList.remove('hidden');
    } else {
        loadingOverlay.classList.add('hidden');
        generateBtn.disabled = false;
        btnText.classList.remove('hidden');
        btnLoader.classList.add('hidden');
    }
}

function toggleCodeView() {
    isCodeView = !isCodeView;
    const liveViewTab = tabs[0];
    const codeViewTab = tabs[1];
    
    if (isCodeView) {
        previewFrame.classList.remove('active-view');
        previewFrame.classList.add('hidden-view');
        document.getElementById('code-view').classList.remove('hidden-view');
        document.getElementById('code-view').classList.add('active-view');
        
        liveViewTab.classList.remove('active');
        codeViewTab.classList.add('active');
    } else {
        previewFrame.classList.add('active-view');
        previewFrame.classList.remove('hidden-view');
        document.getElementById('code-view').classList.add('hidden-view');
        document.getElementById('code-view').classList.remove('active-view');
        
        liveViewTab.classList.add('active');
        codeViewTab.classList.remove('active');
    }
}

// Add click listeners to tabs
tabs[0].addEventListener('click', () => {
    if (isCodeView) toggleCodeView();
});

tabs[1].addEventListener('click', () => {
    if (!isCodeView) toggleCodeView();
});

function refreshPreview() {
    if (currentCode) {
        updatePreview(currentCode);
    } else {
        updatePreview(initialContent);
    }
    // Add small animation to button
    const btn = document.querySelector('.actions .icon-btn:first-child');
    btn.style.transform = 'rotate(180deg)';
    setTimeout(() => {
        btn.style.transform = 'none';
    }, 300);
}

function openInNewTab() {
    const newWindow = window.open();
    newWindow.document.write(currentCode || initialContent);
    newWindow.document.close();
}

// --- Split Window Resizer ---
const resizer = document.getElementById('resizer');
const sidebar = document.querySelector('.sidebar');

if (resizer && sidebar) {
    let isResizing = false;

    const startResize = (e) => {
        isResizing = true;
        resizer.classList.add('dragging');
        document.body.classList.add('is-resizing');
    };

    const stopResize = () => {
        if (!isResizing) return;
        isResizing = false;
        resizer.classList.remove('dragging');
        document.body.classList.remove('is-resizing');
    };

    const resize = (e) => {
        if (!isResizing) return;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const appContainer = document.getElementById('app-container');
        const containerWidth = appContainer ? appContainer.getBoundingClientRect().width : window.innerWidth;
        
        const minWidth = 250;
        const maxWidth = containerWidth * 0.6;
        let newWidth = clientX;
        
        if (newWidth < minWidth) newWidth = minWidth;
        if (newWidth > maxWidth) newWidth = maxWidth;

        sidebar.style.width = `${newWidth}px`;
    };

    resizer.addEventListener('mousedown', startResize);
    resizer.addEventListener('touchstart', startResize, { passive: true });

    window.addEventListener('mousemove', resize);
    window.addEventListener('touchmove', resize, { passive: true });

    window.addEventListener('mouseup', stopResize);
    window.addEventListener('touchend', stopResize);
}

// --- Added Features ---

let isDiffMode = false;

function updateVersionSelect() {
    const select = document.getElementById('version-select');
    const diffSelect = document.getElementById('diff-base-select');
    if (!select) return;
    
    select.innerHTML = '';
    if (diffSelect) diffSelect.innerHTML = '';
    codeVersions.forEach((v, i) => {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = `Version ${i + 1} (${v.time})`;
        select.appendChild(opt);
        
        if (diffSelect) {
            const opt2 = document.createElement('option');
            opt2.value = i;
            opt2.textContent = `Version ${i + 1}`;
            diffSelect.appendChild(opt2);
        }
    });
    if (codeVersions.length > 0) {
        select.value = codeVersions.length - 1;
        if (diffSelect) {
            diffSelect.value = Math.max(0, codeVersions.length - 2);
        }
    }
}

window.handleVersionChange = function() {
    if (isDiffMode) {
        renderDiff();
    } else {
        const select = document.getElementById('version-select');
        window.loadVersion(select.value);
    }
}

window.loadVersion = function(index) {
    if (codeVersions[index]) {
        currentCode = codeVersions[index].code;
        if (currentUser) localStorage.setItem(`currentCode_${currentUser}`, currentCode);
        updatePreview(currentCode);
    }
}

window.toggleEditCode = function() {
    const isEditable = codeDisplay.isContentEditable;
    codeDisplay.contentEditable = !isEditable;
    const saveBtn = document.getElementById('save-code-btn');
    if (!isEditable) {
        codeDisplay.style.backgroundColor = 'rgba(255,255,255,0.1)';
        codeDisplay.focus();
        if(saveBtn) saveBtn.style.display = 'inline-block';
    } else {
        codeDisplay.style.backgroundColor = 'transparent';
        if(saveBtn) saveBtn.style.display = 'none';
    }
}

window.saveEditedCode = function() {
    let newCode = codeDisplay.innerText;
    currentCode = newCode;
    codeVersions.push({ time: new Date().toLocaleTimeString() + ' (Manual)', code: currentCode });
    if (currentUser) {
        localStorage.setItem(`codeVersions_${currentUser}`, JSON.stringify(codeVersions));
        localStorage.setItem(`currentCode_${currentUser}`, currentCode);
    }
    updateVersionSelect();
    updatePreview(currentCode);
    window.toggleEditCode();
    addMessageToChat('system', 'Code manually edited and saved.');
}

window.exportCode = function() {
    const blob = new Blob([currentCode || initialContent], {type: 'text/html'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'atoms_export.html';
    a.click();
    URL.revokeObjectURL(url);
}

window.toggleDiffMode = function() {
    isDiffMode = !isDiffMode;
    const diffSelect = document.getElementById('diff-base-select');
    const diffSeparator = document.getElementById('diff-separator');
    const editBtn = document.getElementById('edit-code-btn');
    const diffBtn = document.getElementById('diff-toggle-btn');
    
    if (isDiffMode) {
        if (codeVersions.length < 2) {
            alert("Need at least 2 versions to compare.");
            isDiffMode = false;
            return;
        }
        diffSelect.style.display = 'block';
        diffSeparator.style.display = 'block';
        if(editBtn) editBtn.style.display = 'none';
        if(diffBtn) diffBtn.style.backgroundColor = 'rgba(255,255,255,0.2)';
        
        // Ensure diffSelect is set relative to target
        const targetIdx = parseInt(document.getElementById('version-select').value) || (codeVersions.length - 1);
        diffSelect.value = Math.max(0, targetIdx - 1);
        
        window.renderDiff();
    } else {
        diffSelect.style.display = 'none';
        diffSeparator.style.display = 'none';
        if(editBtn) editBtn.style.display = 'inline-block';
        if(diffBtn) diffBtn.style.backgroundColor = 'transparent';
        
        // Restore normal code view
        const select = document.getElementById('version-select');
        window.loadVersion(select.value);
    }
}

window.renderDiff = function() {
    if (typeof Diff === 'undefined') {
        alert("Diff library not loaded.");
        return;
    }
    
    const targetIdx = parseInt(document.getElementById('version-select').value);
    const baseIdx = parseInt(document.getElementById('diff-base-select').value);
    
    if (isNaN(targetIdx) || isNaN(baseIdx)) return;
    
    const curr = codeVersions[targetIdx].code;
    const prev = codeVersions[baseIdx].code;
    
    const diff = Diff.diffLines(prev, curr);
    const fragment = document.createDocumentFragment();
    diff.forEach((part) => {
        const span = document.createElement('span');
        // Use specific colors for diff
        span.style.color = part.added ? '#10b981' : part.removed ? '#ef4444' : 'inherit';
        span.style.backgroundColor = part.added ? 'rgba(16, 185, 129, 0.1)' : part.removed ? 'rgba(239, 68, 68, 0.1)' : 'transparent';
        span.style.display = part.added || part.removed ? 'inline-block' : 'inline';
        span.style.width = part.added || part.removed ? '100%' : 'auto';
        // Escape HTML characters before creating text node
        span.textContent = part.value;
        fragment.appendChild(span);
    });
    
    codeDisplay.innerHTML = '';
    codeDisplay.appendChild(fragment);
    
    if (!isCodeView) toggleCodeView();
}

window.clearWorkspace = function() {
    if (confirm("Are you sure you want to clear your workspace? This cannot be undone.")) {
        if (currentUser) {
            localStorage.removeItem(`currentCode_${currentUser}`);
            localStorage.removeItem(`codeVersions_${currentUser}`);
            localStorage.removeItem(`chatHistory_${currentUser}`);
        }
        
        codeVersions = [];
        currentCode = "";
        pendingDesignPlan = "";
        
        // Reset Chat
        chatHistory.innerHTML = `
            <div class="message system-msg">
                <div class="avatar">🤖</div>
                <div class="content">
                    Hello! I am your AI agent. Describe the web application or component you want to build, and I will generate it for you in the preview panel.
                </div>
            </div>
        `;
        if (currentUser) localStorage.setItem(`chatHistory_${currentUser}`, chatHistory.innerHTML);
        
        updatePreview(initialContent);
        updateVersionSelect();
    }
}

// --- Auth Features ---
let authMode = 'login';
const authScreen = document.getElementById('auth-screen');
const appContainer = document.getElementById('app-container');

function loadUserData(username) {
    if (!username) return;
    currentCode = localStorage.getItem(`currentCode_${username}`) || "";
    codeVersions = JSON.parse(localStorage.getItem(`codeVersions_${username}`)) || [];
    pendingDesignPlan = "";
    
    const savedChat = localStorage.getItem(`chatHistory_${username}`);
    if (savedChat) {
        chatHistory.innerHTML = savedChat;
    } else {
        chatHistory.innerHTML = `
            <div class="message system-msg">
                <div class="avatar">🤖</div>
                <div class="content">
                    Hello! I am your AI agent. Describe the web application or component you want to build, and I will generate it for you in the preview panel.
                </div>
            </div>
        `;
    }
    chatHistory.scrollTop = chatHistory.scrollHeight;
    
    if (currentCode) {
        updatePreview(currentCode);
        updateVersionSelect();
    } else {
        updatePreview(initialContent);
        updateVersionSelect();
    }
}

function checkAuth() {
    if (currentUser) {
        loadUserData(currentUser);
        if(authScreen) authScreen.classList.add('hidden');
        if(appContainer) appContainer.style.display = 'flex';
    } else {
        if(authScreen) authScreen.classList.remove('hidden');
        if(appContainer) appContainer.style.display = 'none';
    }
}

window.switchAuthTab = function(mode) {
    authMode = mode;
    document.getElementById('tab-login').classList.toggle('active', mode === 'login');
    document.getElementById('tab-register').classList.toggle('active', mode === 'register');
    document.getElementById('auth-submit-btn').textContent = mode === 'login' ? 'Login' : 'Register';
    document.getElementById('auth-error').classList.add('hidden');
}

window.handleAuth = function(e) {
    e.preventDefault();
    const username = document.getElementById('auth-username').value.trim();
    const password = document.getElementById('auth-password').value.trim();
    const errorEl = document.getElementById('auth-error');
    
    if (!username || !password) {
        errorEl.textContent = 'Please fill out all fields.';
        errorEl.classList.remove('hidden');
        return;
    }
    
    let users = JSON.parse(localStorage.getItem('users')) || {};
    
    if (authMode === 'register') {
        if (users[username]) {
            errorEl.textContent = 'Username already exists.';
            errorEl.classList.remove('hidden');
            return;
        }
        users[username] = password;
        localStorage.setItem('users', JSON.stringify(users));
        currentUser = username;
        localStorage.setItem('currentUser', username);
        document.getElementById('auth-form').reset();
        checkAuth();
    } else {
        if (users[username] && users[username] === password) {
            currentUser = username;
            localStorage.setItem('currentUser', username);
            document.getElementById('auth-form').reset();
            checkAuth();
        } else {
            errorEl.textContent = 'Invalid username or password.';
            errorEl.classList.remove('hidden');
        }
    }
}

window.logout = function() {
    currentUser = null;
    localStorage.removeItem('currentUser');
    
    // Reset global state
    currentCode = "";
    codeVersions = [];
    pendingDesignPlan = "";
    chatHistory.innerHTML = "";
    
    checkAuth();
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
});
checkAuth(); // Also call immediately in case DOMContentLoaded already fired
