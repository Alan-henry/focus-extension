// ─── Focus Flow — popup.js ───────────────────────────────────────────────────

// ── Tab switching ────────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`panel-${btn.dataset.tab}`).classList.add('active');
  });
});

// ── Timer ────────────────────────────────────────────────────────────────────
const timerDisplay  = document.getElementById('timerDisplay');
const startStopBtn  = document.getElementById('startStopBtn');
const resetBtn      = document.getElementById('resetBtn');
const phaseDot      = document.getElementById('phaseDot');
const phaseLabel    = document.getElementById('phaseLabel');
const progressFill  = document.getElementById('progressFill');
const workMinsInput = document.getElementById('workMins');
const breakMinsInput= document.getElementById('breakMins');
const countDots     = document.getElementById('countDots');

let tickInterval = null;

// Default timer state
const defaultState = () => ({
  phase: 'work',
  running: false,
  workMins: parseInt(workMinsInput.value),
  breakMins: parseInt(breakMinsInput.value),
  totalSeconds: parseInt(workMinsInput.value) * 60,
  remaining: parseInt(workMinsInput.value) * 60,
  startedAt: null,
  completedPomodoros: 0
});

function fmt(secs) {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function applyPhaseUI(phase) {
  const isWork = phase === 'work';
  timerDisplay.className = `timer-display ${isWork ? 'work-mode' : 'break-mode'}`;
  progressFill.className = `progress-fill ${isWork ? '' : 'break-mode'}`;
  phaseDot.className     = `phase-dot ${isWork ? '' : 'break'}`;
  phaseLabel.textContent = isWork ? 'Work' : 'Break';
  startStopBtn.className = `btn-primary ${isWork ? '' : 'break-mode'}`;
}

function renderTimer(state) {
  timerDisplay.textContent = fmt(state.remaining);
  applyPhaseUI(state.phase);
  startStopBtn.textContent = state.running ? 'PAUSE' : 'START';

  const pct = state.remaining / state.totalSeconds * 100;
  progressFill.style.width = `${pct}%`;

  // Pomodoro dots
  const dots = countDots.querySelectorAll('.count-dot');
  dots.forEach((d, i) => {
    d.classList.toggle('filled', i < (state.completedPomodoros % 4));
  });

  workMinsInput.value  = state.workMins;
  breakMinsInput.value = state.breakMins;
}

function loadAndRender() {
  chrome.storage.local.get(['timerState'], (res) => {
    const state = res.timerState || defaultState();

    // If running, recalculate remaining from elapsed time
    if (state.running && state.startedAt) {
      const elapsed = Math.floor((Date.now() - state.startedAt) / 1000);
      state.remaining = Math.max(0, state.totalSeconds - elapsed);
      if (state.remaining === 0) {
        // Phase ended while popup was closed — reset to next phase standby
        const nextPhase = state.phase === 'work' ? 'break' : 'work';
        const nextMins  = nextPhase === 'work' ? state.workMins : state.breakMins;
        state.phase     = nextPhase;
        state.running   = false;
        state.totalSeconds = nextMins * 60;
        state.remaining    = nextMins * 60;
        state.startedAt    = null;
        chrome.storage.local.set({ timerState: state });
      }
    }

    renderTimer(state);
    if (state.running) startTick(state);
  });
}

function startTick(state) {
  clearInterval(tickInterval);
  tickInterval = setInterval(() => {
    chrome.storage.local.get(['timerState'], (res) => {
      const s = res.timerState;
      if (!s || !s.running) { clearInterval(tickInterval); return; }

      const elapsed  = Math.floor((Date.now() - s.startedAt) / 1000);
      const remaining = Math.max(0, s.totalSeconds - elapsed);
      timerDisplay.textContent = fmt(remaining);

      const pct = remaining / s.totalSeconds * 100;
      progressFill.style.width = `${pct}%`;

      if (remaining === 0) {
        clearInterval(tickInterval);
        // Phase switch
        const nextPhase = s.phase === 'work' ? 'break' : 'work';
        const nextMins  = nextPhase === 'work' ? s.workMins : s.breakMins;
        const newState  = {
          ...s,
          phase: nextPhase,
          running: false,
          totalSeconds: nextMins * 60,
          remaining: nextMins * 60,
          startedAt: null,
          completedPomodoros: nextPhase === 'break'
            ? s.completedPomodoros + 1
            : s.completedPomodoros
        };
        chrome.storage.local.set({ timerState: newState });
        renderTimer(newState);
      }
    });
  }, 1000);
}

startStopBtn.addEventListener('click', () => {
  chrome.storage.local.get(['timerState'], (res) => {
    const state = res.timerState || defaultState();

    if (state.running) {
      // Pause
      const elapsed  = Math.floor((Date.now() - state.startedAt) / 1000);
      state.remaining = Math.max(0, state.totalSeconds - elapsed);
      state.running   = false;
      state.startedAt = null;
      clearInterval(tickInterval);
      chrome.alarms.clear('pomodoroTick');
    } else {
      // Start
      state.running   = true;
      state.startedAt = Date.now();
      // Re-read custom durations if timer is at full (fresh start)
      if (state.remaining === state.totalSeconds) {
        state.workMins  = parseInt(workMinsInput.value)  || 25;
        state.breakMins = parseInt(breakMinsInput.value) || 5;
        const mins = state.phase === 'work' ? state.workMins : state.breakMins;
        state.totalSeconds = mins * 60;
        state.remaining    = mins * 60;
      }
      chrome.alarms.create('pomodoroTick', { periodInMinutes: 1 / 60 });
      startTick(state);
    }

    chrome.storage.local.set({ timerState: state });
    renderTimer(state);
  });
});

resetBtn.addEventListener('click', () => {
  clearInterval(tickInterval);
  chrome.alarms.clear('pomodoroTick');
  chrome.storage.local.get(['timerState'], (res) => {
    const s = res.timerState || {};
    const workMins  = parseInt(workMinsInput.value)  || 25;
    const breakMins = parseInt(breakMinsInput.value) || 5;
    const state = {
      phase: 'work',
      running: false,
      workMins,
      breakMins,
      totalSeconds: workMins * 60,
      remaining: workMins * 60,
      startedAt: null,
      completedPomodoros: s.completedPomodoros || 0
    };
    chrome.storage.local.set({ timerState: state });
    renderTimer(state);
  });
});

// Update settings on input change (only when not running)
[workMinsInput, breakMinsInput].forEach(input => {
  input.addEventListener('change', () => {
    chrome.storage.local.get(['timerState'], (res) => {
      const s = res.timerState || defaultState();
      if (s.running) return; // don't change mid-session
      const workMins  = parseInt(workMinsInput.value)  || 25;
      const breakMins = parseInt(breakMinsInput.value) || 5;
      const mins = s.phase === 'work' ? workMins : breakMins;
      const newState = {
        ...s,
        workMins,
        breakMins,
        totalSeconds: mins * 60,
        remaining: mins * 60
      };
      chrome.storage.local.set({ timerState: newState });
      renderTimer(newState);
    });
  });
});

// ── Todo ─────────────────────────────────────────────────────────────────────
const todoInput   = document.getElementById('todoInput');
const addTodoBtn  = document.getElementById('addTodoBtn');
const todoList    = document.getElementById('todoList');
const todoStats   = document.getElementById('todoStats');
const clearDoneBtn= document.getElementById('clearDoneBtn');

let currentFilter = 'all';
let todos = [];

document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    renderTodos();
  });
});

function saveTodos() {
  chrome.storage.local.set({ todos });
}

function loadTodos() {
  chrome.storage.local.get(['todos'], (res) => {
    todos = res.todos || [];
    renderTodos();
  });
}

function renderTodos() {
  const filtered = todos.filter(t => {
    if (currentFilter === 'active') return !t.done;
    if (currentFilter === 'done')   return t.done;
    return true;
  });

  if (filtered.length === 0) {
    const msg = currentFilter === 'done'
      ? "No completed tasks yet."
      : currentFilter === 'active'
      ? "You're all caught up! 🎉"
      : "No tasks yet. Add one above!";
    todoList.innerHTML = `<div class="todo-empty"><span>📋</span>${msg}</div>`;
  } else {
    todoList.innerHTML = '';
    filtered.forEach(todo => {
      const item = document.createElement('div');
      item.className = `todo-item ${todo.done ? 'done' : ''}`;

      const check = document.createElement('div');
      check.className = `todo-check ${todo.done ? 'checked' : ''}`;
      check.addEventListener('click', () => toggleTodo(todo.id));

      const text = document.createElement('div');
      text.className = 'todo-text';
      text.textContent = todo.text;

      const del = document.createElement('button');
      del.className = 'todo-delete';
      del.innerHTML = '×';
      del.title = 'Delete';
      del.addEventListener('click', () => deleteTodo(todo.id));

      item.appendChild(check);
      item.appendChild(text);
      item.appendChild(del);
      todoList.appendChild(item);
    });
  }

  const total  = todos.length;
  const done   = todos.filter(t => t.done).length;
  const active = total - done;
  todoStats.textContent = `${active} active · ${done} done`;
}

function addTodo() {
  const text = todoInput.value.trim();
  if (!text) return;
  todos.unshift({ id: Date.now(), text, done: false });
  todoInput.value = '';
  saveTodos();
  renderTodos();
}

function toggleTodo(id) {
  todos = todos.map(t => t.id === id ? { ...t, done: !t.done } : t);
  saveTodos();
  renderTodos();
}

function deleteTodo(id) {
  todos = todos.filter(t => t.id !== id);
  saveTodos();
  renderTodos();
}

clearDoneBtn.addEventListener('click', () => {
  todos = todos.filter(t => !t.done);
  saveTodos();
  renderTodos();
});

addTodoBtn.addEventListener('click', addTodo);
todoInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addTodo();
});

// ── Init ─────────────────────────────────────────────────────────────────────
loadAndRender();
loadTodos();
