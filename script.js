// PackAi – Pure In-Memory AI Engine (No Storage)

(function() {
    // ---------- Configuration ----------
    const MODES = {
        default: ['cuss-dialouge.txt', 'dialogue.txt', 'language.txt', 'nerd-vs-bully-vs-normal.txt', 'roasted-dialouge.txt', 'sarcasm.txt', 'Human.PAI', 'Logic.PAI', 'code-dialouge.txt', 'heroic.pai'],
        cuss: ['cuss-dialouge.txt'],
        human: ['Human.PAI'],
        logic: ['Logic.PAI'],
        sarcasm: ['sarcasm.txt'],
        heroic: ['heroic.pai'],
        language: ['language.txt']
    };

    let DIALOGUE_FILES = MODES.default;
    let knowledgeBase = [];

    const messagesDiv = document.getElementById('messages');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');
    const modeSelector = document.getElementById('mode-selector');

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

    // Stopwords
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

    // ---------- Extract Keywords ----------
    function extractKeywords(text) {
        const words = text.toLowerCase().split(/\s+/);
        return words.filter(w => w.length > 2 && !stopwords.has(w));
    }

    // ---------- Fetch Files ----------
    async function fetchFile(fileName) {
        try {
            console.log(`Fetching ${fileName}...`);
            const response = await fetch(fileName);
            if (!response.ok) {
                console.warn(`Failed to load ${fileName}: ${response.status}`);
                return null;
            }
            return await response.text();
        } catch (error) {
            console.error(`Error fetching ${fileName}:`, error);
            return null;
        }
    }

  function parseTxt(content) {
    const lines = content.split('\n');
    const pairs = [];
    
    for (let line of lines) {
        line = line.trim();
        if (!line) continue;
        
        let question, answer;
        
        // Try different separators in order
        if (line.includes('::')) {
            const parts = line.split('::');
            question = parts[0].trim();
            answer = parts.slice(1).join('::').trim();
        } else if (line.includes('|')) {
            const parts = line.split('|');
            question = parts[0].trim();
            answer = parts.slice(1).join('|').trim();
        } else if (line.includes('\t')) {
            const parts = line.split('\t');
            question = parts[0].trim();
            answer = parts.slice(1).join('\t').trim();
        } else if (line.includes(':')) {
            const parts = line.split(':');
            question = parts[0].trim();
            answer = parts.slice(1).join(':').trim();
        } else {
            // No separator found, just accept the whole line
            question = line;
            answer = line;
        }
        
        if (question && answer) {
            const normalized = normalize(question);
            const keywords = extractKeywords(normalized);
            pairs.push({ question, answer, normalized, keywords });
        }
    }
    
    return pairs;
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

    // ---------- Sentiment ----------
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

    // ---------- Topics ----------
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
                    matrix[i][j] = Math.min(
                        matrix[i-1][j-1] + 1,
                        Math.min(matrix[i][j-1] + 1, matrix[i-1][j] + 1)
                    );
                }
            }
        }
        return matrix[b.length][a.length];
    }

    // ---------- Advanced Matching ----------
    function findBestMatch(userMessage, knowledge) {
        const normalizedUser = normalize(userMessage);
        const userKeywords = extractKeywords(normalizedUser);
        const sentiment = detectSentiment(userMessage);
        const userTopics = detectTopics(userMessage);
        
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

            const profaneWords = ['fuck', 'shit', 'damn', 'bitch', 'ass', 'cunt', 'dick'];
            const memeWords = ['meme', 'drake', 'spongebob', 'pooh', 'gigachad'];
            
            for (let word of profaneWords) {
                if (normalizedUser.includes(word) && item.normalized.includes(word)) score += 20;
            }
            for (let phrase of memeWords) {
                if (normalizedUser.includes(phrase) && item.normalized.includes(phrase)) score += 30;
            }

            const anyWordMatch = item.keywords.some(k => normalizedUser.includes(k));
            if (anyWordMatch) score += 5;

            if (sentiment === 'positive' && item.answer.toLowerCase().includes('glad')) score += 10;
            if (sentiment === 'negative' && (item.answer.toLowerCase().includes('sorry') || item.answer.toLowerCase().includes('sad'))) score += 10;

            const itemTopics = detectTopics(item.question);
            const commonTopics = userTopics.filter(t => itemTopics.includes(t));
            score += commonTopics.length * 15;

            if (score > bestScore) {
                bestScore = score;
                bestMatch = item;
            }
        }

        return bestScore > 20 ? bestMatch : null;
    }

    function getAIResponse(userMessage) {
        if (!knowledgeBase.length) {
            return "I have no knowledge loaded. Please check that your files exist.";
        }
        const match = findBestMatch(userMessage, knowledgeBase);
        return match ? match.answer : "I don't know how to answer that.";
    }

    // ---------- UI ----------
    function addMessage(text, sender) {
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
        messagesDiv.appendChild(messageDiv);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
        return messageDiv;
    }

    function handleUserMessage(message) {
        const trimmed = message.trim();
        if (!trimmed) return;

        addMessage(trimmed, 'user');
        userInput.value = '';

        const response = getAIResponse(trimmed);
        addMessage(response, 'ai');
    }

    // ---------- Load Knowledge ----------
    async function loadKnowledge(fileList) {
        knowledgeBase = [];
        
        for (const file of fileList) {
            const content = await fetchFile(file);
            if (!content) continue;
            
            if (file.toLowerCase().endsWith('.pai')) {
                const pairs = parsePAI(content);
                console.log(`Loaded ${pairs.length} pairs from ${file} (PAI)`);
                knowledgeBase = knowledgeBase.concat(pairs);
            } else {
                const pairs = parseTxt(content);
                console.log(`Loaded ${pairs.length} pairs from ${file} (TXT)`);
                knowledgeBase = knowledgeBase.concat(pairs);
            }
        }

        console.log(`Total knowledge: ${knowledgeBase.length} entries`);
        
        const modeName = modeSelector.selectedOptions[0].textContent;
        addMessage(`Switched to ${modeName}. How can I help?`, 'ai');
    }

    // ---------- Mode Switching ----------
    async function switchMode(mode) {
        const files = MODES[mode];
        if (!files) return;
        DIALOGUE_FILES = files;
        messagesDiv.innerHTML = '';
        await loadKnowledge(files);
    }

    // ---------- Initialization ----------
    async function init() {
        // Set up mode selector
        modeSelector.addEventListener('change', (e) => {
            switchMode(e.target.value);
        });

        // Load default mode
        await loadKnowledge(MODES.default);

        // Attach event listeners
        sendButton.addEventListener('click', () => handleUserMessage(userInput.value));
        userInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleUserMessage(userInput.value);
        });

        console.log('PackAi ready - pure in-memory mode');
    }

    init().catch(console.error);
})();