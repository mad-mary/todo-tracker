class TodoTracker {
    constructor() {
        this.currentDate = this.formatDate(new Date());
        this.todos = this.loadFromLocalStorage();
        this.runningTimers = new Map(); // id → intervalId
        this.runningTodoId = null; // 히어로에 표시할 기준 태스크
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
        this.diary = this.loadDiary();
        this.calendarYear = new Date().getFullYear();
        this.calendarMonth = new Date().getMonth();
        this.pendingHabitStamp = '📚';
        this.pendingHabitColor = '#1DB954';
        this.pendingHabitDays = [];
        this.STAMPS = ['📚','✏️','🏃','💪','🎯','🍎','💧','🧘','📝','🎵','🌟','🔥','😊','🎨','🍵','🌙','☀️','🐣','🦋','⭐'];
        this.QUOTES = [
            { text: '우리는 반복적으로 하는 행동의 결과물이다. 탁월함은 행동이 아니라 습관이다.', author: '아리스토텔레스' },
            { text: '작은 습관이 쌓여 위대한 삶이 된다.', author: 'James Clear' },
            { text: '동기는 시작하게 하지만, 습관이 계속하게 만든다.', author: 'Jim Ryun' },
            { text: '성공은 매일의 작은 노력이 쌓인 결과다.', author: 'Robert Collier' },
            { text: '당신이 하는 일이 곧 당신이 된다.', author: 'Epictetus' },
            { text: '한 번에 한 걸음씩. 그것이 산을 오르는 방법이다.', author: '아프리카 속담' },
            { text: '나무를 심기에 가장 좋은 때는 20년 전이었다. 두 번째로 좋은 때는 지금이다.', author: '중국 속담' },
            { text: '완벽한 계획보다 불완전한 실행이 낫다.', author: '조지 패튼' },
            { text: '당신의 미래는 오늘 당신이 하는 것에 달려 있다.', author: '마하트마 간디' },
            { text: '변화는 어렵다. 변하지 않는 것은 더 어렵다.', author: 'James Baldwin' },
            { text: '규칙적인 삶은 창조적인 일을 위한 최고의 토대다.', author: '귀스타브 플로베르' },
            { text: '한 가지 일을 매일 두렵더라도 해라.', author: '엘리너 루스벨트' },
            { text: '시간이 지나면 하지 않은 일이 한 일보다 더 후회된다.', author: 'Mark Twain' },
            { text: '전진하는 한, 속도는 문제가 되지 않는다.', author: '공자' },
            { text: '오늘 할 수 있는 일을 내일로 미루지 마라.', author: '벤자민 프랭클린' },
            { text: '1%씩 나아지면 1년 후엔 37배 성장한다.', author: 'James Clear' },
            { text: '처음엔 당신이 습관을 만들고, 그다음엔 습관이 당신을 만든다.', author: 'John Dryden' },
            { text: '시작이 반이다.', author: '아리스토텔레스' },
            { text: '지금 이 순간도 언젠가는 그리워하게 된다.', author: '' },
            { text: '지속성은 재능을 이긴다. 재능 있지만 꾸준하지 못한 사람은 흔하다.', author: 'Calvin Coolidge' },
        ];

        this.taskHistoryCache = null;

        // Portfolio state
        this.pfPeriod = 'week';       // 'week' | 'all'
        this.pfFilter = 'all';        // 'all' | 'missed'
        this.pfWeekOffset = 0;        // 0 = 이번 주, -1 = 저번 주, ...
        this.pfDonutChart = null;
        this.pfBarChart = null;
        this.pfCatOverrides = JSON.parse(localStorage.getItem('pfCatOverrides') || '{}');

        this.initElements();
        this.initEventListeners();
        this.setDateInput();
        this.requestNotificationPermission();
        this.restoreActiveState();
        this.render();
        this.renderDiary();
        this.updateSyncDot();

        if (this.gistToken && this.gistId) {
            this.syncFromGist();
        }
        this.startSyncInterval();
        window.addEventListener('beforeunload', () => this.syncToGistKeepAlive());
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') this.syncToGistKeepAlive();
        });
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

        const taskName = this.truncate(todo.text, 40);
        new Notification('⏰ 1시간 경과', {
            body: `"${taskName}" 태스크가 1시간이 넘도록 진행 중입니다.`,
            icon: '/favicon.svg',
            tag: `overdue-${todo.id}`
        });
    }

    restoreActiveState() {
        const todos = this.getCurrentDateTodos();
        todos.filter(t => t.running).forEach(todo => {
            this.runningTodoId = todo.id;
            this.runningTimers.set(todo.id, setInterval(() => this.updateTimer(todo.id), 1000));
        });
        this.updatePageTitle();
    }

    updatePageTitle() {
        const todos = this.getCurrentDateTodos();
        const runningCount = todos.filter(t => t.running).length;
        const onHoldTodo = todos.find(t => t.onHold);

        if (runningCount > 1) {
            document.title = `FOCUS ×${runningCount} — Mad Mode`;
        } else if (runningCount === 1) {
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
        this.diaryTab = document.getElementById('diaryTab');
        this.diaryView = document.getElementById('diaryView');
        this.diaryFab = document.getElementById('diaryFab');
        this.diaryModal = document.getElementById('diaryModal');
        this.diaryModalInput = document.getElementById('diaryModalInput');
        this.diaryModalSubmit = document.getElementById('diaryModalSubmit');
        this.diaryModalClose = document.getElementById('diaryModalClose');
        this.calPrevMonth = document.getElementById('calPrevMonth');
        this.calNextMonth = document.getElementById('calNextMonth');
        this.addHabitBtn = document.getElementById('addHabitBtn');
        this.habitModal = document.getElementById('habitModal');
        this.habitNameInput = document.getElementById('habitNameInput');
        this.habitStartDateInput = document.getElementById('habitStartDateInput');
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
        this.manualSyncBtn = document.getElementById('manualSyncBtn');
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
        this.addTodoSection = document.querySelector('.add-todo-section');
        this.streakSummaryEl = document.getElementById('streakSummary');
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
        this.diaryTab.addEventListener('click', () => this.switchView('diary'));

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
        this.manualSyncBtn.addEventListener('click', () => this.syncFromGist());
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

        this.diaryFab.addEventListener('click', () => this.openDiaryModal());
        this.diaryModalClose.addEventListener('click', () => this.closeDiaryModal());
        this.diaryModalSubmit.addEventListener('click', () => this.submitDiaryModal());
        this.diaryModal.addEventListener('click', (e) => {
            if (e.target === this.diaryModal) this.closeDiaryModal();
        });
        this.diaryModalInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) this.submitDiaryModal();
            if (e.key === 'Escape') this.closeDiaryModal();
        });
    }

    switchView(view) {
        this.currentView = view;
        this.dailyTab.classList.remove('active');
        this.weeklyTab.classList.remove('active');
        this.calendarTab.classList.remove('active');
        this.diaryTab.classList.remove('active');
        this.dailyView.style.display = 'none';
        this.weeklyView.style.display = 'none';
        this.calendarView.style.display = 'none';
        this.diaryView.style.display = 'none';
        this.dateSelector.style.visibility = 'hidden';

        if (view === 'daily') {
            this.dailyTab.classList.add('active');
            this.dailyView.style.display = 'block';
            this.dateSelector.style.visibility = 'visible';
        } else if (view === 'weekly') {
            this.weeklyTab.classList.add('active');
            this.weeklyView.style.display = 'block';
            this.renderPortfolioWeekly();
        } else if (view === 'calendar') {
            this.calendarTab.classList.add('active');
            this.calendarView.style.display = 'block';
            this.renderCalendar();
        } else if (view === 'diary') {
            this.diaryTab.classList.add('active');
            this.diaryView.style.display = 'block';
            this.renderDiaryFeed();
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
        this.taskHistoryCache = null;
    }

    truncate(text, max) {
        return text.length > max ? text.substring(0, max) + '...' : text;
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

    loadDiary() {
        const data = localStorage.getItem('todoTrackerDiary');
        return data ? JSON.parse(data) : {};
    }

    saveDiary() {
        localStorage.setItem('todoTrackerDiary', JSON.stringify(this.diary));
    }

    getCurrentDateDiary() {
        return this.diary[this.currentDate] || [];
    }

    addDiaryEntry(text, source = 'manual') {
        if (!text.trim()) return;
        const entry = {
            id: Date.now(),
            text: text.trim(),
            time: new Date().toTimeString().slice(0, 5),
            source
        };
        if (!this.diary[this.currentDate]) this.diary[this.currentDate] = [];
        this.diary[this.currentDate].unshift(entry);
        this.saveDiary();
        this.renderDiary();
        if (this.currentView === 'diary') this.renderDiaryFeed();
        this.syncToGist();
    }

    deleteDiaryEntry(id, date = null) {
        const targetDate = date || this.currentDate;
        if (!this.diary[targetDate]) return;
        this.diary[targetDate] = this.diary[targetDate].filter(e => e.id !== id);
        this.saveDiary();
        this.renderDiary();
        if (this.currentView === 'diary') this.renderDiaryFeed();
        this.syncToGist();
    }

    openDiaryModal() {
        const d = new Date(this.currentDate + 'T00:00:00');
        const label = `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
        document.getElementById('diaryModalTitle').textContent = label;
        this.diaryModal.classList.add('active');
        this.diaryModalInput.focus();
    }

    closeDiaryModal() {
        this.diaryModal.classList.remove('active');
        this.diaryModalInput.value = '';
    }

    submitDiaryModal() {
        const text = this.diaryModalInput.value.trim();
        if (!text) return;
        this.addDiaryEntry(text);
        this.closeDiaryModal();
    }

    renderDiaryFeed() {
        const feedEl = document.getElementById('diaryFeed');
        if (!feedEl) return;

        const dates = Object.keys(this.diary)
            .filter(d => this.diary[d] && this.diary[d].length > 0)
            .sort((a, b) => b.localeCompare(a));

        feedEl.innerHTML = '';

        if (dates.length === 0) {
            feedEl.innerHTML = '<div class="diary-feed-empty">아직 기록이 없습니다<br><span>우측 하단 버튼을 눌러 첫 일기를 남겨보세요</span></div>';
            return;
        }

        const today = this.formatDate(new Date());
        const yesterday = this.formatDate(new Date(Date.now() - 86400000));

        dates.forEach(date => {
            const entries = [...this.diary[date]].sort((a, b) => b.id - a.id);

            const group = document.createElement('div');
            group.className = 'diary-feed-group';

            const dateHeader = document.createElement('div');
            dateHeader.className = 'diary-feed-date';
            let label;
            if (date === today) label = '오늘';
            else if (date === yesterday) label = '어제';
            else {
                const d = new Date(date + 'T00:00:00');
                label = `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
            }
            dateHeader.textContent = label;
            group.appendChild(dateHeader);

            entries.forEach(entry => {
                const card = document.createElement('div');
                card.className = 'diary-feed-card';

                const meta = document.createElement('div');
                meta.className = 'diary-feed-card-meta';

                const timeEl = document.createElement('span');
                timeEl.className = 'diary-feed-time';
                timeEl.textContent = entry.time;
                meta.appendChild(timeEl);

                if (entry.source === 'imessage') {
                    const src = document.createElement('span');
                    src.className = 'diary-entry-source';
                    src.textContent = '💬 iMessage';
                    meta.appendChild(src);
                }

                const delBtn = document.createElement('button');
                delBtn.className = 'diary-delete-btn';
                delBtn.textContent = '×';
                delBtn.onclick = () => this.deleteDiaryEntry(entry.id, date);

                const textEl = document.createElement('div');
                textEl.className = 'diary-feed-card-text';
                textEl.textContent = entry.text;

                card.appendChild(meta);
                card.appendChild(delBtn);
                card.appendChild(textEl);
                group.appendChild(card);
            });

            feedEl.appendChild(group);
        });
    }

    renderDiary() {
        const entries = this.getCurrentDateDiary();
        const list = document.getElementById('diaryList');
        const countEl = document.getElementById('diaryCount');
        if (!list) return;

        countEl.textContent = entries.length > 0 ? `${entries.length}개` : '';

        list.innerHTML = '';
        if (entries.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'diary-empty';
            empty.textContent = '아직 기록이 없습니다';
            list.appendChild(empty);
            return;
        }

        entries.forEach(entry => {
            const el = document.createElement('div');
            el.className = 'diary-entry';

            const meta = document.createElement('div');
            meta.className = 'diary-entry-meta';

            const timeEl = document.createElement('span');
            timeEl.className = 'diary-entry-time';
            timeEl.textContent = entry.time;
            meta.appendChild(timeEl);

            if (entry.source === 'imessage') {
                const src = document.createElement('span');
                src.className = 'diary-entry-source';
                src.textContent = '💬 iMessage';
                meta.appendChild(src);
            }

            const textEl = document.createElement('div');
            textEl.className = 'diary-entry-text';
            textEl.textContent = entry.text;

            const delBtn = document.createElement('button');
            delBtn.className = 'diary-delete-btn';
            delBtn.textContent = '×';
            delBtn.onclick = () => this.deleteDiaryEntry(entry.id);

            el.appendChild(meta);
            el.appendChild(textEl);
            el.appendChild(delBtn);
            list.appendChild(el);
        });
    }

    // ── 캘린더 ────────────────────────────────────

    renderMotivationQuote() {
        const el = document.getElementById('motivationQuote');
        if (!el) return;
        // 날짜 기반 시드로 하루 동안 같은 문구 유지
        const today = this.formatDate(new Date());
        const seed = today.replace(/-/g, '') | 0;
        const quote = this.QUOTES[seed % this.QUOTES.length];
        el.innerHTML = `
            <div class="motivation-quote-text">${quote.text}</div>
            ${quote.author ? `<div class="motivation-quote-author">— ${quote.author}</div>` : ''}
        `;
    }

    renderCalendar() {
        this.renderMotivationQuote();
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

            const dayOfWeek = new Date(year, month, day).getDay();
            const dayHabits = activeHabits.filter(h =>
                h.startDate <= dateStr && h.endDate >= dateStr &&
                (!h.days || h.days.length === 0 || h.days.includes(dayOfWeek))
            );

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
        if (!this.streakSummaryEl) {
            this.streakSummaryEl = document.getElementById('streakSummary');
        }
        const el = this.streakSummaryEl;
        if (!el) return;

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

        // 진행 중 카운트를 사이드바 헤더에 반영
        const subEl = document.querySelector('.streak-sidebar-title');
        if (subEl) {
            const activeCount = items.filter(h => h.streak > 0).length;
            subEl.dataset.sub = activeCount > 0 ? `${activeCount}개 진행 중` : '';
        }

        el.innerHTML = `
            <div class="streak-dashboard">
                <div class="streak-cards-grid">
                    ${items.map(h => `
                        <div class="streak-card-v2 ${h.streak > 0 ? 'active' : 'inactive'}" style="--habit-color:${h.color}">
                            <div class="streak-card-top">
                                ${h.todayDone
                                    ? '<span class="streak-today-badge">오늘 완료</span>'
                                    : '<span class="streak-burning-badge">타오르는 중</span>'}
                            </div>
                            <div class="streak-card-number ${h.streak > 0 ? '' : 'zero'}">
                                ${h.streak > 0 ? h.stamp : '—'} ${h.streak}
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
        this.habitStartDateInput.value = this.formatDate(new Date());
        this.habitEndDateInput.value = '';
        this.pendingHabitStamp = this.STAMPS[0];
        this.pendingHabitColor = this.TAG_COLORS[2]; // green
        this.pendingHabitDays = [];
        this.renderDaySelector();
        this.renderStampPicker();
        this.renderHabitColorSwatches();
        this.habitModal.classList.add('active');
        this.habitNameInput.focus();
    }

    renderDaySelector() {
        const labels = ['일','월','화','수','목','금','토'];
        const container = document.getElementById('daySelector');
        container.style.setProperty('--habit-color', this.pendingHabitColor);
        container.innerHTML = labels.map((d, i) => `
            <button type="button" class="day-btn ${this.pendingHabitDays.includes(i) ? 'selected' : ''}" data-day="${i}">${d}</button>
        `).join('');
        container.querySelectorAll('.day-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const day = Number(btn.dataset.day);
                const idx = this.pendingHabitDays.indexOf(day);
                if (idx === -1) this.pendingHabitDays.push(day);
                else this.pendingHabitDays.splice(idx, 1);
                this.renderDaySelector();
            });
        });
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

    renderColorSwatches(container, selectedColor, onSelect) {
        container.innerHTML = this.TAG_COLORS.map(color => `
            <span class="tag-color-swatch ${color === selectedColor ? 'selected' : ''}" data-color="${color}" style="background: ${color}"></span>
        `).join('');
        container.querySelectorAll('.tag-color-swatch').forEach(swatch => {
            swatch.addEventListener('click', () => onSelect(swatch.dataset.color));
        });
    }

    renderHabitColorSwatches() {
        this.renderColorSwatches(
            document.getElementById('habitColorSwatches'),
            this.pendingHabitColor,
            (color) => { this.pendingHabitColor = color; this.renderHabitColorSwatches(); this.renderDaySelector(); }
        );
    }

    confirmHabit() {
        const name = this.habitNameInput.value.trim();
        const startDate = this.habitStartDateInput.value;
        const endDate = this.habitEndDateInput.value;
        if (!name || !startDate || !endDate) {
            if (!name) this.habitNameInput.style.outline = '2px solid #FF6B6B';
            if (!startDate) this.habitStartDateInput.style.outline = '2px solid #FF6B6B';
            if (!endDate) this.habitEndDateInput.style.outline = '2px solid #FF6B6B';
            setTimeout(() => {
                this.habitNameInput.style.outline = '';
                this.habitStartDateInput.style.outline = '';
                this.habitEndDateInput.style.outline = '';
            }, 1200);
            return;
        }
        this.habits.push({
            id: Date.now(),
            name,
            endDate,
            startDate,
            stamp: this.pendingHabitStamp,
            color: this.pendingHabitColor,
            days: [...this.pendingHabitDays],
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

        const autoTagIds = this.autoAssignTagsFromText(text);
        const mergedTagIds = [...new Set([...this.selectedTagIds, ...autoTagIds])];

        const todo = {
            id: Date.now(),
            text: text,
            tags: mergedTagIds,
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

    autoAssignTagsFromText(text) {
        const catIds = this.pfAutoClassifyMultiple(text);
        if (!catIds.length) return [];
        const categories = this.pfCategories();
        const tagIds = [];
        catIds.forEach((catId, i) => {
            const cat = categories.find(c => c.id === catId);
            if (!cat) return;
            let tag = this.tags.find(t => t.name.toLowerCase() === cat.label.toLowerCase());
            if (!tag) {
                tag = { id: Date.now() + i + 1, name: cat.label, color: cat.color };
                this.tags.push(tag);
                this.saveTags();
                this.renderTagChips();
            }
            tagIds.push(tag.id);
        });
        return tagIds;
    }

    // ── Feature 1: 태스크 기록 자동완성 ─────────────

    getTaskHistory(filter = '') {
        if (!this.taskHistoryCache) {
            const counts = {};
            Object.values(this.todos).forEach(dayTodos => {
                dayTodos.forEach(t => {
                    const key = t.text.trim();
                    if (key) counts[key] = (counts[key] || 0) + 1;
                });
            });
            this.taskHistoryCache = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        }
        return this.taskHistoryCache
            .filter(([text]) => !filter || text.toLowerCase().includes(filter.toLowerCase()))
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
        const targetDays = habit.days && habit.days.length > 0 ? habit.days : null;
        let streak = 0;
        const today = new Date();

        for (let i = 0; i < 366; i++) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const dayOfWeek = d.getDay();
            const dateStr = this.formatDate(d);

            // Skip days not in target
            if (targetDays && !targetDays.includes(dayOfWeek)) continue;

            if (habit.stamps[dateStr]) {
                streak++;
            } else if (i === 0) {
                // Today is a target day but not stamped yet — don't penalize
                continue;
            } else {
                break;
            }
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
        const zone = this.addTodoSection;
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

    renderTagChips(container, selectedIds, onToggle, emptyHtml = '') {
        if (!container) return;
        if (this.tags.length === 0) {
            container.innerHTML = emptyHtml;
            return;
        }
        container.innerHTML = this.tags.map(tag => {
            const selected = selectedIds.includes(tag.id);
            return `<span class="tag-chip ${selected ? 'selected' : ''}" data-tag-id="${tag.id}" style="--tag-color: ${tag.color}">${tag.name}</span>`;
        }).join('');
        container.querySelectorAll('.tag-chip').forEach(chip => {
            chip.addEventListener('click', () => onToggle(Number(chip.dataset.tagId)));
        });
    }

    renderAddTagSelector() {
        this.renderTagChips(
            this.tagSelectorContainer,
            this.selectedTagIds,
            (tagId) => {
                const idx = this.selectedTagIds.indexOf(tagId);
                if (idx === -1) this.selectedTagIds.push(tagId);
                else this.selectedTagIds.splice(idx, 1);
                this.renderAddTagSelector();
            }
        );
    }

    renderEditTagSelector() {
        this.renderTagChips(
            this.editTagContainer,
            this.editSelectedTagIds,
            (tagId) => {
                const idx = this.editSelectedTagIds.indexOf(tagId);
                if (idx === -1) this.editSelectedTagIds.push(tagId);
                else this.editSelectedTagIds.splice(idx, 1);
                this.renderEditTagSelector();
            },
            '<span style="color: var(--text-faint); font-size: 12px;">등록된 태그 없음 — 🏷 버튼으로 추가하세요</span>'
        );
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
        this.renderColorSwatches(
            this.tagColorSwatches,
            this.pendingTagColor,
            (color) => { this.pendingTagColor = color; this.renderTagColorSwatches(); }
        );
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
            if (this.runningTimers.has(id)) {
                this.stopTask(id);
            }
            this.notifiedTasks.delete(id);
            todos.splice(index, 1);
            this.saveToLocalStorage();
            this.render();
        }
    }

    startTodo(id) {
        const todos = this.getCurrentDateTodos();
        const todo = todos.find(t => t.id === id);
        if (!todo || todo.running) return;

        todo.running = true;
        todo.startTime = Date.now();
        this.runningTodoId = id;
        this.runningTimers.set(id, setInterval(() => this.updateTimer(id), 1000));

        this.saveToLocalStorage();
        this.updatePageTitle();
        this.render();
    }

    stopTask(id) {
        const todos = this.getCurrentDateTodos();
        const todo = todos.find(t => t.id === id);
        if (todo && todo.running) {
            todo.elapsedTime += Date.now() - todo.startTime;
            todo.running = false;
            todo.startTime = null;
        }
        this.stopTimer(id);
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

        this.stopTimer(this.pendingHoldTodoId);
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
            if (this.runningTimers.has(todo.id)) {
                this.stopTask(todo.id);
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
                    // Merge: Gist에만 있는 항목(외부 추가)을 로컬에 반영
                    for (const date in parsed.todos) {
                        if (!this.todos[date]) {
                            this.todos[date] = parsed.todos[date];
                        } else {
                            const localIds = new Set(this.todos[date].map(t => t.id));
                            for (const todo of parsed.todos[date]) {
                                if (!localIds.has(todo.id)) this.todos[date].push(todo);
                            }
                        }
                    }
                    this.tags = parsed.tags || this.tags;
                    this.habits = parsed.habits || this.habits;
                    if (parsed.diary) {
                        for (const date in parsed.diary) {
                            if (!this.diary[date]) {
                                this.diary[date] = parsed.diary[date];
                            } else {
                                const localIds = new Set(this.diary[date].map(e => e.id));
                                for (const entry of parsed.diary[date]) {
                                    if (!localIds.has(entry.id)) this.diary[date].unshift(entry);
                                }
                            }
                        }
                    }
                } else {
                    this.todos = parsed;
                }
                this.saveTags();
                this.saveHabits();
                this.saveDiary();
                this.saveToLocalStorage();
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
        this.syncIntervalTimer = setInterval(async () => {
            await this.syncFromGist();
            await this.syncToGist();
        }, this.SYNC_INTERVAL_MS);
    }

    async syncToGist() {
        if (!this.gistToken) return;
        this.updateSyncDot('syncing');
        try {
            const content = JSON.stringify({ todos: this.todos, tags: this.tags, habits: this.habits, diary: this.diary }, null, 2);
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

    // 페이지 닫힘/백그라운드 전환 시 keepalive fetch로 데이터 손실 방지
    syncToGistKeepAlive() {
        if (!this.gistToken || !this.gistId) return;
        const content = JSON.stringify({ todos: this.todos, tags: this.tags, habits: this.habits, diary: this.diary }, null, 2);
        try {
            fetch(`https://api.github.com/gists/${this.gistId}`, {
                method: 'PATCH',
                keepalive: true,
                headers: {
                    'Authorization': `Bearer ${this.gistToken}`,
                    'Accept': 'application/vnd.github+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    files: { 'todo-tracker.json': { content } }
                })
            });
        } catch {}
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
        this.runningTimers.set(id, setInterval(() => this.updateTimer(id), 1000));

        this.saveToLocalStorage();
        this.updatePageTitle();
        this.render();
    }

    finishTodo(id) {
        this.stopTask(id);

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

    stopTimer(id) {
        clearInterval(this.runningTimers.get(id));
        this.runningTimers.delete(id);
        if (this.runningTodoId === id) {
            this.runningTodoId = this.runningTimers.size > 0
                ? [...this.runningTimers.keys()].at(-1)
                : null;
        }
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
                this.statusValue.textContent = this.truncate(activeTodo.text, 25);
                this.statusSubtext.textContent = 'FOCUS';
            } else if (activeTodo.onHold) {
                this.statusItem.classList.add('on-hold');
                const taskName = this.truncate(activeTodo.text, 25);

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
        const runningTodos = todos.filter(t => t.running);
        const onHoldTodo = todos.find(t => t.onHold);

        this.heroIdle.style.display = 'none';
        this.heroActive.style.display = 'none';
        this.heroHoldState.style.display = 'none';

        if (runningTodos.length > 0) {
            this.heroActive.style.display = 'flex';
            const primary = runningTodos.find(t => t.id === this.runningTodoId) || runningTodos[0];
            this.heroTaskName.textContent = runningTodos.length > 1
                ? `${primary.text} 외 ${runningTodos.length - 1}개`
                : primary.text;
            const elapsed = primary.elapsedTime + (Date.now() - primary.startTime);
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

        const today = this.formatDate(new Date());
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
            const [, month, day] = item.date.split('-').map(Number);
            const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
            const dateLabel = `${months[month - 1]} ${day}`;
            return `
                <div class="backlog-item" data-date="${item.date}" data-todo-id="${item.id}" draggable="true" style="cursor:pointer;">
                    <div class="backlog-item-date">${dateLabel}</div>
                    <div class="backlog-item-text">${item.text}</div>
                </div>
            `;
        }).join('');

        this.backlogList.onclick = (e) => {
            const el = e.target.closest('.backlog-item');
            if (!el) return;
            this.currentDate = el.dataset.date;
            this.setDateInput();
            this.render();
        };
        this.backlogList.ondragstart = (e) => {
            const el = e.target.closest('.backlog-item');
            if (!el) return;
            e.dataTransfer.setData('text/plain', JSON.stringify({
                todoId: Number(el.dataset.todoId),
                fromDate: el.dataset.date
            }));
            el.classList.add('dragging');
        };
        this.backlogList.ondragend = (e) => {
            const el = e.target.closest('.backlog-item');
            if (el) el.classList.remove('dragging');
        };
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

        if (todo.tags && todo.tags.length > 0) {
            todo.tags.forEach(tagId => {
                const tag = this.tags.find(t => t.id === tagId);
                if (tag) {
                    const chip = document.createElement('span');
                    chip.className = 'tag-chip-small';
                    chip.style.setProperty('--tag-color', tag.color);
                    chip.textContent = tag.name;
                    textWrapper.appendChild(chip);
                }
            });
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
                resumeBtn.disabled = false;
                resumeBtn.onclick = () => this.resumeTodo(todo.id);
                controls.appendChild(resumeBtn);
            } else if (!todo.running) {
                const startBtn = document.createElement('button');
                startBtn.className = 'start-btn';
                startBtn.textContent = '시작';
                startBtn.disabled = false;
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
        this.renderDiary();
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

    calculateDailyScore(date) {
        const originalDate = this.currentDate;
        this.currentDate = date;
        const score = this.calculateFocusScore();
        this.currentDate = originalDate;
        return score.score;
    }

    /* ============================================================
       PORTFOLIO (주별 탭) — PO 업무 분류 & 렌더링
       ============================================================ */

    pfGetWeekDates() {
        const d = new Date();
        d.setDate(d.getDate() + this.pfWeekOffset * 7);
        const day = d.getDay();
        const mon = new Date(d);
        mon.setDate(d.getDate() - ((day + 6) % 7));
        return Array.from({ length: 7 }, (_, i) => {
            const dt = new Date(mon);
            dt.setDate(mon.getDate() + i);
            return this.formatDate(dt);
        });
    }

    pfAutoClassify(name) {
        const n = (name || '').toLowerCase();
        const prefixMap = {
            '요청': 'stakeholder', '작업공유': 'stakeholder', '회의': 'stakeholder',
            '미팅': 'stakeholder', '싱크': 'stakeholder', '공유': 'stakeholder',
            '보고': 'stakeholder', '리마인드': 'stakeholder',
            '리서치': 'discovery', '분석': 'discovery',
            '기획': 'delivery', '검토': 'delivery',
            '운영': 'operations', '대응': 'operations', '배포': 'operations',
        };
        const prefixMatch = name.match(/^\[(.+?)\]/);
        if (prefixMatch && prefixMap[prefixMatch[1]]) return prefixMap[prefixMatch[1]];

        const kwMap = [
            { cat: 'stakeholder', words: ['공유', '싱크', '협의', '발표', '보고', '회의', '미팅', '리마인드'] },
            { cat: 'discovery',   words: ['보고서', '로그 분석', '데이터 분석', '지표', '수치', '리서치', '인터뷰', '탐색', '설문', '전환율', '경쟁사', 'abt'] },
            { cat: 'planning',    words: ['로드맵', '우선순위', '계획', 'okr', '분기', '전략', '백로그'] },
            { cat: 'operations',  words: ['이슈', '대응', '운영', 'cs', '처리', '모니터링', '트래킹', '배포', '노출', '릴리즈'] },
            { cat: 'learning',    words: ['스터디', '교육', '세미나', '학습', '회고', '강의'] },
            { cat: 'delivery',    words: ['작성', '확인', '스펙', 'prd', 'ubl', '기획서', '초안', '최종본', '로직', '검수', '피드백', '문서', 'qa', '와이어', '정리', '수정', '검토', '보완', '작업', '정의'] },
        ];
        for (const { cat, words } of kwMap) {
            if (words.some(w => n.includes(w))) return cat;
        }
        return 'other';
    }

    pfGetCategory(todoId, taskName) {
        return this.pfCatOverrides[todoId] || this.pfAutoClassify(taskName);
    }

    pfAutoClassifyMultiple(name) {
        const n = (name || '').toLowerCase();
        const results = new Set();
        const prefixMap = {
            '요청': 'stakeholder', '작업공유': 'stakeholder', '회의': 'stakeholder',
            '미팅': 'stakeholder', '싱크': 'stakeholder', '공유': 'stakeholder',
            '보고': 'stakeholder', '리마인드': 'stakeholder',
            '리서치': 'discovery', '분석': 'discovery',
            '기획': 'delivery', '검토': 'delivery',
            '운영': 'operations', '대응': 'operations', '배포': 'operations',
        };
        const prefixMatch = name.match(/^\[(.+?)\]/);
        if (prefixMatch && prefixMap[prefixMatch[1]]) results.add(prefixMap[prefixMatch[1]]);

        const kwMap = [
            { cat: 'stakeholder', words: ['공유', '싱크', '협의', '발표', '보고', '회의', '미팅', '리마인드'] },
            { cat: 'discovery',   words: ['보고서', '로그 분석', '데이터 분석', '지표', '수치', '리서치', '인터뷰', '탐색', '설문', '전환율', '경쟁사', 'abt'] },
            { cat: 'planning',    words: ['로드맵', '우선순위', '계획', 'okr', '분기', '전략', '백로그'] },
            { cat: 'operations',  words: ['이슈', '대응', '운영', 'cs', '처리', '모니터링', '트래킹', '배포', '노출', '릴리즈'] },
            { cat: 'learning',    words: ['스터디', '교육', '세미나', '학습', '회고', '강의'] },
            { cat: 'delivery',    words: ['작성', '확인', '스펙', 'prd', 'ubl', '기획서', '초안', '최종본', '로직', '검수', '피드백', '문서', 'qa', '와이어', '정리', '수정', '검토', '보완', '작업', '정의'] },
        ];
        for (const { cat, words } of kwMap) {
            if (words.some(w => n.includes(w))) results.add(cat);
        }
        return [...results];
    }

    pfSaveOverrides() {
        localStorage.setItem('pfCatOverrides', JSON.stringify(this.pfCatOverrides));
    }

    pfGetWeekData(weekDates) {
        const PF_CATS = this.pfCategories();
        const catMs = {};
        PF_CATS.forEach(c => { catMs[c.id] = 0; });
        catMs['other'] = 0;
        const tasks = [];

        weekDates.forEach(date => {
            (this.todos[date] || []).forEach(todo => {
                const cat = this.pfGetCategory(todo.id, todo.text);
                catMs[cat] = (catMs[cat] || 0) + (todo.elapsedTime || 0);
                const lastHold = (todo.holdHistory || []).slice(-1)[0];
                tasks.push({
                    id: todo.id, name: todo.text, cat,
                    done: !!todo.completed, date,
                    reason: !todo.completed ? (lastHold ? lastHold.reason : '미착수') : null,
                    completedDate: todo.completed ? date.slice(5).replace('-', '/') : null,
                });
            });
        });

        const total = Object.values(catMs).reduce((s, v) => s + v, 0);
        const pct = {};
        PF_CATS.forEach(c => { pct[c.id] = total > 0 ? Math.round((catMs[c.id] / total) * 100) : 0; });
        pct['other'] = total > 0 ? Math.round(((catMs['other'] || 0) / total) * 100) : 0;
        return { pct, tasks };
    }

    pfGetAllTimeData() {
        const PF_CATS = this.pfCategories();
        const catMs = {};
        PF_CATS.forEach(c => { catMs[c.id] = 0; });
        catMs['other'] = 0;
        Object.values(this.todos).forEach(dayTodos => {
            (dayTodos || []).forEach(todo => {
                const cat = this.pfGetCategory(todo.id, todo.text);
                catMs[cat] = (catMs[cat] || 0) + (todo.elapsedTime || 0);
            });
        });
        const total = Object.values(catMs).reduce((s, v) => s + v, 0);
        const pct = {};
        PF_CATS.forEach(c => { pct[c.id] = total > 0 ? Math.round((catMs[c.id] / total) * 100) : 0; });
        return pct;
    }

    pfCategories() {
        return [
            { id: 'delivery',     label: 'Delivery',     emoji: '⚙️',  color: '#1DB954',  dim: 'rgba(29,185,84,0.80)' },
            { id: 'stakeholder',  label: 'Stakeholder',  emoji: '💬',  color: '#F59B23',  dim: 'rgba(245,155,35,0.80)' },
            { id: 'planning',     label: 'Planning',     emoji: '🗺️',  color: '#BB8FCE',  dim: 'rgba(187,143,206,0.80)' },
            { id: 'discovery',    label: 'Discovery',    emoji: '🔍',  color: '#45B7D1',  dim: 'rgba(69,183,209,0.80)' },
            { id: 'operations',   label: 'Operations',   emoji: '⚡',  color: '#F8A5C2',  dim: 'rgba(248,165,194,0.80)' },
            { id: 'learning',     label: 'Learning',     emoji: '📚',  color: '#78E8C0',  dim: 'rgba(120,232,192,0.80)' },
        ];
    }

    pfCatInfo(id) {
        return this.pfCategories().find(c => c.id === id)
            || { id: 'other', label: '기타', emoji: '•', color: '#6A6A6A', dim: 'rgba(106,106,106,0.80)' };
    }

    renderPortfolioWeekly() {
        const weekDates = this.pfGetWeekDates();
        const weekData  = this.pfGetWeekData(weekDates);
        const allData   = this.pfGetAllTimeData();

        // Period label
        const fmt = d => `${parseInt(d.slice(5, 7))}월 ${parseInt(d.slice(8, 10))}일`;
        document.getElementById('pfPeriodLabel').textContent = `${fmt(weekDates[0])} — ${fmt(weekDates[6])}`;

        this.pfRenderCharts(weekData.pct, allData);
        this.pfRenderLegend(weekData.pct);
        this.pfRenderSummary(weekData.pct, allData);
        this.pfRenderInsights(weekData.pct, allData);
        this.pfRenderTaskList(weekData.tasks);
        this.pfBindButtons(weekDates, weekData.tasks);
    }

    pfRenderCharts(weekPct, allPct) {
        const cats = this.pfCategories();
        const weekVals = cats.map(c => weekPct[c.id] || 0);
        const allVals  = cats.map(c => allPct[c.id]  || 0);

        if (this.pfDonutChart) this.pfDonutChart.destroy();
        const ctx1 = document.getElementById('pfDonutChart');
        if (!ctx1) return;
        this.pfDonutChart = new Chart(ctx1, {
            type: 'doughnut',
            data: {
                labels: cats.map(c => c.label),
                datasets: [{ data: weekVals, backgroundColor: cats.map(c => c.dim), borderColor: '#121212', borderWidth: 3, hoverOffset: 6 }]
            },
            options: {
                cutout: '68%',
                plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed}%` }, backgroundColor: '#2a2a2a', bodyColor: '#B3B3B3', padding: 10, cornerRadius: 8 } },
                animation: { duration: 400 }
            }
        });
        const maxCat = cats.reduce((m, c) => (weekPct[c.id] || 0) > (weekPct[m.id] || 0) ? c : m, cats[0]);
        const donutVal = document.getElementById('pfDonutValue');
        const donutLbl = document.getElementById('pfDonutLabel');
        if (donutVal) { donutVal.textContent = `${weekPct[maxCat.id] || 0}%`; donutVal.style.color = maxCat.color; }
        if (donutLbl) donutLbl.textContent = maxCat.label;

        if (this.pfBarChart) this.pfBarChart.destroy();
        const ctx2 = document.getElementById('pfBarChart');
        if (!ctx2) return;
        this.pfBarChart = new Chart(ctx2, {
            type: 'bar',
            data: {
                labels: cats.map(c => c.label),
                datasets: [
                    { label: '이번 주', data: weekVals, backgroundColor: cats.map(c => c.dim), borderRadius: 4, borderSkipped: false },
                    { label: '전체 누적 평균', data: allVals, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 4, borderSkipped: false }
                ]
            },
            options: {
                indexAxis: 'y',
                scales: {
                    x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#6A6A6A', font: { size: 11 }, callback: v => v + '%' }, max: 80 },
                    y: { grid: { display: false }, ticks: { color: '#B3B3B3', font: { size: 12, weight: '600' } } }
                },
                plugins: {
                    legend: { labels: { color: '#B3B3B3', font: { size: 11 }, boxWidth: 10, padding: 16 } },
                    tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.x}%` }, backgroundColor: '#2a2a2a', bodyColor: '#B3B3B3', padding: 10, cornerRadius: 8 }
                },
                animation: { duration: 400 }
            }
        });
    }

    pfRenderLegend(weekPct) {
        const el = document.getElementById('pfCatLegend');
        if (!el) return;
        el.innerHTML = this.pfCategories().map(c =>
            `<div class="pf-cat-pill"><span style="font-size:12px">${c.emoji}</span>${c.label}<span style="color:var(--text-faint);font-weight:400;margin-left:3px;">${weekPct[c.id] || 0}%</span></div>`
        ).join('');
    }

    pfRenderSummary(weekPct, allPct) {
        const cats = this.pfCategories();
        const topCat   = cats.reduce((m, c) => (weekPct[c.id] || 0) > (weekPct[m.id] || 0) ? c : m, cats[0]);
        const lowCat   = cats.reduce((m, c) => (weekPct[c.id] || 0) < (weekPct[m.id] || 0) ? c : m, cats[0]);
        const topPct   = weekPct[topCat.id] || 0;
        const allTopPct = allPct[topCat.id] || 0;

        const hl = document.getElementById('pfHeadline');
        const sub = document.getElementById('pfSub');
        if (hl)  hl.innerHTML = `<span style="color:${topCat.color}">${topCat.label} 중심</span>의 한 주.<br>${topCat.label}에 ${topPct}% 집중했습니다.`;
        if (sub) {
            const diff = topPct - allTopPct;
            sub.textContent = `${lowCat.label} 비중이 누적 평균 대비 낮은 주였습니다. ${topCat.label}은 전체 평균 대비 ${diff >= 0 ? '+' : ''}${diff}%p.`;
        }
    }

    pfRenderInsights(weekPct, allPct) {
        const cats = this.pfCategories();
        const topCat  = cats.reduce((m, c) => (weekPct[c.id] || 0) > (weekPct[m.id] || 0) ? c : m, cats[0]);
        const lowCat  = cats.reduce((m, c) => (weekPct[c.id] || 0) < (weekPct[m.id] || 0) ? c : m, cats[0]);
        const delivPct = weekPct['delivery'] || 0;
        const allDeliv = allPct['delivery']  || 0;
        const delta    = delivPct - allDeliv;
        const el = document.getElementById('pfInsightRow');
        if (!el) return;
        el.innerHTML = `
            <div class="pf-insight-card">
                <div class="pf-insight-label">주요 업무</div>
                <div class="pf-insight-value" style="color:${topCat.color}">${topCat.label}</div>
                <div class="pf-insight-delta pf-delta-neutral">${weekPct[topCat.id] || 0}% 집중</div>
            </div>
            <div class="pf-insight-card">
                <div class="pf-insight-label">Delivery vs 평균</div>
                <div class="pf-insight-value">${delivPct}%</div>
                <div class="pf-insight-delta ${delta >= 0 ? 'pf-delta-up' : 'pf-delta-down'}">누적 평균 대비 ${delta >= 0 ? '+' : ''}${delta}%p</div>
            </div>
            <div class="pf-insight-card">
                <div class="pf-insight-label">가장 적은 업무</div>
                <div class="pf-insight-value" style="color:${lowCat.color}">${lowCat.label}</div>
                <div class="pf-insight-delta pf-delta-down">${weekPct[lowCat.id] || 0}% — 보강 필요</div>
            </div>`;
    }

    pfRenderTaskList(tasks) {
        const filtered = this.pfFilter === 'missed' ? tasks.filter(t => !t.done) : tasks;
        const missedCount = tasks.filter(t => !t.done).length;
        const lbl = document.getElementById('pfMissedLabel');
        if (lbl) lbl.textContent = `미완료 ${missedCount}건`;

        const cats = this.pfCategories();
        const grouped = {};
        filtered.forEach(t => {
            const cat = this.pfCatOverrides[t.id] || t.cat;
            if (!grouped[cat]) grouped[cat] = [];
            grouped[cat].push({ ...t, cat });
        });

        const el = document.getElementById('pfTaskGroups');
        if (!el) return;
        el.innerHTML = cats
            .filter(c => grouped[c.id])
            .map(c => {
                const list = grouped[c.id];
                const done = list.filter(t => t.done).length;
                const rows = list.map((t) => {
                    const rightEl = t.done
                        ? `<span class="pf-task-date">${t.completedDate} 완료</span>`
                        : `<span class="pf-task-reason">${t.reason || '미착수'}</span>`;
                    return `<div class="pf-task-item">
                        <span class="pf-status-dot ${t.done ? 'pf-dot-done' : 'pf-dot-hold'}"></span>
                        <span class="pf-task-name ${t.done ? 'pf-done' : ''}">${t.name}</span>
                        ${rightEl}
                        ${this.pfBadgeHTML(t.id, t.cat)}
                    </div>`;
                }).join('');
                return `<div class="pf-task-group">
                    <div class="pf-task-group-header">
                        <span style="font-size:14px;line-height:1">${c.emoji}</span>
                        <span class="pf-task-group-name" style="color:${c.color}">${c.label}</span>
                        <span class="pf-task-group-count">${done}/${list.length} 완료</span>
                    </div>
                    ${rows}
                </div>`;
            }).join('');
    }

    pfBadgeHTML(todoId, catId) {
        const c = this.pfCatInfo(catId);
        const dropdownItems = this.pfCategories().map(cat =>
            `<div class="pf-cat-dropdown-item" onclick="window._pfApp.pfChangeCategory('${todoId}','${cat.id}')">
                <span style="width:8px;height:8px;border-radius:50%;background:${cat.color};display:inline-block"></span>${cat.label}
            </div>`
        ).join('');
        return `<div class="pf-cat-badge-wrap">
            <button class="pf-cat-badge pf-cat-${c.id}" onclick="window._pfApp.pfToggleDropdown('${todoId}')" id="pfbadge-${todoId}">
                ${c.label} <span style="font-size:8px;opacity:.7">▾</span>
            </button>
            <div class="pf-cat-dropdown" id="pfdd-${todoId}">${dropdownItems}</div>
        </div>`;
    }

    pfToggleDropdown(todoId) {
        document.querySelectorAll('.pf-cat-dropdown').forEach(d => {
            if (d.id !== `pfdd-${todoId}`) d.classList.remove('pf-open');
        });
        const dd = document.getElementById(`pfdd-${todoId}`);
        if (dd) dd.classList.toggle('pf-open');
    }

    pfChangeCategory(todoId, newCatId) {
        this.pfCatOverrides[todoId] = newCatId;
        this.pfSaveOverrides();
        const dd = document.getElementById(`pfdd-${todoId}`);
        if (dd) dd.classList.remove('pf-open');
        const badge = document.getElementById(`pfbadge-${todoId}`);
        if (badge) {
            const c = this.pfCatInfo(newCatId);
            badge.className = `pf-cat-badge pf-cat-${c.id}`;
            badge.innerHTML = `${c.label} <span style="font-size:8px;opacity:.7">▾</span>`;
        }
    }

    pfBindButtons(weekDates, tasks) {
        window._pfApp = this;

        // Close dropdowns on outside click
        document.addEventListener('click', e => {
            if (!e.target.closest('.pf-cat-badge-wrap')) {
                document.querySelectorAll('.pf-cat-dropdown').forEach(d => d.classList.remove('pf-open'));
            }
        }, { passive: true });

        const bind = (id, fn) => { const el = document.getElementById(id); if (el) { const clone = el.cloneNode(true); el.parentNode.replaceChild(clone, el); clone.addEventListener('click', fn); } };

        bind('pfPrevWeek', () => { this.pfWeekOffset--; this.renderPortfolioWeekly(); });
        bind('pfNextWeek', () => { this.pfWeekOffset++; this.renderPortfolioWeekly(); });
        bind('pfThisWeek', () => { this.pfWeekOffset = 0; this.renderPortfolioWeekly(); });

        bind('pfToggleWeek', () => {
            this.pfPeriod = 'week';
            document.getElementById('pfToggleWeek')?.classList.add('pf-toggle-active');
            document.getElementById('pfToggleAll')?.classList.remove('pf-toggle-active');
            this.pfRenderCharts(this.pfGetWeekData(weekDates).pct, this.pfGetAllTimeData());
        });
        bind('pfToggleAll', () => {
            this.pfPeriod = 'all';
            document.getElementById('pfToggleAll')?.classList.add('pf-toggle-active');
            document.getElementById('pfToggleWeek')?.classList.remove('pf-toggle-active');
            const allPct = this.pfGetAllTimeData();
            this.pfRenderCharts(allPct, allPct);
            this.pfRenderLegend(allPct);
        });

        bind('pfFilterAll', () => {
            this.pfFilter = 'all';
            document.getElementById('pfFilterAll')?.classList.add('pf-toggle-active');
            document.getElementById('pfFilterMissed')?.classList.remove('pf-toggle-active');
            this.pfRenderTaskList(tasks);
        });
        bind('pfFilterMissed', () => {
            this.pfFilter = 'missed';
            document.getElementById('pfFilterMissed')?.classList.add('pf-toggle-active');
            document.getElementById('pfFilterAll')?.classList.remove('pf-toggle-active');
            this.pfRenderTaskList(tasks);
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new TodoTracker();
});
