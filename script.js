// PackAi – Core AI Engine with Advanced Fuzzy Matching and .PAI Support
// Preserves all original functionality and adds parsing for custom .PAI files.

(function() {
    // ---------- Configuration ----------
    const DIALOGUE_FILES = ['dialogue.txt', 'cuss-dialouge.txt','roasted-dialouge.txt', 'language.txt', 'nerd-vs-bully-vs-normal.txt', 'sarcasm.txt']; // Add your files here
    const DB_NAME = 'PackAiDB';
    const DB_VERSION = 1;
    const STORE_NAME = 'learnedQA';

    let knowledgeBase = []; // array of { question, answer, learned?, normalized, keywords }
    let db;

    const messagesDiv = document.getElementById('messages');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');

    // ---------- Text Normalization ----------
    function normalize(text) {
        return text.toLowerCase()
            .replace(/[.,!?;:'"()\[\]{}<>\/\\|–—―-]/g, ' ')  // punctuation → space
            .replace(/\s+/g, ' ')                             // collapse spaces
            .trim();
    }

    // Full stopwords list (common words that don't add meaning)
    const stopwords = new Set([
        'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves', 'you', 'your', 'yours',
        'yourself', 'yourselves', 'he', 'him', 'his', 'himself', 'she', 'her', 'hers', 'herself',
        'it', 'its', 'itself', 'they', 'them', 'their', 'theirs', 'themselves', 'what', 'which',
        'who', 'whom', 'this', 'that', 'these', 'those', 'am', 'is', 'are', 'was', 'were', 'be',
        'been', 'being', 'have', 'has', 'had', 'having', 'do', 'does', 'did', 'doing', 'a', 'an',
        'the', 'and', 'but', 'if', 'or', 'because', 'as', 'until', 'while', 'of', 'at', 'by', 'for',
        'with', 'about', 'against', 'between', 'into', 'through', 'during', 'before', 'after',
        'above', 'below', 'to', 'from', 'up', 'down', 'in', 'out', 'on', 'off', 'over', 'under',
        'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all',
        'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not',
        'only', 'own', 'same', 'so', 'than', 'too', 'very', 's', 't', 'can', 'will', 'just', 'don',
        'should', 'now'
    ]);

    // Levenshtein distance for fuzzy matching
    function levenshtein(a, b) {
        if (a.length === 0) return b.length;
        if (b.length === 0) return a.length;
        const matrix = [];
        for (let i = 0; i <= b.length; i++) matrix[i] = [i];
        for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i-1) === a.charAt(j-1)) {
                    matrix[i][j] = matrix[i-1][j-1];
                } else {
                    matrix[i][j] = Math.min(matrix[i-1][j-1] + 1,
                                            Math.min(matrix[i][j-1] + 1,
                                                     matrix[i-1][j] + 1));
                }
            }
        }
        return matrix[b.length][a.length];
    }

    // Extract keywords (filter stopwords and keep words with length > 2)
    function extractKeywords(text) {
        const words = text.toLowerCase().split(/\s+/);
        return words.filter(w => w.length > 2 && !stopwords.has(w));
    }

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

    async function saveLearnedPair(question, answer) {
        if (!db) return;
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.add({ question, answer, timestamp: Date.now() });
        return tx.complete;
    }

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

    // ---------- Parsers ----------
    // Standard .txt format: question::answer
    function parseTxt(content) {
        return content.split('\n')
            .filter(line => line.includes('::'))
            .map(line => {
                const [q, a] = line.split('::').map(s => s.trim());
                const normalized = normalize(q);
                const keywords = extractKeywords(normalized);
                return { question: q, answer: a, normalized, keywords };
            });
    }

    // Custom .PAI format: User)Response $question$ @PAI) response @answer
    function parsePAI(content) {
        const lines = content.split('\n');
        const pairs = [];
        const regex = /^User\)Response \$([^$]+)\$ @PAI\) response @(.*)$/;
        for (let line of lines) {
            line = line.trim();
            if (!line) continue;
            const match = line.match(regex);
            if (match) {
                const question = match[1].trim();
                const answer = match[2].trim();
                const normalized = normalize(question);
                const keywords = extractKeywords(normalized);
                pairs.push({ question, answer, normalized, keywords });
            }
        }
        return pairs;
    }

    // Merge two knowledge arrays (base + learned)
    function mergeKnowledge(base, learned) {
        const learnedPairs = learned.map(l => ({ 
            question: l.question, 
            answer: l.answer, 
            learned: true,
            normalized: normalize(l.question),
            keywords: extractKeywords(l.question.toLowerCase())
        }));
        return [...base, ...learnedPairs];
    }

    // ---------- Advanced Matching ----------
    function findBestMatch(userMessage, knowledge) {
        const normalizedUser = normalize(userMessage);
        const userKeywords = extractKeywords(normalizedUser);
        
        let bestMatch = null;
        let bestScore = 0;

        for (const item of knowledge) {
            let score = 0;

            // 1. Exact normalized match
            if (item.normalized === normalizedUser) {
                score += 100;
            }
            
            // 2. User message contains entire stored question
            if (normalizedUser.includes(item.normalized)) {
                score += 50;
            }
            // 3. Stored question contains entire user message
            else if (item.normalized.includes(normalizedUser)) {
                score += 40;
            }

            // 4. Keyword overlap (Jaccard similarity)
            const commonKeywords = userKeywords.filter(k => item.keywords.includes(k)).length;
            const totalUnique = new Set([...userKeywords, ...item.keywords]).size;
            if (totalUnique > 0) {
                const jaccard = (commonKeywords / totalUnique) * 100;
                score += jaccard * 2;
            }

            // 5. Fuzzy matching on important words (if few keywords)
            if (userKeywords.length < 3 && item.keywords.length < 3) {
                const dist = levenshtein(normalizedUser, item.normalized);
                const maxLen = Math.max(normalizedUser.length, item.normalized.length);
                if (maxLen > 0) {
                    const similarity = (1 - dist / maxLen) * 100;
                    score += similarity * 1.5;
                }
            }

            // 6. Boost for profanity/meme keywords
            const profaneWords = ['fuck', 'shit', 'damn', 'bitch', 'ass', 'cunt', 'dick', 'bastard', 'prick', 'twat', 'wanker', 'arse', 'bollocks', 'bloody', 'motherfucker', 'cocksucker', 'shithead', 'dickhead', 'piss', 'pussy', 'fucktard', 'goddamn', 'shitfuck', 'fuckstick', 'dickweed', 'asshat', 'shitlord', 'fuckwad', 'twatwaffle', 'cuntpunt', 'fucknugget', 'bitchtits'];
            const memeWords = ['meme', 'drake', 'spongebob', 'pooh', 'gigachad', 'keyboard cat', 'disaster girl', 'this is fine', 'distracted boyfriend', 'woman yelling at cat', 'hide the pain harold', 'expanding brain', 'grumpy cat', 'success kid'];
            
            for (let word of profaneWords) {
                if (normalizedUser.includes(word) && item.normalized.includes(word)) {
                    score += 20;
                }
            }
            for (let phrase of memeWords) {
                if (normalizedUser.includes(phrase) && item.normalized.includes(phrase)) {
                    score += 30;
                }
            }

            // 7. Partial phrase matching: any word from stored question appears in user message
            const anyWordMatch = item.keywords.some(k => normalizedUser.includes(k));
            if (anyWordMatch) score += 5;

            if (score > bestScore) {
                bestScore = score;
                bestMatch = item;
            }
        }

        // Only return if score is above threshold (25)
        return bestScore > 25 ? bestMatch : null;
    }

    async function getAIResponse(userMessage) {
        if (!knowledgeBase.length) return "I'm still loading my knowledge. Please wait a moment.";

        const match = findBestMatch(userMessage, knowledgeBase);
        if (match) {
            return match.answer;
        }

        return "I don't know how to answer that yet. What would be a good response? (Or type 'skip' to ignore)";
    }

    // ---------- Learning & UI ----------
    let pendingQuestion = null;

    async function handleUserMessage(message) {
        const trimmed = message.trim();
        if (!trimmed) return;

        addMessage(trimmed, 'user');
        userInput.value = '';

        if (pendingQuestion) {
            if (trimmed.toLowerCase() === 'skip') {
                addMessage('Okay, I won\'t learn that this time.', 'ai');
                pendingQuestion = null;
                return;
            } else {
                await saveLearnedPair(pendingQuestion, trimmed);
                knowledgeBase.push({ 
                    question: pendingQuestion, 
                    answer: trimmed, 
                    learned: true,
                    normalized: normalize(pendingQuestion),
                    keywords: extractKeywords(pendingQuestion.toLowerCase())
                });
                addMessage(`Thank you! I've learned that. Next time you ask "${pendingQuestion}", I'll know what to say.`, 'ai');
                pendingQuestion = null;
                return;
            }
        }

        const typingIndicator = addMessage('', 'ai', true);
        const response = await getAIResponse(trimmed);
        removeTypingIndicator(typingIndicator);

        if (response === "I don't know how to answer that yet. What would be a good response? (Or type 'skip' to ignore)") {
            pendingQuestion = trimmed;
        }

        addMessage(response, 'ai');
    }

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
            bubble.textContent = '';
        }

        messagesDiv.appendChild(messageDiv);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
        return messageDiv;
    }

    function removeTypingIndicator(element) {
        if (element && element.parentNode) {
            element.remove();
        }
    }

    // ---------- API Key Handling (stores all files as a JSON object) ----------
    const API_KEY_STORAGE_KEY = 'packai_api_key';

    async function getOrCreateAPIKey() {
        let apiKey = localStorage.getItem(API_KEY_STORAGE_KEY);
        if (apiKey) {
            console.log('API key found in localStorage');
            return apiKey;
        }

        console.log('No API key found. Generating from dialogue files...');
        try {
            const fileList = Array.isArray(DIALOGUE_FILES) ? DIALOGUE_FILES : [DIALOGUE_FILES];
            const fileContents = {};

            // Fetch each file and store its content keyed by filename
            for (const file of fileList) {
                const response = await fetch(file);
                if (!response.ok) {
                    console.warn(`Failed to load ${file}, skipping`);
                    continue;
                }
                const text = await response.text();
                fileContents[file] = text;
            }

            // Store as JSON string, then base64
            const combinedJson = JSON.stringify(fileContents);
            const base64 = btoa(unescape(encodeURIComponent(combinedJson)));
            localStorage.setItem(API_KEY_STORAGE_KEY, base64);
            return base64;
        } catch (error) {
            console.error('Could not generate API key:', error);
            return '';
        }
    }

    function decodeAPIKey(apiKey) {
        if (!apiKey) return {};
        try {
            const jsonStr = decodeURIComponent(escape(atob(apiKey)));
            return JSON.parse(jsonStr);
        } catch (e) {
            console.error('Failed to decode API key', e);
            return {};
        }
    }

    // ---------- Initialization ----------
    async function init() {
        try {
            db = await openDB();
            console.log('IndexedDB ready');
        } catch (e) {
            console.error('IndexedDB failed', e);
        }

        const apiKey = await getOrCreateAPIKey();
        const fileContents = decodeAPIKey(apiKey); // object: { filename: content, ... }

        // Parse each file based on its extension
        let baseKnowledge = [];
        for (const [filename, content] of Object.entries(fileContents)) {
            if (filename.toLowerCase().endsWith('.pai')) {
                const pairs = parsePAI(content);
                console.log(`Loaded ${pairs.length} pairs from ${filename} (PAI)`);
                baseKnowledge = baseKnowledge.concat(pairs);
            } else {
                // assume .txt or any other extension uses :: format
                const pairs = parseTxt(content);
                console.log(`Loaded ${pairs.length} pairs from ${filename} (TXT)`);
                baseKnowledge = baseKnowledge.concat(pairs);
            }
        }

        console.log(`Total base knowledge: ${baseKnowledge.length} pairs`);

        const learned = await loadLearnedPairs();
        console.log(`Loaded ${learned.length} learned pairs from IndexedDB`);

        knowledgeBase = mergeKnowledge(baseKnowledge, learned);
        console.log(`Total knowledge: ${knowledgeBase.length} entries`);

        sendButton.addEventListener('click', () => handleUserMessage(userInput.value));
        userInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleUserMessage(userInput.value);
        });
    }

    init().catch(console.error);
})();
