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
let isCodeView = false;
let pendingDesignPlan = "";

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
updatePreview(initialContent);

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
            body: JSON.stringify({ prompt: prompt, current_plan: previousPlan })
        });
        
        if (!response.ok) {
            throw new Error('Failed to generate design plan');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        pendingDesignPlan = "";
        
        const msgDiv = addMessageToChat('system', `<strong>Designer Agent:</strong>\n\n<span class="stream-content"></span>`);
        const streamContainer = msgDiv.querySelector('.stream-content');

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunkText = decoder.decode(value, {stream: true});
            const lines = chunkText.split('\n').filter(l => l.trim() !== '');
            for (const line of lines) {
                try {
                    const parsed = JSON.parse(line);
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
        }
        addActionButtons();
    } catch (e) {
        console.error('Design error:', e);
        addMessageToChat('system', `Error: ${e.message}. Please try again.`);
    } finally {
        setLoading(false);
    }
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
            body: JSON.stringify({ design_plan: pendingDesignPlan })
        });
        
        if (!response.ok) {
            throw new Error('Failed to build code');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        currentCode = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunkText = decoder.decode(value, {stream: true});
            const lines = chunkText.split('\n').filter(l => l.trim() !== '');
            for (const line of lines) {
                try {
                    const parsed = JSON.parse(line);
                    if (parsed.status) {
                        setLoading(true, parsed.status);
                    }
                    if (parsed.code_chunk) {
                        currentCode += parsed.code_chunk;
                    }
                } catch(e) {}
            }
        }
        
        // Clean markdown backticks if present
        let cleanCode = currentCode.trim();
        if (cleanCode.startsWith("\`\`\`html")) cleanCode = cleanCode.substring(7);
        if (cleanCode.startsWith("\`\`\`")) cleanCode = cleanCode.substring(3);
        if (cleanCode.endsWith("\`\`\`")) cleanCode = cleanCode.substring(0, cleanCode.length - 3);
        
        currentCode = cleanCode.trim();
        updatePreview(currentCode);
        pendingDesignPlan = ""; // Reset for next project
        
        addMessageToChat('system', 'Build and QA complete! Check out the live preview.');
    } catch (e) {
        console.error('Build error:', e);
        addMessageToChat('system', `Error: ${e.message}.`);
    } finally {
        setLoading(false);
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
