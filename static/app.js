/* ═══════════════════════════════════════════════════════════════
   Sunschool — Thin Chat UI Client
   Vanilla JS SPA with hash-based routing, Google Sign-In,
   and calls to the FastAPI backend.
   ═══════════════════════════════════════════════════════════════ */

// ---------------------------------------------------------------------------
// Config — Auth config is fetched from the server at /api/config/auth
// ---------------------------------------------------------------------------
const API = '';  // same origin

let googleClientId = null;
let authReady = false;

// Parsed user info from the Google ID token (JWT)
let _currentUser = null;

async function initAuth() {
  if (authReady) return;
  try {
    const res = await fetch(`${API}/api/config/auth`);
    if (!res.ok) {
      console.warn('Auth config endpoint unavailable');
      return;
    }
    const config = await res.json();
    googleClientId = config.clientId || config.client_id;
    if (!googleClientId) {
      console.warn('No Google client ID returned from /api/config/auth');
      return;
    }
    authReady = true;

    // Restore session from sessionStorage if available
    const storedToken = sessionStorage.getItem('id_token');
    if (storedToken) {
      _currentUser = parseJwt(storedToken);
      // Check if token is expired
      if (_currentUser && _currentUser.exp && _currentUser.exp * 1000 < Date.now()) {
        // Token expired — clear and force re-login
        sessionStorage.removeItem('id_token');
        _currentUser = null;
      }
    }
  } catch (err) {
    console.warn('Could not init auth:', err);
  }
}

function parseJwt(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64).split('').map(c =>
        '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
      ).join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------
function currentUser() {
  return _currentUser;
}

async function getIdToken() {
  return sessionStorage.getItem('id_token');
}

async function authHeaders() {
  const token = await getIdToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

function handleCredentialResponse(response) {
  if (!response.credential) {
    console.error('No credential in Google response');
    return;
  }
  // Store the ID token (JWT) in sessionStorage
  sessionStorage.setItem('id_token', response.credential);
  _currentUser = parseJwt(response.credential);
  navigate('#/chat');
}

function signInWithGoogle() {
  if (!authReady || !googleClientId) {
    console.error('Google Sign-In not initialized');
    alert('Sign-in is not available yet. Please refresh and try again.');
    return;
  }
  // Use One Tap prompt as a fallback trigger
  google.accounts.id.prompt();
}

function signOut() {
  if (authReady) {
    google.accounts.id.disableAutoSelect();
  }
  sessionStorage.clear();
  _currentUser = null;
  // Reset learner state
  state.learners = [];
  state.learnersLoaded = false;
  state.onboardingChecked = false;
  state.needsOnboarding = false;
  state.currentLearnerId = null;
  state.conversations = [];
  state.currentConversationId = null;
  state.messages = [];
  state.points = 0;
  navigate('#/');
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const state = {
  messages: [],
  conversations: [],
  points: 0,
  loading: false,
  currentConversationId: null,
  currentLearnerId: null,
  learners: [],           // child learners for this parent
  learnersLoaded: false,  // whether we've fetched learners yet
  onboardingChecked: false, // whether we've called /api/onboarding/status
  needsOnboarding: false,   // true if user has no children yet
  auditMessages: [],
  auditFilter: { role: 'all', search: '' },
  mastery: [],
  guidelines: '',
  guidelinesSaving: false,
};

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------
function handleAuthError(res) {
  if (res.status === 401) {
    // Token expired or invalid — prompt re-login
    sessionStorage.removeItem('id_token');
    _currentUser = null;
    alert('Your session has expired. Please sign in again.');
    navigate('#/');
    return true;
  }
  return false;
}

async function apiGet(path) {
  const headers = await authHeaders();
  const res = await fetch(`${API}${path}`, { headers });
  if (handleAuthError(res)) return;
  if (!res.ok) throw new Error(`GET ${path}: ${res.status}`);
  return res.json();
}

async function apiPost(path, body) {
  const headers = await authHeaders();
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (handleAuthError(res)) return;
  if (!res.ok) throw new Error(`POST ${path}: ${res.status}`);
  return res.json();
}

async function apiPut(path, body) {
  const headers = await authHeaders();
  const res = await fetch(`${API}${path}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  });
  if (handleAuthError(res)) return;
  if (!res.ok) throw new Error(`PUT ${path}: ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------
async function fetchConversations(learnerId) {
  try {
    state.conversations = await apiGet(`/api/conversations?learner_id=${learnerId}`);
  } catch (err) {
    console.error('fetchConversations:', err);
    state.conversations = [];
  }
}

async function fetchMessages(conversationId, page = 1) {
  try {
    const data = await apiGet(`/api/conversations/${conversationId}/messages?page=${page}&page_size=50`);
    state.messages = data.messages || [];
  } catch (err) {
    console.error('fetchMessages:', err);
    state.messages = [];
  }
}

async function sendMessage(conversationId, text) {
  state.loading = true;
  render();
  try {
    const data = await apiPost(`/api/conversations/${conversationId}/message`, {
      message: text,
    });
    state.messages.push({
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
      metadata: {},
    });
    if (data.message) {
      state.messages.push(data.message);
    }
    if (data.quiz_detected && data.quiz_data) {
      state.messages[state.messages.length - 1].metadata = {
        ...state.messages[state.messages.length - 1].metadata,
        quiz_detected: true,
        quiz: data.quiz_data,
      };
    }
  } catch (err) {
    console.error('sendMessage:', err);
    state.messages.push({
      id: `error-${Date.now()}`,
      role: 'system',
      content: 'Failed to send message. Please try again.',
      created_at: new Date().toISOString(),
      metadata: {},
    });
  } finally {
    state.loading = false;
    render();
    scrollToBottom();
  }
}

async function submitAnswer(conversationId, quizData, answer) {
  state.loading = true;
  render();
  try {
    const data = await apiPost(`/api/conversations/${conversationId}/answer`, {
      question: quizData.question || '',
      expected_answer: quizData.expected_answer || quizData.correct_answer || '',
      student_answer: answer,
      concepts: quizData.concepts || [],
    });
    if (data.points_awarded) {
      state.points += data.points_awarded;
    }
    state.messages.push({
      id: `feedback-${Date.now()}`,
      role: 'assistant',
      content: data.feedback || (data.is_correct ? 'Correct!' : 'Not quite. Keep trying!'),
      created_at: new Date().toISOString(),
      metadata: { answer_result: data },
    });
  } catch (err) {
    console.error('submitAnswer:', err);
  } finally {
    state.loading = false;
    render();
    scrollToBottom();
  }
}

async function fetchPoints(learnerId) {
  try {
    const data = await apiGet(`/api/learners/${learnerId}/points`);
    state.points = data.total_points || data.points || 0;
  } catch (err) {
    console.error('fetchPoints:', err);
  }
}

async function fetchMastery(learnerId) {
  try {
    const data = await apiGet(`/api/learners/${learnerId}/mastery`);
    state.mastery = data.concepts || data.mastery || [];
  } catch (err) {
    console.error('fetchMastery:', err);
    state.mastery = [];
  }
}

async function fetchAuditMessages(learnerId, promptType) {
  try {
    let url = `/api/audit/prompts?learner_id=${encodeURIComponent(learnerId)}&page=1&page_size=200`;
    if (promptType) {
      url += `&prompt_type=${encodeURIComponent(promptType)}`;
    }
    const data = await apiGet(url);
    state.auditMessages = data.entries || [];
  } catch (err) {
    console.error('fetchAuditMessages:', err);
    state.auditMessages = [];
  }
}

async function fetchGuidelines() {
  try {
    const data = await apiGet('/api/parent/guidelines');
    state.guidelines = data.guidelines || '';
  } catch {
    state.guidelines = '';
  }
}

async function saveGuidelines(text) {
  state.guidelinesSaving = true;
  render();
  try {
    await apiPut('/api/parent/guidelines', { guidelines: text });
    state.guidelines = text;
  } catch (err) {
    console.error('saveGuidelines:', err);
    alert('Failed to save guidelines.');
  } finally {
    state.guidelinesSaving = false;
    render();
  }
}

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------
async function checkOnboardingStatus() {
  try {
    const data = await apiGet('/api/onboarding/status');
    state.needsOnboarding = data.needs_onboarding;
    state.onboardingChecked = true;
    // Also populate learners from this response
    if (data.learners && data.learners.length > 0) {
      state.learners = data.learners.map(l => ({
        learner_id: l.id,
        name: l.name,
        grade_level: l.grade_level,
      }));
      state.learnersLoaded = true;
      // Restore or set selected learner
      const stored = sessionStorage.getItem('selected_learner_id');
      if (stored && state.learners.some(l => l.learner_id === stored)) {
        state.currentLearnerId = stored;
      } else {
        state.currentLearnerId = state.learners[0].learner_id;
        sessionStorage.setItem('selected_learner_id', state.currentLearnerId);
      }
    } else {
      state.learners = [];
      state.learnersLoaded = true;
    }
  } catch (err) {
    console.error('checkOnboardingStatus:', err);
    state.onboardingChecked = true;
    state.needsOnboarding = false;
  }
}

async function submitOnboarding(children) {
  // children: [{name: string, grade_level: int}]
  try {
    const data = await apiPost('/api/onboarding/setup', { children });
    // Update state with new learners
    state.learners = data.learners.map(l => ({
      learner_id: l.id,
      name: l.name,
      grade_level: l.grade_level,
    }));
    state.learnersLoaded = true;
    state.needsOnboarding = false;
    // Select first learner and load their conversation
    const first = data.learners[0];
    state.currentLearnerId = first.id;
    sessionStorage.setItem('selected_learner_id', first.id);
    // Pre-set conversation so chat loads immediately
    state.currentConversationId = first.conversation_id;
    return data;
  } catch (err) {
    console.error('submitOnboarding:', err);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Learner management
// ---------------------------------------------------------------------------
async function fetchLearners() {
  try {
    const data = await apiGet('/api/learners');
    state.learners = data.learners || [];
    state.learnersLoaded = true;

    // Restore selected learner from sessionStorage
    const stored = sessionStorage.getItem('selected_learner_id');
    if (stored && state.learners.some(l => l.learner_id === stored)) {
      state.currentLearnerId = stored;
    } else if (state.learners.length > 0) {
      // Default to first child
      state.currentLearnerId = state.learners[0].learner_id;
      sessionStorage.setItem('selected_learner_id', state.currentLearnerId);
    }
    // If no children, currentLearnerId stays null — setup flow will trigger
  } catch (err) {
    console.error('fetchLearners:', err);
    state.learners = [];
    state.learnersLoaded = true;
  }
}

async function createLearner(name, gradeLevel) {
  try {
    const data = await apiPost('/api/learners', {
      name: name,
      grade_level: gradeLevel,
    });
    // Add to local state
    state.learners.push(data);
    // Select the new learner
    state.currentLearnerId = data.learner_id;
    sessionStorage.setItem('selected_learner_id', data.learner_id);
    return data;
  } catch (err) {
    console.error('createLearner:', err);
    throw err;
  }
}

function selectLearner(learnerId) {
  state.currentLearnerId = learnerId;
  sessionStorage.setItem('selected_learner_id', learnerId);
  // Reset conversation state for the new learner
  state.conversations = [];
  state.currentConversationId = null;
  state.messages = [];
  state.points = 0;
  // Re-trigger route to reload data
  onRouteChange();
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
function navigate(hash) {
  window.location.hash = hash;
}

function getRoute() {
  const hash = window.location.hash || '#/';
  return hash.slice(1); // remove #
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    const el = document.querySelector('.chat-messages');
    if (el) el.scrollTop = el.scrollHeight;
  });
}

// ---------------------------------------------------------------------------
// Components (return HTML strings)
// ---------------------------------------------------------------------------

function googleIcon() {
  return `<svg viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>`;
}

function renderLogin() {
  requestAnimationFrame(() => {
    const btnContainer = document.getElementById('g-signin-btn');
    if (btnContainer && authReady && typeof google !== 'undefined' && google.accounts && google.accounts.id) {
      if (!window._gsiInitDone) {
        google.accounts.id.initialize({
          client_id: googleClientId,
          callback: handleCredentialResponse,
          auto_select: true,
        });
        window._gsiInitDone = true;
      }
      google.accounts.id.renderButton(btnContainer, {
        theme: 'outline',
        size: 'large',
        width: 300,
        text: 'signin_with',
        shape: 'rectangular',
      });
    }
  });

  return `
    <div class="login-page">
      <div class="login-card">
        <h1>&#9728; Sunschool</h1>
        <p>Learn anything with your AI tutor</p>
        <div id="g-signin-btn" style="display:flex;justify-content:center;margin-top:1.5rem;min-height:44px;"></div>
      </div>
    </div>
  `;
}

function renderOnboarding() {
  const gradeOptions = [
    { value: 0, label: 'Kindergarten' },
    { value: 1, label: 'Grade 1' },
    { value: 2, label: 'Grade 2' },
    { value: 3, label: 'Grade 3' },
    { value: 4, label: 'Grade 4' },
    { value: 5, label: 'Grade 5' },
    { value: 6, label: 'Grade 6' },
    { value: 7, label: 'Grade 7' },
    { value: 8, label: 'Grade 8' },
    { value: 9, label: 'Grade 9' },
    { value: 10, label: 'Grade 10' },
    { value: 11, label: 'Grade 11' },
    { value: 12, label: 'Grade 12' },
  ];

  return `
    <div class="login-page" style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);">
      <div class="login-card" style="max-width:480px;">
        <h1>Welcome to Sunschool!</h1>
        <p style="margin-bottom:1.5rem;">Tell us about your learner so Sunny can personalize the experience.</p>
        <div id="onboarding-children" style="text-align:left;">
          <div class="onboarding-child-form" data-index="0" style="display:flex;flex-direction:column;gap:.75rem;margin-bottom:1rem;padding:1rem;background:rgba(255,255,255,0.1);border-radius:var(--radius);">
            <div>
              <label style="font-size:.8rem;font-weight:600;display:block;margin-bottom:.25rem;color:#fff;">Child's Name</label>
              <input type="text" class="onboarding-name" placeholder="e.g. Emma" maxlength="100" style="width:100%;padding:.5rem .75rem;border:1px solid rgba(255,255,255,0.3);border-radius:var(--radius);font-size:.875rem;" />
            </div>
            <div>
              <label style="font-size:.8rem;font-weight:600;display:block;margin-bottom:.25rem;color:#fff;">Grade Level</label>
              <select class="onboarding-grade" style="width:100%;padding:.5rem .75rem;border:1px solid rgba(255,255,255,0.3);border-radius:var(--radius);font-size:.875rem;">
                ${gradeOptions.map(g => `<option value="${g.value}">${g.label}</option>`).join('')}
              </select>
            </div>
          </div>
        </div>
        <div style="display:flex;gap:.5rem;flex-direction:column;align-items:center;">
          <button class="btn-outline" onclick="addOnboardingChild()" style="font-size:.85rem;color:#fff;border-color:rgba(255,255,255,0.5);width:100%;">+ Add another child</button>
          <button class="btn-primary" id="onboarding-submit" onclick="handleOnboardingSubmit()" style="margin-top:.5rem;width:100%;font-size:1rem;padding:.75rem;">Get Started</button>
        </div>
      </div>
    </div>
  `;
}

// Legacy alias — kept for the add-learner flow when children already exist
function renderLearnerSetup() {
  return renderOnboarding();
}

function renderNavbar(activeRoute) {
  const user = currentUser();
  const displayName = user?.name || user?.email || 'User';

  // Learner selector dropdown
  let learnerSelector = '';
  if (state.learners.length > 0) {
    const currentLearner = state.learners.find(l => l.learner_id === state.currentLearnerId);
    const currentName = currentLearner ? currentLearner.name : 'Select learner';
    learnerSelector = `
      <select class="learner-selector" onchange="selectLearner(this.value)" title="Switch learner">
        ${state.learners.map(l => `
          <option value="${escapeAttr(l.learner_id)}" ${l.learner_id === state.currentLearnerId ? 'selected' : ''}>
            ${escapeHtml(l.name)} (Grade ${l.grade_level})
          </option>
        `).join('')}
      </select>
      <button class="btn-outline" onclick="navigate('#/add-learner')" title="Add another learner" style="font-size:.75rem;padding:.25rem .5rem;">+ Add</button>
    `;
  }

  return `
    <nav class="navbar">
      <a href="#/chat" class="navbar-brand">Sunschool</a>
      <div class="navbar-links">
        ${learnerSelector}
        <a href="#/chat" class="${activeRoute === '/chat' ? 'active' : ''}">Chat</a>
        <a href="#/parent" class="${activeRoute.startsWith('/parent') ? 'active' : ''}">Parent</a>
        <span class="points-badge" title="Points">&#11088; ${state.points}</span>
        <span class="user-info">${escapeHtml(displayName)}</span>
        <button class="btn-outline" onclick="signOut()" style="font-size:.75rem;padding:.25rem .5rem;">Sign out</button>
      </div>
    </nav>
  `;
}

function renderMessageBubble(msg) {
  const roleClass = msg.role === 'user' ? 'user' : msg.role === 'assistant' ? 'assistant' : 'system';
  let extra = '';

  // Quiz rendering
  if (msg.metadata?.quiz_detected && msg.metadata?.quiz) {
    const quiz = msg.metadata.quiz;
    const options = quiz.options || quiz.choices || [];
    extra = `
      <div class="quiz-card">
        <h4>Quiz Time!</h4>
        <div class="quiz-options">
          ${options.map((opt, i) => `
            <button class="quiz-option"
              onclick="handleQuizAnswer('${escapeAttr(state.currentConversationId)}', ${JSON.stringify(quiz).replace(/'/g, '\\\'')}, '${escapeAttr(typeof opt === 'string' ? opt : opt.text || opt.label || opt)}')"
            >${escapeHtml(typeof opt === 'string' ? opt : opt.text || opt.label || String(opt))}</button>
          `).join('')}
        </div>
      </div>
    `;
  }

  return `<div class="message ${roleClass}">${escapeHtml(msg.content)}${extra}</div>`;
}

function renderChat() {
  const messagesHtml = state.messages.length > 0
    ? state.messages.map(renderMessageBubble).join('')
    : `<div class="empty-state">
        <h3>Start a conversation</h3>
        <p>Type a message below to begin learning!</p>
       </div>`;

  const loadingHtml = state.loading
    ? `<div class="message assistant"><div class="loading-dots"><span></span><span></span><span></span></div></div>`
    : '';

  return `
    ${renderNavbar('/chat')}
    <div class="chat-container">
      <div class="chat-messages">
        ${messagesHtml}
        ${loadingHtml}
      </div>
      <div class="chat-input-bar">
        <input
          type="text"
          id="chat-input"
          placeholder="Type your message..."
          ${state.loading ? 'disabled' : ''}
          onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();handleSend()}"
        />
        <button class="btn-primary" onclick="handleSend()" ${state.loading ? 'disabled' : ''}>Send</button>
      </div>
    </div>
  `;
}

function renderParentDashboard() {
  const learnerId = state.currentLearnerId || 'unknown';
  return `
    ${renderNavbar('/parent')}
    <div class="dashboard">
      <h2>Parent Dashboard</h2>
      <div class="card-grid">
        <div class="card">
          <div class="stat-value">${state.points}</div>
          <div class="stat-label">Total Points</div>
        </div>
        <div class="card">
          <div class="stat-value">${state.conversations.length}</div>
          <div class="stat-label">Conversations</div>
        </div>
        <div class="card">
          <div class="stat-value">${state.mastery.length}</div>
          <div class="stat-label">Concepts Explored</div>
        </div>
      </div>

      <div class="card">
        <h3>Quick Links</h3>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.5rem;">
          <a href="#/parent/audit" class="btn-outline" style="text-decoration:none;display:inline-block;">Prompt Audit Log</a>
          <a href="#/parent/progress/${learnerId}" class="btn-outline" style="text-decoration:none;display:inline-block;">Progress View</a>
        </div>
      </div>

      <div class="card guidelines-editor">
        <h3>Content Guidelines</h3>
        <p style="font-size:.8rem;color:var(--text-muted);margin-bottom:.5rem;">
          Set rules for what topics and language the AI tutor can use.
        </p>
        <textarea id="guidelines-text" placeholder="e.g. No discussion of violence. Keep language at grade 3 level.">${escapeHtml(state.guidelines)}</textarea>
        <div class="actions">
          <button class="btn-primary" onclick="handleSaveGuidelines()" ${state.guidelinesSaving ? 'disabled' : ''}>
            ${state.guidelinesSaving ? 'Saving...' : 'Save Guidelines'}
          </button>
        </div>
      </div>

      <div class="card">
        <h3>Recent Conversations</h3>
        ${state.conversations.length === 0
          ? '<p style="color:var(--text-muted);font-size:.85rem;">No conversations yet.</p>'
          : `<table class="audit-table">
              <thead><tr><th>Subject</th><th>Messages</th><th>Last Active</th><th></th></tr></thead>
              <tbody>
                ${state.conversations.map(c => `
                  <tr>
                    <td>${escapeHtml(c.subject || 'General')}</td>
                    <td>${c.message_count || 0}</td>
                    <td>${c.last_active ? new Date(c.last_active).toLocaleDateString() : '-'}</td>
                    <td><a href="#/parent/audit?conversation=${c.id}" style="font-size:.8rem;">View</a></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>`
        }
      </div>
    </div>
  `;
}

function renderAuditLog() {
  let filtered = state.auditMessages;
  if (state.auditFilter.role !== 'all') {
    filtered = filtered.filter(m => m.prompt_type === state.auditFilter.role);
  }
  if (state.auditFilter.search) {
    const q = state.auditFilter.search.toLowerCase();
    filtered = filtered.filter(m =>
      (m.user_message || '').toLowerCase().includes(q) ||
      (m.response_preview || '').toLowerCase().includes(q) ||
      (m.system_message || '').toLowerCase().includes(q)
    );
  }

  // Collect unique prompt types for the filter dropdown
  const promptTypes = [...new Set(state.auditMessages.map(m => m.prompt_type).filter(Boolean))];

  return `
    ${renderNavbar('/parent/audit')}
    <div class="dashboard">
      <h2>Prompt Audit Log</h2>
      <a href="#/parent" style="font-size:.85rem;color:var(--primary);margin-bottom:1rem;display:inline-block;">&larr; Back to Dashboard</a>

      <div class="audit-filters">
        <select onchange="state.auditFilter.role=this.value;render()">
          <option value="all" ${state.auditFilter.role === 'all' ? 'selected' : ''}>All Types</option>
          ${promptTypes.map(t => `<option value="${escapeAttr(t)}" ${state.auditFilter.role === t ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('')}
        </select>
        <input
          type="text"
          placeholder="Search prompts..."
          value="${escapeAttr(state.auditFilter.search)}"
          oninput="state.auditFilter.search=this.value;render()"
        />
      </div>

      ${filtered.length === 0
        ? '<div class="empty-state"><p>No prompt audit entries found.</p></div>'
        : `<table class="audit-table">
            <thead>
              <tr><th>Time</th><th>Type</th><th>Model</th><th>Prompt</th><th>Response</th><th>Tokens</th><th>Cost</th></tr>
            </thead>
            <tbody>
              ${filtered.map(m => `
                <tr>
                  <td style="white-space:nowrap;">${m.created_at ? new Date(m.created_at).toLocaleString() : '-'}</td>
                  <td><span class="role-badge">${escapeHtml(m.prompt_type || '-')}</span></td>
                  <td>${escapeHtml(m.model || '-')}</td>
                  <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;">${escapeHtml((m.user_message || '').slice(0, 200))}${(m.user_message || '').length > 200 ? '...' : ''}</td>
                  <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;">${escapeHtml((m.response_preview || '').slice(0, 200))}${(m.response_preview || '').length > 200 ? '...' : ''}</td>
                  <td>${m.tokens_used != null ? m.tokens_used : '-'}</td>
                  <td>${m.cost_estimate != null ? '$' + Number(m.cost_estimate).toFixed(4) : '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>`
      }
    </div>
  `;
}

function renderProgress(learnerId) {
  return `
    ${renderNavbar('/parent/progress')}
    <div class="dashboard">
      <h2>Learning Progress</h2>
      <a href="#/parent" style="font-size:.85rem;color:var(--primary);margin-bottom:1rem;display:inline-block;">&larr; Back to Dashboard</a>

      <div class="card">
        <h3>Points</h3>
        <div class="stat-value">${state.points}</div>
        <div class="stat-label">Total points earned</div>
      </div>

      <div class="card">
        <h3>Concept Mastery</h3>
        ${state.mastery.length === 0
          ? '<p style="color:var(--text-muted);font-size:.85rem;">No mastery data yet. Start learning to track progress!</p>'
          : `<div class="concept-list">
              ${state.mastery.map(c => {
                const level = c.mastery_level || c.level || 0;
                const pct = Math.min(100, Math.round(level * 100));
                return `
                  <div class="concept-item">
                    <span class="concept-name">${escapeHtml(c.concept || c.name || 'Unknown')}</span>
                    <div style="flex:2">
                      <div class="mastery-bar"><div class="mastery-bar-fill" style="width:${pct}%"></div></div>
                    </div>
                    <span class="concept-level">${pct}%</span>
                  </div>
                `;
              }).join('')}
            </div>`
        }
      </div>
    </div>
  `;
}

function renderAddLearner() {
  return `
    ${renderNavbar('/add-learner')}
    <div class="dashboard">
      <h2>Add a Learner</h2>
      <a href="#/chat" style="font-size:.85rem;color:var(--primary);margin-bottom:1rem;display:inline-block;">&larr; Back to Chat</a>
      <div class="card">
        <div style="display:flex;flex-direction:column;gap:.75rem;">
          <div>
            <label style="font-size:.8rem;font-weight:600;display:block;margin-bottom:.25rem;">Name</label>
            <input type="text" id="add-learner-name" placeholder="Child's name" maxlength="100" />
          </div>
          <div>
            <label style="font-size:.8rem;font-weight:600;display:block;margin-bottom:.25rem;">Grade Level</label>
            <select id="add-learner-grade" style="width:100%;padding:.5rem .75rem;border:1px solid var(--border);border-radius:var(--radius);font-size:.875rem;">
              ${[...Array(13).keys()].map(g => `<option value="${g}" ${g === 5 ? 'selected' : ''}>Grade ${g}${g === 0 ? ' (Kindergarten)' : ''}</option>`).join('')}
            </select>
          </div>
          <button class="btn-primary" onclick="handleAddLearner()">Add Learner</button>
        </div>
      </div>
    </div>
  `;
}

function renderSpinner(msg = 'Loading...') {
  return `<div class="spinner">${msg}</div>`;
}

// ---------------------------------------------------------------------------
// Escape helpers
// ---------------------------------------------------------------------------
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------------------
// Event handlers (global, called from inline onclick)
// ---------------------------------------------------------------------------
window.handleSend = function () {
  const input = document.getElementById('chat-input');
  if (!input) return;
  const text = input.value.trim();
  if (!text || state.loading) return;
  input.value = '';
  if (state.currentConversationId) {
    sendMessage(state.currentConversationId, text);
  }
};

window.handleQuizAnswer = function (conversationId, quizData, answer) {
  submitAnswer(conversationId, quizData, answer);
};

window.handleSaveGuidelines = function () {
  const textarea = document.getElementById('guidelines-text');
  if (textarea) saveGuidelines(textarea.value);
};

window.handleSetupLearner = async function () {
  // Legacy — redirect to onboarding submit
  window.handleOnboardingSubmit();
};

window.addOnboardingChild = function () {
  const container = document.getElementById('onboarding-children');
  if (!container) return;
  const count = container.querySelectorAll('.onboarding-child-form').length;
  if (count >= 10) { alert('Maximum 10 children.'); return; }
  const gradeOptions = [...Array(13).keys()].map(g =>
    `<option value="${g}">${g === 0 ? 'Kindergarten' : 'Grade ' + g}</option>`
  ).join('');
  const div = document.createElement('div');
  div.className = 'onboarding-child-form';
  div.setAttribute('data-index', count);
  div.style.cssText = 'display:flex;flex-direction:column;gap:.75rem;margin-bottom:1rem;padding:1rem;background:rgba(255,255,255,0.1);border-radius:var(--radius);position:relative;';
  div.innerHTML = `
    <button onclick="this.parentElement.remove()" style="position:absolute;top:.5rem;right:.5rem;background:none;border:none;color:#fff;cursor:pointer;font-size:1.1rem;" title="Remove">&times;</button>
    <div>
      <label style="font-size:.8rem;font-weight:600;display:block;margin-bottom:.25rem;color:#fff;">Child's Name</label>
      <input type="text" class="onboarding-name" placeholder="e.g. Liam" maxlength="100" style="width:100%;padding:.5rem .75rem;border:1px solid rgba(255,255,255,0.3);border-radius:var(--radius);font-size:.875rem;" />
    </div>
    <div>
      <label style="font-size:.8rem;font-weight:600;display:block;margin-bottom:.25rem;color:#fff;">Grade Level</label>
      <select class="onboarding-grade" style="width:100%;padding:.5rem .75rem;border:1px solid rgba(255,255,255,0.3);border-radius:var(--radius);font-size:.875rem;">
        ${gradeOptions}
      </select>
    </div>
  `;
  container.appendChild(div);
};

window.handleOnboardingSubmit = async function () {
  const forms = document.querySelectorAll('.onboarding-child-form');
  const children = [];
  for (const form of forms) {
    const nameInput = form.querySelector('.onboarding-name');
    const gradeSelect = form.querySelector('.onboarding-grade');
    if (!nameInput || !gradeSelect) continue;
    const name = nameInput.value.trim();
    const grade = parseInt(gradeSelect.value, 10);
    if (!name) continue;
    children.push({ name, grade_level: grade });
  }
  if (children.length === 0) {
    alert('Please enter at least one child\'s name.');
    return;
  }
  const btn = document.getElementById('onboarding-submit');
  if (btn) { btn.disabled = true; btn.textContent = 'Setting up...'; }
  try {
    await submitOnboarding(children);
    // Fetch the conversation messages so Sunny's greeting appears
    if (state.currentConversationId) {
      await fetchMessages(state.currentConversationId);
    }
    navigate('#/chat');
  } catch (err) {
    alert('Something went wrong. Please try again.');
    if (btn) { btn.disabled = false; btn.textContent = 'Get Started'; }
  }
};

window.handleAddLearner = async function () {
  const nameInput = document.getElementById('add-learner-name');
  const gradeSelect = document.getElementById('add-learner-grade');
  if (!nameInput || !gradeSelect) return;
  const name = nameInput.value.trim();
  const grade = parseInt(gradeSelect.value, 10);
  if (!name) { alert('Please enter a name.'); return; }
  try {
    await createLearner(name, grade);
    navigate('#/chat');
  } catch (err) {
    alert('Failed to add learner. Please try again.');
  }
};

window.selectLearner = selectLearner;
window.signInWithGoogle = signInWithGoogle;
window.signOut = signOut;
window.navigate = navigate;

// ---------------------------------------------------------------------------
// Router & render
// ---------------------------------------------------------------------------
async function render() {
  const app = document.getElementById('app');
  const route = getRoute();
  const user = currentUser();

  // Require auth for all routes except login
  if (!user && route !== '/' && route !== '') {
    navigate('#/');
    return;
  }

  // If logged in and on login page, redirect to chat
  if (user && (route === '/' || route === '')) {
    navigate('#/chat');
    return;
  }

  if (route === '/' || route === '') {
    app.innerHTML = renderLogin();
    return;
  }

  // Show onboarding if user needs it
  if (user && state.onboardingChecked && state.needsOnboarding
      && route !== '/onboarding' && route !== '/add-learner' && route !== '/setup') {
    navigate('#/onboarding');
    return;
  }

  if (route === '/onboarding') {
    app.innerHTML = renderOnboarding();
    return;
  }

  if (route === '/add-learner') {
    app.innerHTML = renderAddLearner();
    return;
  }

  if (route === '/chat') {
    app.innerHTML = renderChat();
    // Focus input
    requestAnimationFrame(() => {
      const input = document.getElementById('chat-input');
      if (input) input.focus();
    });
    return;
  }

  if (route === '/parent') {
    app.innerHTML = renderParentDashboard();
    return;
  }

  if (route === '/parent/audit' || route.startsWith('/parent/audit?')) {
    app.innerHTML = renderAuditLog();
    return;
  }

  const progressMatch = route.match(/^\/parent\/progress\/(.+)$/);
  if (progressMatch) {
    const learnerId = progressMatch[1];
    app.innerHTML = renderProgress(learnerId);
    return;
  }

  // 404
  app.innerHTML = `
    ${user ? renderNavbar(route) : ''}
    <div class="empty-state" style="padding-top:4rem;">
      <h3>Page not found</h3>
      <p><a href="#/chat">Go to Chat</a></p>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Data loading on route change
// ---------------------------------------------------------------------------
async function onRouteChange() {
  const route = getRoute();
  const user = currentUser();
  if (!user) {
    render();
    return;
  }

  // Check onboarding status on first load (also populates learners)
  if (!state.onboardingChecked) {
    await checkOnboardingStatus();
  }

  // If onboarding needed, redirect (render handles the redirect)
  if (state.needsOnboarding && route !== '/onboarding' && route !== '/add-learner' && route !== '/setup') {
    render();
    return;
  }

  // If we have the onboarding route, just render it
  if (route === '/onboarding') {
    render();
    return;
  }

  // Fallback: if no learner selected but we have children, pick the first
  if (!state.currentLearnerId && state.learners.length > 0) {
    state.currentLearnerId = state.learners[0].learner_id;
    sessionStorage.setItem('selected_learner_id', state.currentLearnerId);
  }

  // Legacy fallback: if still no learner (shouldn't happen with setup flow),
  // use the user's own uid as a self-learner
  if (!state.currentLearnerId) {
    state.currentLearnerId = user.sub || user.email;
  }

  if (route === '/chat') {
    // Load conversations if we don't have any yet
    if (state.conversations.length === 0) {
      await fetchConversations(state.currentLearnerId);
    }
    // Select first conversation if none selected
    if (!state.currentConversationId && state.conversations.length > 0) {
      state.currentConversationId = state.conversations[0].id;
    }
    // Load messages if we have a conversation but no messages yet
    if (state.currentConversationId && state.messages.length === 0) {
      await fetchMessages(state.currentConversationId);
    }
    await fetchPoints(state.currentLearnerId);
    render();
    scrollToBottom();
    return;
  }

  if (route === '/parent') {
    await Promise.all([
      fetchConversations(state.currentLearnerId),
      fetchPoints(state.currentLearnerId),
      fetchMastery(state.currentLearnerId),
      fetchGuidelines(),
    ]);
    render();
    return;
  }

  if (route === '/parent/audit' || route.startsWith('/parent/audit?')) {
    const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
    const learnerId = params.get('learner') || state.currentLearnerId;
    const promptType = params.get('prompt_type') || null;
    if (learnerId) {
      await fetchAuditMessages(learnerId, promptType);
    }
    render();
    return;
  }

  if (route === '/add-learner') {
    render();
    return;
  }

  const progressMatch = route.match(/^\/parent\/progress\/(.+)$/);
  if (progressMatch) {
    const learnerId = progressMatch[1];
    await Promise.all([
      fetchPoints(learnerId),
      fetchMastery(learnerId),
    ]);
    render();
    return;
  }

  render();
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
async function init() {
  await initAuth();

  // Wait for GSI library to load and initialize (up to 5s)
  await new Promise(resolve => {
    let attempts = 0;
    function tryInit() {
      if (typeof google !== 'undefined' && google.accounts && google.accounts.id && authReady && googleClientId) {
        google.accounts.id.initialize({
          client_id: googleClientId,
          callback: handleCredentialResponse,
          auto_select: true,
        });
        window._gsiInitDone = true;
        resolve();
      } else if (attempts++ < 50) {
        setTimeout(tryInit, 100);
      } else {
        resolve();
      }
    }
    tryInit();
  });

  // Hash-based routing
  window.addEventListener('hashchange', onRouteChange);

  // Initial render
  onRouteChange();
}

// Expose handlers globally
window.handleCredentialResponse = handleCredentialResponse;

// Start
init();
