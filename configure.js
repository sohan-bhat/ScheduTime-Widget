let taskIdCounter = 0;
const tasks = [];

const tasksList = document.getElementById('tasksList');
const emptyState = document.getElementById('emptyState');
const addTaskBtn = document.getElementById('addTaskBtn');
const generateBtn = document.getElementById('generateBtn');
const outputSection = document.getElementById('outputSection');
const generatedUrl = document.getElementById('generatedUrl');
const copyBtn = document.getElementById('copyBtn');
const previewLink = document.getElementById('previewLink');
const taskTemplate = document.getElementById('taskTemplate');

const defaultColors = [
    '#6366f1', // indigo
    '#22c55e', // green
    '#3b82f6', // blue
    '#f59e0b', // amber
    '#a855f7', // purple
    '#ef4444', // red
    '#14b8a6', // teal
    '#f97316', // orange
    '#ec4899', // pink
    '#84cc16', // lime
];

function getNextColor() {
    return defaultColors[tasks.length % defaultColors.length];
}

function createTaskCard(taskData = null) {
    const id = ++taskIdCounter;
    const template = taskTemplate.content.cloneNode(true);
    const card = template.querySelector('.task-card');
    card.dataset.id = id;

    const colorPicker = card.querySelector('.color-picker');
    const colorPreview = card.querySelector('.color-preview');
    const nameInput = card.querySelector('.task-name-input');
    const startTime = card.querySelector('.start-time');
    const endTime = card.querySelector('.end-time');
    const dayOptions = card.querySelectorAll('.day-option');
    const removeBtn = card.querySelector('.btn-remove');

    // Set default or provided values
    const color = taskData?.color || getNextColor();
    colorPicker.value = color;
    colorPreview.style.background = color;

    if (taskData) {
        nameInput.value = taskData.task || '';
        startTime.value = taskData.start || '09:00';
        endTime.value = taskData.end || '10:00';

        dayOptions.forEach(opt => {
            opt.classList.remove('active');
            if (opt.dataset.value === taskData.days) {
                opt.classList.add('active');
            }
        });
    }

    // Color picker change
    colorPicker.addEventListener('input', (e) => {
        colorPreview.style.background = e.target.value;
    });

    // Day options toggle
    dayOptions.forEach(opt => {
        opt.addEventListener('click', () => {
            dayOptions.forEach(o => o.classList.remove('active'));
            opt.classList.add('active');
        });
    });

    // Remove button
    removeBtn.addEventListener('click', () => {
        const index = tasks.findIndex(t => t.id === id);
        if (index > -1) {
            tasks.splice(index, 1);
        }
        card.style.animation = 'slideOut 0.2s ease forwards';
        setTimeout(() => {
            card.remove();
            updateEmptyState();
        }, 200);
    });

    // Store task reference
    const task = {
        id,
        getValues: () => ({
            task: nameInput.value.trim(),
            start: startTime.value,
            end: endTime.value,
            color: colorPicker.value,
            days: card.querySelector('.day-option.active').dataset.value
        })
    };
    tasks.push(task);

    return card;
}

function updateEmptyState() {
    if (tasks.length === 0) {
        emptyState.style.display = 'block';
        tasksList.style.display = 'none';
    } else {
        emptyState.style.display = 'none';
        tasksList.style.display = 'flex';
    }
}

function addTask(taskData = null) {
    const card = createTaskCard(taskData);
    tasksList.appendChild(card);
    updateEmptyState();

    // Focus the name input for new tasks
    if (!taskData) {
        card.querySelector('.task-name-input').focus();
    }
}

function generateUrl() {
    const taskValues = tasks.map(t => t.getValues()).filter(t => t.task);

    if (taskValues.length === 0) {
        alert('Please add at least one task with a name.');
        return null;
    }

    // Validate times
    for (const task of taskValues) {
        if (!task.start || !task.end) {
            alert(`Please set start and end times for "${task.task}".`);
            return null;
        }
        if (task.start >= task.end) {
            alert(`End time must be after start time for "${task.task}".`);
            return null;
        }
    }

    // Encode schedule data
    // Format: task|start|end|color|days,task|start|end|color|days,...
    const encoded = taskValues.map(t =>
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
}

// Event Listeners
addTaskBtn.addEventListener('click', () => addTask());

generateBtn.addEventListener('click', () => {
    const url = generateUrl();
    if (url) {
        showOutput(url);
    }
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
        // Fallback for older browsers
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

// Add slide out animation
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

// Initialize with default tasks to show the UI
function init() {
    // Add some example tasks
    addTask({ task: 'School', start: '08:00', end: '12:00', color: '#6366f1', days: 'weekdays' });
    addTask({ task: 'Lunch', start: '12:00', end: '13:00', color: '#22c55e', days: 'both' });
    addTask({ task: 'Study', start: '13:00', end: '15:00', color: '#3b82f6', days: 'weekdays' });
    addTask({ task: 'Free time', start: '15:30', end: '17:00', color: '#f59e0b', days: 'both' });
    addTask({ task: 'Dinner', start: '18:00', end: '19:00', color: '#a855f7', days: 'both' });
}

init();
