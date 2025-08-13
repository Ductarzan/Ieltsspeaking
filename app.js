// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
    getAuth, 
    onAuthStateChanged,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { 
    getFirestore, 
    doc, 
    setDoc,
    addDoc,
    collection,
    getDocs,
    Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// --- Firebase Initialization ---
const firebaseConfig = {
    apiKey: "AIzaSyCMxajyXZ5P3N2IFgma3NfwNqQo5LSK6Is",
    authDomain: "test-ielts-speaking.firebaseapp.com",
    projectId: "test-ielts-speaking",
    storageBucket: "test-ielts-speaking.appspot.com",
    messagingSenderId: "630605740510",
    appId: "1:630605740510:web:8d0afb4192728c3b42854f",
    measurementId: "G-QD2F4L47VM"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- Gemini API Config ---
const GEMINI_API_KEY = "AIzaSyCwe_41_32LWIslaALPdMe-8KzqodA-Od8";
const GEMINI_MODEL = "gemini-2.0-flash-001";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;


// --- State Variables ---
let mediaRecorder;
let audioChunks = [];
let timerInterval;
let wpmChartInstance, wpmGaugeInstance;
let currentQuestion = {};
let userTranscript = "";
let currentResultsData = {};

const questions = [
    { title: "Describe a historical place you have visited.", cues: ["what it is", "where it is located", "what is its historical significance", "and explain how you felt about visiting it."] },
    { title: "Describe a book you have read recently.", cues: ["what kind of book it is", "what the main story is about", "what you learned from it", "and explain why you would or would not recommend it to others."] },
    { title: "Describe a memorable trip you have taken.", cues: ["where you went", "who you went with", "what you did there", "and explain why it was so memorable for you."] },
    { title: "Describe a skill you would like to learn.", cues: ["what the skill is", "why you want to learn it", "how you would learn it", "and explain how you think this skill would help you in the future."] },
    { title: "Describe your favorite movie.", cues: ["what the movie is called", "what it is about", "who the main actors are", "and explain why it is your favorite movie."] }
];

// --- UI Elements ---
const authNavLoggedIn = document.getElementById('auth-nav-logged-in');
const authNavLoggedOut = document.getElementById('auth-nav-logged-out');
const userEmailDisplay = document.getElementById('user-email-display');

// --- Auth State Management ---
onAuthStateChanged(auth, user => {
    if (user) {
        authNavLoggedIn.classList.remove('hidden');
        authNavLoggedIn.classList.add('flex');
        authNavLoggedOut.classList.add('hidden');
        userEmailDisplay.textContent = user.email;
        if(document.getElementById('auth-page').classList.contains('active')) {
            loadQuestion();
            showPage('test-module');
        }
    } else {
        authNavLoggedIn.classList.add('hidden');
        authNavLoggedOut.classList.remove('hidden');
        userEmailDisplay.textContent = '';
    }
});

// --- Auth Form Logic ---
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = loginForm['login-email'].value;
    const password = loginForm['login-password'].value;
    document.getElementById('login-error').textContent = "";
    signInWithEmailAndPassword(auth, email, password).catch(err => document.getElementById('login-error').textContent = "Email hoặc mật khẩu không đúng.");
});
registerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = registerForm['register-email'].value;
    const password = registerForm['register-password'].value;
    document.getElementById('register-error').textContent = "";
    createUserWithEmailAndPassword(auth, email, password)
        .then(cred => setDoc(doc(db, "users", cred.user.uid), { email: cred.user.email, createdAt: new Date() }))
        .catch(err => document.getElementById('register-error').textContent = "Email đã tồn tại hoặc mật khẩu quá yếu.");
});
document.getElementById('logout-btn').addEventListener('click', () => signOut(auth).then(() => showPage('home')));
window.switchAuthForm = (form) => {
    const loginTab = document.getElementById('login-tab');
    const registerTab = document.getElementById('register-tab');
    if (form === 'login') {
        loginTab.classList.add('active'); registerTab.classList.remove('active');
        document.getElementById('login-form').classList.add('active'); document.getElementById('register-form').classList.remove('active');
    } else {
        loginTab.classList.remove('active'); registerTab.classList.add('active');
        document.getElementById('login-form').classList.remove('active'); document.getElementById('register-form').classList.add('active');
    }
}

// --- Page Navigation ---
window.showPage = (pageId) => {
    document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
    const newPage = document.getElementById(pageId + '-page');
    if (newPage) newPage.classList.add('active');
    window.scrollTo(0, 0);
}
document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const pageId = e.currentTarget.dataset.page;
        if (pageId === 'auth' && auth.currentUser) {
             loadQuestion();
             showPage('test-module');
        } else if (pageId) {
            showPage(pageId);
        }
    });
});

// --- App Logic ---
document.getElementById('start-btn').addEventListener('click', () => {
    document.getElementById('start-test-view').classList.add('hidden');
    document.getElementById('recording-view').classList.remove('hidden');
    startRecording();
});
document.getElementById('stop-btn').addEventListener('click', stopRecording);

document.getElementById('try-again-btn').addEventListener('click', () => {
     loadQuestion();
     document.getElementById('start-test-view').classList.remove('hidden');
     document.getElementById('recording-view').classList.add('hidden');
     showPage('test-module');
});

document.getElementById('retry-btn').addEventListener('click', () => {
     loadQuestion();
     document.getElementById('start-test-view').classList.remove('hidden');
     document.getElementById('recording-view').classList.add('hidden');
     showPage('test-module');
});

// --- Audio & Timer ---
async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        mediaRecorder.ondataavailable = event => audioChunks.push(event.data);
        mediaRecorder.onstop = handleRecordingStop;
        mediaRecorder.start();
        startTimer();
    } catch (err) {
        console.error("Mic access error:", err);
        showError("Không thể truy cập microphone. Vui lòng cấp quyền và thử lại.");
    }
}
function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
        clearInterval(timerInterval);
    }
}
function handleRecordingStop() {
    showPage('loading');
    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
    audioChunks = [];
    const reader = new FileReader();
    reader.readAsDataURL(audioBlob);
    reader.onloadend = () => getIeltsScore(reader.result.split(',')[1]);
}
function startTimer() {
     let timeLeft = 120;
     const timerEl = document.getElementById('timer');
     const updateDisplay = () => {
        const minutes = Math.floor(timeLeft / 60);
        const seconds = (timeLeft % 60).toString().padStart(2, '0');
        timerEl.textContent = `${minutes}:${seconds}`;
     };
     updateDisplay();
     timerInterval = setInterval(() => {
        timeLeft--;
        updateDisplay();
        if (timeLeft <= 0) stopRecording();
     }, 1000);
}

async function fetchWithTimeout(resource, options = {}, timeout = 20000) { // Reduced timeout to 20 seconds
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(resource, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        if (error.name === 'AbortError') {
            throw new Error('Request timed out. Please check your connection and try again.');
        }
        throw error;
    }
}

// --- Gemini API Calls ---
async function callGemini(prompt) {
    const payload = { contents: [{ parts: [{ text: prompt }] }] };
    const response = await fetchWithTimeout(GEMINI_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(`API Error ${response.status}`);
    const result = await response.json();
    if (!result.candidates || !result.candidates[0].content.parts[0].text) {
        throw new Error("Invalid response structure from API.");
    }
    return result.candidates[0].content.parts[0].text;
}

async function getIeltsScore(base64Audio) {
    showPage('loading');
    try {
        const prompt = `You are an expert IELTS examiner. You will be given an audio recording of a user's response to an IELTS Speaking Part 2 question.
        First, transcribe the user's entire response.
        Then, analyze the transcript and the audio characteristics to provide a detailed evaluation based on the official IELTS criteria.
        The question was: "${currentQuestion.title}"
        Cues: ${currentQuestion.cues.join(', ')}.

        Provide your response as a single, valid JSON object. Do not include any text or markdown formatting before or after the JSON object. The JSON object must have the following structure:
        {
          "transcript": "The full transcription of the user's speech.",
          "overall_score": A number from 1.0 to 9.0, rounded to the nearest 0.5.
          "pronunciation": { "score": A number from 1.0 to 9.0, "level": A string like "Good", "Needs Improvement", etc., "percentage": An integer from 0 to 100, "feedback": "Detailed feedback on pronunciation with examples." },
          "intonation": { "level": A string like "Good", "Needs Improvement", etc., "percentage": An integer from 0 to 100, "feedback": "Detailed feedback on intonation." },
          "fluency": { "score": A number from 1.0 to 9.0, "level": A string like "Fluent", "Some Hesitation", etc., "percentage": An integer from 0 to 100, "feedback": "Detailed feedback on fluency, coherence, and self-correction.", "pace": A string like "Good", "Too Fast", "Too Slow", "pausing": A string like "Appropriate", "Too Long", etc., "hesitations": A string like "Few", "Many", etc., "pacing_feedback": "Detailed feedback on the speaking rate.", "wpm": An integer representing words per minute, "wpm_timeline": An array of numbers representing WPM over time chunks. },
          "grammar": { "score": A number from 1.0 to 9.0, "level": A string like "Good Range", "Limited", etc., "percentage": An integer from 0 to 100, "feedback": "Detailed feedback on grammatical range and accuracy with corrected examples from the transcript." },
          "vocabulary": { "score": A number from 1.0 to 9.0, "level": A string like "Effective", "Repetitive", etc., "percentage": An integer from 0 to 100, "feedback": "Detailed feedback on lexical resource, including use of less common vocabulary and idiomatic language, with examples." }
        }`;

        const payload = {
            contents: [{
                parts: [
                    { text: prompt },
                    { inlineData: { mimeType: "audio/webm", data: base64Audio } }
                ]
            }],
            generationConfig: { "responseMimeType": "application/json" }
        };
        
        const response = await fetchWithTimeout(GEMINI_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorBody = await response.json().catch(() => ({error: {message: "Unknown API error"}}));
            throw new Error(`API Error ${response.status}: ${errorBody.error?.message || 'Failed to get a valid response from the server.'}`);
        }
        const result = await response.json();

        if (!result.candidates || !result.candidates[0].content.parts[0].text) {
             throw new Error("API returned an empty or invalid response. This might be due to safety settings or an issue with the prompt.");
        }

        let parsedData;
        const responseText = result.candidates[0].content.parts[0].text;
        
        try {
            parsedData = JSON.parse(responseText);
        } catch (e) {
            console.error("Failed to parse JSON:", responseText);
            throw new Error("The AI returned an invalid data format. Please try again.");
        }
        
        await saveTestResult(parsedData);
        displayResults(parsedData);
    } catch (error) {
        console.error("Scoring error:", error);
        showError(error.message);
    }
}

document.getElementById('suggest-answer-btn').addEventListener('click', async () => {
    const modal = document.getElementById('suggestion-modal');
    const contentEl = document.getElementById('suggestion-content');
    modal.classList.remove('hidden');
    contentEl.innerHTML = '<div class="loader mx-auto"></div>';
    
    try {
        const prompt = `You are an expert IELTS instructor. For the following IELTS Speaking Part 2 topic, please write a high-scoring, well-structured sample answer of about 250 words. The topic is: "${currentQuestion.title}" with the cues: ${currentQuestion.cues.join(', ')}. The response should be in English.`;
        const result = await callGemini(prompt);
        contentEl.innerHTML = result.replace(/\n/g, '<br>');
    } catch (error) {
        contentEl.textContent = "Không thể tạo gợi ý lúc này. Vui lòng thử lại.";
        console.error("Suggestion error:", error);
    }
});

document.getElementById('expand-topic-btn').addEventListener('click', async () => {
    const contentEl = document.getElementById('expand-topic-content');
    const btn = document.getElementById('expand-topic-btn');
    const icon = btn.querySelector('i');

    if (contentEl.classList.contains('hidden')) {
        contentEl.classList.remove('hidden');
        icon.classList.replace('fa-chevron-down', 'fa-chevron-up');
        if (contentEl.innerHTML.trim() === "") { // Only fetch if content is empty
            contentEl.innerHTML = '<div class="loader mx-auto"></div>';
            try {
                const prompt = `You are an expert IELTS instructor. Based on the user's answer to an IELTS Speaking Part 2 question, provide some materials for further practice. The original question was: "${currentQuestion.title}". The user's answer was: "${userTranscript}". Please provide: 1. A list of 5-7 advanced vocabulary words or phrases relevant to the topic with brief Vietnamese definitions. 2. A list of 2-3 relevant idioms with explanations in English and Vietnamese. 3. A list of 3-4 potential IELTS Speaking Part 3 follow-up questions. Format your response clearly in Markdown.`;
                const result = await callGemini(prompt);
                // FIX: Use marked.parse to correctly render markdown
                contentEl.innerHTML = marked.parse(result);
            } catch (error) {
                contentEl.textContent = "Không thể tạo nội dung mở rộng lúc này. Vui lòng thử lại.";
                console.error("Expansion error:", error);
            }
        }
    } else {
        contentEl.classList.add('hidden');
        icon.classList.replace('fa-chevron-up', 'fa-chevron-down');
    }
});

document.getElementById('close-modal-btn').addEventListener('click', () => {
    document.getElementById('suggestion-modal').classList.add('hidden');
});

// --- History Feature ---
async function saveTestResult(data) {
    const user = auth.currentUser;
    if (!user) return; // Don't save if not logged in

    try {
        await addDoc(collection(db, "users", user.uid, "history"), {
            overall_score: data.overall_score || 0,
            questionTitle: currentQuestion.title,
            date: Timestamp.now(),
            full_data: JSON.stringify(data) // Store full data for potential detailed view later
        });
    } catch (error) {
        console.error("Error saving test result: ", error);
    }
}

async function loadHistory() {
    const user = auth.currentUser;
    const historyListEl = document.getElementById('history-list');
    if (!user) {
        historyListEl.innerHTML = '<p>Vui lòng đăng nhập để xem lịch sử.</p>';
        return;
    };

    historyListEl.innerHTML = '<div class="loader mx-auto"></div>';
    
    try {
        const historyCollection = collection(db, "users", user.uid, "history");
        const querySnapshot = await getDocs(historyCollection);
        
        if (querySnapshot.empty) {
            historyListEl.innerHTML = '<p class="text-center text-slate-500">Bạn chưa có bài thi nào trong lịch sử.</p>';
            return;
        }

        historyListEl.innerHTML = ''; // Clear loader
        const results = [];
        querySnapshot.forEach(doc => {
            results.push({ id: doc.id, ...doc.data() });
        });

        // Sort by date, newest first
        results.sort((a, b) => b.date.seconds - a.date.seconds);

        results.forEach(data => {
            const date = data.date.toDate();
            const formattedDate = `${date.toLocaleDateString('vi-VN')} ${date.toLocaleTimeString('vi-VN')}`;
            const itemEl = document.createElement('div');
            itemEl.className = 'bg-slate-50 p-4 rounded-lg flex justify-between items-center hover:bg-slate-100 transition-colors';
            itemEl.innerHTML = `
                <div>
                    <p class="font-semibold text-slate-800">${data.questionTitle}</p>
                    <p class="text-sm text-slate-500">${formattedDate}</p>
                </div>
                <div class="text-2xl font-bold text-blue-600">
                    ${(data.overall_score).toFixed(1)}
                </div>
            `;
            historyListEl.appendChild(itemEl);
        });

    } catch (error) {
        console.error("Error loading history: ", error);
        historyListEl.innerHTML = '<p class="text-center text-red-500">Không thể tải lịch sử. Vui lòng thử lại.</p>';
    }
}

document.getElementById('history-link').addEventListener('click', async (e) => {
    e.preventDefault();
    await loadHistory();
    showPage('history');
});


// --- UI Updates & Rendering ---
function displayResults(data) {
    currentResultsData = data;
    userTranscript = data.transcript || ""; // Save transcript for expansion feature
    document.getElementById('part2-score').textContent = (data.overall_score || 0).toFixed(1);
    
    renderSidebar(data);
    renderContent('fluency'); // Show fluency by default
    
    showPage('results');
}

function renderSidebar(data) {
    const container = document.getElementById('sidebar-container');
    container.innerHTML = '';
    const criteria = [
        { id: 'fluency', name: 'Fluency', icon: 'fa-comments', data: data.fluency },
        { id: 'pronunciation', name: 'Pronunciation', icon: 'fa-microphone-lines', data: data.pronunciation },
        { id: 'grammar', name: 'Grammar', icon: 'fa-spell-check', data: data.grammar },
        { id: 'vocabulary', name: 'Vocabulary', icon: 'fa-book-open', data: data.vocabulary },
        { id: 'intonation', name: 'Intonation', icon: 'fa-wave-square', data: data.intonation },
    ];

    criteria.forEach((item, index) => {
        const itemData = item.data || {};
        const el = document.createElement('div');
        el.id = `sb-${item.id}`;
        el.className = `sidebar-item flex justify-between items-center p-3 rounded-lg cursor-pointer transition-colors duration-200 hover:bg-slate-100 ${index === 0 ? 'active' : ''}`;
        el.innerHTML = `
            <div class="flex items-center">
                <i class="fa-solid ${item.icon} mr-3 text-blue-500 w-6 text-center"></i>
                <div>
                    <p class="font-semibold">${item.name}</p>
                    <p class="text-sm text-slate-500">${itemData.level || 'N/A'}</p>
                </div>
            </div>
            <i class="fa-solid fa-chevron-right"></i>
        `;
        el.addEventListener('click', () => renderContent(item.id));
        container.appendChild(el);
    });
}

function renderContent(criteriaId) {
    document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
    document.getElementById(`sb-${criteriaId}`).classList.add('active');

    const container = document.getElementById('content-container');
    const data = currentResultsData[criteriaId];
    if (!data) {
        container.innerHTML = '<p>No data available for this section.</p>';
        return;
    }

    let contentHTML = `
        <div class="flex items-center justify-between mb-4">
            <div>
                <p class="text-sm text-slate-500">Your Level</p>
                <h4 class="text-2xl font-bold">${data.level || 'N/A'}</h4>
            </div>
            <div class="text-right">
                <p class="text-3xl font-bold text-blue-600">${data.percentage ? `${data.percentage}%` : '-'}</p>
            </div>
        </div>
        <div class="w-full progress-bar-bg rounded-full h-2.5 mb-4">
            <div class="progress-bar-fill h-2.5 rounded-full" style="width: ${data.percentage || 0}%"></div>
        </div>
        <h5 class="font-bold text-lg mt-6 mb-2">Feedback</h5>
        <p class="text-slate-600 mb-8">${data.feedback || 'No feedback available.'}</p>
    `;

    if (criteriaId === 'fluency') {
        contentHTML += `
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 border-t pt-6 mt-6">
                <div class="text-center"><p class="text-sm text-slate-500">Pace</p><p class="font-semibold text-lg">${data.pace || 'N/A'}</p></div>
                <div class="text-center"><p class="text-sm text-slate-500">Pausing</p><p class="font-semibold text-lg">${data.pausing || 'N/A'}</p></div>
                <div class="text-center"><p class="text-sm text-slate-500">Hesitations</p><p class="font-semibold text-lg">${data.hesitations || 'N/A'}</p></div>
            </div>
            <div class="flex flex-col md:flex-row items-center gap-6 mb-8">
                <div class="w-full md:w-1/3">
                    <div class="relative w-full" style="padding-bottom: 50%;">
                        <canvas id="wpm-gauge"></canvas>
                    </div>
                </div>
                <div class="w-full md:w-2/3">
                    <h5 class="font-bold text-lg">Pacing</h5>
                    <p class="text-slate-600">${data.pacing_feedback || ''}</p>
                </div>
            </div>
            <h5 class="font-bold text-lg mb-4">Pacing Overview</h5>
            <div class="h-64"><canvas id="wpm-chart"></canvas></div>
        `;
    }
     if (criteriaId === 'pronunciation' || criteriaId === 'grammar' || criteriaId === 'vocabulary') {
        contentHTML += `
        <div class="border-t pt-6 mt-6">
         <h5 class="font-bold text-lg mb-2">Transcript</h5>
         <p class="text-slate-600 bg-white p-4 rounded-lg">${userTranscript}</p>
        </div>
        `;
    }

    container.innerHTML = contentHTML;

    if (criteriaId === 'fluency' && data.wpm && data.wpm_timeline) {
        renderWpmGauge(data.wpm);
        renderWpmChart(data.wpm_timeline);
    }
}

function renderWpmGauge(wpm) {
    const ctx = document.getElementById('wpm-gauge')?.getContext('2d');
    if (!ctx) return;
    if (wpmGaugeInstance) wpmGaugeInstance.destroy();
    wpmGaugeInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['WPM', ''],
            datasets: [{
                data: [wpm, 200 - wpm],
                backgroundColor: ['#3b82f6', '#e5e7eb'],
                borderWidth: 0,
            }]
        },
        options: {
            rotation: -90,
            circumference: 180,
            cutout: '70%',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { enabled: false } }
        }
    });
}

function renderWpmChart(wpmData) {
    const ctx = document.getElementById('wpm-chart')?.getContext('2d');
    if (!ctx || !wpmData) return;
    if (wpmChartInstance) wpmChartInstance.destroy();
    wpmChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: wpmData.map((_, i) => `Seg ${i+1}`),
            datasets: [{
                label: 'Words Per Minute',
                data: wpmData,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                fill: true,
                tension: 0.4
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

function showError(message) {
    document.getElementById('error-message').textContent = message;
    showPage('error');
}
function loadQuestion() {
     const question = questions[Math.floor(Math.random() * questions.length)];
     currentQuestion = question;
     document.getElementById('question-title').textContent = question.title;
     const cuesEl = document.getElementById('question-cues');
     cuesEl.innerHTML = '';
     question.cues.forEach(cue => {
        const li = document.createElement('li');
        li.textContent = cue;
        cuesEl.appendChild(li);
     });
     // Reset expansion content for the new question
     const expandContent = document.getElementById('expand-topic-content');
     expandContent.innerHTML = '';
     expandContent.classList.add('hidden');
     document.getElementById('expand-topic-btn').querySelector('i').classList.replace('fa-chevron-up', 'fa-chevron-down');
}

// --- Initial Load ---
showPage('home');




