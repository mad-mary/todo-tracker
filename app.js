class MadMode {
    constructor() {
        this.currentDate = this.formatDate(new Date());
        this.todos = this.loadFromLocalStorage();
        this.runningTimer = null;
        this.runningTodoId = null;
        this.pendingHoldTodoId = null;
        this.currentView = 'daily';
        this.focusScoreChart = null;
        this.focusHoldChart = null;
        this.notifiedTasks = new Set();
        this.pendingEditTodoId = null;
        this.gistToken = localStorage.getItem('gist_token') || '';
        this.gistId = localStorage.getItem('gist_id') || '';
        this.syncIntervalTimer = null;
        this.SYNC_INTERVAL_MS = 3 * 60 * 60 * 1000; // 3시간

        this.initElements();
        this.initEventListeners();
        this.setDateInput();
        this.requestNotificationPermission();
        this.restoreActiveState();
        this.render();
        this.updateSyncDot();

        if (this.gistToken && this.gistId) {
            this.syncFromGist();
        }
        this.startSyncInterval();
        window.addEventListener('beforeunload', () => this.syncToGist());
    }

    requestNotificationPermission() {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }

    checkOverdueNotification(todo) {
        if (this.notifiedTasks.has(todo.id)) return;

        const elapsed = todo.elapsedTime + (Date.now() - todo.startTime);
        if (elapsed < 3600000) return;

        this.notifiedTasks.add(todo.id);

        if (!('Notification' in window) || Notification.permission !== 'granted') return;

        const taskName = todo.text.length > 40 ? todo.text.substring(0, 40) + '...' : todo.text;
        new Notification('⏰ 1시간 경과', {
            body: `"${taskName}" 태스크가 1시간이 넘도록 진행 중입니다.`,
            icon: '/favicon.svg',
            tag: `overdue-${todo.id}`
        });
    }

    restoreActiveState() {
        const todos = this.getCurrentDateTodos();
        const runningTodo = todos.find(t => t.running);
        const onHoldTodo = todos.find(t => t.onHold);

        if (runningTodo) {
            this.runningTodoId = runningTodo.id;
            this.runningTimer = setInterval(() => {
                this.updateTimer(runningTodo.id);
            }, 1000);
        }

        this.updatePageTitle();
    }

    updatePageTitle() {
        const todos = this.getCurrentDateTodos();
        const runningTodo = todos.find(t => t.running);
        const onHoldTodo = todos.find(t => t.onHold);

        if (runningTodo) {
            document.title = 'FOCUS — Mad Mode';
        } else if (onHoldTodo) {
            document.title = 'ON HOLD — Mad Mode';
        } else {
            document.title = 'Mad Mode';
        }
    }

    initElements() {
        this.dateInput = document.getElementById('dateInput');
        this.prevDayBtn = document.getElementById('prevDay');
        this.nextDayBtn = document.getElementById('nextDay');
        this.todayBtn = document.getElementById('todayBtn');
        this.todoInput = document.getElementById('todoInput');
        this.addTodoBtn = document.getElementById('addTodoBtn');
        this.todoList = document.getElementById('todoList');
        this.statusItem = document.getElementById('statusItem');
        this.statusValue = document.getElementById('statusValue');
        this.statusSubtext = document.getElementById('statusSubtext');
        this.focusTime = document.getElementById('focusTime');
        this.holdRatio = document.getElementById('holdRatio');
        this.progressValue = document.getElementById('progressValue');
        this.focusScoreValue = document.getElementById('focusScoreValue');
        this.focusScoreMessage = document.getElementById('focusScoreMessage');
        this.completionBreakdown = document.getElementById('completionBreakdown');
        this.efficiencyBreakdown = document.getElementById('efficiencyBreakdown');
        this.flowBreakdown = document.getElementById('flowBreakdown');
        this.restartBreakdown = document.getElementById('restartBreakdown');
        this.holdModal = document.getElementById('holdModal');
        this.holdReasonPreset = document.getElementById('holdReasonPreset');
        this.holdReasonInput = document.getElementById('holdReasonInput');
        this.confirmHoldBtn = document.getElementById('confirmHoldBtn');
        this.cancelHoldBtn = document.getElementById('cancelHoldBtn');
        this.dailyTab = document.getElementById('dailyTab');
        this.weeklyTab = document.getElementById('weeklyTab');
        this.dailyView = document.getElementById('dailyView');
        this.weeklyView = document.getElementById('weeklyView');
        this.dateSelector = document.getElementById('dateSelector');
        // Hero elements
        this.heroSection = document.getElementById('heroSection') || document.querySelector('.hero-section');
        this.heroIdle = document.getElementById('heroIdle');
        this.heroActive = document.getElementById('heroActive');
        this.heroHoldState = document.getElementById('heroHoldState');
        this.heroTaskName = document.getElementById('heroTaskName');
        this.heroTimer = document.getElementById('heroTimer');
        this.heroHoldTaskName = document.getElementById('heroHoldTaskName');
        this.heroHoldReason = document.getElementById('heroHoldReason');
        this.heroHoldBtn = document.getElementById('heroHoldBtn');
        this.heroFinishBtn = document.getElementById('heroFinishBtn');
        this.heroResumeBtn = document.getElementById('heroResumeBtn');
        this.heroFinishHoldBtn = document.getElementById('heroFinishHoldBtn');
        // Backlog
        this.backlogList = document.getElementById('backlogList');
        // Edit modal
        this.editModal = document.getElementById('editModal');
        this.editTaskInput = document.getElementById('editTaskInput');
        this.editTaskDate = document.getElementById('editTaskDate');
        this.confirmEditBtn = document.getElementById('confirmEditBtn');
        this.cancelEditBtn = document.getElementById('cancelEditBtn');
        // Settings modal
        this.settingsModal = document.getElementById('settingsModal');
        this.settingsBtn = document.getElementById('settingsBtn');
        this.syncDot = document.getElementById('syncDot');
        this.gistTokenInput = document.getElementById('gistTokenInput');
        this.gistIdInput = document.getElementById('gistIdInput');
        this.confirmSettingsBtn = document.getElementById('confirmSettingsBtn');
        this.disconnectGistBtn = document.getElementById('disconnectGistBtn');
        this.cancelSettingsBtn = document.getElementById('cancelSettingsBtn');
        this.syncStatusRow = document.getElementById('syncStatusRow');
        this.syncStatusText = document.getElementById('syncStatusText');
    }

    initEventListeners() {
        this.dateInput.addEventListener('change', (e) => {
            this.currentDate = e.target.value;
            this.render();
        });

        this.prevDayBtn.addEventListener('click', () => this.changeDate(-1));
        this.nextDayBtn.addEventListener('click', () => this.changeDate(1));
        this.todayBtn.addEventListener('click', () => {
            this.currentDate = this.formatDate(new Date());
            this.setDateInput();
            this.render();
        });

        this.addTodoBtn.addEventListener('click', () => this.addTodo());
        this.todoInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addTodo();
        });

        this.confirmHoldBtn.addEventListener('click', () => this.confirmHold());
        this.cancelHoldBtn.addEventListener('click', () => this.cancelHold());
        this.holdModal.addEventListener('click', (e) => {
            if (e.target === this.holdModal) this.cancelHold();
        });

        this.holdReasonPreset.addEventListener('change', (e) => {
            if (e.target.value === '기타') {
                this.holdReasonInput.style.display = 'block';
                this.holdReasonInput.value = '';
                this.holdReasonInput.focus();
            } else {
                this.holdReasonInput.style.display = 'none';
                this.holdReasonInput.value = '';
            }
        });

        this.dailyTab.addEventListener('click', () => this.switchView('daily'));
        this.weeklyTab.addEventListener('click', () => this.switchView('weekly'));

        this.confirmEditBtn.addEventListener('click', () => this.confirmEdit());
        this.cancelEditBtn.addEventListener('click', () => this.cancelEdit());
        this.editModal.addEventListener('click', (e) => {
            if (e.target === this.editModal) this.cancelEdit();
        });
        this.editTaskInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.confirmEdit();
            if (e.key === 'Escape') this.cancelEdit();
        });

        this.settingsBtn.addEventListener('click', () => this.openSettingsModal());
        this.confirmSettingsBtn.addEventListener('click', () => this.saveGistSettings());
        this.disconnectGistBtn.addEventListener('click', () => this.disconnectGist());
        this.cancelSettingsBtn.addEventListener('click', () => this.settingsModal.classList.remove('active'));
        this.settingsModal.addEventListener('click', (e) => {
            if (e.target === this.settingsModal) this.settingsModal.classList.remove('active');
        });

        // Hero button listeners
        if (this.heroHoldBtn) {
            this.heroHoldBtn.addEventListener('click', () => {
                if (this.runningTodoId !== null) this.holdTodo(this.runningTodoId);
            });
        }
        if (this.heroFinishBtn) {
            this.heroFinishBtn.addEventListener('click', () => {
                if (this.runningTodoId !== null) this.finishTodo(this.runningTodoId);
            });
        }
        if (this.heroResumeBtn) {
            this.heroResumeBtn.addEventListener('click', () => {
                const onHoldTodo = this.getCurrentDateTodos().find(t => t.onHold);
                if (onHoldTodo) this.resumeTodo(onHoldTodo.id);
            });
        }
        if (this.heroFinishHoldBtn) {
            this.heroFinishHoldBtn.addEventListener('click', () => {
                const onHoldTodo = this.getCurrentDateTodos().find(t => t.onHold);
                if (onHoldTodo) this.finishTodo(onHoldTodo.id);
            });
        }
    }

    switchView(view) {
        this.currentView = view;

        if (view === 'daily') {
            this.dailyTab.classList.add('active');
            this.weeklyTab.classList.remove('active');
            this.dailyView.style.display = 'block';
            this.weeklyView.style.display = 'none';
            this.dateSelector.style.display = 'flex';
        } else {
            this.weeklyTab.classList.add('active');
            this.dailyTab.classList.remove('active');
            this.weeklyView.style.display = 'block';
            this.dailyView.style.display = 'none';
            this.dateSelector.style.display = 'none';
            this.renderWeeklySummary();
        }
    }

    formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    setDateInput() {
        this.dateInput.value = this.currentDate;
    }

    changeDate(days) {
        const date = new Date(this.currentDate);
        date.setDate(date.getDate() + days);
        this.currentDate = this.formatDate(date);
        this.setDateInput();
        this.render();
    }

    loadFromLocalStorage() {
        const data = localStorage.getItem('madModeData');
        return data ? JSON.parse(data) : {};
    }

    saveToLocalStorage() {
        localStorage.setItem('madModeData', JSON.stringify(this.todos));
    }

    getCurrentDateTodos() {
        if (!this.todos[this.currentDate]) {
            this.todos[this.currentDate] = [];
        }
        return this.todos[this.currentDate];
    }

    addTodo() {
        const text = this.todoInput.value.trim();
        if (!text) return;

        const todo = {
            id: Date.now(),
            text: text,
            completed: false,
            startTime: null,
            elapsedTime: 0,
            running: false,
            onHold: false,
            holdHistory: []
        };

        this.getCurrentDateTodos().push(todo);
        this.todoInput.value = '';
        this.saveToLocalStorage();
        this.render();
    }

    deleteTodo(id) {
        const todos = this.getCurrentDateTodos();
        const index = todos.findIndex(t => t.id === id);
        if (index !== -1) {
            if (this.runningTodoId === id) {
                this.stopTimer();
            }
            this.notifiedTasks.delete(id);
            todos.splice(index, 1);
            this.saveToLocalStorage();
            this.render();
        }
    }

    startTodo(id) {
        if (this.runningTodoId !== null) {
            this.stopCurrentTask();
        }

        const todos = this.getCurrentDateTodos();
        const todo = todos.find(t => t.id === id);
        if (!todo) return;

        todo.running = true;
        todo.startTime = Date.now();
        this.runningTodoId = id;

        this.runningTimer = setInterval(() => {
            this.updateTimer(id);
        }, 1000);

        this.saveToLocalStorage();
        this.updatePageTitle();
        this.render();
    }

    stopCurrentTask() {
        if (this.runningTodoId === null) return;

        const todos = this.getCurrentDateTodos();
        const todo = todos.find(t => t.id === this.runningTodoId);
        if (todo && todo.running) {
            const elapsed = Date.now() - todo.startTime;
            todo.elapsedTime += elapsed;
            todo.running = false;
            todo.startTime = null;
        }

        this.stopTimer();
        this.saveToLocalStorage();
    }

    holdTodo(id) {
        this.pendingHoldTodoId = id;
        this.holdReasonPreset.value = '정의 안됨';
        this.holdReasonInput.value = '';
        this.holdReasonInput.style.display = 'none';
        this.holdModal.classList.add('active');
        this.holdReasonPreset.focus();
    }

    confirmHold() {
        if (this.pendingHoldTodoId === null) return;

        let reason = this.holdReasonPreset.value;
        if (reason === '기타') {
            const customReason = this.holdReasonInput.value.trim();
            reason = customReason || '기타 (사유 미입력)';
        }

        const todos = this.getCurrentDateTodos();
        const todo = todos.find(t => t.id === this.pendingHoldTodoId);

        if (!todo) {
            this.cancelHold();
            return;
        }

        const elapsed = Date.now() - todo.startTime;
        todo.elapsedTime += elapsed;

        todo.holdHistory.push({
            reason: reason,
            timestamp: Date.now(),
            duration: 0,
            holdStartTime: Date.now()
        });

        todo.running = false;
        todo.onHold = true;
        todo.startTime = null;

        this.stopTimer();
        this.saveToLocalStorage();
        this.cancelHold();
        this.updatePageTitle();
        this.render();
    }

    cancelHold() {
        this.pendingHoldTodoId = null;
        this.holdReasonPreset.value = '정의 안됨';
        this.holdReasonInput.value = '';
        this.holdReasonInput.style.display = 'none';
        this.holdModal.classList.remove('active');
    }

    openEditModal(id) {
        const todos = this.getCurrentDateTodos();
        const todo = todos.find(t => t.id === id);
        if (!todo) return;

        this.pendingEditTodoId = id;
        this.editTaskInput.value = todo.text;
        this.editTaskDate.value = this.currentDate;
        this.editModal.classList.add('active');
        this.editTaskInput.focus();
        this.editTaskInput.select();
    }

    confirmEdit() {
        if (this.pendingEditTodoId === null) return;

        const newText = this.editTaskInput.value.trim();
        const newDate = this.editTaskDate.value;
        if (!newText) return;

        const todos = this.getCurrentDateTodos();
        const todoIndex = todos.findIndex(t => t.id === this.pendingEditTodoId);
        if (todoIndex === -1) { this.cancelEdit(); return; }

        const todo = todos[todoIndex];
        todo.text = newText;

        if (newDate && newDate !== this.currentDate) {
            if (this.runningTodoId === todo.id) {
                this.stopCurrentTask();
            }
            todos.splice(todoIndex, 1);
            if (!this.todos[newDate]) {
                this.todos[newDate] = [];
            }
            this.todos[newDate].push(todo);
        }

        this.saveToLocalStorage();
        this.cancelEdit();
        this.render();
    }

    cancelEdit() {
        this.pendingEditTodoId = null;
        this.editModal.classList.remove('active');
    }

    // ── Gist 설정 모달 ──────────────────────────────

    openSettingsModal() {
        this.gistTokenInput.value = this.gistToken ? '••••••••••••••••••••' : '';
        this.gistIdInput.value = this.gistId;
        this.syncStatusRow.style.display = 'none';
        this.settingsModal.classList.add('active');
        if (!this.gistToken) this.gistTokenInput.focus();
    }

    saveGistSettings() {
        const tokenVal = this.gistTokenInput.value.trim();
        const idVal = this.gistIdInput.value.trim();

        // 마스킹된 값이면 기존 토큰 유지
        if (tokenVal && !tokenVal.startsWith('•')) {
            this.gistToken = tokenVal;
            localStorage.setItem('gist_token', this.gistToken);
        }
        if (idVal) {
            this.gistId = idVal;
            localStorage.setItem('gist_id', this.gistId);
        }

        this.settingsModal.classList.remove('active');
        this.startSyncInterval();
        this.syncToGist();
    }

    disconnectGist() {
        this.gistToken = '';
        this.gistId = '';
        localStorage.removeItem('gist_token');
        localStorage.removeItem('gist_id');
        clearInterval(this.syncIntervalTimer);
        this.settingsModal.classList.remove('active');
        this.updateSyncDot('idle');
    }

    // ── Gist 동기화 ──────────────────────────────────

    updateSyncDot(state) {
        const dot = this.syncDot;
        if (!dot) return;
        dot.className = 'sync-dot';
        if (!this.gistToken) return;
        if (state) dot.classList.add(state);
    }

    showSyncStatus(msg, type = 'info') {
        this.syncStatusRow.style.display = 'flex';
        this.syncStatusText.textContent = msg;
        this.syncStatusText.className = `sync-status-text ${type}`;
    }

    async syncFromGist() {
        if (!this.gistToken || !this.gistId) return;
        this.updateSyncDot('syncing');
        try {
            const res = await fetch(`https://api.github.com/gists/${this.gistId}`, {
                headers: {
                    'Authorization': `Bearer ${this.gistToken}`,
                    'Accept': 'application/vnd.github+json'
                }
            });
            if (!res.ok) throw new Error(`${res.status}`);
            const data = await res.json();
            const content = data.files['mad-mode.json']?.content;
            if (content) {
                this.todos = JSON.parse(content);
                localStorage.setItem('madModeData', JSON.stringify(this.todos));
                this.render();
            }
            this.updateSyncDot('synced');
        } catch (err) {
            this.updateSyncDot('error');
        }
    }

    startSyncInterval() {
        clearInterval(this.syncIntervalTimer);
        if (!this.gistToken) return;
        this.syncIntervalTimer = setInterval(() => this.syncToGist(), this.SYNC_INTERVAL_MS);
    }

    async syncToGist() {
        if (!this.gistToken) return;
        this.updateSyncDot('syncing');
        try {
            const content = JSON.stringify(this.todos, null, 2);
            if (!this.gistId) {
                const res = await fetch('https://api.github.com/gists', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.gistToken}`,
                        'Accept': 'application/vnd.github+json',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        description: 'Mad Mode Todo Tracker',
                        public: false,
                        files: { 'mad-mode.json': { content } }
                    })
                });
                if (!res.ok) throw new Error(`${res.status}`);
                const data = await res.json();
                this.gistId = data.id;
                localStorage.setItem('gist_id', this.gistId);
            } else {
                const res = await fetch(`https://api.github.com/gists/${this.gistId}`, {
                    method: 'PATCH',
                    headers: {
                        'Authorization': `Bearer ${this.gistToken}`,
                        'Accept': 'application/vnd.github+json',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        files: { 'mad-mode.json': { content } }
                    })
                });
                if (!res.ok) throw new Error(`${res.status}`);
            }
            this.updateSyncDot('synced');
        } catch (err) {
            this.updateSyncDot('error');
        }
    }

    resumeTodo(id) {
        const todos = this.getCurrentDateTodos();
        const todo = todos.find(t => t.id === id);
        if (!todo) return;

        if (todo.holdHistory.length > 0) {
            const lastHold = todo.holdHistory[todo.holdHistory.length - 1];
            lastHold.duration = Date.now() - lastHold.holdStartTime;
        }

        todo.onHold = false;
        todo.running = true;
        todo.startTime = Date.now();
        this.runningTodoId = id;

        this.runningTimer = setInterval(() => {
            this.updateTimer(id);
        }, 1000);

        this.saveToLocalStorage();
        this.updatePageTitle();
        this.render();
    }

    finishTodo(id) {
        this.stopCurrentTask();

        const todos = this.getCurrentDateTodos();
        const todo = todos.find(t => t.id === id);
        if (!todo) return;

        if (todo.onHold && todo.holdHistory.length > 0) {
            const lastHold = todo.holdHistory[todo.holdHistory.length - 1];
            if (lastHold.duration === 0) {
                lastHold.duration = Date.now() - lastHold.holdStartTime;
            }
        }

        todo.completed = true;
        todo.onHold = false;
        this.notifiedTasks.delete(id);
        this.saveToLocalStorage();
        this.updatePageTitle();
        this.render();
    }

    stopTimer() {
        if (this.runningTimer) {
            clearInterval(this.runningTimer);
            this.runningTimer = null;
        }
        this.runningTodoId = null;
    }

    updateTimer(id) {
        const timerElement = document.querySelector(`[data-timer-id="${id}"]`);
        if (!timerElement) return;

        const todos = this.getCurrentDateTodos();
        const todo = todos.find(t => t.id === id);
        if (!todo) return;

        const elapsed = todo.elapsedTime + (Date.now() - todo.startTime);
        timerElement.textContent = this.formatTime(elapsed);

        // Also update hero timer
        if (this.heroTimer && this.runningTodoId === id) {
            this.heroTimer.textContent = this.formatTimerDisplay(elapsed);
        }

        this.checkOverdueNotification(todo);
    }

    formatTimerDisplay(ms) {
        const totalSec = Math.floor(ms / 1000);
        const h = Math.floor(totalSec / 3600);
        const m = Math.floor((totalSec % 3600) / 60);
        const s = totalSec % 60;
        const pad = n => String(n).padStart(2, '0');
        return `${pad(h)}:${pad(m)}:${pad(s)}`;
    }

    formatTime(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }

    calculateStats() {
        const todos = this.getCurrentDateTodos();
        const total = todos.length;
        const completed = todos.filter(t => t.completed).length;
        const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

        const totalTime = todos.reduce((sum, todo) => {
            let time = todo.elapsedTime;
            if (todo.running && todo.startTime) {
                time += Date.now() - todo.startTime;
            }
            const holdTime = (todo.holdHistory || []).reduce((holdSum, hold) => {
                return holdSum + (hold.duration || 0);
            }, 0);
            return sum + time + holdTime;
        }, 0);

        return {
            completionRate,
            totalTime,
            completed,
            total
        };
    }

    calculateFocusScore() {
        const todos = this.getCurrentDateTodos();
        const total = todos.length;

        if (total === 0) {
            return {
                score: 0,
                breakdown: {
                    completion: 0,
                    efficiency: 0,
                    flow: 0,
                    restart: 0
                },
                message: '아직 태스크가 없습니다'
            };
        }

        const completed = todos.filter(t => t.completed).length;
        const completionRate = completed / total;

        let totalFocusSeconds = 0;
        let totalHoldSeconds = 0;
        let totalHoldCount = 0;
        let allRestartDelays = [];

        todos.forEach(todo => {
            let focusTime = todo.elapsedTime;
            if (todo.running && todo.startTime) {
                focusTime += Date.now() - todo.startTime;
            }
            totalFocusSeconds += focusTime / 1000;

            const holdHistory = todo.holdHistory || [];
            totalHoldCount += holdHistory.length;

            holdHistory.forEach(hold => {
                let holdDuration = hold.duration || 0;
                if (todo.onHold && holdHistory.indexOf(hold) === holdHistory.length - 1) {
                    holdDuration = Date.now() - hold.holdStartTime;
                }
                totalHoldSeconds += holdDuration / 1000;
                allRestartDelays.push(holdDuration / 1000);
            });
        });

        const focusRatio = (totalFocusSeconds + totalHoldSeconds) > 0
            ? totalFocusSeconds / (totalFocusSeconds + totalHoldSeconds)
            : 0;

        const avgHoldPerTask = totalHoldCount / total;

        const avgRestartMinutes = allRestartDelays.length > 0
            ? (allRestartDelays.reduce((sum, d) => sum + d, 0) / allRestartDelays.length) / 60
            : 0;

        const completionScore = Math.round(completionRate * 40);
        const focusEfficiencyScore = Math.round(focusRatio * 30);
        const flowScore = Math.round(Math.max(0, 20 - avgHoldPerTask * 5));
        const restartScore = Math.round(Math.max(0, 10 - avgRestartMinutes / 3));

        const totalScore = Math.min(100, Math.max(0,
            completionScore + focusEfficiencyScore + flowScore + restartScore
        ));

        let message = '';
        const holdRatio = (totalFocusSeconds + totalHoldSeconds) > 0
            ? totalHoldSeconds / (totalFocusSeconds + totalHoldSeconds)
            : 0;

        if (completionRate < 0.5) {
            message = '태스크를 더 완료해보세요';
        } else if (holdRatio > 0.3 || totalHoldCount > total * 2) {
            message = 'Hold가 자주 발생하네요';
        } else if (avgRestartMinutes > 15) {
            message = 'Hold 후 복귀가 느려요';
        } else {
            if (totalScore >= 80) {
                message = '집중 상태 매우 좋음';
            } else if (totalScore >= 60) {
                message = '좋은 흐름이에요!';
            } else if (totalScore >= 40) {
                message = '조금 더 집중해봐요';
            } else {
                message = '집중이 많이 흐트러졌어요';
            }
        }

        return {
            score: totalScore,
            breakdown: {
                completion: completionScore,
                efficiency: focusEfficiencyScore,
                flow: flowScore,
                restart: restartScore
            },
            message: message
        };
    }

    updateStats() {
        const todos = this.getCurrentDateTodos();

        const runningTodo = todos.find(t => t.running);
        const onHoldTodo = todos.find(t => t.onHold);
        const activeTodo = runningTodo || onHoldTodo;

        this.statusItem.classList.remove('active', 'on-hold');

        if (activeTodo) {
            if (activeTodo.running) {
                this.statusItem.classList.add('active');
                const taskName = activeTodo.text.length > 25
                    ? activeTodo.text.substring(0, 25) + '...'
                    : activeTodo.text;
                this.statusValue.textContent = taskName;
                this.statusSubtext.textContent = 'FOCUS';
            } else if (activeTodo.onHold) {
                this.statusItem.classList.add('on-hold');
                const taskName = activeTodo.text.length > 25
                    ? activeTodo.text.substring(0, 25) + '...'
                    : activeTodo.text;

                const lastHold = activeTodo.holdHistory[activeTodo.holdHistory.length - 1];
                const holdDuration = Date.now() - lastHold.holdStartTime;
                const holdTimeText = this.formatTime(holdDuration);

                this.statusValue.textContent = taskName;
                this.statusSubtext.textContent = `HOLD (${lastHold.reason}, ${holdTimeText})`;
            }
        } else {
            const completedToday = todos.filter(t => t.completed).length;
            if (completedToday > 0 && todos.length === completedToday) {
                this.statusValue.textContent = '모든 작업 완료';
                this.statusSubtext.textContent = 'COMPLETED';
            } else {
                this.statusValue.textContent = '대기 중';
                this.statusSubtext.textContent = 'IDLE';
            }
        }

        let totalFocusTime = 0;
        let totalHoldTime = 0;

        todos.forEach(todo => {
            let focusTime = todo.elapsedTime;
            if (todo.running && todo.startTime) {
                focusTime += Date.now() - todo.startTime;
            }
            totalFocusTime += focusTime;

            const holdTime = (todo.holdHistory || []).reduce((sum, hold) => {
                let duration = hold.duration || 0;
                if (todo.onHold && todo.holdHistory.indexOf(hold) === todo.holdHistory.length - 1) {
                    duration = Date.now() - hold.holdStartTime;
                }
                return sum + duration;
            }, 0);
            totalHoldTime += holdTime;
        });

        this.focusTime.textContent = this.formatTime(totalFocusTime);

        const totalWorkTime = totalFocusTime + totalHoldTime;
        const holdRatioValue = totalWorkTime > 0 ? Math.round((totalHoldTime / totalWorkTime) * 100) : 0;
        this.holdRatio.textContent = `${holdRatioValue}%`;

        const stats = this.calculateStats();
        this.progressValue.textContent = `${stats.completionRate}%`;

        const focusScore = this.calculateFocusScore();
        this.focusScoreValue.textContent = focusScore.score;
        this.focusScoreMessage.textContent = focusScore.message;
        this.completionBreakdown.textContent = `${focusScore.breakdown.completion}/40`;
        this.efficiencyBreakdown.textContent = `${focusScore.breakdown.efficiency}/30`;
        this.flowBreakdown.textContent = `${focusScore.breakdown.flow}/20`;
        this.restartBreakdown.textContent = `${focusScore.breakdown.restart}/10`;

        this.updateHero();
    }

    updateHero() {
        if (!this.heroIdle) return;

        const todos = this.getCurrentDateTodos();
        const runningTodo = todos.find(t => t.running);
        const onHoldTodo = todos.find(t => t.onHold);

        this.heroIdle.style.display = 'none';
        this.heroActive.style.display = 'none';
        this.heroHoldState.style.display = 'none';

        if (runningTodo) {
            this.heroActive.style.display = 'flex';
            this.heroTaskName.textContent = runningTodo.text;
            const elapsed = runningTodo.elapsedTime + (Date.now() - runningTodo.startTime);
            this.heroTimer.textContent = this.formatTimerDisplay(elapsed);
        } else if (onHoldTodo) {
            this.heroHoldState.style.display = 'flex';
            this.heroHoldTaskName.textContent = onHoldTodo.text;
            const lastHold = onHoldTodo.holdHistory[onHoldTodo.holdHistory.length - 1];
            this.heroHoldReason.textContent = lastHold ? lastHold.reason : '-';
        } else {
            this.heroIdle.style.display = 'flex';
        }
    }

    renderBacklog() {
        if (!this.backlogList) return;

        const today = this.currentDate;
        const allDates = Object.keys(this.todos)
            .filter(date => date < today)
            .sort((a, b) => b.localeCompare(a));

        const backlogItems = [];
        allDates.forEach(date => {
            (this.todos[date] || [])
                .filter(t => !t.completed)
                .forEach(t => backlogItems.push({ text: t.text, date }));
        });

        if (backlogItems.length === 0) {
            this.backlogList.innerHTML = '<div class="backlog-empty">No unresolved tasks</div>';
            return;
        }

        this.backlogList.innerHTML = backlogItems.map(item => {
            const [year, month, day] = item.date.split('-').map(Number);
            const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
            const dateLabel = `${months[month - 1]} ${day}`;
            return `
                <div class="backlog-item">
                    <div class="backlog-item-date">${dateLabel}</div>
                    <div class="backlog-item-text">${item.text}</div>
                </div>
            `;
        }).join('');
    }

    renderTodoItem(todo) {
        const div = document.createElement('div');
        div.className = `todo-item ${todo.completed ? 'completed' : ''} ${todo.running ? 'running' : ''} ${todo.onHold ? 'on-hold' : ''}`;

        const header = document.createElement('div');
        header.className = 'todo-header';

        const textWrapper = document.createElement('div');
        textWrapper.style.display = 'flex';
        textWrapper.style.alignItems = 'center';
        textWrapper.style.flex = '1';

        const text = document.createElement('div');
        text.className = 'todo-text';
        text.textContent = todo.text;
        textWrapper.appendChild(text);

        if (todo.onHold) {
            const holdStatus = document.createElement('span');
            holdStatus.className = 'hold-status';
            holdStatus.textContent = '홀드 중';
            textWrapper.appendChild(holdStatus);
        }

        const editBtn = document.createElement('button');
        editBtn.className = 'edit-btn';
        editBtn.textContent = '수정';
        editBtn.onclick = () => this.openEditModal(todo.id);

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.textContent = '삭제';
        deleteBtn.onclick = () => this.deleteTodo(todo.id);

        header.appendChild(textWrapper);
        header.appendChild(editBtn);
        header.appendChild(deleteBtn);

        const controls = document.createElement('div');
        controls.className = 'todo-controls';

        if (!todo.completed) {
            if (todo.onHold) {
                const resumeBtn = document.createElement('button');
                resumeBtn.className = 'resume-btn';
                resumeBtn.textContent = '재개';
                resumeBtn.disabled = this.runningTodoId !== null;
                resumeBtn.onclick = () => this.resumeTodo(todo.id);
                controls.appendChild(resumeBtn);
            } else if (!todo.running) {
                const startBtn = document.createElement('button');
                startBtn.className = 'start-btn';
                startBtn.textContent = '시작';
                startBtn.disabled = this.runningTodoId !== null;
                startBtn.onclick = () => this.startTodo(todo.id);
                controls.appendChild(startBtn);
            } else {
                const timer = document.createElement('div');
                timer.className = 'timer-display';
                timer.setAttribute('data-timer-id', todo.id);
                const elapsed = todo.elapsedTime + (Date.now() - todo.startTime);
                timer.textContent = this.formatTime(elapsed);
                controls.appendChild(timer);

                const holdBtn = document.createElement('button');
                holdBtn.className = 'hold-btn';
                holdBtn.textContent = '홀드';
                holdBtn.onclick = () => this.holdTodo(todo.id);
                controls.appendChild(holdBtn);
            }

            const finishBtn = document.createElement('button');
            finishBtn.className = 'finish-btn';
            finishBtn.textContent = '완료';
            finishBtn.disabled = (!todo.running && !todo.onHold);
            finishBtn.onclick = () => this.finishTodo(todo.id);
            controls.appendChild(finishBtn);
        } else {
            const elapsed = document.createElement('div');
            elapsed.className = 'elapsed-time';
            elapsed.textContent = `완료 — ${this.formatTime(todo.elapsedTime)}`;
            controls.appendChild(elapsed);
        }

        div.appendChild(header);
        div.appendChild(controls);

        if (todo.running || todo.onHold || todo.completed) {
            div.appendChild(this.renderTaskStats(todo));
        }

        if (todo.holdHistory && todo.holdHistory.length > 0) {
            div.appendChild(this.renderHoldHistory(todo));
        }

        return div;
    }

    renderTaskStats(todo) {
        const statsDiv = document.createElement('div');
        statsDiv.className = 'task-stats';

        let focusTime = todo.elapsedTime;
        if (todo.running && todo.startTime) {
            focusTime += Date.now() - todo.startTime;
        }

        const totalHoldTime = (todo.holdHistory || []).reduce((sum, hold) => {
            let duration = hold.duration || 0;
            if (todo.onHold && todo.holdHistory.indexOf(hold) === todo.holdHistory.length - 1) {
                duration = Date.now() - hold.holdStartTime;
            }
            return sum + duration;
        }, 0);

        const holdCount = (todo.holdHistory || []).length;

        const focusTimeItem = document.createElement('div');
        focusTimeItem.className = 'task-stat-item';
        focusTimeItem.innerHTML = `
            <div class="task-stat-label">집중 시간</div>
            <div class="task-stat-value">${this.formatTime(focusTime)}</div>
        `;

        const holdTimeItem = document.createElement('div');
        holdTimeItem.className = 'task-stat-item';
        holdTimeItem.innerHTML = `
            <div class="task-stat-label">홀드 시간</div>
            <div class="task-stat-value">${this.formatTime(totalHoldTime)}</div>
        `;

        const holdCountItem = document.createElement('div');
        holdCountItem.className = 'task-stat-item';
        holdCountItem.innerHTML = `
            <div class="task-stat-label">홀드 횟수</div>
            <div class="task-stat-value">${holdCount}</div>
        `;

        statsDiv.appendChild(focusTimeItem);
        statsDiv.appendChild(holdTimeItem);
        statsDiv.appendChild(holdCountItem);

        return statsDiv;
    }

    renderHoldHistory(todo) {
        const historyDiv = document.createElement('div');
        historyDiv.className = 'hold-history';

        const title = document.createElement('div');
        title.className = 'hold-history-title';
        const toggleIcon = document.createElement('span');
        toggleIcon.className = 'toggle-icon';
        toggleIcon.textContent = '▼';
        title.appendChild(toggleIcon);
        title.appendChild(document.createTextNode(` 홀드 기록 (${todo.holdHistory.length})`));

        const list = document.createElement('div');
        list.className = 'hold-history-list';
        list.style.display = 'none';

        let isExpanded = false;
        title.onclick = () => {
            isExpanded = !isExpanded;
            list.style.display = isExpanded ? 'flex' : 'none';
            toggleIcon.textContent = isExpanded ? '▲' : '▼';
        };

        todo.holdHistory.forEach((hold, index) => {
            const item = document.createElement('div');
            item.className = 'hold-history-item';

            const reason = document.createElement('div');
            reason.className = 'hold-reason';
            reason.textContent = `${index + 1}. ${hold.reason}`;

            const duration = document.createElement('div');
            duration.className = 'hold-duration';
            const date = new Date(hold.timestamp);
            duration.textContent = `${date.toLocaleTimeString()} — 홀드 시간: ${this.formatTime(hold.duration)}`;

            item.appendChild(reason);
            item.appendChild(duration);
            list.appendChild(item);
        });

        historyDiv.appendChild(title);
        historyDiv.appendChild(list);

        return historyDiv;
    }

    render() {
        const todos = this.getCurrentDateTodos();
        this.todoList.innerHTML = '';

        if (todos.length === 0) {
            const emptyState = document.createElement('div');
            emptyState.className = 'empty-state';
            emptyState.innerHTML = '<h3>태스크 없음</h3><p>아래에서 태스크를 추가하세요.</p>';
            this.todoList.appendChild(emptyState);
        } else {
            const sorted = [...todos].sort((a, b) => {
                if (a.completed === b.completed) return 0;
                return a.completed ? 1 : -1;
            });
            sorted.forEach(todo => {
                this.todoList.appendChild(this.renderTodoItem(todo));
            });
        }

        this.updateStats();
        this.renderBacklog();
    }

    getWeekDates() {
        const today = new Date();
        const currentDay = today.getDay();
        const monday = new Date(today);
        monday.setDate(today.getDate() - (currentDay === 0 ? 6 : currentDay - 1));

        const weekDates = [];
        for (let i = 0; i < 7; i++) {
            const date = new Date(monday);
            date.setDate(monday.getDate() + i);
            weekDates.push(this.formatDate(date));
        }
        return weekDates;
    }

    getWeeklyData() {
        const weekDates = this.getWeekDates();
        const weeklyData = {
            dates: weekDates,
            dailyScores: [],
            dailyFocusTimes: [],
            dailyHoldTimes: [],
            allTodos: []
        };

        weekDates.forEach(date => {
            const todos = this.todos[date] || [];
            weeklyData.allTodos.push(...todos);

            const dailyScore = this.calculateDailyScore(date);
            weeklyData.dailyScores.push(dailyScore);

            let focusTime = 0;
            let holdTime = 0;

            todos.forEach(todo => {
                focusTime += todo.elapsedTime / 1000 / 60;

                const todoHoldTime = (todo.holdHistory || []).reduce((sum, hold) => {
                    return sum + (hold.duration || 0);
                }, 0);
                holdTime += todoHoldTime / 1000 / 60;
            });

            weeklyData.dailyFocusTimes.push(Math.round(focusTime));
            weeklyData.dailyHoldTimes.push(Math.round(holdTime));
        });

        return weeklyData;
    }

    calculateDailyScore(date) {
        const originalDate = this.currentDate;
        this.currentDate = date;
        const score = this.calculateFocusScore();
        this.currentDate = originalDate;
        return score.score;
    }

    renderWeeklySummary() {
        const weeklyData = this.getWeeklyData();
        const allTodos = weeklyData.allTodos;

        const validScores = weeklyData.dailyScores.filter((score, index) => {
            const date = weeklyData.dates[index];
            const todos = this.todos[date] || [];
            return todos.length > 0;
        });

        const avgScore = validScores.length > 0
            ? Math.round(validScores.reduce((sum, s) => sum + s, 0) / validScores.length)
            : 0;

        const totalFocusMinutes = weeklyData.dailyFocusTimes.reduce((sum, t) => sum + t, 0);
        const totalHoldMinutes = weeklyData.dailyHoldTimes.reduce((sum, t) => sum + t, 0);

        const completedCount = allTodos.filter(t => t.completed).length;
        const avgCompletionRate = allTodos.length > 0
            ? Math.round((completedCount / allTodos.length) * 100)
            : 0;

        const totalWorkMinutes = totalFocusMinutes + totalHoldMinutes;
        const holdRatio = totalWorkMinutes > 0
            ? Math.round((totalHoldMinutes / totalWorkMinutes) * 100)
            : 0;

        document.getElementById('weeklyFocusScore').textContent = `${avgScore}점`;
        document.getElementById('weeklyCompletionRate').textContent = `${avgCompletionRate}%`;
        document.getElementById('weeklyFocusTime').textContent = this.formatTime(totalFocusMinutes * 60 * 1000);
        document.getElementById('weeklyHoldRatio').textContent = `${holdRatio}%`;

        const reasonCounts = {};
        const restartDelays = [];

        allTodos.forEach(todo => {
            (todo.holdHistory || []).forEach(hold => {
                reasonCounts[hold.reason] = (reasonCounts[hold.reason] || 0) + 1;
                restartDelays.push((hold.duration || 0) / 1000);
            });
        });

        const topBlockers = Object.entries(reasonCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        const blockersHtml = topBlockers.length > 0
            ? topBlockers.map(([reason, count]) => `
                <div class="blocker-item">
                    <span class="blocker-reason">${reason}</span>
                    <span class="blocker-count">${count}회</span>
                </div>
            `).join('')
            : '<p style="color: #6A6A6A; text-align: center;">Hold 이력이 없습니다</p>';

        document.getElementById('topBlockers').innerHTML = blockersHtml;

        const avgRestart = restartDelays.length > 0
            ? restartDelays.reduce((sum, d) => sum + d, 0) / restartDelays.length / 60
            : 0;
        const maxRestart = restartDelays.length > 0
            ? Math.max(...restartDelays) / 60
            : 0;

        document.getElementById('avgRestartTime').textContent = `${Math.round(avgRestart)}분`;
        document.getElementById('maxRestartTime').textContent = `${Math.round(maxRestart)}분`;

        const completedTodos = allTodos.filter(t => t.completed);
        const avgTaskTime = completedTodos.length > 0
            ? completedTodos.reduce((sum, t) => sum + t.elapsedTime, 0) / completedTodos.length / 1000 / 60
            : 0;

        const todosWithHold = allTodos.filter(t => (t.holdHistory || []).length > 0).length;
        const holdOccurrence = allTodos.length > 0
            ? Math.round((todosWithHold / allTodos.length) * 100)
            : 0;

        document.getElementById('avgTaskTime').textContent = `${Math.round(avgTaskTime)}분`;
        document.getElementById('holdOccurrenceRate').textContent = `${holdOccurrence}%`;

        this.renderCharts(weeklyData);
    }

    renderCharts(weeklyData) {
        const dayLabels = ['월', '화', '수', '목', '금', '토', '일'];

        // Spotify dark theme defaults for Chart.js
        const darkDefaults = {
            color: '#B3B3B3',
            borderColor: '#333333',
        };
        const scaleDefaults = {
            ticks: { color: '#B3B3B3', font: { family: 'Inter, sans-serif' } },
            grid: { color: '#282828' },
        };

        if (this.focusScoreChart) {
            this.focusScoreChart.destroy();
        }

        const ctx1 = document.getElementById('focusScoreChart').getContext('2d');
        this.focusScoreChart = new Chart(ctx1, {
            type: 'line',
            data: {
                labels: dayLabels,
                datasets: [{
                    label: 'Focus Score',
                    data: weeklyData.dailyScores,
                    borderColor: '#1DB954',
                    backgroundColor: 'rgba(29, 185, 84, 0.12)',
                    pointBackgroundColor: '#1DB954',
                    pointBorderColor: '#121212',
                    pointBorderWidth: 2,
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: '#B3B3B3', font: { family: 'Inter, sans-serif' } } }
                },
                scales: {
                    x: { ...scaleDefaults },
                    y: {
                        ...scaleDefaults,
                        beginAtZero: true,
                        max: 100
                    }
                }
            }
        });

        if (this.focusHoldChart) {
            this.focusHoldChart.destroy();
        }

        const ctx2 = document.getElementById('focusHoldChart').getContext('2d');
        this.focusHoldChart = new Chart(ctx2, {
            type: 'bar',
            data: {
                labels: dayLabels,
                datasets: [
                    {
                        label: '집중 시간 (분)',
                        data: weeklyData.dailyFocusTimes,
                        backgroundColor: '#1DB954',
                        borderRadius: 4,
                    },
                    {
                        label: 'Hold 시간 (분)',
                        data: weeklyData.dailyHoldTimes,
                        backgroundColor: '#F59B23',
                        borderRadius: 4,
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: '#B3B3B3', font: { family: 'Inter, sans-serif' } } }
                },
                scales: {
                    x: { ...scaleDefaults, stacked: true },
                    y: { ...scaleDefaults, stacked: true, beginAtZero: true }
                }
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new MadMode();
});
