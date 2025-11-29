let taskIdCounter = 0;
let scheduleIdCounter = 0;

// Schedule management
const schedules = new Map();
let currentScheduleId = null;
let hasGeneratedOnce = false;
let hasUnsavedChanges = false;

// Calendar state
let calendarDate = new Date();
let rangeStart = null;
let rangeEnd = null;
let selectedDateRanges = []; // Array of {start, end} objects

// DOM elements
const scheduleTabs = document.getElementById('scheduleTabs');
const addTabBtn = document.getElementById('addTabBtn');
const addScheduleMenu = document.getElementById('addScheduleMenu');
const datePickerModal = document.getElementById('datePickerModal');
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
        unsavedIndicator.style.display = 'flex';
    }
}

function markSaved() {
    hasUnsavedChanges = false;
    unsavedIndicator.style.display = 'none';
}

// Schedule functions
function createSchedule(type, dateRanges = null) {
    const id = ++scheduleIdCounter;
    const schedule = {
        id,
        type,
        dateRanges, // Array of {start, end} for custom, null for others
        tasks: []
    };
    schedules.set(id, schedule);
    markUnsaved();
    return schedule;
}

function getScheduleLabel(schedule) {
    if (schedule.type === 'always') return 'Always';
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
        return `${schedule.dateRanges.length} date ranges`;
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

// Tab rendering
function renderTabs() {
    const existingTabs = scheduleTabs.querySelectorAll('.tab');
    existingTabs.forEach(tab => tab.remove());

    for (const schedule of schedules.values()) {
        const tab = document.createElement('button');
        tab.className = 'tab' + (schedule.id === currentScheduleId ? ' active' : '');
        tab.dataset.scheduleId = schedule.id;

        if (schedule.type !== 'always') {
            tab.classList.add('removable');
            const removeBtn = document.createElement('span');
            removeBtn.className = 'tab-remove';
            removeBtn.innerHTML = '×';
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                removeSchedule(schedule.id);
            });
            tab.appendChild(removeBtn);
        }

        const label = document.createTextNode(getScheduleLabel(schedule));
        tab.insertBefore(label, tab.firstChild);

        tab.addEventListener('click', () => switchToSchedule(schedule.id));
        scheduleTabs.insertBefore(tab, addTabBtn);
    }

    updateAddMenu();
}

function updateAddMenu() {
    const weekdaysItem = addScheduleMenu.querySelector('[data-type="weekdays"]');
    const weekendsItem = addScheduleMenu.querySelector('[data-type="weekends"]');
    const customItem = addScheduleMenu.querySelector('[data-type="custom"]');

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
    if (!schedule || schedule.type === 'always') return;

    schedules.delete(scheduleId);
    markUnsaved();

    if (currentScheduleId === scheduleId) {
        for (const s of schedules.values()) {
            if (s.type === 'always') {
                currentScheduleId = s.id;
                break;
            }
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

    // Track changes
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

        // Highlight current selection
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

        // Highlight already added ranges
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

    // Check for internal overlap
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
        case 'weekdays':
            return 'weekdays';
        case 'weekends':
            return 'weekends';
        case 'custom':
            if (schedule.dateRanges && schedule.dateRanges.length > 0) {
                // Encode multiple ranges: c20241103-20241107_20250203-20250203
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

// Add selection button
document.getElementById('addSelectionBtn').addEventListener('click', addCurrentSelection);

// Modal controls
document.getElementById('closeModal').addEventListener('click', closeDatePicker);
document.getElementById('cancelDatePicker').addEventListener('click', closeDatePicker);

datePickerModal.addEventListener('click', (e) => {
    if (e.target === datePickerModal) closeDatePicker();
});

document.getElementById('confirmDatePicker').addEventListener('click', () => {
    // Add any pending selection
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
            transform: translateY(-10px);
            height: 0;
            padding: 0;
            margin: 0;
            border: 0;
        }
    }
`;
document.head.appendChild(style);

// Initialize
function init() {
    const alwaysSchedule = createSchedule('always');
    currentScheduleId = alwaysSchedule.id;

    addTask({ task: 'Morning Routine', start: '07:00', end: '08:00', color: '#a78bfa' });
    addTask({ task: 'Lunch', start: '12:00', end: '13:00', color: '#6ee7b7' });
    addTask({ task: 'Dinner', start: '18:00', end: '19:00', color: '#fcd34d' });

    renderTabs();

    // Reset unsaved state after init
    hasGeneratedOnce = false;
    hasUnsavedChanges = false;
}

init();
