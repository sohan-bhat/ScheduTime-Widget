let taskIdCounter = 0;
let scheduleIdCounter = 0;

// Schedule management
const schedules = new Map();
let currentScheduleId = null;
let hasGeneratedOnce = false;
let hasUnsavedChanges = false;

// A/B Day calibration - stored as { date: Date, isADay: boolean }
let abDayCalibration = null;

// Calendar state
let calendarDate = new Date();
let rangeStart = null;
let rangeEnd = null;
let selectedDateRanges = [];

// DOM elements
const scheduleTabs = document.getElementById('scheduleTabs');
const addTabBtn = document.getElementById('addTabBtn');
const addScheduleMenu = document.getElementById('addScheduleMenu');
const datePickerModal = document.getElementById('datePickerModal');
const syncModal = document.getElementById('syncModal');
const tasksList = document.getElementById('tasksList');
const emptyState = document.getElementById('emptyState');
const addTaskBtn = document.getElementById('addTaskBtn');
const generateBtn = document.getElementById('generateBtn');
const outputSection = document.getElementById('outputSection');
const generatedUrl = document.getElementById('generatedUrl');
const copyBtn = document.getElementById('copyBtn');
const previewLink = document.getElementById('previewLink');
const taskTemplate = document.getElementById('taskTemplate');
const unsavedIndicator = document.getElementById('unsavedIndicator');

const defaultColors = [
    '#a78bfa', '#6ee7b7', '#93c5fd', '#fcd34d', '#c4b5fd',
    '#fca5a5', '#5eead4', '#fdba74', '#f9a8d4', '#bef264'
];

function getNextColor(scheduleId) {
    const schedule = schedules.get(scheduleId);
    return defaultColors[(schedule?.tasks.length || 0) % defaultColors.length];
}

function markUnsaved() {
    if (hasGeneratedOnce) {
        hasUnsavedChanges = true;
        unsavedIndicator.style.display = 'block';
    }
}

function markSaved() {
    hasUnsavedChanges = false;
    unsavedIndicator.style.display = 'none';
}

// A/B Day calculation
function countWeekdaysBetween(startDate, endDate) {
    let count = 0;
    const current = new Date(startDate);
    current.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0);

    while (current < end) {
        current.setDate(current.getDate() + 1);
        const day = current.getDay();
        if (day !== 0 && day !== 6) count++;
    }
    return count;
}

function isTodayADay() {
    if (!abDayCalibration) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const refDate = new Date(abDayCalibration.date);
    refDate.setHours(0, 0, 0, 0);

    // Check if today is weekend
    const todayDay = today.getDay();
    if (todayDay === 0 || todayDay === 6) return null;

    const weekdaysPassed = countWeekdaysBetween(refDate, today);
    const isADay = abDayCalibration.isADay ? (weekdaysPassed % 2 === 0) : (weekdaysPassed % 2 === 1);
    return isADay;
}

function formatDateFull(date) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`;
}

// Schedule functions
function createSchedule(type, dateRanges = null) {
    const id = ++scheduleIdCounter;
    const schedule = {
        id,
        type,
        dateRanges,
        tasks: []
    };
    schedules.set(id, schedule);
    markUnsaved();
    return schedule;
}

function getScheduleLabel(schedule) {
    if (schedule.type === 'always') return 'Always';
    if (schedule.type === 'aday') return 'A Day';
    if (schedule.type === 'bday') return 'B Day';
    if (schedule.type === 'weekdays') return 'Weekdays';
    if (schedule.type === 'weekends') return 'Weekends';
    if (schedule.type === 'custom' && schedule.dateRanges && schedule.dateRanges.length > 0) {
        if (schedule.dateRanges.length === 1) {
            const r = schedule.dateRanges[0];
            if (r.start.getTime() === r.end.getTime()) {
                return formatDateShort(r.start);
            }
            return `${formatDateShort(r.start)} - ${formatDateShort(r.end)}`;
        }
        return `${schedule.dateRanges.length} dates`;
    }
    return 'Custom';
}

function formatDateShort(date) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[date.getMonth()]} ${date.getDate()}`;
}

function formatDateForUrl(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
}

function hasScheduleType(type) {
    for (const schedule of schedules.values()) {
        if (schedule.type === type) return true;
    }
    return false;
}

function getCustomScheduleCount() {
    let count = 0;
    for (const schedule of schedules.values()) {
        if (schedule.type === 'custom') count++;
    }
    return count;
}

function doDateRangesOverlap(range1, range2) {
    return range1.start <= range2.end && range2.start <= range1.end;
}

function checkCustomOverlap(newRanges, excludeId = null) {
    for (const schedule of schedules.values()) {
        if (schedule.type === 'custom' && schedule.id !== excludeId && schedule.dateRanges) {
            for (const existingRange of schedule.dateRanges) {
                for (const newRange of newRanges) {
                    if (doDateRangesOverlap(newRange, existingRange)) {
                        return true;
                    }
                }
            }
        }
    }
    return false;
}

// Tab drag state
let isDragging = false;
let draggedTabEl = null;
let draggedScheduleId = null;
let dragStartX = 0;
let dragStartY = 0;
let dragClone = null;
let dragOffsetX = 0;
let dragOffsetY = 0;

// Tab rendering
function renderTabs() {
    const existingTabs = scheduleTabs.querySelectorAll('.tab');
    existingTabs.forEach(tab => tab.remove());

    for (const schedule of schedules.values()) {
        const tab = document.createElement('div');
        tab.className = 'tab' + (schedule.id === currentScheduleId ? ' active' : '');
        tab.dataset.scheduleId = schedule.id;

        const isABDay = schedule.type === 'aday' || schedule.type === 'bday';

        // All tabs are removable (as long as there's more than one)
        if (schedules.size > 1) {
            tab.classList.add('removable');
        }
        if (isABDay) {
            tab.classList.add('has-sync');
            const syncBtn = document.createElement('span');
            syncBtn.className = 'tab-sync';
            syncBtn.textContent = 'sync';
            syncBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                openSyncModal();
            });
            tab.appendChild(syncBtn);
        }
        // Add drag handle (hamburger icon)
        const dragHandle = document.createElement('span');
        dragHandle.className = 'tab-drag-handle';
        dragHandle.innerHTML = '<span></span><span></span><span></span>';
        tab.appendChild(dragHandle);

        const removeBtn = document.createElement('span');
        removeBtn.className = 'tab-remove';
        removeBtn.innerHTML = '×';
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeSchedule(schedule.id);
        });
        tab.appendChild(removeBtn);

        const label = document.createElement('span');
        label.className = 'tab-label';
        label.textContent = getScheduleLabel(schedule);
        tab.appendChild(label);

        tab.addEventListener('click', () => {
            if (!isDragging) switchToSchedule(schedule.id);
        });

        // Mouse drag events
        tab.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('tab-remove') || e.target.classList.contains('tab-sync')) return;
            if (e.button !== 0) return; // Only left click

            const rect = tab.getBoundingClientRect();
            draggedTabEl = tab;
            draggedScheduleId = schedule.id;
            dragStartX = e.clientX;
            dragStartY = e.clientY;
            dragOffsetX = e.clientX - rect.left;
            dragOffsetY = e.clientY - rect.top;

            e.preventDefault();
        });

        scheduleTabs.insertBefore(tab, addTabBtn);
    }

    updateAddMenu();
}

// Global mouse handlers for dragging
document.addEventListener('mousemove', (e) => {
    if (!draggedTabEl) return;

    const dx = Math.abs(e.clientX - dragStartX);
    const dy = Math.abs(e.clientY - dragStartY);

    // Start dragging after moving 5px
    if (!isDragging && (dx > 5 || dy > 5)) {
        isDragging = true;
        draggedTabEl.classList.add('dragging');

        // Create floating clone with explicit dimensions
        const rect = draggedTabEl.getBoundingClientRect();
        dragClone = draggedTabEl.cloneNode(true);
        dragClone.classList.add('tab-clone');
        dragClone.classList.remove('dragging', 'active');
        dragClone.style.width = rect.width + 'px';
        dragClone.style.height = rect.height + 'px';
        dragClone.style.left = (e.clientX - dragOffsetX) + 'px';
        dragClone.style.top = (e.clientY - dragOffsetY) + 'px';
        document.body.appendChild(dragClone);
    }

    if (!isDragging) return;

    // Move clone with cursor
    if (dragClone) {
        dragClone.style.left = (e.clientX - dragOffsetX) + 'px';
        dragClone.style.top = (e.clientY - dragOffsetY) + 'px';
    }

    // Find tab under cursor
    const tabs = scheduleTabs.querySelectorAll('.tab');
    tabs.forEach(tab => {
        if (tab === draggedTabEl) {
            tab.classList.remove('drag-over');
            return;
        }

        const rect = tab.getBoundingClientRect();
        if (e.clientX >= rect.left && e.clientX <= rect.right &&
            e.clientY >= rect.top && e.clientY <= rect.bottom) {
            tab.classList.add('drag-over');
        } else {
            tab.classList.remove('drag-over');
        }
    });
});

document.addEventListener('mouseup', (e) => {
    if (!draggedTabEl) return;

    if (isDragging) {
        // Remove clone
        if (dragClone) {
            dragClone.remove();
            dragClone = null;
        }

        // Find drop target
        const tabs = scheduleTabs.querySelectorAll('.tab');
        let dropTarget = null;

        tabs.forEach(tab => {
            const rect = tab.getBoundingClientRect();
            if (e.clientX >= rect.left && e.clientX <= rect.right &&
                e.clientY >= rect.top && e.clientY <= rect.bottom) {
                if (tab !== draggedTabEl) {
                    dropTarget = tab;
                }
            }
            tab.classList.remove('drag-over');
        });

        if (dropTarget) {
            const targetId = parseInt(dropTarget.dataset.scheduleId);
            const movedId = draggedScheduleId;

            reorderSchedules(movedId, targetId);
            markUnsaved();
            renderTabs();

            // Settle animation
            requestAnimationFrame(() => {
                const droppedTab = scheduleTabs.querySelector(`[data-schedule-id="${movedId}"]`);
                if (droppedTab) {
                    droppedTab.classList.add('just-dropped');
                    setTimeout(() => droppedTab.classList.remove('just-dropped'), 300);
                }
            });
        }

        draggedTabEl.classList.remove('dragging');
    }

    isDragging = false;
    draggedTabEl = null;
    draggedScheduleId = null;
});

function reorderSchedules(fromId, toId) {
    const entries = Array.from(schedules.entries());
    const fromIndex = entries.findIndex(([id]) => id === fromId);
    const toIndex = entries.findIndex(([id]) => id === toId);

    if (fromIndex === -1 || toIndex === -1) return;

    const [removed] = entries.splice(fromIndex, 1);
    entries.splice(toIndex, 0, removed);

    schedules.clear();
    for (const [id, schedule] of entries) {
        schedules.set(id, schedule);
    }
}

function updateAddMenu() {
    const adayItem = addScheduleMenu.querySelector('[data-type="aday"]');
    const bdayItem = addScheduleMenu.querySelector('[data-type="bday"]');
    const weekdaysItem = addScheduleMenu.querySelector('[data-type="weekdays"]');
    const weekendsItem = addScheduleMenu.querySelector('[data-type="weekends"]');
    const customItem = addScheduleMenu.querySelector('[data-type="custom"]');

    adayItem.disabled = hasScheduleType('aday');
    bdayItem.disabled = hasScheduleType('bday');
    weekdaysItem.disabled = hasScheduleType('weekdays');
    weekendsItem.disabled = hasScheduleType('weekends');
    customItem.disabled = getCustomScheduleCount() >= 3;
}

function switchToSchedule(scheduleId) {
    currentScheduleId = scheduleId;
    renderTabs();
    renderTasks();
}

function removeSchedule(scheduleId) {
    const schedule = schedules.get(scheduleId);
    if (!schedule) return;

    // Prevent deletion if it's the only remaining tab
    if (schedules.size <= 1) return;

    schedules.delete(scheduleId);
    markUnsaved();

    if (currentScheduleId === scheduleId) {
        // Switch to the first remaining schedule
        const firstSchedule = schedules.values().next().value;
        if (firstSchedule) {
            currentScheduleId = firstSchedule.id;
        }
    }

    renderTabs();
    renderTasks();
}

// Task functions
function createTaskCard(scheduleId, taskData = null) {
    const id = ++taskIdCounter;
    const template = taskTemplate.content.cloneNode(true);
    const card = template.querySelector('.task-card');
    card.dataset.id = id;

    const colorPicker = card.querySelector('.color-picker');
    const colorPreview = card.querySelector('.color-preview');
    const nameInput = card.querySelector('.task-name-input');
    const startTime = card.querySelector('.start-time');
    const endTime = card.querySelector('.end-time');
    const removeBtn = card.querySelector('.btn-remove');

    const color = taskData?.color || getNextColor(scheduleId);
    colorPicker.value = color;
    colorPreview.style.background = color;

    if (taskData) {
        nameInput.value = taskData.task || '';
        startTime.value = taskData.start || '09:00';
        endTime.value = taskData.end || '10:00';
    }

    const trackChange = () => markUnsaved();
    colorPicker.addEventListener('input', (e) => {
        colorPreview.style.background = e.target.value;
        trackChange();
    });
    nameInput.addEventListener('input', trackChange);
    startTime.addEventListener('change', trackChange);
    endTime.addEventListener('change', trackChange);

    removeBtn.addEventListener('click', () => {
        const schedule = schedules.get(scheduleId);
        if (schedule) {
            const index = schedule.tasks.findIndex(t => t.id === id);
            if (index > -1) schedule.tasks.splice(index, 1);
        }
        markUnsaved();
        card.style.animation = 'slideOut 0.2s ease forwards';
        setTimeout(() => {
            card.remove();
            updateEmptyState();
        }, 200);
    });

    const task = {
        id,
        getValues: () => ({
            task: nameInput.value.trim(),
            start: startTime.value,
            end: endTime.value,
            color: colorPicker.value
        })
    };

    const schedule = schedules.get(scheduleId);
    if (schedule) {
        schedule.tasks.push(task);
    }

    return card;
}

function renderTasks() {
    tasksList.innerHTML = '';
    const schedule = schedules.get(currentScheduleId);
    if (!schedule) return;

    schedule.tasks.forEach(task => {
        const values = task.getValues();
        const id = task.id;

        const template = taskTemplate.content.cloneNode(true);
        const card = template.querySelector('.task-card');
        card.dataset.id = id;

        const colorPicker = card.querySelector('.color-picker');
        const colorPreview = card.querySelector('.color-preview');
        const nameInput = card.querySelector('.task-name-input');
        const startTime = card.querySelector('.start-time');
        const endTime = card.querySelector('.end-time');
        const removeBtn = card.querySelector('.btn-remove');

        colorPicker.value = values.color;
        colorPreview.style.background = values.color;
        nameInput.value = values.task;
        startTime.value = values.start;
        endTime.value = values.end;

        const trackChange = () => markUnsaved();
        colorPicker.addEventListener('input', (e) => {
            colorPreview.style.background = e.target.value;
            trackChange();
        });
        nameInput.addEventListener('input', trackChange);
        startTime.addEventListener('change', trackChange);
        endTime.addEventListener('change', trackChange);

        removeBtn.addEventListener('click', () => {
            const schedule = schedules.get(currentScheduleId);
            if (schedule) {
                const index = schedule.tasks.findIndex(t => t.id === id);
                if (index > -1) schedule.tasks.splice(index, 1);
            }
            markUnsaved();
            card.style.animation = 'slideOut 0.2s ease forwards';
            setTimeout(() => {
                card.remove();
                updateEmptyState();
            }, 200);
        });

        task.getValues = () => ({
            task: nameInput.value.trim(),
            start: startTime.value,
            end: endTime.value,
            color: colorPicker.value
        });

        tasksList.appendChild(card);
    });

    updateEmptyState();
}

function updateEmptyState() {
    const schedule = schedules.get(currentScheduleId);
    const hasTasks = schedule && schedule.tasks.length > 0;
    emptyState.style.display = hasTasks ? 'none' : 'block';
    tasksList.style.display = hasTasks ? 'flex' : 'none';
}

function addTask(taskData = null) {
    const card = createTaskCard(currentScheduleId, taskData);
    tasksList.appendChild(card);
    updateEmptyState();
    markUnsaved();

    if (!taskData) {
        card.querySelector('.task-name-input').focus();
    }
}

// Sync Modal
let selectedSyncDay = null;

function openSyncModal() {
    selectedSyncDay = null;
    document.querySelectorAll('.sync-option').forEach(opt => opt.classList.remove('selected'));

    const today = new Date();
    document.getElementById('syncDateDisplay').textContent = `Today is ${formatDateFull(today)}`;

    syncModal.style.display = 'flex';
}

function closeSyncModal() {
    syncModal.style.display = 'none';
}

document.querySelectorAll('.sync-option').forEach(opt => {
    opt.addEventListener('click', () => {
        document.querySelectorAll('.sync-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        selectedSyncDay = opt.dataset.day;
    });
});

document.getElementById('closeSyncModal').addEventListener('click', closeSyncModal);
document.getElementById('cancelSync').addEventListener('click', closeSyncModal);

syncModal.addEventListener('click', (e) => {
    if (e.target === syncModal) closeSyncModal();
});

document.getElementById('confirmSync').addEventListener('click', () => {
    if (!selectedSyncDay) {
        alert('Please select A Day or B Day');
        return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    abDayCalibration = {
        date: today,
        isADay: selectedSyncDay === 'A'
    };

    // Save to localStorage
    localStorage.setItem('abDayCalibration', JSON.stringify({
        date: today.toISOString(),
        isADay: abDayCalibration.isADay
    }));

    markUnsaved();
    closeSyncModal();
});

// Load calibration from localStorage
function loadCalibration() {
    const saved = localStorage.getItem('abDayCalibration');
    if (saved) {
        try {
            const data = JSON.parse(saved);
            abDayCalibration = {
                date: new Date(data.date),
                isADay: data.isADay
            };
        } catch (e) {
            console.error('Failed to load A/B day calibration:', e);
        }
    }
}

// Calendar functions
function renderCalendar() {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];

    document.getElementById('calMonthYear').textContent = `${monthNames[month]} ${year}`;

    const daysContainer = document.getElementById('calendarDays');
    daysContainer.innerHTML = '';

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < firstDay; i++) {
        const empty = document.createElement('button');
        empty.className = 'cal-day empty';
        daysContainer.appendChild(empty);
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        const btn = document.createElement('button');
        btn.className = 'cal-day';
        btn.textContent = day;

        if (date < today) {
            btn.classList.add('disabled');
        } else {
            btn.addEventListener('click', () => selectDate(date));
        }

        if (date.getTime() === today.getTime()) {
            btn.classList.add('today');
        }

        if (rangeStart && rangeEnd) {
            const startTime = rangeStart.getTime();
            const endTime = rangeEnd.getTime();
            const dateTime = date.getTime();

            if (dateTime === startTime) btn.classList.add('range-start');
            if (dateTime === endTime) btn.classList.add('range-end');
            if (dateTime > startTime && dateTime < endTime) btn.classList.add('in-range');
        } else if (rangeStart && date.getTime() === rangeStart.getTime()) {
            btn.classList.add('range-start', 'range-end');
        }

        for (const range of selectedDateRanges) {
            const startTime = range.start.getTime();
            const endTime = range.end.getTime();
            const dateTime = date.getTime();
            if (dateTime >= startTime && dateTime <= endTime) {
                btn.classList.add('already-selected');
            }
        }

        daysContainer.appendChild(btn);
    }

    updateSelectionDisplay();
}

function selectDate(date) {
    if (!rangeStart || (rangeStart && rangeEnd)) {
        rangeStart = date;
        rangeEnd = null;
    } else {
        if (date < rangeStart) {
            rangeEnd = rangeStart;
            rangeStart = date;
        } else {
            rangeEnd = date;
        }
    }
    renderCalendar();
}

function updateSelectionDisplay() {
    const currentSelection = document.getElementById('currentSelection');
    const selectionText = document.getElementById('selectionText');

    if (rangeStart) {
        currentSelection.style.display = 'flex';
        if (rangeEnd && rangeStart.getTime() !== rangeEnd.getTime()) {
            selectionText.textContent = `${formatDateShort(rangeStart)} → ${formatDateShort(rangeEnd)}`;
        } else {
            selectionText.textContent = formatDateShort(rangeStart);
        }
    } else {
        currentSelection.style.display = 'none';
    }

    renderDateChips();
}

function renderDateChips() {
    const container = document.getElementById('dateChips');
    container.innerHTML = '';

    if (selectedDateRanges.length === 0) {
        container.innerHTML = '<span class="empty-selection">No dates selected</span>';
        return;
    }

    selectedDateRanges.forEach((range, index) => {
        const chip = document.createElement('span');
        chip.className = 'date-chip';

        let text;
        if (range.start.getTime() === range.end.getTime()) {
            text = formatDateShort(range.start);
        } else {
            text = `${formatDateShort(range.start)} → ${formatDateShort(range.end)}`;
        }

        chip.innerHTML = `${text}<button class="date-chip-remove" data-index="${index}">×</button>`;
        container.appendChild(chip);
    });

    container.querySelectorAll('.date-chip-remove').forEach(btn => {
        btn.addEventListener('click', () => {
            const index = parseInt(btn.dataset.index);
            selectedDateRanges.splice(index, 1);
            renderCalendar();
        });
    });
}

function addCurrentSelection() {
    if (!rangeStart) return;

    const newRange = {
        start: rangeStart,
        end: rangeEnd || rangeStart
    };

    for (const existing of selectedDateRanges) {
        if (doDateRangesOverlap(newRange, existing)) {
            alert('This selection overlaps with another selection.');
            return;
        }
    }

    selectedDateRanges.push(newRange);
    rangeStart = null;
    rangeEnd = null;
    renderCalendar();
}

function openDatePicker() {
    rangeStart = null;
    rangeEnd = null;
    selectedDateRanges = [];
    calendarDate = new Date();
    renderCalendar();
    datePickerModal.style.display = 'flex';
}

function closeDatePicker() {
    datePickerModal.style.display = 'none';
}

// URL generation
function getScheduleDays(schedule) {
    switch (schedule.type) {
        case 'always':
            return 'both';
        case 'aday':
            if (abDayCalibration) {
                const refDate = formatDateForUrl(abDayCalibration.date);
                const refDay = abDayCalibration.isADay ? 'A' : 'B';
                return `aday_${refDate}_${refDay}`;
            }
            return 'aday';
        case 'bday':
            if (abDayCalibration) {
                const refDate = formatDateForUrl(abDayCalibration.date);
                const refDay = abDayCalibration.isADay ? 'A' : 'B';
                return `bday_${refDate}_${refDay}`;
            }
            return 'bday';
        case 'weekdays':
            return 'weekdays';
        case 'weekends':
            return 'weekends';
        case 'custom':
            if (schedule.dateRanges && schedule.dateRanges.length > 0) {
                return 'c' + schedule.dateRanges.map(r =>
                    `${formatDateForUrl(r.start)}-${formatDateForUrl(r.end)}`
                ).join('_');
            }
            return 'both';
        default:
            return 'both';
    }
}

function generateUrl() {
    const allTasks = [];

    // Check if A/B day schedules exist but not calibrated
    const hasABSchedule = hasScheduleType('aday') || hasScheduleType('bday');
    if (hasABSchedule && !abDayCalibration) {
        alert('Please sync your A/B days first. Hover over the A Day or B Day tab and click "sync".');
        return null;
    }

    for (const schedule of schedules.values()) {
        const taskValues = schedule.tasks.map(t => t.getValues()).filter(t => t.task);
        const days = getScheduleDays(schedule);

        for (const task of taskValues) {
            if (!task.start || !task.end) {
                alert(`Please set start and end times for "${task.task}".`);
                return null;
            }
            if (task.start >= task.end) {
                alert(`End time must be after start time for "${task.task}".`);
                return null;
            }
            allTasks.push({ ...task, days });
        }
    }

    if (allTasks.length === 0) {
        alert('Please add at least one task with a name.');
        return null;
    }

    const encoded = allTasks.map(t =>
        `${encodeURIComponent(t.task)}|${t.start}|${t.end}|${t.color.replace('#', '')}|${t.days}`
    ).join(',');

    const baseUrl = window.location.href.replace(/\/[^\/]*$/, '/');
    return `${baseUrl}timeline.html?schedule=${encoded}`;
}

function showOutput(url) {
    generatedUrl.value = url;
    previewLink.href = url;
    outputSection.style.display = 'block';
    outputSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    hasGeneratedOnce = true;
    markSaved();
}

// Event listeners
addTabBtn.addEventListener('click', (e) => {
    const rect = addTabBtn.getBoundingClientRect();
    addScheduleMenu.style.top = `${rect.bottom + 8}px`;
    addScheduleMenu.style.left = `${rect.left}px`;
    addScheduleMenu.style.display = 'block';
    e.stopPropagation();
});

document.addEventListener('click', () => {
    addScheduleMenu.style.display = 'none';
});

addScheduleMenu.querySelectorAll('.dropdown-item').forEach(item => {
    item.addEventListener('click', () => {
        const type = item.dataset.type;
        addScheduleMenu.style.display = 'none';

        if (type === 'custom') {
            openDatePicker();
        } else {
            const schedule = createSchedule(type);
            currentScheduleId = schedule.id;
            renderTabs();
            renderTasks();

            // Prompt sync for A/B days if not calibrated
            if ((type === 'aday' || type === 'bday') && !abDayCalibration) {
                setTimeout(() => openSyncModal(), 300);
            }
        }
    });
});

// Calendar navigation
document.getElementById('prevMonth').addEventListener('click', () => {
    calendarDate.setMonth(calendarDate.getMonth() - 1);
    renderCalendar();
});

document.getElementById('nextMonth').addEventListener('click', () => {
    calendarDate.setMonth(calendarDate.getMonth() + 1);
    renderCalendar();
});

document.getElementById('addSelectionBtn').addEventListener('click', addCurrentSelection);

document.getElementById('closeModal').addEventListener('click', closeDatePicker);
document.getElementById('cancelDatePicker').addEventListener('click', closeDatePicker);

datePickerModal.addEventListener('click', (e) => {
    if (e.target === datePickerModal) closeDatePicker();
});

document.getElementById('confirmDatePicker').addEventListener('click', () => {
    if (rangeStart) {
        addCurrentSelection();
    }

    if (selectedDateRanges.length === 0) {
        alert('Please select at least one date.');
        return;
    }

    if (checkCustomOverlap(selectedDateRanges)) {
        alert('Some dates overlap with an existing custom schedule.');
        return;
    }

    const schedule = createSchedule('custom', selectedDateRanges);
    currentScheduleId = schedule.id;
    closeDatePicker();
    renderTabs();
    renderTasks();
});

addTaskBtn.addEventListener('click', () => addTask());

generateBtn.addEventListener('click', () => {
    const url = generateUrl();
    if (url) showOutput(url);
});

copyBtn.addEventListener('click', async () => {
    try {
        await navigator.clipboard.writeText(generatedUrl.value);
        copyBtn.textContent = 'Copied!';
        copyBtn.classList.add('copied');
        setTimeout(() => {
            copyBtn.textContent = 'Copy';
            copyBtn.classList.remove('copied');
        }, 2000);
    } catch (err) {
        generatedUrl.select();
        document.execCommand('copy');
        copyBtn.textContent = 'Copied!';
        copyBtn.classList.add('copied');
        setTimeout(() => {
            copyBtn.textContent = 'Copy';
            copyBtn.classList.remove('copied');
        }, 2000);
    }
});

// Animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideOut {
        to {
            opacity: 0;
            transform: translateY(-8px);
            height: 0;
            padding: 0;
            margin: 0;
            border: 0;
        }
    }
`;
document.head.appendChild(style);

// Parse URL and reconstruct schedules
function parseUrlSchedule() {
    const params = new URLSearchParams(window.location.search);
    const scheduleParam = params.get('schedule');

    if (!scheduleParam) return null;

    try {
        const tasks = scheduleParam.split(',').map(taskStr => {
            const [task, start, end, color, days] = taskStr.split('|');
            return {
                task: decodeURIComponent(task),
                start,
                end,
                color: `#${color}`,
                days: days || 'both'
            };
        });
        return tasks;
    } catch (e) {
        console.error('Failed to parse schedule from URL:', e);
        return null;
    }
}

function getScheduleTypeFromDays(days) {
    if (days === 'both') return { type: 'always' };
    if (days === 'weekdays') return { type: 'weekdays' };
    if (days === 'weekends') return { type: 'weekends' };
    if (days.startsWith('aday_')) return { type: 'aday', calibration: parseABCalibration(days) };
    if (days.startsWith('bday_')) return { type: 'bday', calibration: parseABCalibration(days) };
    if (days.startsWith('c')) return { type: 'custom', dateRanges: parseCustomRanges(days) };
    return { type: 'always' };
}

function parseABCalibration(days) {
    // Format: aday_20251201_B or bday_20251201_A
    const match = days.match(/^(?:aday|bday)_(\d{8})_([AB])$/);
    if (!match) return null;

    const [, dateStr, refDay] = match;
    const y = parseInt(dateStr.slice(0, 4));
    const m = parseInt(dateStr.slice(4, 6)) - 1;
    const d = parseInt(dateStr.slice(6, 8));

    return {
        date: new Date(y, m, d),
        isADay: refDay === 'A'
    };
}

function parseCustomRanges(days) {
    // Format: c20241103-20241107_20250203-20250203
    if (!days.startsWith('c')) return null;

    const parseDate = (str) => {
        const y = parseInt(str.slice(0, 4));
        const m = parseInt(str.slice(4, 6)) - 1;
        const d = parseInt(str.slice(6, 8));
        return new Date(y, m, d);
    };

    const rangeStrs = days.slice(1).split('_');
    const ranges = [];

    for (const rangeStr of rangeStrs) {
        const parts = rangeStr.split('-');
        if (parts.length === 2) {
            ranges.push({
                start: parseDate(parts[0]),
                end: parseDate(parts[1])
            });
        }
    }

    return ranges.length > 0 ? ranges : null;
}

function loadFromUrl(tasks) {
    // Group tasks by their schedule type
    const scheduleMap = new Map(); // key: days string, value: { type, tasks, dateRanges, calibration }

    for (const task of tasks) {
        const days = task.days;

        if (!scheduleMap.has(days)) {
            const info = getScheduleTypeFromDays(days);
            scheduleMap.set(days, {
                ...info,
                tasks: []
            });
        }

        scheduleMap.get(days).tasks.push(task);
    }

    // Create schedules and add tasks
    let firstScheduleId = null;
    let calibrationSet = false;

    for (const [days, info] of scheduleMap) {
        // Set A/B day calibration if found
        if (info.calibration && !calibrationSet) {
            abDayCalibration = info.calibration;
            localStorage.setItem('abDayCalibration', JSON.stringify({
                date: abDayCalibration.date.toISOString(),
                isADay: abDayCalibration.isADay
            }));
            calibrationSet = true;
        }

        const schedule = createSchedule(info.type, info.dateRanges || null);
        if (!firstScheduleId) firstScheduleId = schedule.id;

        currentScheduleId = schedule.id;
        for (const task of info.tasks) {
            addTask({
                task: task.task,
                start: task.start,
                end: task.end,
                color: task.color
            });
        }
    }

    if (firstScheduleId) {
        currentScheduleId = firstScheduleId;
    }
}

// Initialize
function init() {
    loadCalibration();

    const urlTasks = parseUrlSchedule();

    if (urlTasks && urlTasks.length > 0) {
        // Load from URL
        loadFromUrl(urlTasks);
        // Clear URL params after loading
        window.history.replaceState({}, '', window.location.pathname);
    } else {
        // Default initialization
        const alwaysSchedule = createSchedule('always');
        currentScheduleId = alwaysSchedule.id;

        addTask({ task: 'Morning', start: '07:00', end: '08:00', color: '#a78bfa' });
        addTask({ task: 'Lunch', start: '12:00', end: '13:00', color: '#6ee7b7' });
        addTask({ task: 'Dinner', start: '18:00', end: '19:00', color: '#fcd34d' });
    }

    renderTabs();
    renderTasks();

    hasGeneratedOnce = false;
    hasUnsavedChanges = false;
}

init();
