// PackAi – Core AI Engine
// Uses IndexedDB for lifelong learning, and a self‑contained API key (base64 encoded knowledge)
// Now supports multiple initial knowledge files – just list them in the DIALOGUE_FILES array.

(function() {
    // ---------- Configuration ----------
    // You can specify one or more .txt files here. The AI will combine all their contents.
    // Example: const DIALOGUE_FILES = ['dialogue.txt', 'extra.txt', 'science.txt'];
    const DIALOGUE_FILES = ['dialogue.txt'];   // <-- Change this line to load multiple files

    const DB_NAME = 'PackAiDB';
    const DB_VERSION = 1;
    const STORE_NAME = 'learnedQA';

    // This will hold our knowledge base (array of {q, a})
    let knowledgeBase = [];

    // Reference to IndexedDB
    let db;

    // UI Elements
    const messagesDiv = document.getElementById('messages');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');

    // ---------- IndexedDB Setup ----------
    function openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                }
            };
        });
    }

    // Save a learned Q&A pair to IndexedDB
    async function saveLearnedPair(question, answer) {
        if (!db) return;
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.add({ question, answer, timestamp: Date.now() });
        return tx.complete;
    }

    // Load all learned pairs from IndexedDB
    async function loadLearnedPairs() {
        if (!db) return [];
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // ---------- API Key Handling ----------
    // The API key is a base64 string that contains the combined initial knowledge from all dialogue files.
    // We generate it on first run and store it in localStorage.
    const API_KEY_STORAGE_KEY = 'packai_api_key';

    async function getOrCreateAPIKey() {
        let apiKey = localStorage.getItem(API_KEY_STORAGE_KEY);
        if (apiKey) {
            console.log('API key found in localStorage');
            return apiKey;
        }

        // No key yet – load all dialogue files and combine them
        console.log('No API key found. Generating from dialogue files...');
        try {
            // Normalize DIALOGUE_FILES to always be an array
            const fileList = Array.isArray(DIALOGUE_FILES) ? DIALOGUE_FILES : [DIALOGUE_FILES];
            
            // Fetch all files concurrently
            const fetchPromises = fileList.map(async (file) => {
                const response = await fetch(file);
                if (!response.ok) throw new Error(`Failed to load ${file}`);
                return await response.text();
            });
            
            const texts = await Promise.all(fetchPromises);
            // Combine all texts with a newline between files (optional, but keeps separation)
            const combinedText = texts.join('\n');
            
            // Encode combined text to base64
            const base64 = btoa(unescape(encodeURIComponent(combinedText)));
            localStorage.setItem(API_KEY_STORAGE_KEY, base64);
            return base64;
        } catch (error) {
            console.error('Could not generate API key:', error);
            // Return empty key as fallback – AI will rely only on learned data
            return '';
        }
    }

    // Decode the API key back to the original text
    function decodeAPIKey(apiKey) {
        if (!apiKey) return '';
        try {
            const decoded = decodeURIComponent(escape(atob(apiKey)));
            return decoded;
        } catch (e) {
            console.error('Failed to decode API key', e);
            return '';
        }
    }

    // Parse Q&A pairs from text (format: question::answer per line)
    function parseQnA(text) {
        return text.split('\n')
            .filter(line => line.includes('::'))
            .map(line => {
                const [q, a] = line.split('::').map(s => s.trim());
                return { question: q.toLowerCase(), answer: a };
            });
    }

    // Merge two knowledge arrays (base + learned). Learned overwrites if question duplicates?
    // We'll keep both, but when searching we'll prioritize learned (more recent)
    function mergeKnowledge(base, learned) {
        // Learned items are stored with {question, answer, timestamp}
        // Convert learned to same format {question, answer} but keep original for reference
        const learnedPairs = learned.map(l => ({ question: l.question.toLowerCase(), answer: l.answer, learned: true }));
        // Simple concatenation – for response we'll search both arrays and pick best match
        return [...base, ...learnedPairs];
    }

    // ---------- AI Response Logic ----------
    // Very basic matching: find a question that includes the user's words or vice versa.
    // In a real advanced AI you'd use embeddings, but here we'll do keyword overlap.
    function findBestMatch(userMessage, knowledge) {
        const words = userMessage.toLowerCase().split(/\s+/).filter(w => w.length > 2);
        let bestMatch = null;
        let bestScore = 0;

        for (const item of knowledge) {
            const qWords = item.question.split(/\s+/);
            // Count how many user words appear in the question
            let score = words.filter(w => qWords.includes(w)).length;
            // Also check if question contains user message as substring (bonus)
            if (item.question.includes(userMessage.toLowerCase())) score += 5;
            if (userMessage.toLowerCase().includes(item.question)) score += 3;

            if (score > bestScore) {
                bestScore = score;
                bestMatch = item;
            }
        }
        return bestMatch;
    }

    // Main function to get AI response
    async function getAIResponse(userMessage) {
        if (!knowledgeBase.length) return "I'm still loading my knowledge. Please wait a moment.";

        const match = findBestMatch(userMessage, knowledgeBase);
        if (match) {
            return match.answer;
        }

        // No good match – ask user to teach me
        return "I don't know how to answer that yet. What would be a good response? (Or type 'skip' to ignore)";
    }

    // ---------- Learning from User (when AI doesn't know) ----------
    let pendingQuestion = null;  // Stores the original user message when we asked for a response

    async function handleUserMessage(message) {
        const trimmed = message.trim();
        if (!trimmed) return;

        // Display user message
        addMessage(trimmed, 'user');

        // Clear input
        userInput.value = '';

        // If we are in a learning state (waiting for user to provide an answer)
        if (pendingQuestion) {
            if (trimmed.toLowerCase() === 'skip') {
                addMessage('Okay, I won\'t learn that this time.', 'ai');
                pendingQuestion = null;
                return;
            } else {
                // User provided an answer – save as new learned pair
                await saveLearnedPair(pendingQuestion, trimmed);
                // Also add to current knowledgeBase
                knowledgeBase.push({ question: pendingQuestion.toLowerCase(), answer: trimmed, learned: true });
                addMessage(`Thank you! I've learned that. Next time you ask "${pendingQuestion}", I'll know what to say.`, 'ai');
                pendingQuestion = null;
                return;
            }
        }

        // Normal conversation
        // Show typing indicator
        const typingIndicator = addMessage('', 'ai', true);
        const response = await getAIResponse(trimmed);
        removeTypingIndicator(typingIndicator);

        if (response === "I don't know how to answer that yet. What would be a good response? (Or type 'skip' to ignore)") {
            // Set pending question so next message is treated as the answer
            pendingQuestion = trimmed;
        }

        addMessage(response, 'ai');
    }

    // UI Helpers
    function addMessage(text, sender, isTyping = false) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message');
        if (sender === 'user') {
            messageDiv.classList.add('user-message');
        }

        const avatar = document.createElement('div');
        avatar.classList.add('avatar');
        avatar.textContent = sender === 'user' ? 'U' : 'P';

        const bubble = document.createElement('div');
        bubble.classList.add('bubble');
        bubble.textContent = text;

        messageDiv.appendChild(avatar);
        messageDiv.appendChild(bubble);

        if (isTyping) {
            messageDiv.classList.add('typing');
            bubble.textContent = '';  // Will show dots via CSS
        }

        messagesDiv.appendChild(messageDiv);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
        return messageDiv;  // return for potential removal
    }

    function removeTypingIndicator(element) {
        if (element && element.parentNode) {
            element.remove();
        }
    }

    // ---------- Initialization ----------
    async function init() {
        // 1. Open IndexedDB
        try {
            db = await openDB();
            console.log('IndexedDB ready');
        } catch (e) {
            console.error('IndexedDB failed', e);
        }

        // 2. Load or generate API key (now combines all files)
        const apiKey = await getOrCreateAPIKey();
        const knowledgeText = decodeAPIKey(apiKey);

        // 3. Parse base knowledge
        const baseKnowledge = parseQnA(knowledgeText);
        console.log(`Loaded ${baseKnowledge.length} base Q&A pairs from API key`);

        // 4. Load learned pairs from IndexedDB
        const learned = await loadLearnedPairs();
        console.log(`Loaded ${learned.length} learned pairs from IndexedDB`);

        // 5. Merge into knowledgeBase
        knowledgeBase = mergeKnowledge(baseKnowledge, learned);
        console.log(`Total knowledge: ${knowledgeBase.length} entries`);

        // 6. Attach event listeners
        sendButton.addEventListener('click', () => {
            handleUserMessage(userInput.value);
        });
        userInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleUserMessage(userInput.value);
            }
        });
    }

    // Start everything
    init().catch(console.error);
})();