// PackAi – Core AI Engine with Advanced Fuzzy Matching and .PAI Support
// Fixed: robust file loading, clear console errors, and fallback to simple parsing.

(function() {
    // ---------- Configuration ----------
    const DIALOGUE_FILES = ['cuss-dialouge.txt', 'dialogue.txt', 'dude.txt', 'language.txt', 'nerd-vs-bully-vs-normal.txt', 'roasted-dialouge.txt', 'sarcasm.txt']; // fixed dude.txt.txt typo
    const DB_NAME = 'PackAiDB';
    const DB_VERSION = 1;
    const STORE_NAME = 'learnedQA';

    let knowledgeBase = [];
    let db;

    const messagesDiv = document.getElementById('messages');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');

    // ---------- Text Normalization (unchanged) ----------
    function normalize(text) {
        return text.toLowerCase()
            .replace(/[.,!?;:'"()\[\]{}<>\/\\|–—―-]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    const stopwords = new Set([ /* full list */ ]);
    function levenshtein(a, b) { /* unchanged */ }
    function extractKeywords(text) {
        const words = text.toLowerCase().split(/\s+/);
        return words.filter(w => w.length > 2 && !stopwords.has(w));
    }

    // ---------- IndexedDB Setup ----------
    function openDB() { /* unchanged */ }
    async function saveLearnedPair(question, answer) { /* unchanged */ }
    async function loadLearnedPairs() { /* unchanged */ }

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

    // ---------- Advanced Matching (unchanged) ----------
    function findBestMatch(userMessage, knowledge) {
        const normalizedUser = normalize(userMessage);
        const userKeywords = extractKeywords(normalizedUser);
        
        let bestMatch = null;
        let bestScore = 0;

        for (const item of knowledge) {
            let score = 0;

            if (item.normalized === normalizedUser) score += 100;
            if (normalizedUser.includes(item.normalized)) score += 50;
            else if (item.normalized.includes(normalizedUser)) score += 40;

            const commonKeywords = userKeywords.filter(k => item.keywords.includes(k)).length;
            const totalUnique = new Set([...userKeywords, ...item.keywords]).size;
            if (totalUnique > 0) {
                const jaccard = (commonKeywords / totalUnique) * 100;
                score += jaccard * 2;
            }

            if (userKeywords.length < 3 && item.keywords.length < 3) {
                const dist = levenshtein(normalizedUser, item.normalized);
                const maxLen = Math.max(normalizedUser.length, item.normalized.length);
                if (maxLen > 0) {
                    const similarity = (1 - dist / maxLen) * 100;
                    score += similarity * 1.5;
                }
            }

            const profaneWords = ['fuck', 'shit', 'damn', 'bitch', 'ass', 'cunt', 'dick', 'bastard', 'prick', 'twat', 'wanker', 'arse', 'bollocks', 'bloody', 'motherfucker', 'cocksucker', 'shithead', 'dickhead', 'piss', 'pussy', 'fucktard', 'goddamn', 'shitfuck', 'fuckstick', 'dickweed', 'asshat', 'shitlord', 'fuckwad', 'twatwaffle', 'cuntpunt', 'fucknugget', 'bitchtits'];
            const memeWords = ['meme', 'drake', 'spongebob', 'pooh', 'gigachad', 'keyboard cat', 'disaster girl', 'this is fine', 'distracted boyfriend', 'woman yelling at cat', 'hide the pain harold', 'expanding brain', 'grumpy cat', 'success kid'];
            
            for (let word of profaneWords) {
                if (normalizedUser.includes(word) && item.normalized.includes(word)) score += 20;
            }
            for (let phrase of memeWords) {
                if (normalizedUser.includes(phrase) && item.normalized.includes(phrase)) score += 30;
            }

            const anyWordMatch = item.keywords.some(k => normalizedUser.includes(k));
            if (anyWordMatch) score += 5;

            if (score > bestScore) {
                bestScore = score;
                bestMatch = item;
            }
        }

        return bestScore > 20 ? bestMatch : null; // lowered threshold a bit
    }

    async function getAIResponse(userMessage) {
        if (!knowledgeBase.length) {
            console.warn('Knowledge base is empty – check file loading.');
            return "I have no knowledge loaded. Please check console for errors.";
        }
        const match = findBestMatch(userMessage, knowledgeBase);
        return match ? match.answer : "I don't know how to answer that yet. What would be a good response? (Or type 'skip' to ignore)";
    }

    // ---------- Learning & UI (unchanged) ----------
    let pendingQuestion = null;
    async function handleUserMessage(message) { /* unchanged */ }
    function addMessage(text, sender, isTyping) { /* unchanged */ }
    function removeTypingIndicator(element) { /* unchanged */ }

    // ---------- API Key Handling (simplified – no JSON, just concatenated text) ----------
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
                    // Add a marker to separate files (optional)
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

    // ---------- Parse combined text (with file markers) ----------
    function parseCombinedKnowledge(combinedText) {
        // Split by file markers to handle each file separately
        const fileBlocks = combinedText.split(/\n#FILE: [^\n]+\n/);
        // The first block is before the first marker (ignore)
        let baseKnowledge = [];
        for (let i = 1; i < fileBlocks.length; i++) {
            const block = fileBlocks[i];
            // Determine file type from the marker (we lost the filename, but we can assume .pai if content matches)
            // Better: we stored filename in marker, but we can't easily extract. For simplicity, we'll try both parsers.
            // Actually, we can use the marker line to know the file extension.
            // Let's re-parse the combined text to extract filename and content.
            // Simpler: we'll just try both parsers on each block and combine results.
            // This is a hack, but works.
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

        // If no knowledge, show a warning message
        if (knowledgeBase.length === 0) {
            addMessage('⚠️ No knowledge files loaded. Check console for errors.', 'ai');
        }
    }

    init().catch(console.error);
})();
