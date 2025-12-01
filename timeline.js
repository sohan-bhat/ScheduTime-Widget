// Default schedule (used if no URL params provided)
const defaultSchedule = [
    { start: "08:00", end: "12:00", task: "School", color: "#6366f1", days: "weekdays" },
    { start: "12:00", end: "13:00", task: "Lunch", color: "#22c55e", days: "both" },
    { start: "13:00", end: "15:00", task: "Study", color: "#3b82f6", days: "weekdays" },
    { start: "15:30", end: "17:00", task: "Free time", color: "#f59e0b", days: "both" },
    { start: "18:00", end: "19:00", task: "Dinner", color: "#a855f7", days: "both" },
];

function parseScheduleFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const scheduleParam = params.get('schedule');

    if (!scheduleParam) {
        return defaultSchedule;
    }

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
        return defaultSchedule;
    }
}

function parseCustomDateRanges(days) {
    // Format: c20241103-20241107_20250203-20250203 (multiple ranges separated by _)
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

function parseABDay(days) {
    // Format: aday_20251201_B or bday_20251201_A
    // Returns { scheduleType: 'aday'|'bday', refDate: Date, refIsADay: boolean }
    const match = days.match(/^(aday|bday)_(\d{8})_([AB])$/);
    if (!match) return null;

    const [, scheduleType, dateStr, refDay] = match;
    const y = parseInt(dateStr.slice(0, 4));
    const m = parseInt(dateStr.slice(4, 6)) - 1;
    const d = parseInt(dateStr.slice(6, 8));

    return {
        scheduleType,
        refDate: new Date(y, m, d),
        refIsADay: refDay === 'A'
    };
}

function isTodayADay(refDate, refIsADay) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    refDate.setHours(0, 0, 0, 0);

    const weekdaysPassed = countWeekdaysBetween(refDate, today);
    return refIsADay ? (weekdaysPassed % 2 === 0) : (weekdaysPassed % 2 === 1);
}

function filterScheduleForToday(fullSchedule) {
    const now = new Date();
    const todayDay = now.getDay();
    const isWeekend = todayDay === 0 || todayDay === 6;
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    return fullSchedule.filter(task => {
        if (task.days === 'both') return true;
        if (task.days === 'weekends' && isWeekend) return true;
        if (task.days === 'weekdays' && !isWeekend) return true;

        // A/B Day handling
        if (task.days && (task.days.startsWith('aday') || task.days.startsWith('bday'))) {
            // Skip A/B day tasks on weekends
            if (isWeekend) return false;

            const abInfo = parseABDay(task.days);
            if (abInfo) {
                const todayIsADay = isTodayADay(abInfo.refDate, abInfo.refIsADay);
                if (abInfo.scheduleType === 'aday') {
                    return todayIsADay;
                } else {
                    return !todayIsADay;
                }
            }
        }

        // Custom date ranges
        if (task.days && task.days.startsWith('c')) {
            const ranges = parseCustomDateRanges(task.days);
            if (ranges) {
                return ranges.some(range => today >= range.start && today <= range.end);
            }
        }

        return false;
    });
}

const fullSchedule = parseScheduleFromUrl();
const schedule = filterScheduleForToday(fullSchedule);

const HOURS_VISIBLE = 3;

let lastSecond = -1;
let tickerPosition = 0;
let initialized = false;
let timelineBuilt = false;

function timeToMinutes(timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
}

function formatTime12(date) {
    return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });
}

function formatDate(date) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[date.getMonth()];
    const day = date.getDate();
    const year = date.getFullYear();
    return `${month}. ${day}, ${year}`;
}

function formatTimeFromMinutes(minutes) {
    let adjustedMinutes = minutes;
    if (adjustedMinutes < 0) adjustedMinutes += 24 * 60;
    if (adjustedMinutes >= 24 * 60) adjustedMinutes -= 24 * 60;

    const h = Math.floor(adjustedMinutes / 60) % 24;
    const m = Math.floor(adjustedMinutes % 60);
    const period = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 || 12;
    return m === 0 ? `${hour} ${period}` : `${hour}:${m.toString().padStart(2, '0')} ${period}`;
}

function formatDuration(minutes) {
    if (minutes >= 60) {
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        return m > 0 ? `${h}h ${m}m` : `${h}h`;
    }
    return `${minutes}m`;
}

function renderSecondsTicker() {
    const now = new Date();
    const currentSecond = now.getSeconds();
    const currentMs = now.getMilliseconds();

    const ticker = document.getElementById('secondsTicker');
    const track = document.querySelector('.seconds-track');
    const trackWidth = track.offsetWidth;

    const markWidth = 10;
    const totalMarks = 180;
    const cycleWidth = 60 * markWidth;

    if (ticker.children.length === 0) {
        for (let i = 0; i < totalMarks; i++) {
            const sec = i % 60;
            const mark = document.createElement('div');
            mark.className = 'second-mark' + (sec % 5 === 0 ? ' major' : '');

            if (sec % 5 === 0) {
                const label = document.createElement('span');
                label.className = 'label';
                label.textContent = sec;
                mark.appendChild(label);
            }

            const tick = document.createElement('div');
            tick.className = 'tick';
            mark.appendChild(tick);

            ticker.appendChild(mark);
        }
    }

    const centerOffset = trackWidth / 2;

    if (!initialized) {
        tickerPosition = cycleWidth + (currentSecond * markWidth) + ((currentMs / 1000) * markWidth);
        initialized = true;
        lastSecond = currentSecond;
    } else {
        const exactProgress = (currentMs / 1000) * markWidth;
        const basePosition = cycleWidth + (currentSecond * markWidth);
        tickerPosition = basePosition + exactProgress;

        if (tickerPosition >= cycleWidth * 2) {
            tickerPosition -= cycleWidth;
        }
    }

    ticker.style.left = -(tickerPosition - centerOffset) + 'px';
    lastSecond = currentSecond;
}

function buildTimeline() {
    const viewport = document.querySelector('.timeline-viewport');
    const viewportWidth = viewport.offsetWidth;
    const windowMinutes = HOURS_VISIBLE * 60 * 2;
    const pixelsPerMinute = viewportWidth / windowMinutes;

    const timeline = document.getElementById('timeline');
    timeline.innerHTML = '';

    const dayStart = 0;
    const dayEnd = 24 * 60;
    const totalWidth = (dayEnd - dayStart) * pixelsPerMinute;

    timeline.style.width = totalWidth + 'px';

    // Sort schedule by start time
    const sortedSchedule = [...schedule].sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));

    let lastEnd = dayStart;

    for (const block of sortedSchedule) {
        const start = timeToMinutes(block.start);
        const end = timeToMinutes(block.end);

        // Add gap block if there's a gap of 1 hour or more
        if (start > lastEnd && (start - lastEnd) >= 60) {
            const gapLeft = lastEnd * pixelsPerMinute;
            const gapWidth = (start - lastEnd) * pixelsPerMinute;
            const gapDiv = document.createElement('div');
            gapDiv.className = 'block gap-block inactive';
            gapDiv.style.left = gapLeft + 'px';
            gapDiv.style.width = gapWidth + 'px';
            gapDiv.dataset.start = lastEnd;
            gapDiv.dataset.end = start;
            gapDiv.dataset.task = 'Nothing scheduled';

            const label = document.createElement('span');
            label.className = 'block-label';
            label.textContent = 'Nothing scheduled';
            gapDiv.appendChild(label);

            timeline.appendChild(gapDiv);
        }

        const blockLeft = start * pixelsPerMinute;
        const width = (end - start) * pixelsPerMinute;
        const div = document.createElement('div');

        div.className = 'block inactive';
        div.style.left = blockLeft + 'px';
        div.style.width = width + 'px';
        div.style.background = block.color;
        div.dataset.start = start;
        div.dataset.end = end;
        div.dataset.task = block.task;

        const label = document.createElement('span');
        label.className = 'block-label';
        label.textContent = block.task;
        div.appendChild(label);

        timeline.appendChild(div);

        lastEnd = Math.max(lastEnd, end);
    }

    // Add final gap if needed (only if 1 hour or more)
    if (lastEnd < dayEnd && (dayEnd - lastEnd) >= 60) {
        const gapLeft = lastEnd * pixelsPerMinute;
        const gapWidth = (dayEnd - lastEnd) * pixelsPerMinute;
        const gapDiv = document.createElement('div');
        gapDiv.className = 'block gap-block inactive';
        gapDiv.style.left = gapLeft + 'px';
        gapDiv.style.width = gapWidth + 'px';
        gapDiv.dataset.start = lastEnd;
        gapDiv.dataset.end = dayEnd;
        gapDiv.dataset.task = 'Nothing scheduled';

        const label = document.createElement('span');
        label.className = 'block-label';
        label.textContent = 'Nothing scheduled';
        gapDiv.appendChild(label);

        timeline.appendChild(gapDiv);
    }

    timelineBuilt = true;
}

function render() {
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes() + (now.getSeconds() / 60) + (now.getMilliseconds() / 60000);

    const windowMinutes = HOURS_VISIBLE * 60 * 2;

    // Update date display
    const dateEl = document.getElementById('currentDate');
    const newDateText = formatDate(now);
    if (dateEl.textContent !== newDateText) {
        dateEl.textContent = newDateText;
    }

    let currentTask = null;
    let currentBlock = null;

    for (const block of schedule) {
        const start = timeToMinutes(block.start);
        const end = timeToMinutes(block.end);
        if (nowMinutes >= start && nowMinutes < end) {
            currentTask = block.task;
            currentBlock = { ...block, startMin: start, endMin: end };
            break;
        }
    }

    if (!currentTask) {
        let gapStart = 0;
        let gapEnd = 24 * 60;

        for (const block of schedule) {
            const start = timeToMinutes(block.start);
            const end = timeToMinutes(block.end);

            if (end <= nowMinutes) {
                gapStart = end;
            }
            if (start > nowMinutes && start < gapEnd) {
                gapEnd = start;
            }
        }

        currentTask = 'Nothing scheduled';
        currentBlock = { task: 'Nothing scheduled', startMin: gapStart, endMin: gapEnd };
    }

    const taskNameEl = document.getElementById('taskName');
    const timeLeftEl = document.getElementById('timeLeft');

    if (taskNameEl.textContent !== currentTask) {
        taskNameEl.textContent = currentTask;
        if (currentTask === 'Nothing scheduled') {
            taskNameEl.classList.add('free');
        } else {
            taskNameEl.classList.remove('free');
        }
    }

    const remaining = Math.ceil(currentBlock.endMin - nowMinutes);
    const durationText = formatDuration(remaining) + ' left';
    if (timeLeftEl.textContent !== durationText) {
        timeLeftEl.textContent = durationText;
    }
    timeLeftEl.style.display = 'inline-block';

    if (!timelineBuilt) {
        buildTimeline();
    }

    const viewport = document.querySelector('.timeline-viewport');
    const viewportWidth = viewport.offsetWidth;
    const pixelsPerMinute = viewportWidth / windowMinutes;

    const timeline = document.getElementById('timeline');

    const offset = (nowMinutes * pixelsPerMinute) - (viewportWidth / 2);
    timeline.style.left = -offset + 'px';

    const blocks = timeline.querySelectorAll('.block');
    blocks.forEach(block => {
        const start = parseFloat(block.dataset.start);
        const end = parseFloat(block.dataset.end);

        const isActive = nowMinutes >= start && nowMinutes < end;
        const isPast = nowMinutes >= end;

        block.classList.remove('active', 'inactive', 'past');

        if (isActive) {
            block.classList.add('active');
        } else {
            block.classList.add('inactive');
        }
        if (isPast) {
            block.classList.add('past');
        }
    });

    const labels = document.getElementById('timeLabels');

    let startTimeText = '—';
    let endTimeText = '—';

    if (currentBlock) {
        startTimeText = formatTimeFromMinutes(currentBlock.startMin);
        endTimeText = formatTimeFromMinutes(currentBlock.endMin);
    }

    const newLabelsHTML = `
        <span class="time-label">${startTimeText}</span>
        <span class="time-label">${formatTime12(now)}</span>
        <span class="time-label">${endTimeText}</span>
    `;
    if (labels.innerHTML !== newLabelsHTML) {
        labels.innerHTML = newLabelsHTML;
    }
}

function updateAll() {
    render();
    renderSecondsTicker();
    requestAnimationFrame(updateAll);
}

function init() {
    render();
    renderSecondsTicker();
    requestAnimationFrame(updateAll);

    window.addEventListener('resize', () => {
        timelineBuilt = false;
        render();
        renderSecondsTicker();
    });
}

document.addEventListener('DOMContentLoaded', init);

// Back button functionality
document.getElementById('backBtn').addEventListener('click', (e) => {
    e.preventDefault();
    const params = new URLSearchParams(window.location.search);
    const scheduleParam = params.get('schedule');
    if (scheduleParam) {
        window.location.href = `index.html?schedule=${encodeURIComponent(scheduleParam)}`;
    } else {
        window.location.href = 'index.html';
    }
});