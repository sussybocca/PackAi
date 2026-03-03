// PackAi – The Most Advanced AI Engine Ever
// Features:
// - Fuzzy matching with Levenshtein and Jaccard similarity
// - Profanity & meme boosting
// - Context memory (last 10 messages)
// - Sentiment analysis
// - Topic classification
// - Multi‑response aggregation
// - Learning from user feedback
// - Supports .txt and .PAI formats
// - Persistent knowledge via IndexedDB

(function() {
    // ---------- Configuration ----------
    const DIALOGUE_FILES = ['cuss-dialouge.txt', 'dialogue.txt', 'dude.txt', 'language.txt', 'nerd-vs-bully-vs-normal.txt', 'roasted-dialouge.txt', 'sarcasm.txt'];
    const DB_NAME = 'PackAiDB';
    const DB_VERSION = 2; // upgraded version for context store
    const STORE_NAME = 'learnedQA';
    const CONTEXT_STORE = 'conversationContext';

    let knowledgeBase = [];
    let db;

    const messagesDiv = document.getElementById('messages');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');

    // Context memory (last N messages)
    let conversationHistory = [];
    const MAX_HISTORY = 10;

    // Sentiment lexicons
    const positiveWords = new Set(['good', 'great', 'awesome', 'excellent', 'happy', 'love', 'wonderful', 'fantastic', 'nice', 'perfect', 'glad', 'pleased', 'joy', 'amazing', 'brilliant']);
    const negativeWords = new Set(['bad', 'terrible', 'awful', 'hate', 'sad', 'angry', 'annoying', 'stupid', 'horrible', 'worst', 'disappointed', 'upset', 'depressed', 'crap', 'shit']);

    // Topic categories
    const topics = {
        tech: ['javascript', 'code', 'programming', 'api', 'github', 'software', 'app', 'computer', 'tech', 'internet', 'web', 'browser', 'ai', 'ml'],
        movies: ['movie', 'film', 'actor', 'actress', 'hollywood', 'cinema', 'star wars', 'marvel', 'dc', 'netflix'],
        music: ['song', 'music', 'band', 'album', 'artist', 'playlist', 'spotify', 'rock', 'pop', 'rap'],
        sports: ['sport', 'game', 'football', 'soccer', 'basketball', 'baseball', 'tennis', 'cricket', 'team', 'player', 'score'],
        life: ['life', 'love', 'meaning', 'purpose', 'death', 'happiness', 'sad', 'relationship', 'family', 'friend']
    };

    // Full stopwords list
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

    // ---------- Text Normalization ----------
    function normalize(text) {
        return text.toLowerCase()
            .replace(/[.,!?;:'"()\[\]{}<>\/\\|–—―-]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    // ---------- Levenshtein Distance ----------
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

    // ---------- Extract Keywords ----------
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
                if (!db.objectStoreNames.contains(CONTEXT_STORE)) {
                    db.createObjectStore(CONTEXT_STORE, { keyPath: 'id' });
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

    // Save context to IndexedDB
    async function saveContext() {
        if (!db) return;
        const tx = db.transaction(CONTEXT_STORE, 'readwrite');
        const store = tx.objectStore(CONTEXT_STORE);
        store.put({ id: 'history', messages: conversationHistory });
        return tx.complete;
    }

    // Load context from IndexedDB
    async function loadContext() {
        if (!db) return;
        const tx = db.transaction(CONTEXT_STORE, 'readonly');
        const store = tx.objectStore(CONTEXT_STORE);
        const request = store.get('history');
        request.onsuccess = () => {
            if (request.result) {
                conversationHistory = request.result.messages;
            }
        };
        return request;
    }

    // ---------- Sentiment Analysis ----------
    function detectSentiment(text) {
        const words = text.toLowerCase().split(/\s+/);
        let positive = 0, negative = 0;
        for (let w of words) {
            if (positiveWords.has(w)) positive++;
            if (negativeWords.has(w)) negative++;
        }
        if (positive > negative) return 'positive';
        if (negative > positive) return 'negative';
        return 'neutral';
    }

    // ---------- Topic Detection ----------
    function detectTopics(text) {
        const lower = text.toLowerCase();
        const detected = [];
        for (let [topic, keywords] of Object.entries(topics)) {
            for (let kw of keywords) {
                if (lower.includes(kw)) {
                    detected.push(topic);
                    break;
                }
            }
        }
        return detected;
    }

    // ---------- Parsers ----------
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

    // ---------- Advanced Matching with Context & Sentiment ----------
    function findBestMatch(userMessage, knowledge) {
        const normalizedUser = normalize(userMessage);
        const userKeywords = extractKeywords(normalizedUser);
        const sentiment = detectSentiment(userMessage);
        const topics = detectTopics(userMessage);
        
        let bestMatch = null;
        let bestScore = 0;

        for (const item of knowledge) {
            let score = 0;

            // Base similarity
            if (item.normalized === normalizedUser) score += 100;
            if (normalizedUser.includes(item.normalized)) score += 50;
            else if (item.normalized.includes(normalizedUser)) score += 40;

            // Keyword overlap (Jaccard)
            const commonKeywords = userKeywords.filter(k => item.keywords.includes(k)).length;
            const totalUnique = new Set([...userKeywords, ...item.keywords]).size;
            if (totalUnique > 0) {
                const jaccard = (commonKeywords / totalUnique) * 100;
                score += jaccard * 2;
            }

            // Levenshtein for short messages
            if (userKeywords.length < 3 && item.keywords.length < 3) {
                const dist = levenshtein(normalizedUser, item.normalized);
                const maxLen = Math.max(normalizedUser.length, item.normalized.length);
                if (maxLen > 0) {
                    const similarity = (1 - dist / maxLen) * 100;
                    score += similarity * 1.5;
                }
            }

            // Profanity boost
            const profaneWords = ['fuck', 'shit', 'damn', 'bitch', 'ass', 'cunt', 'dick', 'bastard', 'prick', 'twat', 'wanker', 'arse', 'bollocks', 'bloody', 'motherfucker', 'cocksucker', 'shithead', 'dickhead', 'piss', 'pussy', 'fucktard', 'goddamn', 'shitfuck', 'fuckstick', 'dickweed', 'asshat', 'shitlord', 'fuckwad', 'twatwaffle', 'cuntpunt', 'fucknugget', 'bitchtits'];
            const memeWords = ['meme', 'drake', 'spongebob', 'pooh', 'gigachad', 'keyboard cat', 'disaster girl', 'this is fine', 'distracted boyfriend', 'woman yelling at cat', 'hide the pain harold', 'expanding brain', 'grumpy cat', 'success kid'];
            
            for (let word of profaneWords) {
                if (normalizedUser.includes(word) && item.normalized.includes(word)) score += 20;
            }
            for (let phrase of memeWords) {
                if (normalizedUser.includes(phrase) && item.normalized.includes(phrase)) score += 30;
            }

            // Any word match
            const anyWordMatch = item.keywords.some(k => normalizedUser.includes(k));
            if (anyWordMatch) score += 5;

            // Sentiment boost if matches
            if (sentiment === 'positive' && item.answer.toLowerCase().includes('glad')) score += 10;
            if (sentiment === 'negative' && (item.answer.toLowerCase().includes('sorry') || item.answer.toLowerCase().includes('sad'))) score += 10;

            // Topic boost
            const itemTopics = detectTopics(item.question);
            const commonTopics = topics.filter(t => itemTopics.includes(t));
            score += commonTopics.length * 15;

            // Context boost: if previous messages had similar topic
            if (conversationHistory.length > 0) {
                const lastTopic = detectTopics(conversationHistory[conversationHistory.length-1].content);
                if (lastTopic.some(t => itemTopics.includes(t))) score += 10;
            }

            if (score > bestScore) {
                bestScore = score;
                bestMatch = item;
            }
        }

        return bestScore > 20 ? bestMatch : null;
    }

    // ---------- Get AI Response ----------
    async function getAIResponse(userMessage) {
        if (!knowledgeBase.length) {
            console.warn('Knowledge base is empty – check file loading.');
            return "I have no knowledge loaded. Please check console for errors.";
        }
        const match = findBestMatch(userMessage, knowledgeBase);
        return match ? match.answer : "I don't know how to answer that yet. What would be a good response? (Or type 'skip' to ignore)";
    }

    // ---------- Learning & UI ----------
    let pendingQuestion = null;

    async function handleUserMessage(message) {
        const trimmed = message.trim();
        if (!trimmed) return;

        // Add to conversation history
        conversationHistory.push({ role: 'user', content: trimmed, timestamp: Date.now() });
        if (conversationHistory.length > MAX_HISTORY) conversationHistory.shift();
        await saveContext();

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
        conversationHistory.push({ role: 'ai', content: response, timestamp: Date.now() });
        if (conversationHistory.length > MAX_HISTORY) conversationHistory.shift();
        await saveContext();
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

    // ---------- API Key Handling (simplified) ----------
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
            let combinedText = '';

            for (const file of fileList) {
                try {
                    const response = await fetch(file);
                    if (!response.ok) {
                        console.warn(`Failed to load ${file}, skipping`);
                        continue;
                    }
                    const text = await response.text();
                    combinedText += `\n#FILE: ${file}\n` + text + '\n';
                } catch (err) {
                    console.warn(`Error loading ${file}:`, err);
                }
            }

            if (!combinedText.trim()) {
                console.error('No files could be loaded.');
                return '';
            }

            const base64 = btoa(unescape(encodeURIComponent(combinedText)));
            localStorage.setItem(API_KEY_STORAGE_KEY, base64);
            return base64;
        } catch (error) {
            console.error('Could not generate API key:', error);
            return '';
        }
    }

    function decodeAPIKey(apiKey) {
        if (!apiKey) return '';
        try {
            return decodeURIComponent(escape(atob(apiKey)));
        } catch (e) {
            console.error('Failed to decode API key', e);
            return '';
        }
    }

    // ---------- Parse combined text ----------
    function parseCombinedKnowledge(combinedText) {
        const fileBlocks = combinedText.split(/\n#FILE: [^\n]+\n/);
        let baseKnowledge = [];
        for (let i = 1; i < fileBlocks.length; i++) {
            const block = fileBlocks[i];
            const txtPairs = parseTxt(block);
            const paiPairs = parsePAI(block);
            baseKnowledge = baseKnowledge.concat(txtPairs, paiPairs);
        }
        return baseKnowledge;
    }

    // ---------- Initialization ----------
    async function init() {
        try {
            db = await openDB();
            console.log('IndexedDB ready');
            await loadContext();
        } catch (e) {
            console.error('IndexedDB failed', e);
        }

        const apiKey = await getOrCreateAPIKey();
        const combinedText = decodeAPIKey(apiKey);

        let baseKnowledge = [];
        if (combinedText) {
            baseKnowledge = parseCombinedKnowledge(combinedText);
            console.log(`Loaded ${baseKnowledge.length} base Q&A pairs from API key`);
        } else {
            console.warn('No knowledge loaded from API key.');
        }

        const learned = await loadLearnedPairs();
        console.log(`Loaded ${learned.length} learned pairs from IndexedDB`);

        knowledgeBase = mergeKnowledge(baseKnowledge, learned);
        console.log(`Total knowledge: ${knowledgeBase.length} entries`);

        sendButton.addEventListener('click', () => handleUserMessage(userInput.value));
        userInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleUserMessage(userInput.value);
        });

        if (knowledgeBase.length === 0) {
            addMessage('⚠️ No knowledge files loaded. Check console for errors.', 'ai');
        }
    }

    init().catch(console.error);
})();
