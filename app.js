class TodoTracker {
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
        this.SYNC_INTERVAL_MS = 10 * 60 * 1000; // 10분
        this.tags = this.loadTags();
        this.selectedTagIds = [];
        this.editSelectedTagIds = [];
        this.pendingTagColor = '#FF6B6B';
        this.TAG_COLORS = ['#FF6B6B', '#F59B23', '#1DB954', '#45B7D1', '#BB8FCE', '#F8A5C2', '#78E8C0', '#85C1E9'];
        this.habits = this.loadHabits();
        this.calendarYear = new Date().getFullYear();
        this.calendarMonth = new Date().getMonth();
        this.pendingHabitStamp = '📚';
        this.pendingHabitColor = '#1DB954';
        this.STAMPS = ['📚','✏️','🏃','💪','🎯','🍎','💧','🧘','📝','🎵','🌟','🔥','😊','🎨','🍵','🌙','☀️','🐣','🦋','⭐'];

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
        this.renderAddTagSelector();
        this.initDropZone();
        this.initTaskHistoryAutocomplete();
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
        // Calendar
        this.calendarTab = document.getElementById('calendarTab');
        this.calendarView = document.getElementById('calendarView');
        this.calPrevMonth = document.getElementById('calPrevMonth');
        this.calNextMonth = document.getElementById('calNextMonth');
        this.addHabitBtn = document.getElementById('addHabitBtn');
        this.habitModal = document.getElementById('habitModal');
        this.habitNameInput = document.getElementById('habitNameInput');
        this.habitEndDateInput = document.getElementById('habitEndDateInput');
        this.confirmHabitBtn = document.getElementById('confirmHabitBtn');
        this.cancelHabitBtn = document.getElementById('cancelHabitBtn');
        this.stampModal = document.getElementById('stampModal');
        this.closeStampModal = document.getElementById('closeStampModal');
        // Tag management
        this.tagManageBtn = document.getElementById('tagManageBtn');
        this.tagManageModal = document.getElementById('tagManageModal');
        this.tagNameInput = document.getElementById('tagNameInput');
        this.tagColorSwatches = document.getElementById('tagColorSwatches');
        this.addTagBtn = document.getElementById('addTagBtn');
        this.tagManageList = document.getElementById('tagManageList');
        this.closeTagManageBtn = document.getElementById('closeTagManageBtn');
        this.tagSelectorContainer = document.getElementById('tagSelectorContainer');
        this.editTagContainer = document.getElementById('editTagContainer');
        this.editMemoInput = document.getElementById('editMemoInput');
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

        this.calendarTab.addEventListener('click', () => this.switchView('calendar'));
        this.calPrevMonth.addEventListener('click', () => {
            this.calendarMonth--;
            if (this.calendarMonth < 0) { this.calendarMonth = 11; this.calendarYear--; }
            this.renderCalendar();
        });
        this.calNextMonth.addEventListener('click', () => {
            this.calendarMonth++;
            if (this.calendarMonth > 11) { this.calendarMonth = 0; this.calendarYear++; }
            this.renderCalendar();
        });
        this.addHabitBtn.addEventListener('click', () => this.openHabitModal());
        this.confirmHabitBtn.addEventListener('click', () => this.confirmHabit());
        this.cancelHabitBtn.addEventListener('click', () => this.habitModal.classList.remove('active'));
        this.habitModal.addEventListener('click', (e) => {
            if (e.target === this.habitModal) this.habitModal.classList.remove('active');
        });
        this.closeStampModal.addEventListener('click', () => this.stampModal.classList.remove('active'));
        this.stampModal.addEventListener('click', (e) => {
            if (e.target === this.stampModal) this.stampModal.classList.remove('active');
        });
        this.tagManageBtn.addEventListener('click', () => this.openTagManageModal());
        this.closeTagManageBtn.addEventListener('click', () => this.tagManageModal.classList.remove('active'));
        this.tagManageModal.addEventListener('click', (e) => {
            if (e.target === this.tagManageModal) this.tagManageModal.classList.remove('active');
        });
        this.addTagBtn.addEventListener('click', () => this.addTag());
        this.tagNameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addTag();
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
        this.dailyTab.classList.remove('active');
        this.weeklyTab.classList.remove('active');
        this.calendarTab.classList.remove('active');
        this.dailyView.style.display = 'none';
        this.weeklyView.style.display = 'none';
        this.calendarView.style.display = 'none';
        this.dateSelector.style.display = 'none';

        if (view === 'daily') {
            this.dailyTab.classList.add('active');
            this.dailyView.style.display = 'block';
            this.dateSelector.style.display = 'flex';
        } else if (view === 'weekly') {
            this.weeklyTab.classList.add('active');
            this.weeklyView.style.display = 'block';
            this.renderWeeklySummary();
        } else if (view === 'calendar') {
            this.calendarTab.classList.add('active');
            this.calendarView.style.display = 'block';
            this.renderCalendar();
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
        const data = localStorage.getItem('todoTrackerData');
        return data ? JSON.parse(data) : {};
    }

    saveToLocalStorage() {
        localStorage.setItem('todoTrackerData', JSON.stringify(this.todos));
    }

    loadTags() {
        const data = localStorage.getItem('todoTrackerTags');
        return data ? JSON.parse(data) : [];
    }

    saveTags() {
        localStorage.setItem('todoTrackerTags', JSON.stringify(this.tags));
    }

    loadHabits() {
        const data = localStorage.getItem('todoTrackerHabits');
        return data ? JSON.parse(data) : [];
    }

    saveHabits() {
        localStorage.setItem('todoTrackerHabits', JSON.stringify(this.habits));
    }

    // ── 캘린더 ────────────────────────────────────

    renderCalendar() {
        const year = this.calendarYear;
        const month = this.calendarMonth;
        const monthNames = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
        document.getElementById('calMonthLabel').textContent = `${year}년 ${monthNames[month]}`;

        const firstDayOfWeek = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const today = this.formatDate(new Date());

        const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
        const monthEnd = `${year}-${String(month + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
        const activeHabits = this.habits.filter(h => h.startDate <= monthEnd && h.endDate >= monthStart);

        const grid = document.getElementById('calendarGrid');
        grid.innerHTML = '';

        ['일','월','화','수','목','금','토'].forEach(d => {
            const h = document.createElement('div');
            h.className = 'cal-day-header';
            h.textContent = d;
            grid.appendChild(h);
        });

        for (let i = 0; i < firstDayOfWeek; i++) {
            const empty = document.createElement('div');
            empty.className = 'cal-cell empty';
            grid.appendChild(empty);
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const cell = document.createElement('div');
            cell.className = 'cal-cell';
            if (dateStr === today) cell.classList.add('today');

            const dayNum = document.createElement('div');
            dayNum.className = 'cal-day-num';
            dayNum.textContent = day;
            cell.appendChild(dayNum);

            const dayHabits = activeHabits.filter(h => h.startDate <= dateStr && h.endDate >= dateStr);

            if (dayHabits.length > 0) {
                const stampsDiv = document.createElement('div');
                stampsDiv.className = 'cal-stamps';
                dayHabits.forEach(habit => {
                    const stamped = !!habit.stamps[dateStr];
                    const el = document.createElement('span');
                    el.className = `cal-stamp ${stamped ? 'stamped' : 'unstamped'}`;
                    el.textContent = habit.stamp;
                    el.title = habit.name;
                    el.style.setProperty('--habit-color', habit.color);
                    stampsDiv.appendChild(el);
                });
                cell.appendChild(stampsDiv);
                cell.style.cursor = 'pointer';
                cell.addEventListener('click', () => this.openStampModal(dateStr, dayHabits));
            }

            grid.appendChild(cell);
        }

        this.renderHabitLegend(activeHabits);
        this.renderStreakSummary(activeHabits);
    }

    renderStreakSummary(habits) {
        let el = document.getElementById('streakSummary');
        if (!el) {
            el = document.createElement('div');
            el.id = 'streakSummary';
            const grid = document.getElementById('calendarGrid');
            grid.parentNode.insertBefore(el, grid);
        }

        if (!habits || habits.length === 0) {
            el.innerHTML = '';
            return;
        }

        const today = this.formatDate(new Date());
        const items = habits.map(h => {
            const streak = this.calcStreak(h);
            const totalDone = Object.keys(h.stamps || {}).length;
            const remaining = h.endDate >= today
                ? Math.round((new Date(h.endDate) - new Date(today)) / 86400000) + 1
                : 0;
            const todayDone = !!h.stamps[today];
            return { ...h, streak, totalDone, remaining, todayDone };
        }).sort((a, b) => b.streak - a.streak);

        el.innerHTML = `
            <div class="streak-dashboard">
                <div class="streak-dashboard-header">
                    <span class="streak-dashboard-title">스트릭 현황</span>
                    <span class="streak-dashboard-sub">${items.filter(h => h.streak > 0).length}개 진행 중</span>
                </div>
                <div class="streak-cards-grid">
                    ${items.map(h => `
                        <div class="streak-card-v2 ${h.streak > 0 ? 'active' : 'inactive'}" style="--habit-color:${h.color}">
                            <div class="streak-card-top">
                                <span class="streak-card-stamp">${h.stamp}</span>
                                ${h.todayDone ? '<span class="streak-today-badge">오늘 완료</span>' : ''}
                            </div>
                            <div class="streak-card-number ${h.streak > 0 ? '' : 'zero'}">
                                ${h.streak > 0 ? '🔥' : '—'} ${h.streak}
                            </div>
                            <div class="streak-card-label">일 연속</div>
                            <div class="streak-card-name">${h.name}</div>
                            <div class="streak-card-meta">
                                <span>${h.totalDone}일 완료</span>
                                <span>D-${h.remaining}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    renderHabitLegend(habits) {
        const legend = document.getElementById('habitLegend');
        if (!habits || habits.length === 0) {
            legend.innerHTML = '';
            return;
        }
        const today = this.formatDate(new Date());
        legend.innerHTML = habits.map(h => {
            const stamped = Object.keys(h.stamps || {}).length;
            const remaining = h.endDate >= today
                ? Math.round((new Date(h.endDate) - new Date(today)) / 86400000) + 1
                : 0;
            const streak = this.calcStreak(h);
            const streakBadge = streak > 0
                ? `<span class="streak-badge">🔥 ${streak}일 연속</span>`
                : '';
            return `
                <div class="habit-legend-item" style="--habit-color: ${h.color}">
                    <span class="habit-legend-stamp">${h.stamp}</span>
                    <span class="habit-legend-name">${h.name}</span>
                    ${streakBadge}
                    <span class="habit-legend-count">${stamped}일 완료 · D-${remaining}</span>
                    <button class="habit-delete-btn" data-habit-id="${h.id}" title="삭제">✕</button>
                </div>
            `;
        }).join('');
        legend.querySelectorAll('.habit-delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteHabit(Number(btn.dataset.habitId));
            });
        });
    }

openStampModal(dateStr, habits) {
        const [y, m, d] = dateStr.split('-').map(Number);
        document.getElementById('stampModalDate').textContent = `${y}년 ${m}월 ${d}일`;

        const container = document.getElementById('stampModalHabits');
        container.innerHTML = '';

        habits.forEach(habit => {
            const item = document.createElement('div');
            item.className = 'stamp-modal-item';

            const label = document.createElement('div');
            label.className = 'stamp-modal-label';
            label.innerHTML = `<span class="stamp-modal-emoji">${habit.stamp}</span><span>${habit.name}</span>`;

            const btn = document.createElement('button');
            const update = () => {
                const stamped = !!habit.stamps[dateStr];
                btn.className = `stamp-toggle-btn ${stamped ? 'stamped' : ''}`;
                btn.textContent = stamped ? '✓ 완료' : '스탬프 찍기';
                btn.style.setProperty('--habit-color', habit.color);
            };
            update();
            btn.addEventListener('click', () => {
                this.toggleStamp(habit.id, dateStr);
                update();
                this.renderCalendar();
            });

            item.appendChild(label);
            item.appendChild(btn);
            container.appendChild(item);
        });

        this.stampModal.classList.add('active');
    }

    toggleStamp(habitId, dateStr) {
        const habit = this.habits.find(h => h.id === habitId);
        if (!habit) return;
        if (habit.stamps[dateStr]) delete habit.stamps[dateStr];
        else habit.stamps[dateStr] = true;
        this.saveHabits();
    }

    openHabitModal() {
        this.habitNameInput.value = '';
        this.habitEndDateInput.value = '';
        this.pendingHabitStamp = this.STAMPS[0];
        this.pendingHabitColor = this.TAG_COLORS[2]; // green
        this.renderStampPicker();
        this.renderHabitColorSwatches();
        this.habitModal.classList.add('active');
        this.habitNameInput.focus();
    }

    renderStampPicker() {
        const picker = document.getElementById('stampPicker');
        picker.innerHTML = this.STAMPS.map(s => `
            <span class="stamp-option ${s === this.pendingHabitStamp ? 'selected' : ''}" data-stamp="${s}">${s}</span>
        `).join('');
        picker.querySelectorAll('.stamp-option').forEach(el => {
            el.addEventListener('click', () => {
                this.pendingHabitStamp = el.dataset.stamp;
                this.renderStampPicker();
            });
        });
    }

    renderHabitColorSwatches() {
        const container = document.getElementById('habitColorSwatches');
        container.innerHTML = this.TAG_COLORS.map(color => `
            <span class="tag-color-swatch ${color === this.pendingHabitColor ? 'selected' : ''}" data-color="${color}" style="background: ${color}"></span>
        `).join('');
        container.querySelectorAll('.tag-color-swatch').forEach(swatch => {
            swatch.addEventListener('click', () => {
                this.pendingHabitColor = swatch.dataset.color;
                this.renderHabitColorSwatches();
            });
        });
    }

    confirmHabit() {
        const name = this.habitNameInput.value.trim();
        const endDate = this.habitEndDateInput.value;
        if (!name || !endDate) {
            if (!name) this.habitNameInput.style.outline = '2px solid #FF6B6B';
            if (!endDate) this.habitEndDateInput.style.outline = '2px solid #FF6B6B';
            setTimeout(() => {
                this.habitNameInput.style.outline = '';
                this.habitEndDateInput.style.outline = '';
            }, 1200);
            return;
        }
        this.habits.push({
            id: Date.now(),
            name,
            endDate,
            startDate: this.formatDate(new Date()),
            stamp: this.pendingHabitStamp,
            color: this.pendingHabitColor,
            stamps: {}
        });
        this.saveHabits();
        this.habitModal.classList.remove('active');
        this.renderCalendar();
    }

    deleteHabit(id) {
        this.habits = this.habits.filter(h => h.id !== id);
        this.saveHabits();
        this.renderCalendar();
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
            tags: [...this.selectedTagIds],
            memo: '',
            completed: false,
            startTime: null,
            elapsedTime: 0,
            running: false,
            onHold: false,
            holdHistory: []
        };

        this.getCurrentDateTodos().push(todo);
        this.todoInput.value = '';
        this.selectedTagIds = [];
        this.renderAddTagSelector();
        this.saveToLocalStorage();
        this.render();
    }

    // ── Feature 1: 태스크 기록 자동완성 ─────────────

    getTaskHistory(filter = '') {
        const counts = {};
        Object.values(this.todos).forEach(dayTodos => {
            dayTodos.forEach(t => {
                const key = t.text.trim();
                if (key) counts[key] = (counts[key] || 0) + 1;
            });
        });
        return Object.entries(counts)
            .filter(([text]) => !filter || text.toLowerCase().includes(filter.toLowerCase()))
            .sort((a, b) => b[1] - a[1])
            .slice(0, 7)
            .map(([text]) => text);
    }

    initTaskHistoryAutocomplete() {
        const input = this.todoInput;
        const dropdown = document.getElementById('taskHistoryDropdown');
        if (!input || !dropdown) return;

        const show = (items) => {
            if (items.length === 0) { dropdown.style.display = 'none'; return; }
            dropdown.innerHTML = items.map(text =>
                `<div class="task-history-item">${text}</div>`
            ).join('');
            dropdown.style.display = 'block';
            dropdown.querySelectorAll('.task-history-item').forEach(el => {
                el.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    input.value = el.textContent;
                    dropdown.style.display = 'none';
                    input.focus();
                });
            });
        };

        input.addEventListener('input', () => {
            const val = input.value.trim();
            if (!val) { dropdown.style.display = 'none'; return; }
            show(this.getTaskHistory(val));
        });
        input.addEventListener('focus', () => {
            const val = input.value.trim();
            if (val) show(this.getTaskHistory(val));
        });
        input.addEventListener('blur', () => {
            setTimeout(() => { dropdown.style.display = 'none'; }, 150);
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') dropdown.style.display = 'none';
        });
    }

    // ── Feature 2: 스트릭 계산 ────────────────────────

    calcStreak(habit) {
        let streak = 0;
        const today = new Date();
        const todayStr = this.formatDate(today);
        const startOffset = habit.stamps[todayStr] ? 0 : 1;
        for (let i = startOffset; i < 366; i++) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const dateStr = this.formatDate(d);
            if (habit.stamps[dateStr]) streak++;
            else break;
        }
        return streak;
    }

    // ── Feature 3: 태스크 메모 렌더 ──────────────────

    renderTodoMemo(todo) {
        const section = document.createElement('div');
        section.className = 'todo-memo-section';

        const toggle = document.createElement('button');
        toggle.className = `memo-toggle-btn${todo.memo ? ' has-memo' : ''}`;
        toggle.textContent = todo.memo ? '📝 메모' : '+ 메모';

        const area = document.createElement('div');
        area.className = 'memo-area';
        area.style.display = todo.memo ? 'block' : 'none';

        const textarea = document.createElement('textarea');
        textarea.className = 'memo-textarea';
        textarea.placeholder = '메모를 입력하세요...';
        textarea.value = todo.memo || '';
        textarea.addEventListener('input', () => {
            todo.memo = textarea.value;
            this.saveToLocalStorage();
            toggle.textContent = todo.memo ? '📝 메모' : '+ 메모';
            toggle.classList.toggle('has-memo', !!todo.memo);
        });

        toggle.addEventListener('click', () => {
            const visible = area.style.display !== 'none';
            area.style.display = visible ? 'none' : 'block';
            if (!visible) textarea.focus();
        });

        area.appendChild(textarea);
        section.appendChild(toggle);
        section.appendChild(area);
        return section;
    }

    initDropZone() {
        const zone = document.querySelector('.add-todo-section');
        if (!zone) return;

        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            zone.classList.add('drop-over');
        });
        zone.addEventListener('dragleave', () => {
            zone.classList.remove('drop-over');
        });
        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.classList.remove('drop-over');
            try {
                const { todoId, fromDate } = JSON.parse(e.dataTransfer.getData('text/plain'));
                this.moveBacklogTodo(todoId, fromDate, this.currentDate);
            } catch {}
        });
    }

    moveBacklogTodo(todoId, fromDate, toDate) {
        if (fromDate === toDate) return;
        const fromList = this.todos[fromDate];
        if (!fromList) return;
        const idx = fromList.findIndex(t => t.id === todoId);
        if (idx === -1) return;

        const [todo] = fromList.splice(idx, 1);
        if (!this.todos[toDate]) this.todos[toDate] = [];
        this.todos[toDate].push(todo);

        this.saveToLocalStorage();
        this.render();
    }

    renderAddTagSelector() {
        if (!this.tagSelectorContainer) return;
        if (this.tags.length === 0) {
            this.tagSelectorContainer.innerHTML = '';
            return;
        }
        this.tagSelectorContainer.innerHTML = this.tags.map(tag => {
            const selected = this.selectedTagIds.includes(tag.id);
            return `<span class="tag-chip ${selected ? 'selected' : ''}" data-tag-id="${tag.id}" style="--tag-color: ${tag.color}">${tag.name}</span>`;
        }).join('');
        this.tagSelectorContainer.querySelectorAll('.tag-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const tagId = Number(chip.dataset.tagId);
                const idx = this.selectedTagIds.indexOf(tagId);
                if (idx === -1) this.selectedTagIds.push(tagId);
                else this.selectedTagIds.splice(idx, 1);
                this.renderAddTagSelector();
            });
        });
    }

    renderEditTagSelector() {
        if (!this.editTagContainer) return;
        if (this.tags.length === 0) {
            this.editTagContainer.innerHTML = '<span style="color: var(--text-faint); font-size: 12px;">등록된 태그 없음 — 🏷 버튼으로 추가하세요</span>';
            return;
        }
        this.editTagContainer.innerHTML = this.tags.map(tag => {
            const selected = this.editSelectedTagIds.includes(tag.id);
            return `<span class="tag-chip ${selected ? 'selected' : ''}" data-tag-id="${tag.id}" style="--tag-color: ${tag.color}">${tag.name}</span>`;
        }).join('');
        this.editTagContainer.querySelectorAll('.tag-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const tagId = Number(chip.dataset.tagId);
                const idx = this.editSelectedTagIds.indexOf(tagId);
                if (idx === -1) this.editSelectedTagIds.push(tagId);
                else this.editSelectedTagIds.splice(idx, 1);
                this.renderEditTagSelector();
            });
        });
    }

    openTagManageModal() {
        this.tagNameInput.value = '';
        this.pendingTagColor = this.TAG_COLORS[0];
        this.renderTagColorSwatches();
        this.renderTagManageList();
        this.tagManageModal.classList.add('active');
        this.tagNameInput.focus();
    }

    renderTagColorSwatches() {
        this.tagColorSwatches.innerHTML = this.TAG_COLORS.map(color => {
            const selected = color === this.pendingTagColor;
            return `<span class="tag-color-swatch ${selected ? 'selected' : ''}" data-color="${color}" style="background: ${color}"></span>`;
        }).join('');
        this.tagColorSwatches.querySelectorAll('.tag-color-swatch').forEach(swatch => {
            swatch.addEventListener('click', () => {
                this.pendingTagColor = swatch.dataset.color;
                this.renderTagColorSwatches();
            });
        });
    }

    renderTagManageList() {
        if (this.tags.length === 0) {
            this.tagManageList.innerHTML = '<div style="color: var(--text-faint); font-size: 13px; padding: 8px 0;">등록된 태그가 없습니다</div>';
            return;
        }
        this.tagManageList.innerHTML = this.tags.map(tag => `
            <div class="tag-manage-item">
                <span class="tag-chip" style="--tag-color: ${tag.color}">${tag.name}</span>
                <button class="tag-delete-btn" data-tag-id="${tag.id}">삭제</button>
            </div>
        `).join('');
        this.tagManageList.querySelectorAll('.tag-delete-btn').forEach(btn => {
            btn.addEventListener('click', () => this.deleteTag(Number(btn.dataset.tagId)));
        });
    }

    addTag() {
        const name = this.tagNameInput.value.trim();
        if (!name) return;
        if (this.tags.some(t => t.name === name)) {
            this.tagNameInput.style.outline = '2px solid #FF6B6B';
            setTimeout(() => this.tagNameInput.style.outline = '', 1200);
            return;
        }
        this.tags.push({ id: Date.now(), name, color: this.pendingTagColor });
        this.saveTags();
        this.tagNameInput.value = '';
        this.renderTagManageList();
        this.renderAddTagSelector();
    }

    deleteTag(id) {
        this.tags = this.tags.filter(t => t.id !== id);
        Object.values(this.todos).forEach(dayTodos => {
            dayTodos.forEach(todo => {
                if (todo.tags) todo.tags = todo.tags.filter(tagId => tagId !== id);
            });
        });
        this.selectedTagIds = this.selectedTagIds.filter(tagId => tagId !== id);
        this.editSelectedTagIds = this.editSelectedTagIds.filter(tagId => tagId !== id);
        this.saveTags();
        this.saveToLocalStorage();
        this.renderTagManageList();
        this.renderAddTagSelector();
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
        this.editSelectedTagIds = [...(todo.tags || [])];
        this.editMemoInput.value = todo.memo || '';
        this.renderEditTagSelector();
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
        todo.tags = [...this.editSelectedTagIds];
        todo.memo = this.editMemoInput.value.trim();

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
            const content = data.files['todo-tracker.json']?.content;
            if (content) {
                const parsed = JSON.parse(content);
                if (parsed.todos) {
                    this.todos = parsed.todos;
                    this.tags = parsed.tags || this.tags;
                    this.habits = parsed.habits || this.habits;
                } else {
                    this.todos = parsed;
                }
                this.saveTags();
                this.saveHabits();
                localStorage.setItem('todoTrackerData', JSON.stringify(this.todos));
                this.renderAddTagSelector();
                this.render();
                if (this.currentView === 'calendar') this.renderCalendar();
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
            const content = JSON.stringify({ todos: this.todos, tags: this.tags, habits: this.habits }, null, 2);
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
                        files: { 'todo-tracker.json': { content } }
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
                        files: { 'todo-tracker.json': { content } }
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
                .forEach(t => backlogItems.push({ id: t.id, text: t.text, date }));
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
                <div class="backlog-item" data-date="${item.date}" data-todo-id="${item.id}" draggable="true" style="cursor:pointer;">
                    <div class="backlog-item-date">${dateLabel}</div>
                    <div class="backlog-item-text">${item.text}</div>
                </div>
            `;
        }).join('');

        this.backlogList.querySelectorAll('.backlog-item').forEach(el => {
            el.addEventListener('click', () => {
                this.currentDate = el.dataset.date;
                this.setDateInput();
                this.render();
            });
            el.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', JSON.stringify({
                    todoId: Number(el.dataset.todoId),
                    fromDate: el.dataset.date
                }));
                el.classList.add('dragging');
            });
            el.addEventListener('dragend', () => {
                el.classList.remove('dragging');
            });
        });
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

        if (todo.tags && todo.tags.length > 0) {
            const tagRow = document.createElement('div');
            tagRow.className = 'todo-tag-row';
            todo.tags.forEach(tagId => {
                const tag = this.tags.find(t => t.id === tagId);
                if (tag) {
                    const chip = document.createElement('span');
                    chip.className = 'tag-chip-small';
                    chip.style.setProperty('--tag-color', tag.color);
                    chip.textContent = tag.name;
                    tagRow.appendChild(chip);
                }
            });
            div.appendChild(tagRow);
        }

        div.appendChild(controls);

        if (todo.running || todo.onHold || todo.completed) {
            div.appendChild(this.renderTaskStats(todo));
        }

        if (todo.holdHistory && todo.holdHistory.length > 0) {
            div.appendChild(this.renderHoldHistory(todo));
        }

        div.appendChild(this.renderTodoMemo(todo));

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
        const tagData = {};
        this.tags.forEach(tag => {
            tagData[tag.id] = { name: tag.name, color: tag.color, total: 0, completed: 0, focusTime: 0 };
        });

        const weeklyData = {
            dates: weekDates,
            dailyScores: [],
            dailyFocusTimes: [],
            dailyHoldTimes: [],
            allTodos: [],
            tagData
        };

        weekDates.forEach(date => {
            const todos = this.todos[date] || [];
            weeklyData.allTodos.push(...todos);
            todos.forEach(todo => {
                (todo.tags || []).forEach(tagId => {
                    if (tagData[tagId]) {
                        tagData[tagId].total++;
                        if (todo.completed) tagData[tagId].completed++;
                        tagData[tagId].focusTime += todo.elapsedTime;
                    }
                });
            });

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
        this.renderTagWeeklyBreakdown(weeklyData.tagData);
    }

    renderTagWeeklyBreakdown(tagData) {
        const container = document.getElementById('tagWeeklyBreakdown');
        if (!container) return;
        const entries = Object.entries(tagData).filter(([, d]) => d.total > 0);
        if (entries.length === 0) {
            container.innerHTML = '<p style="color: var(--text-faint); text-align: center; padding: 12px 0;">이번 주 태그된 태스크 없음</p>';
            return;
        }
        container.innerHTML = entries.map(([, d]) => `
            <div class="tag-weekly-card">
                <div class="tag-weekly-header">
                    <span class="tag-chip-small" style="--tag-color: ${d.color}">${d.name}</span>
                </div>
                <div class="tag-weekly-stats">
                    <div class="tag-stat"><span class="tag-stat-label">태스크</span><span class="tag-stat-value">${d.total}개</span></div>
                    <div class="tag-stat"><span class="tag-stat-label">완료율</span><span class="tag-stat-value">${d.total > 0 ? Math.round(d.completed / d.total * 100) : 0}%</span></div>
                    <div class="tag-stat"><span class="tag-stat-label">집중 시간</span><span class="tag-stat-value">${this.formatTime(d.focusTime)}</span></div>
                </div>
            </div>
        `).join('');
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
    new TodoTracker();
});
