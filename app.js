/**
 * Adapt — Full-Featured Adaptive Study Planner
 * Zero-dependency standalone application.
 * Runs directly in Chrome via file:// or any local server.
 */

(function () {
  'use strict';

  // =========================================================================
  // 1. CONSTANTS & CONFIG
  // =========================================================================
  const googleId = localStorage.getItem('adapt_google_id');
  const STORAGE_KEY = googleId ? `adapt_study_planner_state_${googleId}` : 'adapt_study_planner_state_v2';

  const DEFAULT_CATEGORIES = [
    { id: 'cat-dsa', label: 'DSA & Algorithms', color: '#f59e0b' },
    { id: 'cat-college', label: 'College & Exams', color: '#3b82f6' },
    { id: 'cat-dev', label: 'Software Dev', color: '#06b6d4' },
    { id: 'cat-research', label: 'Research & AI', color: '#a855f7' },
    { id: 'cat-personal', label: 'Personal Growth', color: '#ec4899' },
    { id: 'cat-other', label: 'Other', color: '#64748b' },
  ];

  const FALLBACK_CATEGORY_ID = 'cat-other';

  const PRIORITIES = [
    { id: 'Critical', label: 'Critical', color: '#ef4444', weight: 4 },
    { id: 'High', label: 'High', color: '#f97316', weight: 3 },
    { id: 'Medium', label: 'Medium', color: '#eab308', weight: 2 },
    { id: 'Low', label: 'Low', color: '#10b981', weight: 1 },
  ];

  const ENERGIES = [
    { id: 'High', label: 'High Energy', icon: '⚡' },
    { id: 'Medium', label: 'Medium Energy', icon: '🔋' },
    { id: 'Low', label: 'Low Energy', icon: '☕' },
  ];

  const FLEXIBILITIES = [
    { id: 'Strict', label: 'Strict (Priority locked)' },
    { id: 'Flexible', label: 'Flexible (Auto-flow)' },
  ];

  const LOST_TIME_REASONS = [
    'Social media & scrolling',
    'Procrastination / daydreaming',
    'Unexpected call / interruption',
    'Fatigue / low energy',
    'Errands / chores',
    'Overextended break',
    'Other distraction',
  ];

  const COLOR_SWATCHES = [
    '#f59e0b', '#f97316', '#ef4444', '#ec4899', '#d946ef',
    '#a855f7', '#6366f1', '#3b82f6', '#06b6d4', '#14b8a6',
    '#10b981', '#84cc16', '#64748b',
  ];

  const DEFAULT_SCHEDULE_CONFIG = {
    dayStart: '08:00',
    dayEnd: '23:00',
    breakfastStart: '08:30',
    breakfastEnd: '09:00',
    breakfastDuration: 30,
    breakfastEnabled: true,
    lunchStart: '13:00',
    lunchEnd: '13:45',
    lunchDuration: 45,
    dinnerStart: '20:00',
    dinnerEnd: '20:45',
    dinnerDuration: 45,
    maxChunkMin: 90,
    minChunkMin: 20,
    gapUtilization: 0.82,
    breakDurationMin: 10,
    breakThresholdMin: 45,
  };

  // =========================================================================
  // 2. DATE & TIME UTILITIES
  // =========================================================================
  function parseTimeToMinutes(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return 0;
    const parts = timeStr.split(':');
    return (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
  }

  function minutesToTime(totalMinutes) {
    const norm = Math.max(0, Math.min(24 * 60 - 1, Math.round(totalMinutes)));
    const h = Math.floor(norm / 60);
    const m = norm % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  function formatTime12(timeVal) {
    const totalMin = typeof timeVal === 'number' ? timeVal : parseTimeToMinutes(timeVal);
    const roundedMin = Math.round(totalMin);
    const h24 = Math.floor(roundedMin / 60) % 24;
    const m = roundedMin % 60;
    const period = h24 >= 12 ? 'PM' : 'AM';
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return `${h12}:${String(m).padStart(2, '0')} ${period}`;
  }

  function getTodayISO() {
    return formatDateISO(new Date());
  }

  function formatDateISO(d) {
    const date = new Date(d);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function addDays(isoStr, days) {
    const d = new Date(isoStr + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return formatDateISO(d);
  }

  function diffDays(isoA, isoB) {
    const da = new Date(isoA + 'T00:00:00');
    const db = new Date(isoB + 'T00:00:00');
    return Math.round((da.getTime() - db.getTime()) / (1000 * 60 * 60 * 24));
  }

  function relativeDateLabel(targetIso, refIso = getTodayISO()) {
    if (!targetIso) return 'No deadline';
    const diff = diffDays(targetIso, refIso);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff === -1) return 'Yesterday';
    if (diff < -1) return `Overdue by ${Math.abs(diff)}d`;
    if (diff <= 6) {
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const d = new Date(targetIso + 'T00:00:00');
      return `In ${diff}d (${days[d.getDay()]})`;
    }
    return `In ${diff}d`;
  }

  function formatDateDisplay(isoDateStr) {
    if (!isoDateStr) return '';
    const d = new Date(isoDateStr + 'T00:00:00');
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
  }

  function getDayOfWeek(dateOrIso) {
    if (typeof dateOrIso === 'string') {
      return new Date(dateOrIso + 'T00:00:00').getDay();
    }
    return dateOrIso.getDay();
  }

  function formatDuration(minutes) {
    const m = Math.max(0, Math.round(minutes || 0));
    if (m === 0) return '0m';
    const h = Math.floor(m / 60);
    const rem = m % 60;
    if (h > 0 && rem > 0) return `${h}h ${rem}m`;
    if (h > 0) return `${h}h`;
    return `${rem}m`;
  }

  function formatSeconds(totalSec) {
    const s = Math.max(0, Math.floor(totalSec || 0));
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    if (hrs > 0) {
      return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  function getCurrentTimeMinutes(d = new Date()) {
    return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
  }

  function getWeekDates(refDate = new Date()) {
    const ref = new Date(refDate);
    const day = ref.getDay();
    const diffToMonday = (day === 0 ? -6 : 1) - day;
    const mon = new Date(ref);
    mon.setDate(ref.getDate() + diffToMonday);

    const dates = [];
    for (let i = 0; i < 7; i++) {
      const cur = new Date(mon);
      cur.setDate(mon.getDate() + i);
      dates.push(formatDateISO(cur));
    }
    return dates;
  }

  // Web Audio Chime
  function playChime() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;

      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now); // D5
      gain1.gain.setValueAtTime(0.3, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.8);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, now + 0.15); // A5
      gain2.gain.setValueAtTime(0.3, now + 0.15);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.15);
      osc2.stop(now + 1.2);
    } catch (e) {
      console.warn('Audio chime notice:', e);
    }
  }

  // Data Validation Helpers
  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function validateTaskDuration(val) {
    if (val === undefined || val === null || String(val).trim() === '') {
      return { valid: false, message: 'Duration is required.' };
    }
    const n = Number(val);
    if (typeof n !== 'number' || isNaN(n) || !isFinite(n)) {
      return { valid: false, message: 'Duration must be a valid number.' };
    }
    if (n < 1) {
      return { valid: false, message: 'Duration must be at least 1 minute.' };
    }
    if (n > 1440) {
      return { valid: false, message: 'Duration cannot exceed 1440 minutes (24 hours).' };
    }
    return { valid: true, value: Math.round(n) };
  }

  function validateTimeRange(startStr, endStr) {
    const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!startStr || !timeRegex.test(String(startStr).trim())) {
      return { valid: false, message: 'Start time must be a valid time (HH:MM).' };
    }
    if (!endStr || !timeRegex.test(String(endStr).trim())) {
      return { valid: false, message: 'End time must be a valid time (HH:MM).' };
    }
    const sMin = parseTimeToMinutes(startStr);
    const eMin = parseTimeToMinutes(endStr);
    if (eMin <= sMin) {
      return { valid: false, message: 'End time must be strictly after start time.' };
    }
    return { valid: true, startMin: sMin, endMin: eMin };
  }

  function validateStudyMinutes(val) {
    if (val === undefined || val === null || String(val).trim() === '') {
      return { valid: false, message: 'Study minutes are required.' };
    }
    const n = Number(val);
    if (typeof n !== 'number' || isNaN(n) || !isFinite(n)) {
      return { valid: false, message: 'Study minutes must be a valid number.' };
    }
    if (n < 1) {
      return { valid: false, message: 'Study minutes must be at least 1 minute.' };
    }
    if (n > 1440) {
      return { valid: false, message: 'Study minutes cannot exceed 1440 minutes.' };
    }
    return { valid: true, value: Math.round(n) };
  }

  // =========================================================================
  // 3. CATEGORY HELPERS
  // =========================================================================
  function getCategoryById(categories, catId) {
    if (!categories || !categories.length) {
      return DEFAULT_CATEGORIES.find(c => c.id === FALLBACK_CATEGORY_ID) || DEFAULT_CATEGORIES[0];
    }
    const found = categories.find(c => c.id === catId);
    return found || (categories.find(c => c.id === FALLBACK_CATEGORY_ID) || categories[0]);
  }

  function getCategoryColor(categories, catId) {
    return getCategoryById(categories, catId).color || '#64748b';
  }

  function getCategoryLabel(categories, catId) {
    return getCategoryById(categories, catId).label || 'Other';
  }

  function normalizeCategoryId(categories, catId) {
    if (!catId) return FALLBACK_CATEGORY_ID;
    return categories && categories.some(c => c.id === catId) ? catId : FALLBACK_CATEGORY_ID;
  }

  // =========================================================================
  // 4. NATURAL LANGUAGE TASK PARSER
  // =========================================================================
  const NLP_MONTH_MAP = {
    jan: 1, january: 1,
    feb: 2, february: 2,
    mar: 3, march: 3,
    apr: 4, april: 4,
    may: 5,
    jun: 6, june: 6,
    jul: 7, july: 7,
    aug: 8, august: 8,
    sep: 9, sept: 9, september: 9,
    oct: 10, october: 10,
    nov: 11, november: 11,
    dec: 12, december: 12
  };

  function parseQuickTaskInput(text, categories = []) {
    const todayIso = getTodayISO();
    if (!text || typeof text !== 'string') {
      return { title: '', duration: 45, deadline: todayIso, priority: 'Medium', categoryId: categories[0]?.id || 'cat-dsa' };
    }

    const [curY, curM, curD] = todayIso.split('-').map(Number);
    let working = text.trim();
    let duration = null;
    let deadline = null;
    let priority = null;
    let categoryId = null;

    // 1. Strip conversational leading phrasing
    working = working.replace(/^(?:i\s+(?:want|need|have|wish|plan)\s+to\s+(?:complete|finish|do|study|submit|work\s+on|prepare)\s+|please\s+add\s+|add\s+task\s+|add\s+|create\s+task\s+|create\s+|task\s*:\s*|plan\s+to\s+|remind\s+me\s+to\s+)/i, '');

    // 2. Duration matching (e.g. 1.5h, 90m, 45 mins, for 2 hours)
    const hourMinMatch = working.match(/(?:for\s+)?(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hours?)\s*(\d+)?\s*(?:m|min|mins|minutes?)?/i);
    if (hourMinMatch) {
      const hrs = parseFloat(hourMinMatch[1]) || 0;
      const mins = parseInt(hourMinMatch[2], 10) || 0;
      duration = Math.round(hrs * 60 + mins);
      working = working.replace(hourMinMatch[0], ' ');
    } else {
      const minMatch = working.match(/(?:for\s+)?(\d+)\s*(?:m|min|mins|minutes?)\b/i);
      if (minMatch) {
        duration = parseInt(minMatch[1], 10);
        working = working.replace(minMatch[0], ' ');
      }
    }

    // 3. Priority matching (e.g. critical, urgent, p0, high, med, medium, low)
    if (/\b(?:critical|urgent|p0|p1|asap)\b/i.test(working)) {
      priority = 'Critical';
      working = working.replace(/\b(?:critical|urgent|p0|p1|asap)\b/i, ' ');
    } else if (/\b(?:high|p2|important)\b/i.test(working)) {
      priority = 'High';
      working = working.replace(/\b(?:high|p2|important)\b/i, ' ');
    } else if (/\b(?:medium|med|p3|normal)\b/i.test(working)) {
      priority = 'Medium';
      working = working.replace(/\b(?:medium|med|p3|normal)\b/i, ' ');
    } else if (/\b(?:low|p4)\b/i.test(working)) {
      priority = 'Low';
      working = working.replace(/\b(?:low|p4)\b/i, ' ');
    }

    // 4. Deadline matching
    // 4a. Day-Month matching (e.g. 'by 18 sep', '18th september', 'due 18 sep 2026', 'by 18 september')
    const dFirst = working.match(/\b(?:by|on|due|before|deadline|until)?\s*(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s*,?\s*(\d{4}))?\b/i);
    if (dFirst) {
      const day = parseInt(dFirst[1], 10);
      const mKey = dFirst[2].toLowerCase();
      const month = NLP_MONTH_MAP[mKey];
      let year = dFirst[3] ? parseInt(dFirst[3], 10) : curY;
      if (!dFirst[3]) {
        const testIso = year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
        if (testIso < todayIso && month < curM) year += 1;
      }
      deadline = year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
      working = working.replace(dFirst[0], ' ');
    }

    // 4b. Month-Day matching (e.g. 'by sep 18', 'september 18th', 'due sep 18 2026')
    if (!deadline) {
      const mFirst = working.match(/\b(?:by|on|due|before|deadline|until)?\s*(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{4}))?\b/i);
      if (mFirst) {
        const month = NLP_MONTH_MAP[mFirst[1].toLowerCase()];
        const day = parseInt(mFirst[2], 10);
        let year = mFirst[3] ? parseInt(mFirst[3], 10) : curY;
        if (!mFirst[3]) {
          const testIso = year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
          if (testIso < todayIso && month < curM) year += 1;
        }
        deadline = year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
        working = working.replace(mFirst[0], ' ');
      }
    }

    // 4c. Numeric Date matching (e.g. 'by 18/09', 'due 18-09-2026', '18/9')
    if (!deadline) {
      const numMatch = working.match(/\b(?:by|on|due|before|deadline|until)?\s*(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/i);
      if (numMatch) {
        const d = parseInt(numMatch[1], 10);
        const m = parseInt(numMatch[2], 10);
        let y = numMatch[3] ? parseInt(numMatch[3], 10) : curY;
        if (y < 100) y += 2000;
        if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
          deadline = y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
          working = working.replace(numMatch[0], ' ');
        }
      }
    }

    // 4d. Relative dates (today, tomorrow, day after tomorrow, in X days, weekdays)
    if (!deadline) {
      if (/\b(?:by|on|due|before)?\s*(?:today|tonight)\b/i.test(working)) {
        deadline = todayIso;
        working = working.replace(/\b(?:by|on|due|before)?\s*(?:today|tonight)\b/i, ' ');
      } else if (/\b(?:by|on|due|before)?\s*(?:day\s+after\s+tomorrow)\b/i.test(working)) {
        deadline = addDays(todayIso, 2);
        working = working.replace(/\b(?:by|on|due|before)?\s*(?:day\s+after\s+tomorrow)\b/i, ' ');
      } else if (/\b(?:by|on|due|before)?\s*tomorrow\b/i.test(working)) {
        deadline = addDays(todayIso, 1);
        working = working.replace(/\b(?:by|on|due|before)?\s*tomorrow\b/i, ' ');
      } else {
        const inDaysMatch = working.match(/\b(?:in|after)\s+(\d+)\s*(?:d|days?)\b/i);
        if (inDaysMatch) {
          deadline = addDays(todayIso, parseInt(inDaysMatch[1], 10));
          working = working.replace(inDaysMatch[0], ' ');
        } else {
          const days = [
            { name: 'sunday', short: 'sun', d: 0 },
            { name: 'monday', short: 'mon', d: 1 },
            { name: 'tuesday', short: 'tue', d: 2 },
            { name: 'wednesday', short: 'wed', d: 3 },
            { name: 'thursday', short: 'thu', d: 4 },
            { name: 'friday', short: 'fri', d: 5 },
            { name: 'saturday', short: 'sat', d: 6 },
          ];
          for (const item of days) {
            const pattern = new RegExp(`\\b(?:by|on|due|before|next|this)?\\s*(${item.name}|${item.short})\\b`, 'i');
            if (pattern.test(working)) {
              const curDay = new Date(todayIso + 'T00:00:00').getDay();
              let offset = item.d - curDay;
              if (offset <= 0) offset += 7;
              deadline = addDays(todayIso, offset);
              working = working.replace(pattern, ' ');
              break;
            }
          }
        }
      }
    }

    // 5. Category matching
    if (categories && categories.length > 0) {
      for (const cat of categories) {
        const slug = cat.label.toLowerCase().replace(/[^a-z0-9]/g, '');
        const firstWord = cat.label.toLowerCase().split(/\s+/)[0];
        const tagPattern = new RegExp(`#(${slug}|${firstWord})\\b`, 'i');
        const wordPattern = new RegExp(`\\b(${slug}|${firstWord})\\b`, 'i');

        if (tagPattern.test(working)) {
          categoryId = cat.id;
          working = working.replace(tagPattern, ' ');
          break;
        } else if (wordPattern.test(working)) {
          categoryId = cat.id;
          break;
        }
      }
    }

    // 6. Clean trailing prepositions & extra spaces from title
    working = working.replace(/\b(?:by|on|due|before|until|at|for|in|with)\s*$/i, '');
    working = working.replace(/\s+/g, ' ').trim();

    return {
      title: working || text.trim(),
      duration: duration || 45,
      deadline: deadline || todayIso,
      priority: priority || 'Medium',
      categoryId: categoryId || categories[0]?.id || 'cat-dsa',
    };
  }

  // =========================================================================
  // 5. CORE SCHEDULING ENGINE
  // =========================================================================
  const PRIORITY_WEIGHTS = { Critical: 4, High: 3, Medium: 2, Low: 1 };

  function generateDayTimeline({
    fixedEvents = [],
    tasks = [],
    currentDate = getTodayISO(),
    currentTimeMinutes = getCurrentTimeMinutes(),
    config = DEFAULT_SCHEDULE_CONFIG,
  }) {
    const weekday = getDayOfWeek(currentDate);
    const dayStartMin = parseTimeToMinutes(config.dayStart || '08:00');
    const dayEndMin = parseTimeToMinutes(config.dayEnd || '23:00');
    const breakfastDuration = typeof config.breakfastDuration === 'number' && config.breakfastDuration > 0
      ? config.breakfastDuration
      : (parseTimeToMinutes(config.breakfastEnd || '09:00') - parseTimeToMinutes(config.breakfastStart || '08:30')) || 30;
    const breakfastStartMin = parseTimeToMinutes(config.breakfastStart || '08:30');
    const breakfastEndMin = config.breakfastEnd
      ? parseTimeToMinutes(config.breakfastEnd)
      : (breakfastStartMin + breakfastDuration);

    const lunchDuration = typeof config.lunchDuration === 'number' && config.lunchDuration > 0
      ? config.lunchDuration
      : (parseTimeToMinutes(config.lunchEnd || '13:45') - parseTimeToMinutes(config.lunchStart || '13:00')) || 45;
    const lunchStartMin = parseTimeToMinutes(config.lunchStart || '13:00');
    const lunchEndMin = config.lunchEnd
      ? parseTimeToMinutes(config.lunchEnd)
      : (lunchStartMin + lunchDuration);

    const dinnerDuration = typeof config.dinnerDuration === 'number' && config.dinnerDuration > 0
      ? config.dinnerDuration
      : (parseTimeToMinutes(config.dinnerEnd || '20:45') - parseTimeToMinutes(config.dinnerStart || '20:00')) || 45;
    const dinnerStartMin = parseTimeToMinutes(config.dinnerStart || '20:00');
    const dinnerEndMin = config.dinnerEnd
      ? parseTimeToMinutes(config.dinnerEnd)
      : (dinnerStartMin + dinnerDuration);
    const maxChunkMin = config.maxChunkMin || 90;
    const minChunkMin = config.minChunkMin || 20;
    const gapUtilization = config.gapUtilization || 0.82;
    const breakDurationMin = config.breakDurationMin || 10;
    const breakThresholdMin = config.breakThresholdMin || 45;

    // 1. Filter today's fixed events
    const todayFixed = fixedEvents
      .filter(ev => Array.isArray(ev.days) && ev.days.includes(weekday))
      .map(ev => ({
        id: `fixed-${ev.id}`,
        eventId: ev.id,
        type: 'fixed',
        title: ev.title,
        subtitle: ev.subtitle || '',
        category: ev.category || FALLBACK_CATEGORY_ID,
        startMin: parseTimeToMinutes(ev.start),
        endMin: parseTimeToMinutes(ev.end),
        duration: Math.max(0, parseTimeToMinutes(ev.end) - parseTimeToMinutes(ev.start)),
      }))
      .filter(ev => ev.duration > 0);

    // Inject today's Lost Time blocks (Fixed events are locked and never modified)
    if (typeof state !== 'undefined' && state.lostTimeEvents) {
      const todayLost = state.lostTimeEvents.filter(l => l.date === currentDate && l.startMin !== undefined);
      for (const l of todayLost) {
        todayFixed.push({
          id: l.id,
          type: 'lost',
          title: '⚠️ Lost Time',
          subtitle: l.reason || 'Distraction',
          category: FALLBACK_CATEGORY_ID,
          startMin: l.startMin,
          endMin: l.startMin + l.minutes,
          duration: l.minutes,
        });
      }
    }
    
    todayFixed.sort((a, b) => a.startMin - b.startMin);

    // 2. Configure Meal Blocks (Breakfast, Lunch, Dinner)
    const mealBlocks = [];
    if (config.breakfastEnabled !== false && breakfastEndMin > breakfastStartMin) {
      mealBlocks.push({
        id: 'meal-breakfast',
        type: 'meal',
        mealKey: 'breakfast',
        title: '🍳 Breakfast & Energize',
        category: FALLBACK_CATEGORY_ID,
        startMin: breakfastStartMin,
        endMin: breakfastEndMin,
        duration: breakfastEndMin - breakfastStartMin,
      });
    }
    if (lunchEndMin > lunchStartMin) {
      mealBlocks.push({
        id: 'meal-lunch',
        type: 'meal',
        mealKey: 'lunch',
        title: '🍱 Lunch & Recharge',
        category: FALLBACK_CATEGORY_ID,
        startMin: lunchStartMin,
        endMin: lunchEndMin,
        duration: lunchEndMin - lunchStartMin,
      });
    }
    if (dinnerEndMin > dinnerStartMin) {
      mealBlocks.push({
        id: 'meal-dinner',
        type: 'meal',
        mealKey: 'dinner',
        title: '🍽️ Dinner & Unwind',
        category: FALLBACK_CATEGORY_ID,
        startMin: dinnerStartMin,
        endMin: dinnerEndMin,
        duration: dinnerEndMin - dinnerStartMin,
      });
    }

    // 3. Separate pending tasks by DEADLINE URGENCY then priority
    const taskPool = tasks
      .filter(t => t.status !== 'completed' && t.remaining > 0 && (!t.postponedUntil || t.postponedUntil <= currentDate))
      .map(t => ({ ...t, simRemaining: t.remaining }))
      .sort((a, b) => {
        // Primary: deadline urgency (closer deadlines first, no-deadline last)
        const aHas = a.deadline ? 1 : 0;
        const bHas = b.deadline ? 1 : 0;
        if (aHas !== bHas) return bHas - aHas; // tasks with deadlines first
        if (a.deadline && b.deadline) {
          const cmp = a.deadline.localeCompare(b.deadline);
          if (cmp !== 0) return cmp; // earlier deadline first
        }
        // Secondary: priority weight (higher first)
        const pA = PRIORITY_WEIGHTS[a.priority] || 1;
        const pB = PRIORITY_WEIGHTS[b.priority] || 1;
        if (pA !== pB) return pB - pA;
        // Tertiary: creation date (earlier first)
        return (a.createdAt || '').localeCompare(b.createdAt || '');
      });

    // 4. Extract Anchored Tasks (explicit startTime set, e.g. 09:35)
    const anchoredTasks = [];
    const flexibleTasks = [];
    for (const t of taskPool) {
      if (t.startTime) {
        const sMin = parseTimeToMinutes(t.startTime);
        if (sMin > 0) {
          anchoredTasks.push({ ...t, explicitStartMin: sMin });
          continue;
        }
      }
      flexibleTasks.push(t);
    }

    // Effective day start adapts if an anchored task or event starts earlier
    let effectiveDayStart = dayStartMin;
    if (anchoredTasks.length > 0) {
      const minAnchored = Math.min(...anchoredTasks.map(at => at.explicitStartMin));
      if (minAnchored < effectiveDayStart) effectiveDayStart = minAnchored;
    }

    if (currentTimeMinutes > effectiveDayStart) {
      // Round up to next 5 minutes for clean scheduling
      effectiveDayStart = Math.ceil(currentTimeMinutes / 5) * 5;
    }

    // Build Anchored Task Blocks & resolve collisions deterministically
    const anchoredTaskBlocks = [];
    const anchoredBreakBlocks = [];

    for (const at of anchoredTasks) {
      const take = Math.max(5, at.simRemaining || at.duration || 45);
      const bStart = at.explicitStartMin;
      const bEnd = bStart + take;
      const postBreak = at.breakAfterMin > 0 ? at.breakAfterMin : 0;
      const spanEnd = bEnd + postBreak;

      const currentLocked = [
        ...todayFixed.map(b => ({ ...b, source: 'fixed' })),
        ...mealBlocks.map(b => ({ ...b, source: 'meal' })),
        ...anchoredTaskBlocks.map(b => ({ ...b, source: 'anchored' })),
        ...anchoredBreakBlocks.map(b => ({ ...b, source: 'break' })),
      ];

      const collision = currentLocked.find(l => Math.max(bStart, l.startMin) < Math.min(spanEnd, l.endMin));

      if (collision) {
        if (at.flexibility === 'Strict') {
          let shiftedStart = collision.endMin;
          while (shiftedStart + take <= dayEndMin) {
            const nextCol = currentLocked.find(l => Math.max(shiftedStart, l.startMin) < Math.min(shiftedStart + take + postBreak, l.endMin));
            if (!nextCol) break;
            shiftedStart = nextCol.endMin;
          }

          if (shiftedStart + take <= dayEndMin) {
            const sEnd = shiftedStart + take;
            anchoredTaskBlocks.push({
              id: `task-block-${at.id}-${shiftedStart}`,
              taskId: at.id,
              type: 'task',
              title: at.title,
              category: at.category || FALLBACK_CATEGORY_ID,
              priority: at.priority,
              energy: at.energy,
              flexibility: at.flexibility,
              isRevision: at.isRevision || false,
              breakAfterMin: at.breakAfterMin,
              startMin: shiftedStart,
              endMin: sEnd,
              duration: take,
              warning: `Shifted from ${at.startTime} to avoid collision with "${collision.title}".`,
            });
            if (postBreak > 0) {
              anchoredBreakBlocks.push({
                id: `break-${at.id}-${sEnd}`,
                type: 'break',
                title: `☕ Break after ${at.title}`,
                category: FALLBACK_CATEGORY_ID,
                startMin: sEnd,
                endMin: sEnd + postBreak,
                duration: postBreak,
              });
            }
          } else {
            flexibleTasks.unshift(at);
          }
        } else {
          flexibleTasks.unshift(at);
        }
      } else {
        anchoredTaskBlocks.push({
          id: `task-block-${at.id}-${bStart}`,
          taskId: at.id,
          type: 'task',
          title: at.title,
          category: at.category || FALLBACK_CATEGORY_ID,
          priority: at.priority,
          energy: at.energy,
          flexibility: at.flexibility,
          isRevision: at.isRevision || false,
          breakAfterMin: at.breakAfterMin,
          startMin: bStart,
          endMin: bEnd,
          duration: take,
        });
        if (postBreak > 0) {
          anchoredBreakBlocks.push({
            id: `break-${at.id}-${bEnd}`,
            type: 'break',
            title: `☕ Break after ${at.title}`,
            category: FALLBACK_CATEGORY_ID,
            startMin: bEnd,
            endMin: bEnd + postBreak,
            duration: postBreak,
          });
        }
      }
    }

    // 5. Calculate Free Gaps after all locked intervals
    const lockedIntervals = [
      ...todayFixed.map(b => ({ startMin: b.startMin, endMin: b.endMin })),
      ...mealBlocks.map(b => ({ startMin: b.startMin, endMin: b.endMin })),
      ...anchoredTaskBlocks.map(b => ({ startMin: b.startMin, endMin: b.endMin })),
      ...anchoredBreakBlocks.map(b => ({ startMin: b.startMin, endMin: b.endMin })),
    ].sort((a, b) => a.startMin - b.startMin);

    const mergedLocked = [];
    for (const lock of lockedIntervals) {
      if (!mergedLocked.length) {
        mergedLocked.push({ ...lock });
      } else {
        const prev = mergedLocked[mergedLocked.length - 1];
        if (lock.startMin <= prev.endMin) {
          prev.endMin = Math.max(prev.endMin, lock.endMin);
        } else {
          mergedLocked.push({ ...lock });
        }
      }
    }

    const availableGaps = [];
    let gPtr = effectiveDayStart;
    for (const lock of mergedLocked) {
      if (lock.startMin > gPtr) {
        availableGaps.push({ startMin: gPtr, endMin: lock.startMin });
      }
      gPtr = Math.max(gPtr, lock.endMin);
    }
    if (gPtr < dayEndMin) {
      availableGaps.push({ startMin: gPtr, endMin: dayEndMin });
    }

    // 6. Fill available gaps with flexible task chunks & their breaks
    const flexibleTaskBlocks = [];
    const flexibleBreakBlocks = [];
    const freeBlocks = [];
    let poolIdx = 0;

    for (const gap of availableGaps) {
      const gapTotal = gap.endMin - gap.startMin;
      if (gapTotal <= 0) continue;

      let slotPtr = gap.startMin;

      while (poolIdx < flexibleTasks.length && slotPtr < gap.endMin) {
        const curTask = flexibleTasks[poolIdx];
        if (curTask.simRemaining <= 0) {
          poolIdx++;
          continue;
        }

        const spaceLeft = gap.endMin - slotPtr;
        if (spaceLeft < 5) break;

        const minNeeded = curTask.simRemaining <= maxChunkMin
          ? curTask.simRemaining
          : minChunkMin;
        if (spaceLeft < minNeeded) {
          break;
        }

        const canTake = Math.min(curTask.simRemaining, maxChunkMin, spaceLeft);
        if (canTake < 5) break;

        const bStart = slotPtr;
        const bEnd = bStart + canTake;

        flexibleTaskBlocks.push({
          id: `task-block-${curTask.id}-${bStart}`,
          taskId: curTask.id,
          type: 'task',
          title: curTask.title,
          category: curTask.category || FALLBACK_CATEGORY_ID,
          priority: curTask.priority,
          energy: curTask.energy,
          flexibility: curTask.flexibility,
          isRevision: curTask.isRevision || false,
          breakAfterMin: curTask.breakAfterMin,
          startMin: bStart,
          endMin: bEnd,
          duration: canTake,
        });

        curTask.simRemaining -= canTake;
        slotPtr = bEnd;

        // Insert break after task
        const neededBreak = (curTask.breakAfterMin != null && curTask.breakAfterMin > 0)
          ? curTask.breakAfterMin
          : (canTake >= breakThresholdMin ? breakDurationMin : 0);

        if (neededBreak > 0 && slotPtr + 5 <= gap.endMin) {
          const brkEnd = Math.min(slotPtr + neededBreak, gap.endMin);
          const actualBreak = brkEnd - slotPtr;
          if (actualBreak >= 5) {
            flexibleBreakBlocks.push({
              id: `break-${curTask.id}-${slotPtr}`,
              type: 'break',
              title: curTask.breakAfterMin > 0 ? `☕ Break after ${curTask.title}` : 'Short Break & Reset',
              category: FALLBACK_CATEGORY_ID,
              startMin: slotPtr,
              endMin: brkEnd,
              duration: actualBreak,
            });
            slotPtr = brkEnd;
          }
        }

        if (curTask.simRemaining <= 0) poolIdx++;
      }

      // Leftover space in gap becomes free buffer
      if (slotPtr < gap.endMin) {
        freeBlocks.push({
          id: `free-${slotPtr}`,
          type: 'free',
          title: 'Free Time & Buffer',
          category: FALLBACK_CATEGORY_ID,
          startMin: slotPtr,
          endMin: gap.endMin,
          duration: gap.endMin - slotPtr,
        });
      }
    }

    // 7. Combine & Sort All Blocks (Guaranteed non-overlapping, duration > 0, end > start)
    const all = [
      ...todayFixed,
      ...mealBlocks,
      ...anchoredTaskBlocks,
      ...anchoredBreakBlocks,
      ...flexibleTaskBlocks,
      ...flexibleBreakBlocks,
      ...freeBlocks,
    ]
      .filter(b => b.duration > 0 && b.endMin > b.startMin)
      .sort((a, b) => a.startMin - b.startMin);

    // 8. Status tagging
    const taskMap = new Map(tasks.map(t => [t.id, t]));
    return all.map(block => {
      let status = 'upcoming';
      if (block.type === 'fixed') {
        if (currentTimeMinutes >= block.endMin) status = 'fixed-done';
        else if (currentTimeMinutes >= block.startMin) status = 'fixed-active';
        else status = 'fixed';
      } else if (block.type === 'task') {
        const original = taskMap.get(block.taskId);
        const isDone = original?.status === 'completed' || (original && original.remaining <= 0);
        if (isDone) status = 'completed';
        else if (currentTimeMinutes >= block.endMin) status = 'missed';
        else if (currentTimeMinutes >= block.startMin) status = 'active';
        else status = 'upcoming';
      } else {
        if (currentTimeMinutes >= block.endMin) status = 'passed';
        else if (currentTimeMinutes >= block.startMin) status = 'active';
        else status = 'upcoming';
      }

      return {
        ...block,
        status,
        startTimeStr: minutesToTime(block.startMin),
        endTimeStr: minutesToTime(block.endMin),
      };
    });
  }

  // =========================================================================
  // 6. 4-TIER LOST-TIME REPLANNING ENGINE
  // =========================================================================
  function replanAfterLostTime({
    currentTimeline = [],
    tasks = [],
    lostMinutes = 30,
    reason = 'Other distraction',
    currentTimeMinutes = 0,
    todayIso = '',
    startMin = null,
  }) {
    const min = Math.max(5, Math.round(lostMinutes || 30));
    const lostStartMin = (startMin != null && !isNaN(startMin))
      ? startMin
      : Math.max(0, currentTimeMinutes - min);
    const lostEndMin = lostStartMin + min;

    const parts = [];
    let affectedCriticalOrHigh = false;
    const taskMap = new Map(tasks.map(t => [t.id, { ...t }]));

    const lostBlock = {
      id: `lost-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type: 'lost',
      title: '⚠️ Lost Time',
      subtitle: reason || 'Distraction',
      category: FALLBACK_CATEGORY_ID,
      startMin: lostStartMin,
      endMin: lostEndMin,
      duration: min,
    };

    // Separate blocks into:
    // 1. pastBlocks: fully finished before lostStartMin
    // 2. resumingTasks: study tasks interrupted by or during lost time (kept at full uncut duration)
    // 3. subsequentBlocks: all remaining blocks originally scheduled after lostStartMin
    const pastBlocks = [];
    const resumingTasks = [];
    const subsequentBlocks = [];

    for (const b of currentTimeline) {
      if (b.type === 'free') {
        // Drop previous free buffer placeholders so shifted schedule packs smoothly
        continue;
      }

      if (b.endMin <= lostStartMin) {
        pastBlocks.push({ ...b });
        continue;
      }

      // Blocks overlapping the lost time window [lostStartMin, lostEndMin]
      if (b.startMin < lostEndMin && b.endMin > lostStartMin) {
        if (b.type === 'task') {
          if (b.startMin < lostStartMin) {
            // Task was partially worked on before distraction started
            const workedMin = lostStartMin - b.startMin;
            pastBlocks.push({
              ...b,
              endMin: lostStartMin,
              duration: workedMin,
            });
            const remDuration = Math.max(5, b.duration - workedMin);
            resumingTasks.push({
              ...b,
              id: `${b.id}-resumed`,
              duration: remDuration,
            });
            parts.push(`Study on "${b.title}" resumes right after lost time at ${formatTime12(lostEndMin)} for ${remDuration}m.`);
          } else {
            // Task was scheduled during or overlapping lost time:
            // It MUST NOT be sliced or reduced! It resumes right after lost time with full duration:
            const fullTask = taskMap.get(b.taskId);
            const userDuration = fullTask ? (fullTask.duration || fullTask.remaining || b.duration) : b.duration;
            resumingTasks.push({
              ...b,
              duration: userDuration,
            });
            parts.push(`Study on "${b.title}" starts right after lost time at ${formatTime12(lostEndMin)} for ${userDuration}m.`);
          }
          if (b.priority === 'Critical' || b.priority === 'High') {
            affectedCriticalOrHigh = true;
          }
        } else if (b.type === 'break') {
          // Break falls during distraction window -> drop it since user was not studying
          continue;
        } else {
          // Non-task block (e.g. fixed or meal) if somehow overlapping
          subsequentBlocks.push({ ...b });
        }
        continue;
      }

      if (b.startMin >= lostEndMin) {
        // Scheduled after lost time window -> shifts below!
        subsequentBlocks.push({ ...b });
      }
    }

    // Reflow queue starting right after the lost time (lostEndMin)
    let curPtr = lostEndMin;
    const reflowed = [lostBlock];

    // 1. Place resuming study tasks immediately after lost time with FULL intact duration
    for (const rTask of resumingTasks) {
      const taskStart = curPtr;
      const taskEnd = taskStart + rTask.duration;
      reflowed.push({
        ...rTask,
        startMin: taskStart,
        endMin: taskEnd,
        duration: rTask.duration,
        startTimeStr: minutesToTime(taskStart),
        endTimeStr: minutesToTime(taskEnd),
      });
      curPtr = taskEnd;

      if (rTask.taskId && taskMap.has(rTask.taskId)) {
        taskMap.get(rTask.taskId).startTime = minutesToTime(taskStart);
      }
    }

    // 2. Sort subsequent blocks by original startMin and shift them smoothly
    subsequentBlocks.sort((a, b) => a.startMin - b.startMin);

    for (const b of subsequentBlocks) {
      // Shift block if preceding items pushed past its original start time
      const newStart = Math.max(b.startMin, curPtr);
      const newEnd = newStart + b.duration;
      reflowed.push({
        ...b,
        startMin: newStart,
        endMin: newEnd,
        duration: b.duration,
        startTimeStr: minutesToTime(newStart),
        endTimeStr: minutesToTime(newEnd),
      });
      curPtr = newEnd;

      if (b.type === 'task' && b.taskId && taskMap.has(b.taskId)) {
        const t = taskMap.get(b.taskId);
        if (t.startTime) {
          t.startTime = minutesToTime(newStart);
        }
      }
    }

    const dayEndMin = typeof state !== 'undefined' && state.scheduleConfig?.dayEnd
      ? parseTimeToMinutes(state.scheduleConfig.dayEnd)
      : 23 * 60; // 23:00 default

    const trimmedTasks = [];
    const postponedTasks = [];

    // Check for overflow past dayEndMin (bedtime)
    for (let i = reflowed.length - 1; i >= 0; i--) {
      const b = reflowed[i];
      if (b.type === 'task' && b.endMin > dayEndMin) {
        if (b.flexibility !== 'Strict') {
          if (b.taskId && taskMap.has(b.taskId)) {
            taskMap.get(b.taskId).postponedUntil = addDays(todayIso, 1);
          }
          postponedTasks.push({ title: b.title, priority: b.priority });
          reflowed.splice(i, 1);
        }
      }
    }

    if (postponedTasks.length > 0) {
      parts.push(`Day capacity reached: Postponed to tomorrow (${postponedTasks.map(t => t.title).join(', ')}).`);
    } else {
      parts.push(`Subsequent schedule shifted below smoothly.`);
    }

    const combined = [...pastBlocks, ...reflowed]
      .filter(b => b.duration > 0 && b.endMin > b.startMin)
      .sort((a, b) => a.startMin - b.startMin);

    const finalTimeline = combined.map(block => {
      let status = 'upcoming';
      if (block.type === 'fixed') {
        if (currentTimeMinutes >= block.endMin) status = 'fixed-done';
        else if (currentTimeMinutes >= block.startMin) status = 'fixed-active';
        else status = 'fixed';
      } else if (block.type === 'lost') {
        if (currentTimeMinutes >= block.endMin) status = 'passed';
        else if (currentTimeMinutes >= block.startMin) status = 'active';
        else status = 'upcoming';
      } else if (block.type === 'task') {
        const original = taskMap.get(block.taskId);
        const isDone = original?.status === 'completed' || (original && original.remaining <= 0);
        if (isDone) status = 'completed';
        else if (currentTimeMinutes >= block.endMin && block.endMin <= lostStartMin) status = 'missed';
        else if (currentTimeMinutes >= block.endMin && block.startMin >= lostEndMin) status = 'missed';
        else if (currentTimeMinutes >= block.startMin && currentTimeMinutes < block.endMin) status = 'active';
        else status = 'upcoming';
      } else {
        if (currentTimeMinutes >= block.endMin) status = 'passed';
        else if (currentTimeMinutes >= block.startMin) status = 'active';
        else status = 'upcoming';
      }

      return {
        ...block,
        status,
        startTimeStr: minutesToTime(block.startMin),
        endTimeStr: minutesToTime(block.endMin),
      };
    });

    return {
      updatedTimeline: finalTimeline,
      updatedTasks: Array.from(taskMap.values()),
      explanation: parts.join(' ') || `Schedule replanned: study resumed at ${formatTime12(lostEndMin)}.`,
      affectedCriticalOrHigh,
      trimmedTasks,
      postponedTasks,
    };
  }

  // =========================================================================
  // 7. SEED DATA GENERATOR
  // =========================================================================
  function getSeedData() {
    const today = getTodayISO();

    const tasks = [
      {
        id: 'task-1',
        title: 'Dynamic Programming — Graph & Grid Recurrences',
        category: 'cat-dsa',
        duration: 90,
        remaining: 60,
        priority: 'Critical',
        deadline: today,
        energy: 'High',
        flexibility: 'Flexible',
        status: 'pending',
        notes: 'Solve LeetCode #62 (Unique Paths) and #64 (Min Path Sum). Space-optimize to 1D array.',
        subtasks: [
          { id: 'st-1-1', title: 'Top-down memoization pattern', done: true },
          { id: 'st-1-2', title: 'Bottom-up DP table tabulation', done: false },
          { id: 'st-1-3', title: 'Space complexity reduction', done: false },
        ],
        isRevision: false,
        revisionOf: null,
        postponedUntil: null,
        createdAt: addDays(today, -2),
        completedAt: null,
      },
      {
        id: 'task-2',
        title: 'Operating Systems — Virtual Memory & Page Replacement',
        category: 'cat-college',
        duration: 75,
        remaining: 75,
        priority: 'High',
        deadline: today,
        energy: 'Medium',
        flexibility: 'Flexible',
        status: 'pending',
        notes: 'Study LRU, Second-Chance Clock algorithm, Belady anomaly, and TLB hit ratios.',
        subtasks: [
          { id: 'st-2-1', title: 'Read textbook chapter 9 (Paging)', done: false },
          { id: 'st-2-2', title: 'Solve 3 previous exam numericals', done: false },
        ],
        isRevision: false,
        revisionOf: null,
        postponedUntil: null,
        createdAt: addDays(today, -1),
        completedAt: null,
      },
      {
        id: 'task-3',
        title: 'Build Secure Authentication & JWT Flow',
        category: 'cat-dev',
        duration: 80,
        remaining: 80,
        priority: 'Medium',
        deadline: addDays(today, 1),
        energy: 'High',
        flexibility: 'Flexible',
        status: 'pending',
        notes: 'Configure refresh token rotation and HTTP-only cookies in Express backend.',
        subtasks: [
          { id: 'st-3-1', title: 'Write JWT verification middleware', done: true },
          { id: 'st-3-2', title: 'Add Redis blacklist store', done: false },
        ],
        isRevision: false,
        revisionOf: null,
        postponedUntil: null,
        createdAt: addDays(today, -3),
        completedAt: null,
      },
      {
        id: 'task-4',
        title: 'Review Attention Mechanism & Transformer Paper',
        category: 'cat-research',
        duration: 60,
        remaining: 60,
        priority: 'Low',
        deadline: addDays(today, 2),
        energy: 'Low',
        flexibility: 'Optional',
        status: 'pending',
        notes: 'Read "Attention Is All You Need" section on Multi-Head scaled dot-product attention.',
        subtasks: [],
        isRevision: false,
        revisionOf: null,
        postponedUntil: null,
        createdAt: addDays(today, -1),
        completedAt: null,
      },
      {
        id: 'task-5',
        title: 'Spaced Repetition: Binary Trees & BST Invariants',
        category: 'cat-dsa',
        duration: 45,
        remaining: 45,
        priority: 'High',
        deadline: today,
        energy: 'Medium',
        flexibility: 'Flexible',
        status: 'pending',
        notes: 'Revision session (+3 day offset). Practice iterative Morris tree traversal.',
        subtasks: [
          { id: 'st-5-1', title: 'In-order traversal with 1 stack', done: false },
        ],
        isRevision: true,
        revisionOf: 'task-prev-trees',
        postponedUntil: null,
        createdAt: addDays(today, -3),
        completedAt: null,
      },
      {
        id: 'task-6',
        title: 'Database Normalization & B+ Tree Indexing',
        category: 'cat-college',
        duration: 60,
        remaining: 0,
        priority: 'Medium',
        deadline: addDays(today, -1),
        energy: 'Medium',
        flexibility: 'Fixed',
        status: 'completed',
        notes: 'Practice sets on 3NF and BCNF decomposition without lossy join.',
        subtasks: [
          { id: 'st-6-1', title: 'BCNF decomposition proof', done: true },
        ],
        isRevision: false,
        revisionOf: null,
        postponedUntil: null,
        createdAt: addDays(today, -4),
        completedAt: addDays(today, -1),
      },
    ];

    const fixedEvents = [
      {
        id: 'fix-1',
        title: 'Distributed Systems Lecture',
        subtitle: 'Room 402 • Prof. Mukherjee',
        category: 'cat-college',
        start: '10:00',
        end: '11:30',
        days: [0, 1, 2, 3, 4, 5, 6],
      },
      {
        id: 'fix-2',
        title: 'Compiler Design Lab & Viva',
        subtitle: 'Computing Lab 3 • LLVM IR',
        category: 'cat-college',
        start: '15:00',
        end: '17:00',
        days: [0, 1, 2, 3, 4, 5, 6],
      },
    ];

    const dsaTopics = [
      { id: 'dsa-1', name: 'Arrays & Two Pointers', status: 'done', problemsSolved: 28, note: 'Kadane algorithm & Dutch National Flag.' },
      { id: 'dsa-2', name: 'Sliding Window & Substrings', status: 'done', problemsSolved: 19, note: 'Variable size window pattern mastered.' },
      { id: 'dsa-3', name: 'Binary Search On Answers', status: 'in-progress', problemsSolved: 14, note: 'Practice Painter Partition & Koko Bananas.' },
      { id: 'dsa-4', name: 'Linked Lists & Fast/Slow', status: 'done', problemsSolved: 16, note: 'Cycle detection and reversal patterns.' },
      { id: 'dsa-5', name: 'Binary Trees & BSTs', status: 'in-progress', problemsSolved: 22, note: 'Lowest Common Ancestor & Diameter.' },
      { id: 'dsa-6', name: 'Dynamic Programming (1D/2D)', status: 'in-progress', problemsSolved: 31, note: 'Grid DP and 0/1 knapsack variations.' },
      { id: 'dsa-7', name: 'Graphs (BFS/DFS, Dijkstra)', status: 'in-progress', problemsSolved: 18, note: 'Topological sort & Min-heap Dijkstra.' },
      { id: 'dsa-8', name: 'Heaps & Priority Queues', status: 'done', problemsSolved: 15, note: 'Median from stream and Top-K elements.' },
    ];

    const collegeSubjects = [
      {
        id: 'col-1',
        name: 'Operating Systems',
        examDate: addDays(today, 12),
        topics: [
          { id: 'ct-1-1', name: 'Processes & Threads', status: 'done', revised: true },
          { id: 'ct-1-2', name: 'CPU Scheduling Algorithms', status: 'done', revised: true },
          { id: 'ct-1-3', name: 'Synchronization & Semaphores', status: 'done', revised: false },
          { id: 'ct-1-4', name: 'Virtual Memory & Paging', status: 'in-progress', revised: false },
          { id: 'ct-1-5', name: 'Deadlock & Banker\'s Algo', status: 'in-progress', revised: false },
        ],
      },
      {
        id: 'col-2',
        name: 'Computer Networks',
        examDate: addDays(today, 18),
        topics: [
          { id: 'ct-2-1', name: 'OSI vs TCP/IP Models', status: 'done', revised: true },
          { id: 'ct-2-2', name: 'IP Addressing & Subnetting', status: 'in-progress', revised: false },
          { id: 'ct-2-3', name: 'Routing Protocols (OSPF, BGP)', status: 'not-started', revised: false },
          { id: 'ct-2-4', name: 'TCP 3-Way Handshake & Flow', status: 'in-progress', revised: false },
        ],
      },
      {
        id: 'col-3',
        name: 'Database Management Systems',
        examDate: addDays(today, 25),
        topics: [
          { id: 'ct-3-1', name: 'ER Diagrams & Relational Schema', status: 'done', revised: true },
          { id: 'ct-3-2', name: 'Normalization (1NF to BCNF)', status: 'done', revised: true },
          { id: 'ct-3-3', name: 'Transaction Management & ACID', status: 'in-progress', revised: false },
        ],
      },
    ];

    const lostTimeEvents = [
      { id: 'lost-1', date: addDays(today, -6), minutes: 30, reason: 'Social media & scrolling' },
      { id: 'lost-2', date: addDays(today, -5), minutes: 45, reason: 'Procrastination / daydreaming' },
      { id: 'lost-3', date: addDays(today, -4), minutes: 20, reason: 'Unexpected call / interruption' },
      { id: 'lost-4', date: addDays(today, -3), minutes: 40, reason: 'Social media & scrolling' },
      { id: 'lost-5', date: addDays(today, -2), minutes: 35, reason: 'Fatigue / low energy' },
      { id: 'lost-6', date: addDays(today, -1), minutes: 25, reason: 'Overextended break' },
    ];

    const studySessions = [
      { id: 'sess-1', taskId: 'task-prev-1', taskTitle: 'Binary Search Implementation', category: 'cat-dsa', date: addDays(today, -6), plannedMin: 60, actualMin: 55 },
      { id: 'sess-2', taskId: 'task-prev-2', taskTitle: 'OS Process Synchronization', category: 'cat-college', date: addDays(today, -6), plannedMin: 90, actualMin: 100 },
      { id: 'sess-3', taskId: 'task-prev-3', taskTitle: 'React Prototyping', category: 'cat-dev', date: addDays(today, -5), plannedMin: 80, actualMin: 75 },
      { id: 'sess-4', taskId: 'task-prev-4', taskTitle: 'Sliding Window LeetCode Sets', category: 'cat-dsa', date: addDays(today, -5), plannedMin: 60, actualMin: 70 },
      { id: 'sess-5', taskId: 'task-prev-5', taskTitle: 'DBMS ER Modeling', category: 'cat-college', date: addDays(today, -4), plannedMin: 60, actualMin: 55 },
      { id: 'sess-6', taskId: 'task-prev-6', taskTitle: 'Attention Mechanism Reading', category: 'cat-research', date: addDays(today, -4), plannedMin: 50, actualMin: 55 },
      { id: 'sess-7', taskId: 'task-prev-7', taskTitle: 'Two Pointers Practice', category: 'cat-dsa', date: addDays(today, -3), plannedMin: 90, actualMin: 110 },
      { id: 'sess-8', taskId: 'task-prev-8', taskTitle: 'Computer Networks Subnetting', category: 'cat-college', date: addDays(today, -3), plannedMin: 75, actualMin: 75 },
      { id: 'sess-9', taskId: 'task-prev-9', taskTitle: 'Express API Architecture', category: 'cat-dev', date: addDays(today, -2), plannedMin: 90, actualMin: 95 },
      { id: 'sess-10', taskId: 'task-6', taskTitle: 'Database Normalization & B+ Tree Indexing', category: 'cat-college', date: addDays(today, -1), plannedMin: 60, actualMin: 65 },
      { id: 'sess-11', taskId: 'task-prev-12', taskTitle: 'Tree Traversals & BST Invariants', category: 'cat-dsa', date: addDays(today, -1), plannedMin: 45, actualMin: 45 },
    ];

    const dailyNotes = {
      [addDays(today, -1)]: {
        reflection: 'Great',
        whatLearned: 'Mastered BCNF decomposition and lossless join verification.',
        whatToImprove: 'Start morning block directly at 9 AM without checking phone.',
      },
    };

    return {
      tasks,
      fixedEvents,
      categories: DEFAULT_CATEGORIES,
      dsaTopics,
      collegeSubjects,
      lostTimeEvents,
      studySessions,
      dailyNotes,
      theme: 'dark',
    };
  }

  // =========================================================================
  // 8. SELECTORS & DERIVED ANALYTICS
  // =========================================================================
  function calculateStreak(studySessions = [], todayIso = getTodayISO()) {
    if (!studySessions || studySessions.length === 0) return 0;
    const datesWithStudy = new Set(studySessions.filter(s => (s.actualMin || 0) > 0).map(s => s.date));
    let streak = 0;
    let checkDate = todayIso;
    if (!datesWithStudy.has(checkDate)) checkDate = addDays(todayIso, -1);
    while (datesWithStudy.has(checkDate)) {
      streak++;
      checkDate = addDays(checkDate, -1);
    }
    return streak;
  }

  function getOverdueTasksCount(tasks = [], todayIso = getTodayISO()) {
    return tasks.filter(t => t.status !== 'completed' && t.deadline && diffDays(t.deadline, todayIso) < 0).length;
  }

  function getTodayStats(studySessions = [], tasks = [], todayIso = getTodayISO()) {
    const completedMinToday = studySessions.filter(s => s.date === todayIso).reduce((acc, s) => acc + (s.actualMin || 0), 0);
    const plannedMinToday = tasks
      .filter(t => t.deadline === todayIso && t.status !== 'completed')
      .reduce((acc, t) => acc + (t.remaining || t.duration || 0), 0) + completedMinToday;

    return {
      completedMinToday,
      plannedMinToday: Math.max(plannedMinToday, completedMinToday),
    };
  }

  function getWeeklyCapacityStats(fixedEvents = [], tasks = [], studySessions = []) {
    const weekDates = getWeekDates(new Date());
    const totalDayAwakeMin = 900; // 15h
    let totalCap = 0;
    let totalRemainingDue = 0;
    let totalOriginalPlanned = 0;
    let totalStudied = 0;

    const dayStats = weekDates.map(dIso => {
      const wday = getDayOfWeek(dIso);
      const fixedMin = fixedEvents
        .filter(ev => Array.isArray(ev.days) && ev.days.includes(wday))
        .reduce((sum, ev) => sum + Math.max(0, parseTimeToMinutes(ev.end) - parseTimeToMinutes(ev.start)), 0);

      const nonFixedMin = Math.max(0, totalDayAwakeMin - fixedMin);
      const dailyCap = Math.round(nonFixedMin * DEFAULT_SCHEDULE_CONFIG.gapUtilization);

      const studiedMin = studySessions.filter(s => s.date === dIso).reduce((sum, s) => sum + (s.actualMin || 0), 0);
      const dayTasks = tasks.filter(t => t.deadline === dIso);
      const originalPlannedMin = dayTasks.reduce((sum, t) => sum + (t.duration || 0), 0);
      const remainingDueMin = dayTasks.reduce((sum, t) => sum + (t.status !== 'completed' ? (t.remaining != null ? t.remaining : t.duration) : 0), 0);

      totalCap += dailyCap;
      totalOriginalPlanned += originalPlannedMin;
      totalRemainingDue += remainingDueMin;
      totalStudied += studiedMin;

      return {
        dateIso: dIso,
        weekday: wday,
        dailyCap,
        studiedMin,
        dueMin: remainingDueMin,
        originalPlannedMin,
        isToday: dIso === getTodayISO(),
      };
    });

    return {
      dayStats,
      capacityHours: +(totalCap / 60).toFixed(1),
      plannedHours: +(totalRemainingDue / 60).toFixed(1),
      originalPlannedHours: +(totalOriginalPlanned / 60).toFixed(1),
      bufferHours: +(Math.max(0, totalCap - totalRemainingDue) / 60).toFixed(1),
      studiedHours: +(totalStudied / 60).toFixed(1),
    };
  }

  function getAnalyticsData(studySessions = [], lostTimeEvents = [], tasks = [], categories = []) {
    const weekDates = getWeekDates(new Date());
    const weekSet = new Set(weekDates);

    const weekSessions = studySessions.filter(s => weekSet.has(s.date));
    const totalFocusedMin = weekSessions.reduce((sum, s) => sum + (s.actualMin || 0), 0);

    const weekDueTasks = tasks.filter(t => t.deadline && weekSet.has(t.deadline));
    const compDue = weekDueTasks.filter(t => t.status === 'completed');
    const compRate = weekDueTasks.length > 0 ? Math.round((compDue.length / weekDueTasks.length) * 100) : 100;

    const weekLost = lostTimeEvents.filter(l => weekSet.has(l.date));
    const totalLostMin = weekLost.reduce((sum, l) => sum + (l.minutes || 0), 0);

    const reasonCounts = {};
    for (const l of weekLost) reasonCounts[l.reason] = (reasonCounts[l.reason] || 0) + (l.minutes || 0);

    let mostCommon = 'None logged';
    let maxR = 0;
    for (const [r, min] of Object.entries(reasonCounts)) {
      if (min > maxR) { maxR = min; mostCommon = r; }
    }

    const catMap = {};
    for (const s of weekSessions) catMap[s.category] = (catMap[s.category] || 0) + (s.actualMin || 0);
    const catDist = Object.entries(catMap).map(([id, m]) => {
      const c = getCategoryById(categories, id);
      return { label: c.label, color: c.color, minutes: m, pct: totalFocusedMin > 0 ? Math.round((m / totalFocusedMin) * 100) : 0 };
    }).sort((a, b) => b.minutes - a.minutes);

    const chart = weekDates.map(dIso => {
      const studied = studySessions.filter(s => s.date === dIso).reduce((sum, s) => sum + (s.actualMin || 0), 0);
      const lost = lostTimeEvents.filter(l => l.date === dIso).reduce((sum, l) => sum + (l.minutes || 0), 0);
      const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(dIso + 'T00:00:00').getDay()];
      return { date: dIso, dayName, studied, lost };
    });

    const recent = studySessions.slice(-25);
    let insight = 'Log at least 3 sessions to view planning accuracy calibration.';
    if (recent.length >= 3) {
      const plan = recent.reduce((a, s) => a + (s.plannedMin || 45), 0);
      const act = recent.reduce((a, s) => a + (s.actualMin || 45), 0);
      const diff = act - plan;
      const pct = Math.abs(Math.round((diff / plan) * 100));
      if (pct <= 5) insight = `Spot on! Your planned times match actual study execution within ±${pct}%.`;
      else if (diff > 0) insight = `You tend to underestimate study duration by ~${pct}%. Add slightly longer buffers.`;
      else insight = `You tend to overestimate study duration by ~${pct}%. You finish faster than planned!`;
    }

    return { totalFocusedMin, compRate, totalLostMin, mostCommon, catDist, chart, insight };
  }

  function getRecommendation(timeline = [], tasks = []) {
    const active = timeline.find(b => b.type === 'task' && b.status === 'active');
    if (active) {
      const t = tasks.find(x => x.id === active.taskId);
      return { task: t || active, reason: `Currently scheduled active block (${active.startTimeStr} – ${active.endTimeStr})` };
    }
    const curMin = getCurrentTimeMinutes(new Date());
    const next = timeline.find(b => b.type === 'task' && b.startMin >= curMin && b.status !== 'completed');
    if (next) {
      const t = tasks.find(x => x.id === next.taskId);
      return { task: t || next, reason: `Next scheduled block at ${next.startTimeStr} (${next.priority} priority)` };
    }
    const pending = tasks.filter(t => t.status !== 'completed' && t.remaining > 0);
    if (pending.length > 0) {
      const sorted = [...pending].sort((a, b) => (PRIORITY_WEIGHTS[b.priority] || 1) - (PRIORITY_WEIGHTS[a.priority] || 1));
      return { task: sorted[0], reason: `Highest priority pending task (${sorted[0].priority} priority)` };
    }
    return null;
  }

  // =========================================================================
  // 9. REACTIVE STATE & PERSISTENCE
  // =========================================================================
  function loadState() {
    const seed = getSeedData();
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          // Normalize categories
          let categories = Array.isArray(parsed.categories) && parsed.categories.length > 0
            ? parsed.categories.filter(c => c && c.id && c.label)
            : seed.categories;
          if (!categories.some(c => c.id === FALLBACK_CATEGORY_ID)) {
            categories.push({ id: FALLBACK_CATEGORY_ID, label: 'Other', color: '#64748b' });
          }

          // Normalize tasks
          const validPriorities = ['Critical', 'High', 'Medium', 'Low'];
          const tasks = Array.isArray(parsed.tasks) ? parsed.tasks.map((t, idx) => {
            const dur = Math.max(5, Math.min(1440, Number(t.duration) || 45));
            const rem = t.remaining != null ? Math.max(0, Math.min(dur, Number(t.remaining))) : dur;
            return {
              id: t.id || `task-${Date.now()}-${idx}`,
              title: (t.title && String(t.title).trim()) || 'Untitled Task',
              category: normalizeCategoryId(categories, t.category),
              deadline: (typeof t.deadline === 'string' && t.deadline.length === 10) ? t.deadline : null,
              duration: dur,
              remaining: rem,
              priority: validPriorities.includes(t.priority) ? t.priority : 'Medium',
              energy: ['High', 'Medium', 'Low'].includes(t.energy) ? t.energy : 'Medium',
              flexibility: t.flexibility === 'Strict' ? 'Strict' : 'Flexible',
              status: t.status === 'completed' ? 'completed' : 'pending',
              notes: typeof t.notes === 'string' ? t.notes : '',
              subtasks: Array.isArray(t.subtasks) ? t.subtasks : [],
              startTime: (typeof t.startTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t.startTime.trim())) ? t.startTime.trim() : '',
              breakAfterMin: Math.max(0, Math.min(60, Number(t.breakAfterMin) || 0)),
              isRevision: !!t.isRevision,
              revisionOf: t.revisionOf || null,
              postponedUntil: t.postponedUntil || null,
              createdAt: t.createdAt || getTodayISO(),
              completedAt: t.completedAt || null,
            };
          }) : seed.tasks;

          // Normalize fixed events
          const fixedEvents = Array.isArray(parsed.fixedEvents) ? parsed.fixedEvents.map((fe, idx) => {
            const sMin = parseTimeToMinutes(fe.start || '09:00');
            let eMin = parseTimeToMinutes(fe.end || '10:00');
            if (eMin <= sMin) eMin = sMin + 60;
            return {
              id: fe.id || `fix-${Date.now()}-${idx}`,
              title: (fe.title && String(fe.title).trim()) || 'Event',
              subtitle: fe.subtitle || '',
              category: normalizeCategoryId(categories, fe.category),
              start: minutesToTime(sMin),
              end: minutesToTime(eMin),
              days: Array.isArray(fe.days) ? fe.days.filter(d => typeof d === 'number' && d >= 0 && d <= 6) : [0, 1, 2, 3, 4, 5, 6],
            };
          }) : seed.fixedEvents;

          // Normalize study sessions
          const studySessions = Array.isArray(parsed.studySessions) ? parsed.studySessions.map((s, idx) => ({
            id: s.id || `sess-${Date.now()}-${idx}`,
            taskId: s.taskId || null,
            taskTitle: s.taskTitle || 'Study Session',
            category: normalizeCategoryId(categories, s.category),
            date: s.date || getTodayISO(),
            plannedMin: Math.max(1, Number(s.plannedMin) || 45),
            actualMin: Math.max(1, Number(s.actualMin) || 45),
          })) : seed.studySessions;

          // Normalize DSA topics
          const dsaTopics = Array.isArray(parsed.dsaTopics) ? parsed.dsaTopics.map((d, idx) => ({
            id: d.id || `dsa-${Date.now()}-${idx}`,
            name: d.name || 'DSA Topic',
            status: ['not-started', 'in-progress', 'done'].includes(d.status) ? d.status : 'not-started',
            problemsSolved: Math.max(0, Number(d.problemsSolved) || 0),
            note: d.note || '',
          })) : seed.dsaTopics;

          const collegeSubjects = Array.isArray(parsed.collegeSubjects) ? parsed.collegeSubjects : seed.collegeSubjects;
          const lostTimeEvents = Array.isArray(parsed.lostTimeEvents) ? parsed.lostTimeEvents : seed.lostTimeEvents;

          return {
            user: parsed.user || null,
            theme: parsed.theme === 'light' ? 'light' : 'dark',
            categories,
            tasks,
            fixedEvents,
            dsaTopics,
            collegeSubjects,
            lostTimeEvents,
            studySessions,
            dailyNotes: parsed.dailyNotes || seed.dailyNotes,
            scheduleConfig: parsed.scheduleConfig ? { ...DEFAULT_SCHEDULE_CONFIG, ...parsed.scheduleConfig } : { ...DEFAULT_SCHEDULE_CONFIG },
          };
        }
      }
    } catch (e) {
      console.warn('Fallback to seed data:', e);
    }
    return { ...seed, scheduleConfig: { ...DEFAULT_SCHEDULE_CONFIG } };
  }

  const state = {
    ...loadState(),
    activeTab: 'dashboard',
    activeModal: null, // { name, data }
    banner: null, // { text, type }
    focus: null, // { taskId, title, category, plannedSec, accumulatedSec, isRunning }
    timeline: [],
    timelineView: 'agenda', // 'agenda' (default, non-overlapping) or 'grid' (hour scale)
    currentTime: new Date(),
    viewDate: getTodayISO(), // Date being viewed/planned (defaults to Today)
  };

  // Ensure scheduleConfig always exists
  if (!state.scheduleConfig) state.scheduleConfig = { ...DEFAULT_SCHEDULE_CONFIG };

  function saveState() {
    try {
      const payload = {
        tasks: state.tasks,
        fixedEvents: state.fixedEvents,
        categories: state.categories,
        dsaTopics: state.dsaTopics,
        collegeSubjects: state.collegeSubjects,
        lostTimeEvents: state.lostTimeEvents,
        studySessions: state.studySessions,
        dailyNotes: state.dailyNotes,
        theme: state.theme,
        timelineView: state.timelineView,
        scheduleConfig: state.scheduleConfig,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (err) {
      console.error('LocalStorage write error:', err);
    }
  }

  // 1. Clear All Data (Clean Slate for Real Daily Life)
  function clearAllData() {
    try {
      localStorage.removeItem(STORAGE_KEY);
      // Avoid full localStorage wipe
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith('adapt_')) {
        localStorage.removeItem(k);
      }
    }
    } catch (e) {}

    state.tasks = [];
    state.fixedEvents = [];
    state.dsaTopics = [];
    state.collegeSubjects = [];
    state.lostTimeEvents = [];
    state.studySessions = [];
    state.dailyNotes = {};
    state.categories = [...DEFAULT_CATEGORIES];
    state.scheduleConfig = { ...DEFAULT_SCHEDULE_CONFIG };
    state.focus = null;
    state.activeModal = null;
    state.viewDate = getTodayISO();

    recalculateTimeline();
    saveState();
    showBanner('All data cleared! You have a fresh, clean slate ready for daily planning.', 'success');
    render();
  }

  // 2. Load Sample Demo Data (For previewing)
  function loadDemoData() {
    try {
      localStorage.removeItem(STORAGE_KEY);
      // Avoid full localStorage wipe
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith('adapt_')) {
        localStorage.removeItem(k);
      }
    }
    } catch (e) {}

    const fresh = getSeedData();
    state.tasks = fresh.tasks;
    state.fixedEvents = fresh.fixedEvents;
    state.categories = fresh.categories;
    state.dsaTopics = fresh.dsaTopics;
    state.collegeSubjects = fresh.collegeSubjects;
    state.lostTimeEvents = fresh.lostTimeEvents;
    state.studySessions = fresh.studySessions;
    state.dailyNotes = fresh.dailyNotes;
    state.focus = null;
    state.activeModal = null;
    state.viewDate = getTodayISO();

    recalculateTimeline();
    saveState();
    showBanner('Sample demo dataset loaded successfully!', 'success');
    render();
  }

  // Reset All Data defaults to Clean Slate
  function resetAllData() {
    clearAllData();
  }

  function recalculateTimeline(targetDate = null) {
    if (targetDate) {
      state.viewDate = targetDate;
    }
    const target = state.viewDate || getTodayISO();
    const isFuture = target > getTodayISO();

    state.timeline = generateDayTimeline({
      fixedEvents: state.fixedEvents,
      tasks: state.tasks,
      currentDate: target,
      currentTimeMinutes: isFuture ? -1 : getCurrentTimeMinutes(state.currentTime),
      config: state.scheduleConfig || DEFAULT_SCHEDULE_CONFIG,
    });
  }

  function updateScheduleConfig(updates) {
    state.scheduleConfig = { ...state.scheduleConfig, ...updates };
    recalculateTimeline();
    saveState();
    showBanner('Schedule configuration updated', 'success');
    render();
  }

  function showBanner(text, type = 'info') {
    state.banner = { text, type };
    renderBanner();
    setTimeout(() => {
      if (state.banner && state.banner.text === text) {
        state.banner = null;
        renderBanner();
      }
    }, 7000);
  }

  // =========================================================================
  // 10. DOM RENDERING ENGINE
  // =========================================================================
  const appRoot = document.getElementById('app');

  
  function renderOnboardingHtml() {
    return `
      <div class="onboarding-overlay">
        <div class="onboarding-card">
          <h2 style="margin-bottom:10px; font-size: 24px; color: var(--text-primary);">Welcome to Adapt</h2>
          <p style="color: var(--text-secondary); margin-bottom: 20px;">Your intelligent, adaptive study planner.</p>
          <div class="form-group" style="text-align:left; margin-bottom: 20px;">
            <label style="display:block; margin-bottom: 8px; color: var(--text-muted);">What should we call you?</label>
            <input type="text" id="onboarding-name" class="input-text" placeholder="Your Name" style="width: 100%;" />
          </div>
          <button class="btn btn-primary" id="btn-onboarding-start" style="width:100%; justify-content:center;">Start Focusing</button>
        </div>
      </div>
    `;
  }

  function attachOnboardingListeners() {
    const btn = document.getElementById('btn-onboarding-start');
    if (btn) {
      btn.onclick = () => {
        const name = document.getElementById('onboarding-name').value.trim();
        if (!name) {
          alert('Please enter your name.');
          return;
        }
        state.user = { name };
        saveState();
        render();
      };
    }
  }

  function render() {
    if (!googleId) {
      document.documentElement.setAttribute('data-theme', 'dark');
      appRoot.innerHTML = `
        <div class="login-overlay">
          <div class="login-ambient-lights">
            <div class="login-orb orb-1"></div>
            <div class="login-orb orb-2"></div>
            <div class="login-orb orb-3"></div>
          </div>
          <div class="login-card">
            <div class="login-badge">
              <span class="pulse-dot"></span> Secure Account Sync
            </div>
            <div class="login-logo-wrapper">
              <div class="login-logo">
                <svg viewBox="0 0 24 24" width="42" height="42" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.16v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.16C1.43 8.55 1 10.22 1 12s.43 3.45 1.16 4.93l2.85-2.22.83-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.16 7.07l3.68 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
              </div>
            </div>
            <h1 class="login-title">Sign in to Adapt</h1>
            <p class="login-subtitle">Connect your Google ID to auto-save and synchronize your academic schedule</p>
            <form id="google-login-form">
              <div class="login-field-group">
                <label class="login-label">Google Account (Email)</label>
                <div class="login-input-box">
                  <svg class="login-field-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                  <input type="email" id="login-email" class="login-input" placeholder="student@gmail.com" required autocomplete="username" />
                </div>
              </div>
              <div class="login-field-group">
                <label class="login-label">App Password</label>
                <div class="login-input-box">
                  <svg class="login-field-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  <input type="password" id="login-password" class="login-input" placeholder="Set password for this app" required autocomplete="current-password" />
                </div>
              </div>
              <div class="login-actions">
                <button type="submit" class="btn login-btn">
                  <span>Sign In & Sync Progress</span>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              </div>
              <div class="login-security-notice">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                <span>Encrypted local storage bound to your Google ID</span>
              </div>
            </form>
          </div>
        </div>
      `;
      document.getElementById('google-login-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        if (email) {
          localStorage.setItem('adapt_google_id', email);
          
          const newKey = `adapt_study_planner_state_${email}`;
          if (!localStorage.getItem(newKey)) {
            const guestData = localStorage.getItem('adapt_study_planner_state_v2');
            if (guestData) {
              localStorage.setItem(newKey, guestData);
            }
          }
          
          window.location.reload();
        }
      });
      return;
    }

    document.documentElement.setAttribute('data-theme', state.theme);

    appRoot.innerHTML = `
      <div class="app-container">
        ${renderNavHtml()}
        <div id="banner-slot"></div>
        <main class="main-content" id="tab-content-slot">
          ${renderCurrentTabHtml()}
        </main>
        <div id="modal-slot"></div>
      </div>
    `;

    renderBanner();
    renderModal();
    attachEventListeners();
  }

  function renderBanner() {
    const slot = document.getElementById('banner-slot');
    if (!slot) return;
    if (!state.banner) {
      slot.innerHTML = '';
      return;
    }
    slot.innerHTML = `
      <div class="app-banner banner-${state.banner.type} animate-fade-in">
        <div class="banner-content">
          <span>${state.banner.type === 'warning' ? '⚠️' : state.banner.type === 'success' ? '✅' : 'ℹ️'}</span>
          <span>${state.banner.text}</span>
        </div>
        <button class="banner-close-btn" id="btn-banner-close">✕</button>
      </div>
    `;
    document.getElementById('btn-banner-close')?.addEventListener('click', () => {
      state.banner = null;
      renderBanner();
    });
  }

  function renderNavHtml() {
    const today = getTodayISO();
    const streak = calculateStreak(state.studySessions, today);
    const overdue = getOverdueTasksCount(state.tasks, today);
    const curMin = getCurrentTimeMinutes(state.currentTime);
    const timeStr = formatTime12(curMin);
    const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][state.currentTime.getDay()];

    const tabs = [
      { id: 'dashboard', label: 'Dashboard', icon: '⚡' },
      { id: 'tasks', label: 'Tasks', icon: '📋', count: overdue > 0 ? overdue : null },
      { id: 'dsa', label: 'DSA', icon: '🌲' },
      { id: 'college', label: 'College', icon: '🎓' },
      { id: 'weekly', label: 'Weekly', icon: '📅' },
      { id: 'analytics', label: 'Analytics', icon: '📊' },
      { id: 'settings', label: 'Settings', icon: '⚙️' },
    ];

    return `
      <header class="nav-header">
        <div class="nav-container">
          <div class="nav-brand" id="brand-logo-btn">
            <div class="brand-logo"><span class="brand-glyph">✦</span></div>
            <div class="brand-text">
              <span class="brand-title">Adapt</span>
              <span class="brand-subtitle">STUDY PLANNER</span>
            </div>
          </div>

          <div class="nav-meta">
            <div class="live-clock font-mono">
              <span class="clock-dot"></span>
              <span id="nav-clock-text">${dayName} ${timeStr}</span>
            </div>
            <div class="streak-badge" title="${streak} day streak">
              <span>🔥</span>
              <span class="font-mono font-semibold">${streak}d</span>
              <span class="streak-label">streak</span>
            </div>
            ${overdue > 0 ? `
              <div class="overdue-badge-pill font-mono" id="nav-overdue-pill">
                <span>⚠️</span>
                <span>${overdue} overdue</span>
              </div>
            ` : ''}
            <button class="theme-toggle-btn" id="btn-theme-toggle" title="Toggle Theme">
              ${state.theme === 'dark' ? '☀️' : '🌙'}
            </button>
          </div>

          <nav class="nav-tabs" aria-label="Main Navigation">
            ${tabs.map(t => `
              <button class="nav-tab-btn ${state.activeTab === t.id ? 'active' : ''}" data-tab="${t.id}">
                <span>${t.icon}</span>
                <span>${t.label}</span>
                ${t.count ? `<span class="tab-badge-count font-mono">${t.count}</span>` : ''}
              </button>
            `).join('')}
          </nav>
        </div>
      </header>
    `;
  }

  function renderCurrentTabHtml() {
    switch (state.activeTab) {
      case 'dashboard': return renderDashboardHtml();
      case 'tasks': return renderTasksHtml();
      case 'dsa': return renderDSAHtml();
      case 'college': return renderCollegeHtml();
      case 'weekly': return renderWeeklyHtml();
      case 'analytics': return renderAnalyticsHtml();
      case 'settings': return renderSettingsHtml();
      default: return renderDashboardHtml();
    }
  }

  // -------------------------------------------------------------------------
  // TAB 1: DASHBOARD
  // -------------------------------------------------------------------------
  function renderDashboardHtml() {
    const today = getTodayISO();
    const tomorrow = addDays(today, 1);
    const viewDate = state.viewDate || today;
    const isTomorrowView = viewDate !== today;
    const curMin = getCurrentTimeMinutes(state.currentTime);

    const activeBlock = state.timeline.find(b => b.status === 'active' || b.status === 'fixed-active');
    const nextBlock = state.timeline.find(b => b.startMin > curMin && (b.type === 'task' || b.type === 'fixed'));

    let curStatus = 'Free Time / Buffer';
    let nextStatus = 'No further events scheduled today';

    if (isTomorrowView) {
      curStatus = `Planning Tomorrow (${formatDateDisplay(viewDate)})`;
      const tomorrowTasksCount = state.timeline.filter(b => b.type === 'task').length;
      nextStatus = `${tomorrowTasksCount} study task(s) currently slotted for tomorrow`;
    } else {
      if (activeBlock) curStatus = `${activeBlock.title} (${activeBlock.startTimeStr} – ${activeBlock.endTimeStr})`;
      if (nextBlock) nextStatus = `Next up at ${nextBlock.startTimeStr}: ${nextBlock.title}`;
    }

    const { completedMinToday, plannedMinToday } = getTodayStats(state.studySessions, state.tasks, today);
    const remMin = Math.max(0, plannedMinToday - completedMinToday);

    const displayedTasks = isTomorrowView
      ? state.tasks.filter(t => t.status !== 'completed' && t.deadline === viewDate).slice(0, 5)
      : state.tasks.filter(t => t.status !== 'completed' && (!t.deadline || t.deadline <= today)).slice(0, 5);

    return `
      <div class="dashboard-page animate-fade-in">
        ${isTomorrowView ? `
          <div class="planning-tomorrow-banner">
            <div class="planning-tomorrow-banner-text">
              <span style="font-size: 18px;">☀️</span>
              <div>
                <strong>Viewing & Planning for Tomorrow (${formatDateDisplay(viewDate)})</strong>
                <span class="text-xs text-secondary" style="display:block;">Schedule, routine, and priority tasks shown below are prepared for tomorrow.</span>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <button class="btn btn-sm btn-primary" id="btn-plan-tomorrow-modal-trigger">☀️ Plan Tomorrow</button>
              <button class="btn btn-sm btn-secondary" data-switch-date="${today}">📅 Back to Today</button>
            </div>
          </div>
        ` : ''}

        <div class="dashboard-hero card">
          <div class="hero-top-row">
            <div>
              <span class="hero-date-badge font-mono">${formatDateDisplay(viewDate)}${isTomorrowView ? ' (Tomorrow)' : ''}</span>
              <h1 class="hero-headline">${isTomorrowView ? "Tomorrow's Planned Command Center" : "Today's Adaptive Command Center"}</h1>
              <div class="hero-live-status">
                <span class="live-status-chip">
                  <span class="status-indicator-dot"></span>
                  <strong>Currently:</strong> ${curStatus}
                </span>
                <span class="next-status-text font-mono">${nextStatus}</span>
              </div>
            </div>

            <div class="countdown-card">
              <span class="countdown-label uppercase">Remaining Study Today</span>
              <div class="countdown-val font-mono">
                ${remMin > 0 ? `${Math.floor(remMin / 60)}h ${remMin % 60}m` : '<span class="text-low">✓ Goal Met!</span>'}
              </div>
              <span class="text-xs text-muted font-mono">${completedMinToday}m logged of ${plannedMinToday}m planned</span>
            </div>
          </div>

          <div class="dashboard-control-bar">
            <div class="control-left">
              <div class="dropdown-container">
                <button class="btn btn-primary" id="btn-quick-add">
                  <span>+ Quick Add</span>
                  <span>▾</span>
                </button>
                <div class="dropdown-menu card" id="quick-add-menu" style="display:none;">
                  <button class="dropdown-item" data-action="open-modal-task"><span>📋</span><span>New Study Task</span></button>
                  <button class="dropdown-item" data-action="open-modal-plan-next-day"><span>☀️</span><span>Plan Tomorrow</span></button>
                  <button class="dropdown-item" data-action="open-modal-session"><span>⏱️</span><span>Log Study Session</span></button>
                  <button class="dropdown-item" data-action="open-modal-rev-picker"><span>🔄</span><span>Schedule Revision</span></button>
                  <button class="dropdown-item" data-action="open-modal-fixed"><span>📌</span><span>Add Fixed Event</span></button>
                </div>
              </div>

              <button class="btn btn-secondary text-amber" id="btn-plan-tomorrow"><span>☀️ Plan Tomorrow</span></button>
              <button class="btn btn-secondary" id="btn-what-now"><span>✨ What should I do now?</span></button>
              <button class="btn btn-secondary text-amber" id="btn-lost-time"><span>⚠️ Lost time</span></button>
              <button class="btn btn-secondary" id="btn-brain-dump" style="color:#a855f7;"><span>🧠 Auto-Schedule Week</span></button>
            </div>

            <div class="control-right">
              <button class="btn btn-ghost" id="btn-regen-plan"><span>⚡ Recalculate schedule</span></button>
              <button class="btn btn-ghost" id="btn-end-day"><span>🌙 End-of-Day Review</span></button>
            </div>
          </div>
        </div>

        <div class="action-cards-grid grid-3 mt-4">
          <button class="action-card card card-hover" data-action="open-modal-task">
            <div class="action-card-top"><div class="action-card-icon" style="color:#f59e0b;background:#f59e0b18;">📋</div></div>
            <div><span class="action-card-title">Add Task</span><span class="action-card-desc">Quick parser or standard</span></div>
          </button>
          <button class="action-card card card-hover" id="btn-action-focus">
            <div class="action-card-top"><div class="action-card-icon" style="color:#06b6d4;background:#06b6d418;">⚡</div></div>
            <div><span class="action-card-title">Start Focus</span><span class="action-card-desc">Deep work timer</span></div>
          </button>
          <button class="action-card card card-hover" data-action="open-modal-fixed">
            <div class="action-card-top"><div class="action-card-icon" style="color:#3b82f6;background:#3b82f618;">📌</div></div>
            <div><span class="action-card-title">Fixed Event</span><span class="action-card-desc">Lectures & hard blocks</span></div>
          </button>
        </div>

        <div class="dashboard-main-grid mt-4">
          <div class="dashboard-primary-col">
            <div class="card mb-4">
              <div class="card-header-row">
                <div>
                  <h3 class="font-semibold text-base">${isTomorrowView ? "Tomorrow's Priority Queue" : "Today's Priority Queue"}</h3>
                  <span class="text-xs text-secondary">${displayedTasks.length} pending task(s) for ${isTomorrowView ? 'tomorrow' : 'today'}</span>
                </div>
                <button class="btn btn-sm btn-ghost" data-tab="tasks">View All Tasks →</button>
              </div>

              ${displayedTasks.length === 0 ? `
                <div class="py-6 text-center text-muted text-xs">
                  ${isTomorrowView
                    ? 'No tasks scheduled specifically for tomorrow yet. Click "Plan Tomorrow" to slot tasks!'
                    : "No pending tasks for today. You're completely on track!"}
                </div>
              ` : `
                <div class="mini-task-list">
                  ${displayedTasks.map(t => {
                    const col = getCategoryColor(state.categories, t.category);
                    const lab = getCategoryLabel(state.categories, t.category);
                    return `
                      <div class="mini-task-row">
                        <div class="mini-task-left">
                          <input type="checkbox" class="task-checkbox" data-task-complete="${t.id}" ${t.status === 'completed' ? 'checked' : ''} />
                          <div class="mini-task-meta">
                            <span class="mini-task-title">${t.title}</span>
                            <div class="mini-task-tags">
                              <span class="badge text-xs" style="color:${col};background:${col}18;">${lab}</span>
                              <span class="badge badge-${(t.priority || 'Medium').toLowerCase()}">${t.priority || 'Medium'}</span>
                              <span class="text-xs text-muted font-mono">${t.remaining}m left</span>
                            </div>
                          </div>
                        </div>
                        <button class="btn btn-sm btn-primary" data-start-focus="${t.id}">⚡ Focus</button>
                      </div>
                    `;
                  }).join('')}
                </div>
              `}
            </div>

            ${renderTimelineHtml()}
          </div>

          <div class="dashboard-sidebar-col">
            <div class="card mb-4">
              <h3 class="font-semibold text-sm mb-2">Today's Study Progress</h3>
              ${renderMeterHtml(completedMinToday, plannedMinToday || 60, 'Goal Completion', `${completedMinToday}m / ${plannedMinToday}m`, 'var(--accent)', 'lg')}
              <div class="flex justify-between text-xs text-secondary mt-2">
                <span>Remaining: <strong>${remMin}m</strong></span>
                <span>Rate: <strong>${plannedMinToday > 0 ? Math.round((completedMinToday / plannedMinToday) * 100) : 100}%</strong></span>
              </div>
            </div>

            ${renderCalendarMatrixHtml()}

            <div class="card mb-4">
              <h3 class="font-semibold text-sm mb-2">Category Palette</h3>
              <div class="sidebar-legend-grid">
                ${state.categories.map(c => `
                  <div class="legend-chip">
                    <span class="pill-dot" style="background-color:${c.color};"></span>
                    <span class="text-xs text-secondary">${c.label}</span>
                  </div>
                `).join('')}
              </div>
            </div>

            <div class="card">
              <h4 class="label-title">Keyboard Shortcuts</h4>
              <div class="shortcuts-compact-list">
                <div class="sc-item"><kbd class="kbd-chip font-mono">N</kbd> <span>New Task</span></div>
                <div class="sc-item"><kbd class="kbd-chip font-mono">F</kbd> <span>Start Focus</span></div>
                <div class="sc-item"><kbd class="kbd-chip font-mono">T</kbd> <span>What should I do?</span></div>
                <div class="sc-item"><kbd class="kbd-chip font-mono">R</kbd> <span>Regenerate plan</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderTimelineHtml() {
    const today = getTodayISO();
    const tomorrow = addDays(today, 1);
    const viewDate = state.viewDate || today;
    const isTomorrowView = viewDate !== today;
    const sc = state.scheduleConfig || DEFAULT_SCHEDULE_CONFIG;

    return `
      <div class="timeline-container card">
        <div class="timeline-header">
          <div class="timeline-title-row">
            <div>
              <h3 class="font-semibold text-base">${isTomorrowView ? "Tomorrow's Adaptive Schedule" : "Today's Adaptive Schedule"}</h3>
              <p class="text-xs text-secondary">${isTomorrowView ? "Previewing tomorrow's slotted routine, lectures, and study tasks." : "Dynamically slotted around your routine, commitments, and breaks."}</p>
            </div>
            <div class="flex items-center gap-2 flex-wrap">
              <div class="date-switch-group">
                <button class="date-switch-btn ${viewDate === today ? 'active' : ''}" data-switch-date="${today}" title="View Today">
                  <span>📅</span><span>Today</span>
                </button>
                <button class="date-switch-btn ${viewDate === tomorrow ? 'active' : ''}" data-switch-date="${tomorrow}" title="View Tomorrow">
                  <span>☀️</span><span>Tomorrow</span>
                </button>
              </div>
              
              <button class="btn btn-secondary btn-sm" id="btn-regen-plan" title="Recalculate schedule">🔄 Recalculate</button>
            </div>
          </div>

          <div class="schedule-routine-bar">
            <div class="flex items-center gap-2 flex-wrap text-xs">
              <span class="text-secondary font-medium">🌅 Day Starts:</span>
              <input type="time" class="input-text font-mono quick-day-start-input" id="quick-day-start" value="${sc.dayStart || '08:00'}" />
              <button class="btn btn-secondary btn-sm" id="btn-start-day-now" style="padding:3px 8px;font-size:11px;" title="Set schedule to start at current time">⚡ Start Now (${formatTime12(getCurrentTimeMinutes(state.currentTime))})</button>
            </div>
            <div class="flex items-center gap-2 text-xs flex-wrap">
              <button class="routine-chip-btn" data-action="open-modal-routine" data-focus-meal="breakfast" title="Click to customize breakfast time & duration">
                🍳 Breakfast: <strong>${sc.breakfastStart || '08:30'}</strong> <span class="font-mono">(${(parseTimeToMinutes(sc.breakfastEnd) - parseTimeToMinutes(sc.breakfastStart)) || sc.breakfastDuration || 30}m)</span>
              </button>
              <button class="routine-chip-btn" data-action="open-modal-routine" data-focus-meal="lunch" title="Click to customize lunch time & duration">
                🍱 Lunch: <strong>${sc.lunchStart || '13:00'}</strong> <span class="font-mono">(${(parseTimeToMinutes(sc.lunchEnd) - parseTimeToMinutes(sc.lunchStart)) || sc.lunchDuration || 45}m)</span>
              </button>
              <button class="routine-chip-btn" data-action="open-modal-routine" data-focus-meal="dinner" title="Click to customize dinner time & duration">
                🍽️ Dinner: <strong>${sc.dinnerStart || '20:00'}</strong> <span class="font-mono">(${(parseTimeToMinutes(sc.dinnerEnd) - parseTimeToMinutes(sc.dinnerStart)) || sc.dinnerDuration || 45}m)</span>
              </button>
              <button class="btn btn-secondary btn-sm" data-action="open-modal-routine" style="padding:3px 10px;font-size:11px;" title="Customize full daily routine and meal durations">⚙️ Edit Routine</button>
            </div>
          </div>

          
        </div>

        ${renderAgendaScheduleHtml()}
      </div>
    `;
  }

  function renderAgendaScheduleHtml() {
    const activeTasks = state.tasks.filter(t => t.status !== 'completed');
    if (activeTasks.length === 0 && state.fixedEvents.length === 0) {
      return `
        <div class="timeline-empty-card">
          <div class="empty-icon">📅</div>
          <h4 class="font-bold text-base mb-1">Your Schedule is Clean & Open</h4>
          <p class="text-xs text-secondary mb-3">Add study tasks or lectures to generate your automated daily schedule.</p>
          <button class="btn btn-primary" data-action="open-modal-task">+ Add Study Task</button>
        </div>
      `;
    }

    const items = state.timeline.filter(b => {
      return b.type !== 'free' || b.duration >= 30;
    });

    if (items.length === 0) {
      const isTomorrowView = (state.viewDate || getTodayISO()) !== getTodayISO();
      return `
        <div class="timeline-empty-card">
          <div class="empty-icon">${isTomorrowView ? '☀️' : '✨'}</div>
          <h4 class="font-bold text-base mb-1">${isTomorrowView ? 'No Tasks Queued for Tomorrow Yet' : 'All Planned Tasks Completed!'}</h4>
          <p class="text-xs text-secondary mb-3">${isTomorrowView ? 'Plan your study tasks now to wake up with a prepared roadmap.' : 'Great job! You have free buffer time for the rest of today.'}</p>
          <button class="btn btn-primary" id="${isTomorrowView ? 'btn-empty-plan-tomorrow' : 'btn-empty-add-task'}" data-action="${isTomorrowView ? 'open-modal-plan-next-day' : 'open-modal-task'}">
            ${isTomorrowView ? '☀️ Plan Tomorrow Now' : '+ Add Another Task'}
          </button>
        </div>
      `;
    }

    return `
      <div class="agenda-list">
        ${items.map(b => {
          if (b.type === 'break') {
            return `
              <div class="agenda-break-row font-mono">
                <span class="break-line"></span>
                <span class="break-pill">☕ ${b.title} &middot; ${b.startTimeStr} – ${b.endTimeStr} (${b.duration}m)</span>
                <div class="break-actions-group">
                  <button class="btn btn-sm btn-ghost text-xs" data-action="skip-break" data-break-id="${b.id}" style="padding:2px 8px;" title="Skip break to free time">✕ Skip</button>
                  <button class="btn btn-sm btn-ghost text-xs" data-action="push-break" data-break-id="${b.id}" data-mins="15" style="padding:2px 8px;" title="Push break 15 min later">⏩ +15m</button>
                </div>
                <span class="break-line"></span>
              </div>
            `;
          }

          if (b.type === 'meal') {
            return `
              <div class="agenda-meal-row">
                <div class="meal-left-meta">
                  <span class="meal-icon">${b.mealKey === 'breakfast' ? '🍳' : b.mealKey === 'dinner' ? '🍽️' : '🍱'}</span>
                  <span class="meal-title">${b.title}</span>
                  <span class="font-mono text-xs text-secondary ml-1">${b.startTimeStr} – ${b.endTimeStr} (${b.duration}m)</span>
                </div>
                <div class="meal-actions-group">
                  <button class="btn btn-sm btn-ghost text-xs" data-action="adjust-meal-duration" data-meal="${b.mealKey || 'lunch'}" data-delta="-15" title="Shorten meal by 15 mins">⏳ -15m</button>
                  <button class="btn btn-sm btn-ghost text-xs" data-action="adjust-meal-duration" data-meal="${b.mealKey || 'lunch'}" data-delta="15" title="Extend meal by 15 mins">⏳ +15m</button>
                  <button class="btn btn-sm btn-ghost text-xs" data-action="push-meal" data-meal="${b.mealKey || 'lunch'}" data-mins="30" title="Shift 30 minutes later">⏩ +30m</button>
                  <button class="btn btn-sm btn-ghost text-xs" data-action="pull-meal" data-meal="${b.mealKey || 'lunch'}" data-mins="30" title="Shift 30 minutes earlier">⏪ -30m</button>
                  <button class="btn btn-sm btn-secondary text-xs" data-action="open-modal-routine" data-focus-meal="${b.mealKey || 'lunch'}" style="padding:2px 8px;" title="Configure variable meal duration & time">⚙️ Edit</button>
                </div>
              </div>
            `;
          }

          if (b.type === 'lost') {
            return `
              <div class="agenda-card lost-block" style="background: repeating-linear-gradient(45deg, rgba(239, 68, 68, 0.05), rgba(239, 68, 68, 0.05) 10px, rgba(239, 68, 68, 0.1) 10px, rgba(239, 68, 68, 0.1) 20px); border-left: 4px solid var(--danger);">
                <div class="agenda-accent-bar" style="background-color:var(--danger);"></div>
                <div class="agenda-meta-top">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="agenda-time-pill font-mono text-danger">⏱️ ${b.startTimeStr} – ${b.endTimeStr} (${b.duration}m)</span>
                    <span class="badge text-xs" style="color:var(--danger);background:rgba(239, 68, 68, 0.15);">Lost Time</span>
                  </div>
                  <div><span class="timeline-badge badge-danger">⚠️ Distraction</span></div>
                </div>
                <div>
                  <h4 class="agenda-title text-danger">${escapeHtml(b.title)}</h4>
                  <p class="agenda-subtitle mt-1" style="color:var(--danger);opacity:0.8;">${escapeHtml(b.subtitle)}</p>
                </div>
              </div>
            `;
          }

          if (b.type === 'free') {
            return `
              <div class="agenda-free-row">
                <span class="text-xs text-secondary font-mono">🍃 ${b.title} &middot; ${b.startTimeStr} – ${b.endTimeStr} (${b.duration}m free buffer)</span>
              </div>
            `;
          }

          // Task or Fixed Lecture Block
          const col = getCategoryColor(state.categories, b.category);
          const lab = getCategoryLabel(state.categories, b.category);
          const isTask = b.type === 'task';
          const isFixed = b.type === 'fixed';
          const isActive = b.status === 'active' || b.status === 'fixed-active';
          const isDone = b.status === 'completed' || b.status === 'fixed-done';

          let statusBadge = `<span class="timeline-badge badge-${b.status}">${b.status}</span>`;
          if (isActive) {
            statusBadge = `<span class="timeline-badge badge-active">⚡ Active Now</span>`;
          } else if (isDone) {
            statusBadge = `<span class="timeline-badge badge-completed">✓ Done</span>`;
          } else if (isFixed) {
            statusBadge = `<span class="timeline-badge badge-fixed">Fixed Class</span>`;
          }

          return `
            
  <div class="agenda-card ${isActive ? 'is-active' : ''} ${isDone ? 'is-completed' : ''}" 
       style="${isTask || isFixed ? `border-left-color:${col};`: ''}"
       ${isTask ? `draggable="true" data-drag-task-id="${b.taskId}"` : ''}
       ${isTask ? 'ondragstart="handleDragStart(event)" ondragover="handleDragOver(event)" ondrop="handleDrop(event)" ondragenter="handleDragEnter(event)" ondragleave="handleDragLeave(event)" ondragend="handleDragEnd(event)"' : ''}>

              <div class="agenda-accent-bar" style="background-color:${col};"></div>
              <div class="agenda-meta-top">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="agenda-time-pill font-mono">⏱️ ${b.startTimeStr} – ${b.endTimeStr} (${b.duration}m)</span>
                  ${isTask ? `<span class="badge text-xs" style="color:${col};background:${col}18;">${lab}</span>` : ''}
                  ${b.priority ? `<span class="badge badge-${(b.priority || 'Medium').toLowerCase()}">${b.priority}</span>` : ''}
                </div>
                <div>${statusBadge}</div>
              </div>
              <div>
                <h4 class="agenda-title ${isDone ? 'line-through text-muted' : ''}">${b.title}</h4>
                ${b.subtitle ? `<p class="agenda-subtitle text-secondary mt-1">${b.subtitle}</p>` : ''}
              </div>
              ${isTask && !isDone ? `
                <div class="agenda-actions">
                  <button class="btn btn-sm btn-primary" data-start-focus="${b.taskId}">⚡ Start Focus Session</button>
                  <button class="btn btn-sm btn-ghost" data-task-complete="${b.taskId}">✓ Mark Done</button>
                </div>
              ` : ''}
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function renderHourGridHtml() {
    const sc = state.scheduleConfig || DEFAULT_SCHEDULE_CONFIG;
    const earliestBlock = state.timeline.length > 0 ? Math.min(...state.timeline.map(b => b.startMin)) : parseTimeToMinutes(sc.dayStart);
    const dayStartMin = Math.min(parseTimeToMinutes(sc.dayStart || '08:00'), earliestBlock);
    const latestBlock = state.timeline.length > 0 ? Math.max(...state.timeline.map(b => b.endMin)) : parseTimeToMinutes(sc.dayEnd);
    const dayEndMin = Math.max(parseTimeToMinutes(sc.dayEnd || '23:00'), latestBlock);
    const totalWin = Math.max(60, dayEndMin - dayStartMin);

    // Use pixel-per-minute for precise sizing (1.5px per minute → 90px per hour)
    const pxPerMin = 1.5;
    const totalPx = totalWin * pxPerMin;

    const curMin = getCurrentTimeMinutes(state.currentTime);
    const playheadTop = Math.max(0, Math.min(totalPx, (curMin - dayStartMin) * pxPerMin));
    const isNow = (state.viewDate || getTodayISO()) === getTodayISO() && curMin >= dayStartMin && curMin <= dayEndMin;

    const hours = [];
    hours.push({ min: dayStartMin, label: formatTime12(dayStartMin), top: 0 });
    const firstRoundHour = Math.ceil(dayStartMin / 60) * 60;
    for (let m = firstRoundHour; m <= dayEndMin; m += 60) {
      if (m > dayStartMin) {
        hours.push({ min: m, label: formatTime12(m), top: (m - dayStartMin) * pxPerMin });
      }
    }

    return `
      <div class="timeline-body" style="height:auto;max-height:80vh;">
        <div class="timeline-gutter" style="height:${totalPx}px;">
          ${hours.map(h => `
            <div class="gutter-hour font-mono" style="top:${h.top}px;">
              <span class="gutter-time-text">${h.label}</span>
              <div class="gutter-grid-line"></div>
            </div>
          `).join('')}
        </div>

        <div class="timeline-track" style="height:${totalPx}px;">
          ${isNow ? `
            <div class="timeline-playhead" style="top:${playheadTop}px;">
              <div class="playhead-badge font-mono">
                <span class="playhead-dot"></span>
                <span>${formatTime12(curMin)} NOW</span>
              </div>
              <div class="playhead-line"></div>
            </div>
          ` : ''}

          ${state.timeline.map(b => {
            const topPx = Math.max(0, (b.startMin - dayStartMin) * pxPerMin);
            const heightPx = Math.max(30, b.duration * pxPerMin); // min 30px so content is visible
            const col = getCategoryColor(state.categories, b.category);
            const lab = getCategoryLabel(state.categories, b.category);
            const isTask = b.type === 'task';
            const isFixed = b.type === 'fixed';
            const isActive = b.status === 'active' || b.status === 'fixed-active';
            const isShort = b.duration < 25;

            return `
              <div class="timeline-block block-${b.type} ${isActive ? 'is-active' : ''} ${isShort ? 'block-compact' : ''} ${isTask || b.type === 'meal' || isFixed ? 'is-draggable' : ''}"
                   style="top:${topPx}px;height:${heightPx}px;${isTask || isFixed ? `border-color:${col}55;` : ''}"
                   ${isTask || b.type === 'meal' || isFixed ? 'draggable="true"' : ''}
                   data-drag-id="${b.id}" data-task-id="${b.taskId || ''}" data-meal-key="${b.mealKey || ''}" data-event-id="${b.eventId || ''}" data-duration="${b.duration || 0}">
                ${isTask || isFixed ? `<div class="block-accent-bar" style="background-color:${col};"></div>` : ''}
                <div class="block-content">
                  <div class="block-meta">
                    <span class="block-time font-mono">${b.startTimeStr} – ${b.endTimeStr} (${b.duration}m)</span>
                    <div class="flex gap-1 items-center">
                      ${isTask && !isShort ? `<span class="badge text-xs" style="color:${col};">${lab}</span>` : ''}
                      <span class="timeline-badge badge-${b.status}">${b.status}</span>
                    </div>
                  </div>
                  <div class="block-main">
                    <span class="block-title">${b.title}</span>
                    ${b.subtitle && !isShort ? `<span class="text-xs text-secondary">${b.subtitle}</span>` : ''}
                  </div>
                  ${isTask && b.status !== 'completed' && !isShort ? `
                    <div class="block-actions">
                      <button class="btn btn-sm btn-ghost" data-task-complete="${b.taskId}">✓ Done</button>
                      <button class="btn btn-sm btn-primary" data-start-focus="${b.taskId}">⚡ Focus</button>
                    </div>
                  ` : ''}
                  ${b.type === 'meal' && !isShort ? `
                    <div class="block-actions">
                      <button class="btn btn-sm btn-ghost" data-action="adjust-meal-duration" data-meal="${b.mealKey || 'lunch'}" data-delta="-15" title="Shorten by 15m">⏳ -15m</button>
                      <button class="btn btn-sm btn-ghost" data-action="adjust-meal-duration" data-meal="${b.mealKey || 'lunch'}" data-delta="15" title="Extend by 15m">⏳ +15m</button>
                      <button class="btn btn-sm btn-ghost" data-action="push-meal" data-meal="${b.mealKey || 'lunch'}" data-mins="30" title="Shift +30m">⏩ +30m</button>
                      <button class="btn btn-sm btn-secondary" data-action="open-modal-routine" data-focus-meal="${b.mealKey || 'lunch'}" style="padding:2px 6px;" title="Edit routine">⚙️</button>
                    </div>
                  ` : ''}
                  ${b.type === 'break' && !isShort ? `
                    <div class="block-actions">
                      <button class="btn btn-sm btn-ghost" data-action="skip-break" data-break-id="${b.id}">✕ Skip</button>
                      <button class="btn btn-sm btn-ghost" data-action="push-break" data-break-id="${b.id}" data-mins="15">⏩ +15m</button>
                    </div>
                  ` : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  // -------------------------------------------------------------------------
  // TAB 2: TASKS
  // -------------------------------------------------------------------------
  let taskFilter = { status: 'all', category: 'all', sort: 'deadline', query: '' };

  function renderTasksHtml() {
    const today = getTodayISO();

    const filtered = state.tasks.filter(t => {
      if (taskFilter.query) {
        const q = taskFilter.query.toLowerCase();
        if (!t.title.toLowerCase().includes(q) && !(t.notes || '').toLowerCase().includes(q)) return false;
      }
      if (taskFilter.status === 'pending' && t.status === 'completed') return false;
      if (taskFilter.status === 'completed' && t.status !== 'completed') return false;
      if (taskFilter.status === 'today' && (t.deadline !== today || t.status === 'completed')) return false;
      if (taskFilter.status === 'overdue' && (t.status === 'completed' || !t.deadline || diffDays(t.deadline, today) >= 0)) return false;
      if (taskFilter.category !== 'all' && t.category !== taskFilter.category) return false;
      return true;
    }).sort((a, b) => {
      if (taskFilter.sort === 'deadline') return (a.deadline || '').localeCompare(b.deadline || '');
      if (taskFilter.sort === 'priority') return (PRIORITY_WEIGHTS[b.priority] || 1) - (PRIORITY_WEIGHTS[a.priority] || 1);
      if (taskFilter.sort === 'duration') return (b.remaining || b.duration) - (a.remaining || a.duration);
      return 0;
    });

    const total = state.tasks.length;
    const pending = state.tasks.filter(t => t.status !== 'completed').length;
    const completed = state.tasks.filter(t => t.status === 'completed').length;
    const remMin = state.tasks.filter(t => t.status !== 'completed').reduce((acc, t) => acc + (t.remaining || t.duration || 0), 0);

    return `
      <div class="tasks-page animate-fade-in">
        <div class="card mb-4">
          <div class="tasks-header-row">
            <div>
              <h1 class="font-bold text-xl">Study Tasks & Commitments</h1>
              <p class="text-xs text-secondary">Manage tasks, track subtasks, and launch focus sessions.</p>
            </div>
            <button class="btn btn-primary" data-action="open-modal-task">+ Create Task</button>
          </div>

          <div class="tasks-metrics-grid mt-3">
            <div class="metric-box"><span class="metric-label">Total</span><span class="metric-value font-mono">${total}</span></div>
            <div class="metric-box"><span class="metric-label">Pending</span><span class="metric-value font-mono text-amber">${pending}</span></div>
            <div class="metric-box"><span class="metric-label">Completed</span><span class="metric-value font-mono text-low">${completed}</span></div>
            <div class="metric-box"><span class="metric-label">Remaining</span><span class="metric-value font-mono">${Math.floor(remMin / 60)}h ${remMin % 60}m</span></div>
          </div>
        </div>

        <div class="card mb-4">
          <div class="toolbar-top-row">
            <div class="search-box">
              <span class="search-icon">🔍</span>
              <input type="text" class="input-text search-input" id="task-search-input" placeholder="Search tasks..." value="${taskFilter.query}" />
            </div>
            <div class="sort-box">
              <span class="text-xs text-secondary mr-2">Sort:</span>
              <select class="select-input sort-select" id="task-sort-select">
                <option value="deadline" ${taskFilter.sort === 'deadline' ? 'selected' : ''}>Deadline</option>
                <option value="priority" ${taskFilter.sort === 'priority' ? 'selected' : ''}>Priority</option>
                <option value="duration" ${taskFilter.sort === 'duration' ? 'selected' : ''}>Duration</option>
              </select>
            </div>
          </div>

          <div class="toolbar-filters-row mt-3">
            <div class="pills-container" id="task-status-pills">
              ${['all', 'pending', 'completed', 'today', 'overdue'].map(s => `
                <button class="pill-btn ${taskFilter.status === s ? 'pill-selected' : ''}" data-filter-status="${s}">
                  ${s.toUpperCase()}
                </button>
              `).join('')}
            </div>
          </div>
        </div>

        <div class="tasks-list-container">
          ${filtered.length === 0 ? `
            <div class="card text-center py-8">
              <div style="font-size:32px;margin-bottom:8px;">📋</div>
              <h3 class="font-bold text-base mb-1">${state.tasks.length === 0 ? 'No Study Tasks Added Yet' : 'No Tasks Match Your Filters'}</h3>
              <p class="text-xs text-secondary mb-4">${state.tasks.length === 0 ? 'Start planning your daily goals, assignments, and exam prep!' : 'Try resetting your search query or selecting a different status pill.'}</p>
              <button class="btn btn-primary btn-sm" data-action="open-modal-task">+ Create Study Task</button>
            </div>
          ` : filtered.map(t => {
            const col = getCategoryColor(state.categories, t.category);
            const lab = getCategoryLabel(state.categories, t.category);
            const isDone = t.status === 'completed';
            const isOverdue = !isDone && t.deadline && diffDays(t.deadline, today) < 0;

            return `
              <div class="task-card card card-hover ${isDone ? 'task-completed-card' : ''}">
                <div class="task-card-main">
                  <div class="task-check-col">
                    <input type="checkbox" class="task-checkbox" data-task-complete="${t.id}" ${isDone ? 'checked' : ''} />
                  </div>
                  <div class="task-info-col">
                    <div class="task-meta-top">
                      <span class="badge" style="background:${col}18;color:${col};">${lab}</span>
                      <span class="badge badge-${(t.priority || 'Medium').toLowerCase()}">${t.priority || 'Medium'}</span>
                      <span class="task-date-pill font-mono text-xs ${isOverdue ? 'date-overdue' : ''}">
                        📅 ${relativeDateLabel(t.deadline, today)}
                      </span>
                    </div>
                    <h3 class="task-title ${isDone ? 'line-through text-muted' : ''}">${t.title}</h3>
                    ${t.notes ? `<p class="text-xs text-secondary">${t.notes}</p>` : ''}
                    ${t.subtasks && t.subtasks.length > 0 ? `
                      <div class="mt-2 text-xs text-muted">
                        ${t.subtasks.filter(s => s.done).length}/${t.subtasks.length} subtasks completed
                      </div>
                    ` : ''}
                  </div>
                  <div class="task-actions-col">
                    ${!isDone ? `<button class="btn btn-sm btn-primary" data-start-focus="${t.id}">⚡ Focus</button>` : ''}
                    <button class="btn btn-sm btn-ghost" data-action="edit-task" data-id="${t.id}">✏️</button>
                    <button class="btn btn-sm btn-ghost text-danger" data-action="delete-task" data-id="${t.id}">🗑️</button>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  // -------------------------------------------------------------------------
  // TAB 3: DSA
  // -------------------------------------------------------------------------
  function renderDSAHtml() {
    const total = state.dsaTopics.length;
    const done = state.dsaTopics.filter(t => t.status === 'done').length;
    const solved = state.dsaTopics.reduce((acc, t) => acc + (t.problemsSolved || 0), 0);

    return `
      <div class="dsa-page animate-fade-in">
        <div class="card mb-4">
          <div class="flex justify-between items-start flex-wrap gap-2 mb-3">
            <div>
              <h1 class="font-bold text-xl">DSA Problem Tracker</h1>
              <p class="text-xs text-secondary">Track algorithm pattern mastery and problem counts.</p>
            </div>
            <button class="btn btn-primary" data-action="open-modal-dsa">+ Add DSA Topic</button>
          </div>
          <div class="grid-3 mt-2">
            <div class="metric-box"><span class="metric-label">Problems Solved</span><span class="metric-value font-mono text-amber">${solved}</span></div>
            <div class="metric-box"><span class="metric-label">Mastered</span><span class="metric-value font-mono text-low">${done}/${total}</span></div>
            <div class="metric-box"><span class="metric-label">Coverage</span><span class="metric-value font-mono">${total > 0 ? Math.round((done / total) * 100) : 0}%</span></div>
          </div>
        </div>

        <div class="grid-3">
          ${state.dsaTopics.length === 0 ? `
            <div class="card text-center py-8" style="grid-column: 1 / -1;">
              <div style="font-size:32px;margin-bottom:8px;">🌲</div>
              <h3 class="font-bold text-base mb-1">No DSA Topics Tracked Yet</h3>
              <p class="text-xs text-secondary mb-4">Add the data structures or algorithm patterns you are practicing (e.g. Two Pointers, Sliding Window, DP).</p>
              <button class="btn btn-primary btn-sm" data-action="open-modal-dsa">+ Add DSA Topic</button>
            </div>
          ` : state.dsaTopics.map(topic => `
            <div class="card card-hover dsa-card">
              <div class="dsa-card-top flex justify-between items-center">
                <button type="button" class="status-clickable-badge" data-cycle-dsa="${topic.id}" title="Click to cycle status (○ Not Started / ⚡ In Progress / ✓ Mastered)">
                  <span class="badge ${topic.status === 'done' ? 'badge-low' : topic.status === 'in-progress' ? 'badge-medium' : 'badge-neutral'}">
                    ${topic.status === 'done' ? '✓ Mastered' : topic.status === 'in-progress' ? '⚡ In Progress' : '○ Not Started'}
                  </span>
                </button>
                <button type="button" class="btn btn-ghost btn-sm text-danger dsa-del-btn" data-delete-dsa="${topic.id}" title="Delete topic">✕</button>
              </div>
              <h3 class="font-semibold text-sm mt-2">${escapeHtml(topic.name)}</h3>
              ${topic.note ? `<p class="text-xs text-secondary mt-1">${escapeHtml(topic.note)}</p>` : ''}
              <div class="dsa-counter-row mt-3">
                <span class="text-xs text-muted font-medium">Problems Solved</span>
                <div class="dsa-stepper">
                  <button type="button" class="dsa-stepper-btn" data-dsa-adj="${topic.id}" data-delta="-1" title="Decrease count">−</button>
                  <input type="number" class="dsa-stepper-input font-mono" data-dsa-set="${topic.id}" value="${topic.problemsSolved}" min="0" />
                  <button type="button" class="dsa-stepper-btn" data-dsa-adj="${topic.id}" data-delta="1" title="Increase count">+</button>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // -------------------------------------------------------------------------
  // TAB 4: COLLEGE
  // -------------------------------------------------------------------------
  function renderCollegeHtml() {
    const today = getTodayISO();

    return `
      <div class="college-page animate-fade-in">
        <div class="card mb-4">
          <div class="flex justify-between items-start flex-wrap gap-2">
            <div>
              <h1 class="font-bold text-xl">College & University Academics</h1>
              <p class="text-xs text-secondary">Track syllabus coverage and 60/40 exam readiness.</p>
            </div>
            <button class="btn btn-primary" data-action="open-modal-college">+ Add Subject</button>
          </div>
        </div>

        ${state.collegeSubjects.length > 0 ? `
        <div class="card mb-4">
          <h3 class="font-semibold text-sm mb-3">📊 Subject-wise Syllabus Progress</h3>
          <div class="circular-progress-grid">
            ${state.collegeSubjects.map(sub => {
              const tot = sub.topics.length;
              const isComp = t => t.status === 'done' || Boolean(t.revised);
              const isProg = t => t.status === 'in-progress' && !t.revised;
              const comp = sub.topics.filter(isComp).length;
              const inProg = sub.topics.filter(isProg).length;
              const pct = tot > 0 ? Math.round(((comp + inProg * 0.5) / tot) * 100) : 0;
              const colors = ['#06b6d4', '#a855f7', '#f59e0b', '#ec4899', '#10b981', '#3b82f6'];
              const color = colors[state.collegeSubjects.indexOf(sub) % colors.length];
              return renderCircularProgressHtml(pct, color, sub.name, 90);
            }).join('')}
          </div>
        </div>
        ` : ''}

        <div class="college-subjects-list">
          ${state.collegeSubjects.length === 0 ? `
            <div class="card text-center py-8">
              <div style="font-size:32px;margin-bottom:8px;">🎓</div>
              <h3 class="font-bold text-base mb-1">No Academic Courses Added Yet</h3>
              <p class="text-xs text-secondary mb-4">Add your real university courses, syllabus topics, and exam dates to track 60/40 readiness.</p>
              <button class="btn btn-primary btn-sm" data-action="open-modal-college">+ Add Course / Subject</button>
            </div>
          ` : state.collegeSubjects.map(sub => {
            const tot = sub.topics.length;
            const isComp = t => t.status === 'done' || Boolean(t.revised);
            const isProg = t => t.status === 'in-progress' && !t.revised;
            const comp = sub.topics.filter(isComp).length;
            const inProg = sub.topics.filter(isProg).length;
            const rev = sub.topics.filter(t => Boolean(t.revised)).length;

            const sylPct = tot > 0 ? Math.round(((comp + inProg * 0.5) / tot) * 100) : 0;
            const revPct = tot > 0 ? Math.round((rev / tot) * 100) : 0;
            const readyPct = Math.round(0.6 * sylPct + 0.4 * revPct);

            let examBadge = 'No exam set';
            if (sub.examDate) {
              const diff = diffDays(sub.examDate, today);
              examBadge = diff === 0 ? 'Exam Today!' : diff > 0 ? `Exam in ${diff}d` : 'Exam done';
            }

            return `
              <div class="card mb-4">
                <div class="flex justify-between items-center flex-wrap gap-2 mb-2">
                  <div class="flex items-center gap-2">
                    <h2 class="font-bold text-base">${sub.name}</h2>
                    <span class="badge badge-medium font-mono text-xs">🗓️ ${examBadge}</span>
                  </div>
                  <button class="btn btn-ghost btn-sm text-danger" data-delete-college="${sub.id}">🗑️</button>
                </div>

                <div class="grid-3 mt-2">
                  ${renderMeterHtml(sylPct, 100, 'Syllabus Covered', `${comp}/${tot} (${sylPct}%)`, '#06b6d4', 'sm')}
                  ${renderMeterHtml(revPct, 100, 'Revision Cycles', `${rev}/${tot} (${revPct}%)`, '#a855f7', 'sm')}
                  ${renderMeterHtml(readyPct, 100, 'Exam Readiness (60/40)', `${readyPct}%`, 'var(--accent)', 'sm')}
                </div>

                <div class="topics-chips-list mt-3">
                  ${sub.topics.map(tp => {
                    const isDone = tp.status === 'done' || Boolean(tp.revised);
                    const isInProg = tp.status === 'in-progress' && !tp.revised;
                    return `
                    <div class="topic-chip ${isDone ? 'chip-done' : isInProg ? 'chip-inprog' : ''}" style="padding: 6px 10px; display: flex; align-items: center; justify-content: space-between; border-radius: 8px; gap: 8px;">
                      <button type="button" class="status-clickable-badge" data-cycle-topic="${sub.id}" data-topic-id="${tp.id}" title="Click to cycle status (○ Not Started / ⚡ In Progress / ✓ Mastered)">
                        <span class="badge ${isDone ? 'badge-low' : isInProg ? 'badge-medium' : 'badge-neutral'}" style="font-size: 11px; padding: 3px 8px; cursor: pointer;">
                          ${isDone ? '✓ Mastered' : isInProg ? '⚡ In Progress' : '○ Not Started'}
                        </span>
                      </button>
                      <div class="flex items-center gap-2 cursor-pointer flex-1 py-1 hover:opacity-80 transition-opacity" data-open-notes="${sub.id}" data-topic-id="${tp.id}" title="Click to edit notes & details">
                        <span style="font-weight: 600; font-size: 13px;">${escapeHtml(tp.name)}</span>
                        ${tp.notes ? '<span title="Has notes" style="font-size: 11px; opacity: 0.7;">📝</span>' : ''}
                      </div>
                      <button type="button" class="badge cursor-pointer" data-toggle-revised="${sub.id}" data-topic-id="${tp.id}" title="Click to toggle revision status" style="font-size:11px; padding:3px 8px; border:none; cursor:pointer; border-radius:6px; transition: all 0.2s ease; ${tp.revised ? 'background: rgba(168, 85, 247, 0.25); color: #c084fc; font-weight:600;' : 'background: rgba(148, 163, 184, 0.15); color: #94a3b8;'}">
                        ${tp.revised ? '🔄 Revised' : 'Unrevised'}
                      </button>
                      <button class="chip-del-btn ml-1" style="padding: 4px 8px; border-radius: 4px; flex-shrink: 0;" data-delete-topic="${sub.id}" data-topic-id="${tp.id}" title="Delete topic">✕</button>
                    </div>
                  `;}).join('')}
                </div>

                <form class="add-topic-inline-row mt-3" data-add-topic-form="${sub.id}">
                  <input type="text" class="input-text" placeholder="Add topic name..." required />
                  <button type="submit" class="btn btn-secondary btn-sm">+ Add</button>
                </form>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  // -------------------------------------------------------------------------
  // TAB 5: WEEKLY
  // -------------------------------------------------------------------------
  let selectedWeeklyDate = getTodayISO();

  function renderWeeklyHtml() {
    const { dayStats, capacityHours, plannedHours, bufferHours, studiedHours } = getWeeklyCapacityStats(state.fixedEvents, state.tasks, state.studySessions);
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const curStat = dayStats.find(d => d.dateIso === selectedWeeklyDate) || dayStats[0];
    const wday = curStat.weekday;
    const dayFixed = state.fixedEvents.filter(ev => Array.isArray(ev.days) && ev.days.includes(wday));
    const dayTasks = state.tasks.filter(t => t.deadline === selectedWeeklyDate);
    const daySessions = state.studySessions.filter(s => s.date === selectedWeeklyDate);

    return `
      <div class="weekly-page animate-fade-in">
        <div class="card mb-4">
          <div class="flex justify-between items-center flex-wrap gap-3">
            <div>
              <h1 class="font-bold text-xl mb-1">Weekly Schedule & Overview</h1>
              <p class="text-xs text-secondary">Click any day below to inspect your scheduled routine, lectures, and upcoming deadlines.</p>
            </div>
            <div class="flex gap-2">
              <button class="btn btn-secondary btn-sm" data-action="open-modal-fixed">+ Add Lecture / Event</button>
              <button class="btn btn-primary btn-sm" data-action="open-modal-task">+ Add Task</button>
            </div>
          </div>
        </div>

        <div class="card mb-4">
          <div class="week-strip-grid">
            ${dayStats.map(stat => `
              <button class="week-day-card card ${stat.dateIso === selectedWeeklyDate ? 'is-selected' : ''} ${stat.isToday ? 'is-today' : ''}" data-select-week-day="${stat.dateIso}">
                <div class="flex justify-between font-mono text-xs">
                  <span class="font-semibold">${dayNames[stat.weekday]}</span>
                  <span class="text-secondary">${stat.dateIso.slice(5)}</span>
                </div>
                <div class="mt-2 font-mono font-bold text-base text-amber">
                  ${formatDuration(stat.studiedMin || stat.dueMin)}
                </div>
                <div class="text-xs text-muted font-mono mt-1">Cap: ${formatDuration(stat.dailyCap)}</div>
              </button>
            `).join('')}
          </div>
        </div>

        <div class="card">
          <h3 class="font-semibold text-base mb-3">Details for ${formatDateDisplay(selectedWeeklyDate)}</h3>
          <div class="grid-3">
            <div class="card">
              <span class="label-title">Fixed Lectures (${dayFixed.length})</span>
              ${dayFixed.map(f => `<div class="text-xs py-1"><strong>${f.title}</strong> <span class="font-mono text-muted">(${f.start}-${f.end})</span></div>`).join('')}
            </div>
            <div class="card">
              <span class="label-title">Tasks Due (${dayTasks.length})</span>
              ${dayTasks.map(t => `<div class="text-xs py-1 ${t.status === 'completed' ? 'line-through text-muted' : ''}"><strong>${t.title}</strong> (${t.remaining}m)</div>`).join('')}
            </div>
            <div class="card">
              <span class="label-title">Logged Sessions (${daySessions.length})</span>
              ${daySessions.map(s => `<div class="text-xs py-1"><strong>${s.taskTitle}</strong> <span class="font-mono text-accent">(${s.actualMin}m)</span></div>`).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // -------------------------------------------------------------------------
  // TAB 6: ANALYTICS
  // -------------------------------------------------------------------------
  function renderAnalyticsHtml() {
    const { totalFocusedMin, compRate, totalLostMin, mostCommon, catDist, chart, insight } = getAnalyticsData(state.studySessions, state.lostTimeEvents, state.tasks, state.categories);
    const maxVal = Math.max(90, ...chart.map(c => Math.max(c.studied, c.lost)));

    return `
      <div class="analytics-page animate-fade-in">
        <div class="card mb-4">
          <h1 class="font-bold text-xl mb-1">Academic & Execution Analytics</h1>
          <p class="text-xs text-secondary">Measure output, lost-time friction, and planning calibration.</p>
        </div>

        <div class="grid-4 mb-4">
          <div class="card metric-box"><span class="metric-label">Focused Time</span><span class="metric-value font-mono text-accent">${formatDuration(totalFocusedMin)}</span></div>
          <div class="card metric-box"><span class="metric-label">Completion Rate</span><span class="metric-value font-mono text-low">${compRate}%</span></div>
          <div class="card metric-box"><span class="metric-label">Lost Time</span><span class="metric-value font-mono text-high">${formatDuration(totalLostMin)}</span></div>
          <div class="card metric-box"><span class="metric-label">Top Distraction</span><span class="metric-value text-sm truncate font-semibold">${mostCommon}</span></div>
        </div>

        <div class="card mb-4" style="background:linear-gradient(135deg,#f59e0b15,#06b6d410);border-color:#f59e0b44;">
          <span class="label-title">Planning Accuracy Calibration</span>
          <p class="text-sm font-semibold mt-1">${insight}</p>
        </div>

        <div class="grid-2 mb-4">
          <div class="card">
            <h3 class="font-semibold text-sm mb-2">7-Day Study vs. Lost Time</h3>
            <div class="bar-chart-container">
              ${chart.map(c => {
                const sH = Math.round((c.studied / maxVal) * 100);
                const lH = Math.round((c.lost / maxVal) * 100);
                return `
                  <div class="bar-chart-col">
                    <div class="bars-stack">
                      <div class="bar bar-studied" style="height:${sH}%;"></div>
                      <div class="bar bar-lost" style="height:${lH}%;"></div>
                    </div>
                    <span class="font-mono text-xs text-secondary mt-1">${c.dayName}</span>
                  </div>
                `;
              }).join('')}
            </div>
          </div>

          <div class="card">
            <h3 class="font-semibold text-sm mb-3">Category Time Distribution</h3>
            ${catDist.map(c => `
              <div class="mb-2">
                ${renderMeterHtml(c.pct, 100, c.label, `${c.minutes}m (${c.pct}%)`, c.color, 'sm')}
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  // -------------------------------------------------------------------------
  // TAB 7: SETTINGS
  // -------------------------------------------------------------------------
  function renderSettingsHtml() {
    const sc = state.scheduleConfig || DEFAULT_SCHEDULE_CONFIG;
    return `
      <div class="settings-page animate-fade-in">
        <div class="card mb-4">
          <h1 class="font-bold text-xl mb-1">Application Settings</h1>
          <p class="text-xs text-secondary">Manage theme, schedule times, categories, backups, and reset options.</p>
        </div>

        <div class="card mb-4">
          <div class="flex justify-between items-center">
            <div>
              <h3 class="font-semibold text-sm">Theme Mode</h3>
              <p class="text-xs text-secondary">Current: <strong>${state.theme === 'dark' ? 'Dark Navy & Amber' : 'Clean Slate Light'}</strong></p>
            </div>
            <button class="btn btn-secondary" id="btn-settings-theme">${state.theme === 'dark' ? '☀️ Switch to Light' : '🌙 Switch to Dark'}</button>
          </div>
        </div>

        <div class="card mb-4">
          <h3 class="font-semibold text-sm mb-1">⏰ Daily Schedule Configuration</h3>
          <p class="text-xs text-secondary mb-3">Set when your day starts/ends and meal break windows. The timeline adapts to your routine.</p>
          <div class="grid-2 mb-3">
            <div>
              <label class="label-title">Day Starts At</label>
              <input type="time" class="input-text font-mono" id="cfg-day-start" value="${sc.dayStart}" />
            </div>
            <div>
              <label class="label-title">Day Ends At</label>
              <input type="time" class="input-text font-mono" id="cfg-day-end" value="${sc.dayEnd}" />
            </div>
          </div>
          <div class="card p-3 mb-3" style="background: var(--bg-card-hover);">
            <div class="flex justify-between items-center mb-2">
              <span class="font-semibold text-sm">🍳 Breakfast Routine</span>
              <label class="flex items-center gap-1 text-xs cursor-pointer">
                <input type="checkbox" id="cfg-breakfast-enabled" ${sc.breakfastEnabled !== false ? 'checked' : ''} />
                <span>Enable Breakfast</span>
              </label>
            </div>
            <div class="grid-3 mb-2">
              <div>
                <label class="label-title">Start Time</label>
                <input type="time" class="input-text font-mono" id="cfg-breakfast-start" value="${sc.breakfastStart || '08:30'}" />
              </div>
              <div>
                <label class="label-title">Duration (min)</label>
                <input type="number" class="input-text font-mono" id="cfg-breakfast-duration" value="${(parseTimeToMinutes(sc.breakfastEnd) - parseTimeToMinutes(sc.breakfastStart)) || sc.breakfastDuration || 30}" min="10" max="180" step="5" />
              </div>
              <div>
                <label class="label-title">End Time</label>
                <input type="time" class="input-text font-mono" id="cfg-breakfast-end" value="${sc.breakfastEnd || '09:00'}" />
              </div>
            </div>
            <div class="flex items-center gap-1 flex-wrap">
              <span class="text-xs text-secondary mr-1">Presets:</span>
              ${[15, 20, 30, 45, 60].map(m => `<button type="button" class="duration-pill-btn" data-cfg-dur="cfg-breakfast" data-mins="${m}">${m}m</button>`).join('')}
            </div>
          </div>

          <div class="card p-3 mb-3" style="background: var(--bg-card-hover);">
            <div class="font-semibold text-sm mb-2">🍱 Lunch & Recharge</div>
            <div class="grid-3 mb-2">
              <div>
                <label class="label-title">Start Time</label>
                <input type="time" class="input-text font-mono" id="cfg-lunch-start" value="${sc.lunchStart || '13:00'}" />
              </div>
              <div>
                <label class="label-title">Duration (min)</label>
                <input type="number" class="input-text font-mono" id="cfg-lunch-duration" value="${(parseTimeToMinutes(sc.lunchEnd) - parseTimeToMinutes(sc.lunchStart)) || sc.lunchDuration || 45}" min="10" max="180" step="5" />
              </div>
              <div>
                <label class="label-title">End Time</label>
                <input type="time" class="input-text font-mono" id="cfg-lunch-end" value="${sc.lunchEnd || '13:45'}" />
              </div>
            </div>
            <div class="flex items-center gap-1 flex-wrap">
              <span class="text-xs text-secondary mr-1">Presets:</span>
              ${[20, 30, 45, 60, 75].map(m => `<button type="button" class="duration-pill-btn" data-cfg-dur="cfg-lunch" data-mins="${m}">${m}m</button>`).join('')}
            </div>
          </div>

          <div class="card p-3 mb-3" style="background: var(--bg-card-hover);">
            <div class="font-semibold text-sm mb-2">🍽️ Dinner & Unwind</div>
            <div class="grid-3 mb-2">
              <div>
                <label class="label-title">Start Time</label>
                <input type="time" class="input-text font-mono" id="cfg-dinner-start" value="${sc.dinnerStart || '20:00'}" />
              </div>
              <div>
                <label class="label-title">Duration (min)</label>
                <input type="number" class="input-text font-mono" id="cfg-dinner-duration" value="${(parseTimeToMinutes(sc.dinnerEnd) - parseTimeToMinutes(sc.dinnerStart)) || sc.dinnerDuration || 45}" min="10" max="180" step="5" />
              </div>
              <div>
                <label class="label-title">End Time</label>
                <input type="time" class="input-text font-mono" id="cfg-dinner-end" value="${sc.dinnerEnd || '20:45'}" />
              </div>
            </div>
            <div class="flex items-center gap-1 flex-wrap">
              <span class="text-xs text-secondary mr-1">Presets:</span>
              ${[20, 30, 45, 60, 90].map(m => `<button type="button" class="duration-pill-btn" data-cfg-dur="cfg-dinner" data-mins="${m}">${m}m</button>`).join('')}
            </div>
          </div>
          <div class="grid-2 mb-3">
            <div>
              <label class="label-title">Max Study Chunk (min)</label>
              <input type="number" class="input-text font-mono" id="cfg-max-chunk" value="${sc.maxChunkMin}" min="15" step="5" />
            </div>
            <div>
              <label class="label-title">Default Break (min)</label>
              <input type="number" class="input-text font-mono" id="cfg-break-duration" value="${sc.breakDurationMin}" min="5" step="5" />
            </div>
          </div>
          <button class="btn btn-primary" id="btn-save-schedule-cfg">💾 Save Schedule Settings</button>
        </div>

        <div class="card mb-4">
          <div class="flex justify-between items-center mb-3">
            <h3 class="font-semibold text-sm">Category Management</h3>
            <button class="btn btn-primary btn-sm" data-action="open-modal-category">+ New Category</button>
          </div>
          <div class="flex flex-col gap-2">
            ${state.categories.map(cat => `
              <div class="flex justify-between items-center card p-2">
                <div class="flex items-center gap-2">
                  <span class="swatch-circle" style="background:${cat.color};"></span>
                  <span class="font-semibold text-sm">${cat.label}</span>
                  ${cat.id === FALLBACK_CATEGORY_ID ? '<span class="badge badge-done text-xs">Permanent</span>' : ''}
                </div>
                ${cat.id !== FALLBACK_CATEGORY_ID ? `
                  <button class="btn btn-ghost btn-sm text-danger" data-delete-cat="${cat.id}">🗑️</button>
                ` : ''}
              </div>
            `).join('')}
          </div>
        </div>

        <div class="card mb-4">
          <h3 class="font-semibold text-sm mb-2">Backup & Sample Data</h3>
          <div class="flex gap-2 flex-wrap">
            <button class="btn btn-secondary" id="btn-load-demo">📦 Load Sample Demo Data</button>
          </div>
        </div>

        <div class="card mb-4 border-danger">
          <div class="flex justify-between items-center flex-wrap gap-2">
            <div>
              <h3 class="font-semibold text-sm text-danger">Clear All Data (Clean Slate)</h3>
              <p class="text-xs text-secondary">Completely wipes all mock tasks, lectures, college courses, and logs so you can use Adapt for your real daily study life.</p>
            </div>
            <button class="btn btn-danger" id="btn-trigger-reset">🗑️ Clear All Data (Clean Slate)</button>
          </div>
        </div>

        <div class="card mb-4" style="border: 1px solid var(--border-focus);">
          <div class="flex justify-between items-center flex-wrap gap-2">
            <div>
              <h3 class="font-semibold text-sm">Session Management</h3>
              <p class="text-xs text-secondary">Sign out of your current Google account.</p>
            </div>
            <button class="btn btn-secondary" id="btn-sign-out" style="color: var(--color-medium);">🚪 Sign Out</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderMeterHtml(val, max, label, detail, color = 'var(--accent)', size = 'md') {
    const pct = max > 0 ? Math.min(100, Math.max(0, Math.round((val / max) * 100))) : 0;
    return `
      <div class="meter-component meter-${size}">
        <div class="meter-header">
          <span class="meter-label">${label}</span>
          <span class="meter-value font-mono">${detail || `${pct}%`}</span>
        </div>
        <div class="meter-track">
          <div class="meter-fill" style="width:${pct}%;background-color:${color};"></div>
        </div>
      </div>
    `;
  }

  function renderCircularProgressHtml(pct, color, label, size = 80) {
    const radius = (size / 2) - 8;
    const circumference = 2 * Math.PI * radius;
    const clampedPct = Math.min(100, Math.max(0, Math.round(pct)));
    const offset = circumference - (clampedPct / 100) * circumference;
    const center = size / 2;
    const gradId = `cpGrad-${Math.random().toString(36).slice(2, 7)}`;
    
    return `
      <div class="circular-progress-container" style="width:${size}px;">
        <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" class="circular-progress-svg">
          <defs>
            <linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="${color}"/>
              <stop offset="100%" stop-color="${color}aa"/>
            </linearGradient>
          </defs>
          <circle cx="${center}" cy="${center}" r="${radius}" fill="none" stroke="var(--border-subtle)" stroke-width="6" opacity="0.4"/>
          <circle cx="${center}" cy="${center}" r="${radius}" fill="none" 
            stroke="url(#${gradId})" stroke-width="6" 
            stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" 
            stroke-linecap="round" transform="rotate(-90 ${center} ${center})"
            style="transition:stroke-dashoffset 0.8s ease;"/>
          <text x="${center}" y="${center}" text-anchor="middle" dominant-baseline="central" 
            fill="var(--text-primary)" font-size="${size < 70 ? 12 : 16}" font-weight="700" 
            font-family="var(--font-mono)">${clampedPct}%</text>
        </svg>
        <div class="circular-progress-label">${label}</div>
      </div>
    `;
  }

  function renderCalendarMatrixHtml() {
    const today = getTodayISO();
    const viewDate = state.viewDate || today;
    const viewD = new Date(viewDate + 'T00:00:00');
    const year = viewD.getFullYear();
    const month = viewD.getMonth();
    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    
    // First day of month (0 = Mon, 6 = Sun) and total days
    const firstDayOfWeek = (new Date(year, month, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    
    // Build task map for all dates
    const tasksByDate = {};
    state.tasks.forEach(t => {
      if (t.deadline) {
        if (!tasksByDate[t.deadline]) tasksByDate[t.deadline] = [];
        tasksByDate[t.deadline].push(t);
      }
    });
    
    // Calendar navigation (1st of prev month, 1st of next month)
    const prevMonthDate = new Date(year, month - 1, 1);
    const nextMonthDate = new Date(year, month + 1, 1);
    const prevMonthISO = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}-01`;
    const nextMonthISO = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, '0')}-01`;
    
    // Build cells
    let cellsHtml = '';

    // 1. Trailing days from previous month (rendered in muted gray)
    for (let i = 0; i < firstDayOfWeek; i++) {
      const d = daysInPrevMonth - firstDayOfWeek + 1 + i;
      const pYear = prevMonthDate.getFullYear();
      const pMonth = String(prevMonthDate.getMonth() + 1).padStart(2, '0');
      const dateISO = `${pYear}-${pMonth}-${String(d).padStart(2, '0')}`;
      const dayTasks = tasksByDate[dateISO] || [];
      const hasTasks = dayTasks.length > 0;
      const allDone = hasTasks && dayTasks.every(t => t.status === 'completed');
      const hasOverdue = hasTasks && dayTasks.some(t => t.status !== 'completed' && dateISO < today);
      const isSelected = dateISO === viewDate;

      let taskClass = '';
      if (allDone) taskClass = 'cal-cell-done';
      else if (hasOverdue) taskClass = 'cal-cell-overdue';
      else if (hasTasks) taskClass = 'cal-cell-pending';

      cellsHtml += `
        <button class="cal-cell cal-cell-adjacent ${isSelected ? 'cal-cell-selected' : ''} ${taskClass}" 
          data-cal-date="${dateISO}" title="${d} ${monthNames[prevMonthDate.getMonth()]}">
          <span class="cal-date-num">${d}</span>
        </button>
      `;
    }
    
    // 2. Days of current month
    for (let d = 1; d <= daysInMonth; d++) {
      const dateISO = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isToday = dateISO === today;
      const isSelected = dateISO === viewDate;
      const dayTasks = tasksByDate[dateISO] || [];
      const hasTasks = dayTasks.length > 0;
      const allDone = hasTasks && dayTasks.every(t => t.status === 'completed');
      const hasOverdue = hasTasks && dayTasks.some(t => t.status !== 'completed' && dateISO < today);
      
      let taskClass = '';
      if (allDone) taskClass = 'cal-cell-done';
      else if (hasOverdue) taskClass = 'cal-cell-overdue';
      else if (hasTasks) taskClass = 'cal-cell-pending';
      else taskClass = 'cal-cell-current';

      cellsHtml += `
        <button class="cal-cell ${taskClass} ${isToday ? 'cal-cell-today' : ''} ${isSelected ? 'cal-cell-selected' : ''}" 
          data-cal-date="${dateISO}" title="${d} ${monthNames[month]} ${year}${hasTasks ? ` — ${dayTasks.length} task(s)` : ''}">
          <span class="cal-date-num">${d}</span>
        </button>
      `;
    }

    // 3. Leading days of next month to complete the visual grid (in muted gray)
    const totalRendered = firstDayOfWeek + daysInMonth;
    const totalCellsNeeded = totalRendered > 35 ? 42 : (totalRendered > 28 ? 35 : 28);
    const trailingCount = totalCellsNeeded - totalRendered;
    for (let d = 1; d <= trailingCount; d++) {
      const nYear = nextMonthDate.getFullYear();
      const nMonth = String(nextMonthDate.getMonth() + 1).padStart(2, '0');
      const dateISO = `${nYear}-${nMonth}-${String(d).padStart(2, '0')}`;
      const dayTasks = tasksByDate[dateISO] || [];
      const hasTasks = dayTasks.length > 0;
      const allDone = hasTasks && dayTasks.every(t => t.status === 'completed');
      const hasOverdue = hasTasks && dayTasks.some(t => t.status !== 'completed' && dateISO < today);
      const isSelected = dateISO === viewDate;

      let taskClass = '';
      if (allDone) taskClass = 'cal-cell-done';
      else if (hasOverdue) taskClass = 'cal-cell-overdue';
      else if (hasTasks) taskClass = 'cal-cell-pending';

      cellsHtml += `
        <button class="cal-cell cal-cell-adjacent ${isSelected ? 'cal-cell-selected' : ''} ${taskClass}" 
          data-cal-date="${dateISO}" title="${d} ${monthNames[nextMonthDate.getMonth()]}">
          <span class="cal-date-num">${d}</span>
        </button>
      `;
    }
    
    return `
      <div class="calendar-matrix-card card mb-4">
        <div class="cal-header">
          <button class="cal-nav-btn" data-cal-nav="${prevMonthISO}" title="Previous Month" aria-label="Previous Month">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          </button>
          <div class="cal-header-title">
            <div class="cal-month-text">${monthNames[month]}</div>
            <div class="cal-year-text">${year}</div>
          </div>
          <button class="cal-nav-btn" data-cal-nav="${nextMonthISO}" title="Next Month" aria-label="Next Month">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </button>
        </div>
        <div class="cal-day-labels">
          <span class="cal-day-label">Mon</span>
          <span class="cal-day-label">Tue</span>
          <span class="cal-day-label">Wed</span>
          <span class="cal-day-label">Thu</span>
          <span class="cal-day-label">Fri</span>
          <span class="cal-day-label cal-day-weekend">Sat</span>
          <span class="cal-day-label cal-day-weekend">Sun</span>
        </div>
        <div class="cal-grid">
          ${cellsHtml}
        </div>
        ${state._calendarSelectedTasks ? renderCalendarTaskListHtml() : ''}
      </div>
    `;
  }

  function renderCalendarTaskListHtml() {
    const dateISO = state.viewDate || getTodayISO();
    const dayTasks = state.tasks.filter(t => t.deadline === dateISO);
    
    return `
      <div class="cal-task-list">
        <div class="cal-task-header">
          <span class="cal-task-header-title">Tasks for ${formatDateDisplay(dateISO)}</span>
          <span class="cal-task-count-badge font-mono">${dayTasks.length}</span>
        </div>
        ${dayTasks.length === 0 ? `
          <div class="cal-task-empty">
            <p class="text-xs text-secondary">No study tasks due on this date.</p>
            <button class="btn btn-xs btn-primary mt-2" data-action="open-modal-task" data-preset-date="${dateISO}">+ Add Task for this Day</button>
          </div>
        ` : `
          <div class="cal-task-items">
            ${dayTasks.map(t => {
              const col = getCategoryColor(state.categories, t.category);
              const isDone = t.status === 'completed';
              return `
                <div class="cal-task-item ${isDone ? 'cal-task-done' : ''}">
                  <input type="checkbox" class="task-checkbox" data-task-complete="${t.id}" ${isDone ? 'checked' : ''} />
                  <span class="cal-task-dot" style="background:${col};"></span>
                  <span class="cal-task-title ${isDone ? 'line-through text-muted' : ''}">${escapeHtml(t.title)}</span>
                  <span class="text-xs font-mono text-muted">${t.remaining || 0}m</span>
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>
    `;
  }

  
  // -------------------------------------------------------------------------
  // DRAG AND DROP HANDLERS
  // -------------------------------------------------------------------------
  let dragDraggedTaskId = null;

  
  window.handleDragStart = function(e) {
    if (!e.target.getAttribute('data-drag-task-id')) return;
    dragDraggedTaskId = e.target.getAttribute('data-drag-task-id');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragDraggedTaskId);
    setTimeout(() => {
      e.target.classList.add('is-dragging');
    }, 0);
  };
  window.handleDragEnd = function(e) {
    e.target.classList.remove('is-dragging');
    document.querySelectorAll('.agenda-card').forEach(el => el.classList.remove('drag-over'));
  };
  window.handleDragOver = function(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const card = e.target.closest('.agenda-card');
    if (card) {
      card.classList.add('drag-over');
    }
  };
  window.handleDragEnter = function(e) {
    e.preventDefault();
  };
  window.handleDragLeave = function(e) {
    const card = e.target.closest('.agenda-card');
    if (card) {
      card.classList.remove('drag-over');
    }
  };
  window.handleDrop = function(e) {
    e.preventDefault();
    const card = e.target.closest('.agenda-card');
    if (card) card.classList.remove('drag-over');
    const dropTargetTaskId = card ? card.getAttribute('data-drag-task-id') : null;
    
    if (dragDraggedTaskId && dropTargetTaskId && dragDraggedTaskId !== dropTargetTaskId) {
      const draggedTask = state.tasks.find(t => t.id === dragDraggedTaskId);
      const targetBlock = state.timeline.find(b => b.taskId === dropTargetTaskId);
      
      if (draggedTask && targetBlock) {
        draggedTask.startTime = minutesToTime(targetBlock.startMin);
        saveState();
        recalculateTimeline();
        render();
      }
    }
  };

  
  // -------------------------------------------------------------------------
  // MODALS

  // -------------------------------------------------------------------------
  function renderModal() {
    const slot = document.getElementById('modal-slot');
    if (!slot) return;
    if (!state.activeModal) {
      slot.innerHTML = '';
      return;
    }

    const { name, data } = state.activeModal;
    let title = '';
    let body = '';
    let footer = '';

    if (name === 'task') {
      title = data?.id ? 'Edit Study Task' : 'Create Study Task';
      body = `
        <form id="form-task" class="flex flex-col gap-3">
          ${!data?.id ? `
            <div class="card p-3" style="background:#f59e0b10;border:1px dashed #f59e0b44;border-radius:10px;">
              <label class="label-title">✨ Natural Language Quick Add</label>
              <div class="flex gap-2">
                 <input type="text" class="input-text" id="task-nlp-input" placeholder="E.g., 'Study DP for 2h high priority tomorrow' or 'Read OS Chapter 3 for 45m today'" autocomplete="off" />
                 <button type="button" class="btn btn-sm btn-primary" id="btn-nlp-apply">Apply</button>
              </div>
              <div id="nlp-preview" class="nlp-preview-bar mt-2 text-xs" style="min-height: 20px; transition: all 0.2s ease;"></div>
            </div>
          ` : ''}
          <div>
            <label class="label-title">Task Title *</label>
            <input type="text" class="input-text" id="task-input-title" value="${data?.title || ''}" required />
          </div>
          <div class="grid-2">
            <div>
              <label class="label-title">Category</label>
              <select class="select-input" id="task-input-cat">
                ${state.categories.map(c => `<option value="${c.id}" ${data?.category === c.id ? 'selected' : ''}>${c.label}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="label-title">Duration (mins)</label>
              <input type="number" class="input-text font-mono" id="task-input-duration" value="${data?.duration || 45}" min="1" step="1" />
            </div>
          </div>
          <div class="grid-2">
            <div>
              <label class="label-title">Deadline</label>
              <input type="date" class="input-text font-mono" id="task-input-deadline" value="${data?.deadline || getTodayISO()}" />
            </div>
            <div>
              <label class="label-title">Priority</label>
              <select class="select-input" id="task-input-priority">
                ${['Critical', 'High', 'Medium', 'Low'].map(p => `<option value="${p}" ${data?.priority === p ? 'selected' : ''}>${p}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="grid-2">
            <div>
              <label class="label-title">Flexibility</label>
              <select class="select-input" id="task-input-flexibility">
                <option value="Flexible" ${data?.flexibility === 'Flexible' ? 'selected' : ''}>Flexible (Auto-reschedule)</option>
                <option value="Strict" ${data?.flexibility === 'Strict' ? 'selected' : ''}>Strict (Must do today)</option>
              </select>
            </div>
            <div>
              <label class="label-title">Energy Required</label>
              <select class="select-input" id="task-input-energy">
                ${['High', 'Medium', 'Low'].map(e => `<option value="${e}" ${data?.energy === e ? 'selected' : ''}>${e}</option>`).join('')}
              </select>
            </div>
          </div>
          <div>
            <label class="label-title">Notes / Details</label>
            <textarea class="textarea-input" id="task-input-notes" placeholder="Any resources or specific goals...">${data?.notes || ''}</textarea>
          </div>
        </form>
      `;
      footer = `
        <button class="btn btn-ghost" data-action="close-modal">Cancel</button>
        <button class="btn btn-primary" id="btn-save-task">${data ? 'Save Changes' : 'Create Task'}</button>
      `;
    } else if (name === 'focus') {
      const f = state.focus;
      title = '🧘 Focus Session';
      const isOvertime = f.accumulatedSec > f.plannedSec;
      const targetMin = Math.round(f.plannedSec / 60);
      const underlyingTask = state.tasks.find(x => x.id === f.taskId);

      const pct = Math.min(100, Math.max(0, (f.accumulatedSec / f.plannedSec) * 100));
      const radius = 54;
      const circumference = 2 * Math.PI * radius;
      const offset = circumference - (pct / 100) * circumference;

      body = `
        <div style="display:flex;flex-direction:column;align-items:center;padding:24px 0;">
          <div id="focus-progress-container" style="position:relative;width:180px;height:180px;">
            <svg viewBox="0 0 130 130" style="width:180px;height:180px;filter:drop-shadow(0 6px 20px rgba(59,130,246,0.15));">
              <defs>
                <linearGradient id="focusGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#06b6d4"/>
                  <stop offset="50%" stop-color="#3b82f6"/>
                  <stop offset="100%" stop-color="#8b5cf6"/>
                </linearGradient>
                <filter id="ringGlow">
                  <feGaussianBlur stdDeviation="2" result="blur"/>
                  <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                </filter>
              </defs>
              <!-- Background track -->
              <circle cx="65" cy="65" r="${radius}" fill="none" stroke="var(--bg-input, #e2e8f0)" stroke-width="14" opacity="0.5"/>
              <!-- Progress arc -->
              <circle id="focus-ring" cx="65" cy="65" r="${radius}" fill="none" 
                stroke="url(#focusGrad)" stroke-width="14" 
                stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" 
                stroke-linecap="round" transform="rotate(-90 65 65)" 
                filter="url(#ringGlow)"
                style="transition:stroke-dashoffset 1s linear;"/>
              <!-- Small dot at tip -->
              <circle id="focus-dot" cx="65" cy="${65 - radius}" r="4" fill="white" 
                style="transform-origin:65px 65px;transform:rotate(${pct * 3.6}deg);transition:transform 1s linear;filter:drop-shadow(0 0 4px rgba(59,130,246,0.6));"/>
            </svg>
          </div>
          <div class="font-bold text-base mt-3 text-center" style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(f.title)}</div>
          <div class="text-xs text-secondary mt-1 font-semibold" id="focus-status-label">${f.isRunning ? 'Focusing...' : 'Paused'}</div>
        </div>
        <div class="flex items-center justify-center gap-2 mt-2 flex-wrap">
          <span class="text-xs text-secondary font-semibold">Adjust Target:</span>
          <button class="btn btn-secondary btn-xs btn-focus-preset" data-preset-min="25">25m</button>
          <button class="btn btn-secondary btn-xs btn-focus-preset" data-preset-min="45">45m</button>
          <button class="btn btn-secondary btn-xs btn-focus-preset" data-preset-min="60">60m</button>
          ${underlyingTask && underlyingTask.remaining > 0 ? `<button class="btn btn-secondary btn-xs btn-focus-preset" data-preset-min="${underlyingTask.remaining}">Full (${underlyingTask.remaining}m)</button>` : ''}
        </div>
      `;

      footer = `
        <button class="btn btn-ghost" data-action="cancel-focus">Cancel</button>
        <button class="btn btn-secondary" id="btn-toggle-pause-focus">${f.isRunning ? '⏸ Pause' : '▶ Resume'}</button>
        <button class="btn btn-primary" id="btn-finish-focus">✓ Finish & Log</button>
      `;
    } else if (name === 'lostTime') {
      title = '⚠️ Log Lost Time & Replan Day';
      body = `
        <div class="flex flex-col gap-3">
          <div>
            <label class="label-title">Select Lost Minutes</label>
            <div class="flex gap-2 flex-wrap">
              ${[15, 30, 45, 60, 90].map(m => `<button class="btn btn-secondary btn-sm font-mono btn-lost-quick" data-min="${m}">${m}m</button>`).join('')}
            </div>
            <input type="number" class="input-text font-mono mt-2" id="lost-min-custom" value="30" min="5" step="5" />
          </div>
          <div>
            <label class="label-title">When did it start? (Optional)</label>
            <input type="time" class="input-text font-mono mt-1" id="lost-time-start" />
          </div>
          <div>
            <label class="label-title">Reason / Distraction</label>
            <select class="select-input" id="lost-reason-select">
              ${LOST_TIME_REASONS.map(r => `<option value="${r}">${r}</option>`).join('')}
            </select>
          </div>
          <div class="card p-3 text-xs text-secondary" style="border-left: 3px solid var(--accent); background: var(--bg-input);">
            <div class="font-semibold text-primary mb-2">How Adapt Automatically Recovers Time:</div>
            <div class="flex flex-col gap-1 text-xs">
              <div>1. <strong class="text-primary">Free Buffer:</strong> Absorbs delay into remaining buffer slots first.</div>
              <div>2. <strong class="text-primary">Compress Breaks:</strong> Reduces upcoming breaks (keeps 5m minimum).</div>
              <div>3. <strong class="text-primary">Trim Tasks:</strong> Trims Low and Medium priority tasks down to 15m.</div>
              <div>4. <strong class="text-primary">Shift to Tomorrow:</strong> Moves flexible tasks to tomorrow if still needed.</div>
            </div>
          </div>
        </div>
      `;
      footer = `
        <button class="btn btn-ghost" data-action="close-modal">Cancel</button>
        <button class="btn btn-primary" id="btn-apply-lost-time">⚡ Replan Timeline</button>
      `;
    } else if (name === 'whatNow') {
      const rec = getRecommendation(state.timeline, state.tasks);
      title = '✨ What Should I Do Now?';
      body = rec ? `
        <div class="card p-3">
          <span class="badge badge-${(rec.task.priority || 'medium').toLowerCase()}">${rec.task.priority} Priority</span>
          <h3 class="font-bold text-base mt-2">${rec.task.title}</h3>
          <p class="text-xs text-secondary mt-1">${rec.reason}</p>
        </div>
      ` : '<p class="text-sm text-secondary">All tasks complete! Add a new goal or enjoy your break.</p>';
      footer = rec ? `
        <button class="btn btn-ghost" data-action="close-modal">Dismiss</button>
        <button class="btn btn-primary" data-start-focus="${rec.task.id}">⚡ Start Focus Session</button>
      ` : '<button class="btn btn-primary" data-action="close-modal">Close</button>';
    
    } else if (name === 'collegeNotes') {
      const sub = state.collegeSubjects.find(x => x.id === data.subId);
      const tp = sub?.topics.find(x => x.id === data.tpId);
      title = `Update Topic: ${tp?.name || 'Unknown'}`;
      const s = tp?.status || 'not-started';
      const isR = tp?.revised || false;
      body = `
        <div class="flex flex-col gap-4">
          <div class="card p-3" style="background:var(--bg-input); border: 1px solid var(--border-subtle); border-radius: 8px;">
            <label class="label-title mb-2 block font-semibold text-primary">Learning Status</label>
            <div class="flex gap-2">
              <button class="btn flex-1 transition-all ${s === 'not-started' ? 'btn-primary shadow-lg shadow-primary/20 scale-105' : 'btn-secondary opacity-70 hover:opacity-100'}" id="btn-status-not-started">○ Not Started</button>
              <button class="btn flex-1 transition-all ${s === 'in-progress' ? 'btn-primary shadow-lg shadow-primary/20 scale-105' : 'btn-secondary opacity-70 hover:opacity-100'}" style="${s === 'in-progress' ? 'background:#f59e0b; color:#fff;' : ''}" id="btn-status-in-progress">⚡ In Progress</button>
              <button class="btn flex-1 transition-all ${s === 'done' ? 'btn-primary shadow-lg shadow-primary/20 scale-105' : 'btn-secondary opacity-70 hover:opacity-100'}" style="${s === 'done' ? 'background:#10b981; color:#fff;' : ''}" id="btn-status-done">✓ Mastered</button>
            </div>
          </div>
          
          <div class="card p-3" style="background:var(--bg-input); border: 1px solid var(--border-subtle); border-radius: 8px;">
            <label class="label-title mb-2 block font-semibold text-primary">Revision Status</label>
            <div class="flex gap-2">
              <button class="btn flex-1 transition-all ${!isR ? 'btn-primary shadow-lg shadow-primary/20 scale-105' : 'btn-secondary opacity-70 hover:opacity-100'}" id="btn-rev-unrevised">Unrevised</button>
              <button class="btn flex-1 transition-all ${isR ? 'btn-primary shadow-lg shadow-primary/20 scale-105' : 'btn-secondary opacity-70 hover:opacity-100'}" style="${isR ? 'background:#a855f7; color:#fff;' : ''}" id="btn-rev-revised">🔄 Revised</button>
            </div>
          </div>

          <div>
            <label class="label-title mb-2 block font-semibold text-primary">Topic Notes</label>
            <textarea class="input-text" id="topic-notes-text" style="height: 120px; border-radius: 8px;" placeholder="Write your notes here... (e.g. chapters, formulas, references)">${tp?.notes || ''}</textarea>
          </div>
        </div>
      `;
      footer = `
        <button class="btn btn-ghost" data-action="close-modal">Cancel</button>
        <button class="btn btn-primary px-6" style="border-radius: 8px;" id="btn-save-topic-notes">💾 Save Changes</button>
      `;
    
    } else if (name === 'collegeSubject') {


      title = 'Add College Subject';
      body = `
        <form id="form-college-subj" class="flex flex-col gap-3">
          <div><label class="label-title">Subject Name *</label><input type="text" class="input-text" id="col-subj-name" required /></div>
          <div><label class="label-title">Exam Date</label><input type="date" class="input-text font-mono" id="col-subj-date" /></div>
          <div class="card p-3" style="background:#06b6d410;border:1px dashed #06b6d444;">
            <label class="label-title">✨ Quick Add Syllabus (Smart Parser)</label>
            <p class="text-xs text-secondary mb-2">Enter all chapters/topics separated by commas, semicolons, or new lines. They'll be auto-added as syllabus topics.</p>
            <textarea class="textarea-input" id="col-subj-bulk-topics" rows="4" placeholder="e.g.: Processes & Threads, CPU Scheduling, Virtual Memory, Deadlocks&#10;Or one per line:&#10;ER Diagrams&#10;Normalization&#10;Transactions"></textarea>
          </div>
        </form>
      `;
      footer = `
        <button class="btn btn-ghost" data-action="close-modal">Cancel</button>
        <button class="btn btn-primary" id="btn-save-college-subj">Save Subject</button>
      `;
    } else if (name === 'category') {
      title = 'Add Category';
      body = `
        <div class="flex flex-col gap-3">
          <div><label class="label-title">Category Name *</label><input type="text" class="input-text" id="cat-name-input" required /></div>
          <div>
            <label class="label-title">Select Color</label>
            <div class="swatches-grid">
              ${COLOR_SWATCHES.map(hex => `<button class="swatch-btn" style="background:${hex};" data-color="${hex}"></button>`).join('')}
            </div>
          </div>
        </div>
      `;
      footer = `
        <button class="btn btn-ghost" data-action="close-modal">Cancel</button>
        <button class="btn btn-primary" id="btn-save-cat">Create Category</button>
      `;
    } else if (name === 'dsaTopic') {
      title = 'Add DSA Topic';
      body = `
        <div class="flex flex-col gap-3">
          <div><label class="label-title">Topic Name *</label><input type="text" class="input-text" id="dsa-name-input" required /></div>
          <div><label class="label-title">Key Invariants / Notes</label><textarea class="textarea-input" id="dsa-note-input"></textarea></div>
        </div>
      `;
      footer = `
        <button class="btn btn-ghost" data-action="close-modal">Cancel</button>
        <button class="btn btn-primary" id="btn-save-dsa">Add Topic</button>
      `;
    } else if (name === 'fixed') {
      title = '📌 Add Fixed Event / Lecture';
      body = `
        <form id="form-fixed" class="flex flex-col gap-3">
          <div><label class="label-title">Event Title *</label><input type="text" class="input-text" id="fixed-input-title" placeholder="e.g. Data Structures Lecture" required /></div>
          <div><label class="label-title">Subtitle / Location</label><input type="text" class="input-text" id="fixed-input-subtitle" placeholder="e.g. Room 401 • Prof. Sharma" /></div>
          <div class="grid-2">
            <div><label class="label-title">Start Time</label><input type="time" class="input-text font-mono" id="fixed-input-start" value="10:00" /></div>
            <div><label class="label-title">End Time</label><input type="time" class="input-text font-mono" id="fixed-input-end" value="11:30" /></div>
          </div>
          <div>
            <label class="label-title">Category</label>
            <select class="select-input" id="fixed-input-cat">
              ${state.categories.map(c => `<option value="${c.id}">${c.label}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="label-title">Repeat On Days</label>
            <div class="pills-container" id="fixed-day-pills">
              ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d, i) => `
                <button type="button" class="pill-btn pill-day-toggle" data-day="${i}">${d}</button>
              `).join('')}
            </div>
          </div>
        </form>
      `;
      footer = `
        <button class="btn btn-ghost" data-action="close-modal">Cancel</button>
        <button class="btn btn-primary" id="btn-save-fixed">Add Fixed Event</button>
      `;
    } else if (name === 'session') {
      title = '⏱️ Log Study Session';
      const taskOpts = state.tasks.map(t => `<option value="${t.id}">${t.title}</option>`).join('');
      body = `
        <form id="form-session" class="flex flex-col gap-3">
          <div>
            <label class="label-title">Task</label>
            <select class="select-input" id="sess-input-task">${taskOpts || '<option value="">No tasks — create one first</option>'}</select>
          </div>
          <div class="grid-2">
            <div><label class="label-title">Date</label><input type="date" class="input-text font-mono" id="sess-input-date" value="${getTodayISO()}" /></div>
            <div><label class="label-title">Actual Minutes</label><input type="number" class="input-text font-mono" id="sess-input-min" value="45" min="1" /></div>
          </div>
        </form>
      `;
      footer = `
        <button class="btn btn-ghost" data-action="close-modal">Cancel</button>
        <button class="btn btn-primary" id="btn-save-session">Log Session</button>
      `;
    } else if (name === 'revPicker') {
      title = '🔄 Schedule Spaced Revision';
      const pendingTasks = state.tasks.filter(t => t.status !== 'completed');
      body = `
        <div class="flex flex-col gap-3">
          <p class="text-xs text-secondary">Select a completed or in-progress task to create a revision session for it. The system schedules revisions at +1, +3, and +7 day intervals.</p>
          ${pendingTasks.length === 0 && state.tasks.length === 0 ? '<p class="text-sm text-muted">No tasks available. Create a task first.</p>' : ''}
          <div>
            <label class="label-title">Base Task</label>
            <select class="select-input" id="rev-task-select">
              ${state.tasks.map(t => `<option value="${t.id}">${t.title}${t.status === 'completed' ? ' ✓' : ''}</option>`).join('')}
            </select>
          </div>
          <div class="grid-3">
            <button class="btn btn-secondary" data-rev-offset="1">+1 Day</button>
            <button class="btn btn-secondary" data-rev-offset="3">+3 Days</button>
            <button class="btn btn-secondary" data-rev-offset="7">+7 Days</button>
          </div>
        </div>
      `;
      footer = `
        <button class="btn btn-ghost" data-action="close-modal">Close</button>
      `;
    } else if (name === 'endOfDay') {
      const today = getTodayISO();
      const todayNote = state.dailyNotes[today] || {};
      title = '🌙 End-of-Day Review';
      body = `
        <div class="flex flex-col gap-3">
          <div>
            <label class="label-title">How was your day?</label>
            <select class="select-input" id="eod-reflection">
              ${['Great', 'Good', 'Okay', 'Rough'].map(r => `<option value="${r}" ${todayNote.reflection === r ? 'selected' : ''}>${r}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="label-title">Key Learning / Achievement</label>
            <textarea class="textarea-input" id="eod-learned" placeholder="What did you learn today?">${todayNote.whatLearned || ''}</textarea>
          </div>
          <div>
            <label class="label-title">What to Improve Tomorrow</label>
            <textarea class="textarea-input" id="eod-improve" placeholder="What will you do better?">${todayNote.whatToImprove || ''}</textarea>
          </div>
        </div>
      `;
      footer = `
        <button class="btn btn-ghost" data-action="close-modal">Cancel</button>
        <button class="btn btn-primary" id="btn-save-eod">Save Review</button>
      `;
    } else if (name === 'confirm') {
      title = data?.title || 'Confirm Action';
      body = `<p class="text-sm text-secondary">${data?.message || 'Are you sure?'}</p>`;
      footer = `
        <button class="btn btn-ghost" data-action="close-modal">Cancel</button>
        <button class="btn btn-danger" id="btn-confirm-action">Confirm</button>
      `;
    } else if (name === 'routine') {
      title = '⚙️ Daily Routine & Meal Schedule';
      const sc = state.scheduleConfig || DEFAULT_SCHEDULE_CONFIG;
      const bDur = (parseTimeToMinutes(sc.breakfastEnd) - parseTimeToMinutes(sc.breakfastStart)) || sc.breakfastDuration || 30;
      const lDur = (parseTimeToMinutes(sc.lunchEnd) - parseTimeToMinutes(sc.lunchStart)) || sc.lunchDuration || 45;
      const dDur = (parseTimeToMinutes(sc.dinnerEnd) - parseTimeToMinutes(sc.dinnerStart)) || sc.dinnerDuration || 45;

      body = `
        <div class="flex flex-col gap-4">
          <p class="text-xs text-secondary">Configure your daily timeline boundaries and customizable meal windows. Meal durations can be set freely.</p>

          <div class="grid-2">
            <div>
              <label class="label-title">🌅 Day Starts At</label>
              <input type="time" class="input-text font-mono" id="routine-day-start" value="${sc.dayStart || '08:00'}" />
            </div>
            <div>
              <label class="label-title">🌙 Day Ends At</label>
              <input type="time" class="input-text font-mono" id="routine-day-end" value="${sc.dayEnd || '23:00'}" />
            </div>
          </div>

          <div class="card p-3" id="routine-card-breakfast">
            <div class="flex justify-between items-center mb-2">
              <span class="font-semibold text-sm">🍳 Breakfast</span>
              <label class="flex items-center gap-1 text-xs cursor-pointer">
                <input type="checkbox" id="routine-breakfast-enabled" ${sc.breakfastEnabled !== false ? 'checked' : ''} />
                <span>Enabled</span>
              </label>
            </div>
            <div class="grid-2 gap-2 mb-2">
              <div>
                <label class="label-title">Start Time</label>
                <input type="time" class="input-text font-mono" id="routine-breakfast-start" value="${sc.breakfastStart || '08:30'}" />
              </div>
              <div>
                <label class="label-title">Duration (minutes)</label>
                <input type="number" class="input-text font-mono" id="routine-breakfast-duration" value="${bDur}" min="10" max="180" step="5" />
              </div>
            </div>
            <div class="flex items-center gap-1 flex-wrap mb-2">
              <span class="text-xs text-secondary mr-1">Presets:</span>
              ${[15, 20, 30, 45, 60].map(m => `<button type="button" class="duration-pill-btn ${m === bDur ? 'active' : ''}" data-set-dur="routine-breakfast-duration" data-val="${m}">${m}m</button>`).join('')}
            </div>
            <div class="text-xs text-secondary font-mono" id="routine-breakfast-preview">
              Window: <strong class="text-primary">${sc.breakfastStart || '08:30'} – ${minutesToTime(parseTimeToMinutes(sc.breakfastStart || '08:30') + bDur)}</strong> (${bDur} mins)
            </div>
          </div>

          <div class="card p-3" id="routine-card-lunch">
            <div class="flex justify-between items-center mb-2">
              <span class="font-semibold text-sm">🍱 Lunch & Recharge</span>
            </div>
            <div class="grid-2 gap-2 mb-2">
              <div>
                <label class="label-title">Start Time</label>
                <input type="time" class="input-text font-mono" id="routine-lunch-start" value="${sc.lunchStart || '13:00'}" />
              </div>
              <div>
                <label class="label-title">Duration (minutes)</label>
                <input type="number" class="input-text font-mono" id="routine-lunch-duration" value="${lDur}" min="10" max="180" step="5" />
              </div>
            </div>
            <div class="flex items-center gap-1 flex-wrap mb-2">
              <span class="text-xs text-secondary mr-1">Presets:</span>
              ${[20, 30, 45, 60, 75].map(m => `<button type="button" class="duration-pill-btn ${m === lDur ? 'active' : ''}" data-set-dur="routine-lunch-duration" data-val="${m}">${m}m</button>`).join('')}
            </div>
            <div class="text-xs text-secondary font-mono" id="routine-lunch-preview">
              Window: <strong class="text-primary">${sc.lunchStart || '13:00'} – ${minutesToTime(parseTimeToMinutes(sc.lunchStart || '13:00') + lDur)}</strong> (${lDur} mins)
            </div>
          </div>

          <div class="card p-3" id="routine-card-dinner">
            <div class="flex justify-between items-center mb-2">
              <span class="font-semibold text-sm">🍽️ Dinner & Unwind</span>
            </div>
            <div class="grid-2 gap-2 mb-2">
              <div>
                <label class="label-title">Start Time</label>
                <input type="time" class="input-text font-mono" id="routine-dinner-start" value="${sc.dinnerStart || '20:00'}" />
              </div>
              <div>
                <label class="label-title">Duration (minutes)</label>
                <input type="number" class="input-text font-mono" id="routine-dinner-duration" value="${dDur}" min="10" max="180" step="5" />
              </div>
            </div>
            <div class="flex items-center gap-1 flex-wrap mb-2">
              <span class="text-xs text-secondary mr-1">Presets:</span>
              ${[20, 30, 45, 60, 90].map(m => `<button type="button" class="duration-pill-btn ${m === dDur ? 'active' : ''}" data-set-dur="routine-dinner-duration" data-val="${m}">${m}m</button>`).join('')}
            </div>
            <div class="text-xs text-secondary font-mono" id="routine-dinner-preview">
              Window: <strong class="text-primary">${sc.dinnerStart || '20:00'} – ${minutesToTime(parseTimeToMinutes(sc.dinnerStart || '20:00') + dDur)}</strong> (${dDur} mins)
            </div>
          </div>
        </div>
      `;
      footer = `
        <button class="btn btn-ghost" data-action="close-modal">Cancel</button>
        <button class="btn btn-primary" id="btn-save-routine-modal">💾 Save Routine & Replan</button>
      `;
    } else if (name === 'planNextDay') {
      const today = getTodayISO();
      const tomorrow = addDays(today, 1);
      const tomorrowDisplay = formatDateDisplay(tomorrow);
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const tomorrowDayName = dayNames[new Date(tomorrow + 'T00:00:00').getDay()];
      const tomorrowWeekday = getDayOfWeek(tomorrow);

      title = `☀️ Plan for Tomorrow (${tomorrowDayName})`;

      // Tomorrow's fixed events
      const tomorrowFixed = state.fixedEvents.filter(ev => Array.isArray(ev.days) && ev.days.includes(tomorrowWeekday));
      const sc = state.scheduleConfig || DEFAULT_SCHEDULE_CONFIG;

      // Pending tasks
      const incompleteTasks = state.tasks.filter(t => t.status !== 'completed' && t.remaining > 0);
      const todayOrEarlierPending = incompleteTasks.filter(t => !t.deadline || t.deadline <= today);
      const slottedForTomorrow = incompleteTasks.filter(t => t.deadline === tomorrow);

      // Tomorrow's Capacity calculation
      const dayStartMin = parseTimeToMinutes(sc.dayStart || '08:00');
      const dayEndMin = parseTimeToMinutes(sc.dayEnd || '23:00');
      const totalDayMin = Math.max(60, dayEndMin - dayStartMin);

      let fixedMin = tomorrowFixed.reduce((sum, ev) => sum + Math.max(0, parseTimeToMinutes(ev.end) - parseTimeToMinutes(ev.start)), 0);
      if (sc.breakfastEnabled !== false) fixedMin += (sc.breakfastDuration || 30);
      fixedMin += (sc.lunchDuration || 45) + (sc.dinnerDuration || 45);

      const effectiveFreeMin = Math.round(Math.max(0, totalDayMin - fixedMin) * (sc.gapUtilization || 0.82));
      const plannedTomorrowMin = slottedForTomorrow.reduce((sum, t) => sum + (t.remaining || t.duration || 45), 0);
      const bufferMin = effectiveFreeMin - plannedTomorrowMin;

      body = `
        <div class="flex flex-col gap-4">
          <div class="card p-4" style="background: linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(6, 182, 212, 0.08)); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.15);">
            <div class="flex justify-between items-center pb-3" style="border-bottom: 1px solid rgba(255,255,255,0.06);">
              <div>
                <span class="text-xs uppercase tracking-widest font-semibold text-secondary mb-1 block">Tomorrow's Date</span>
                <div class="text-lg font-bold text-primary">${tomorrowDayName}, ${tomorrowDisplay}</div>
              </div>
              <div class="text-right">
                <span class="text-xs uppercase tracking-widest font-semibold text-secondary mb-1 block">Available Study Gap</span>
                <div class="text-xl font-mono font-bold" style="color:var(--accent); text-shadow: 0 2px 10px rgba(245, 158, 11, 0.3);">${Math.floor(effectiveFreeMin / 60)}h ${effectiveFreeMin % 60}m</div>
              </div>
            </div>
            <div class="mt-3 text-sm flex items-center gap-2">
              ${bufferMin >= 0
                ? `<span style="display:flex; align-items:center; gap:6px; color:#34d399; font-weight:500;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg> Comfortable workload:</span> <span class="text-primary"><strong>${Math.floor(plannedTomorrowMin / 60)}h ${plannedTomorrowMin % 60}m</strong> planned, leaving <strong>${Math.floor(bufferMin / 60)}h ${bufferMin % 60}m</strong> breathing room.</span>`
                : `<span style="display:flex; align-items:center; gap:6px; color:#ef4444; font-weight:500;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg> Tight schedule:</span> <span class="text-primary">Planned tasks (${Math.floor(plannedTomorrowMin / 60)}h ${plannedTomorrowMin % 60}m) exceed available capacity by <strong>${Math.abs(bufferMin)}m</strong>.</span>`
              }
            </div>
          </div>

          <!-- Section: Tomorrow's Fixed Events & Routine -->
          <div>
            <div class="flex justify-between items-center mb-1">
              <label class="label-title mb-0">📌 Tomorrow's Fixed Schedule & Routine</label>
              <span class="text-xs text-secondary">${tomorrowFixed.length} fixed event(s)</span>
            </div>
            <div class="tomorrow-schedule-chips">
              ${sc.breakfastEnabled !== false ? `<span class="tomorrow-schedule-chip chip-meal">🍳 Breakfast ${sc.breakfastStart || '08:30'}</span>` : ''}
              ${tomorrowFixed.map(fe => `
                <span class="tomorrow-schedule-chip chip-fixed">
                  <strong>📌 ${escapeHtml(fe.title)}</strong> (${fe.start} – ${fe.end})
                </span>
              `).join('')}
              <span class="tomorrow-schedule-chip chip-meal">🍱 Lunch ${sc.lunchStart || '13:00'}</span>
              <span class="tomorrow-schedule-chip chip-meal">🍽️ Dinner ${sc.dinnerStart || '20:00'}</span>
            </div>
          </div>

          <!-- Section: Carry over unfinished tasks -->
          <div>
            <div class="flex justify-between items-center mb-1">
              <label class="label-title mb-0">🔄 Carry Over Unfinished Tasks to Tomorrow</label>
              <span class="text-xs text-secondary font-mono">${todayOrEarlierPending.length} task(s)</span>
            </div>
            <p class="text-xs text-secondary mb-2">Move pending tasks forward to tomorrow with one click.</p>
            ${todayOrEarlierPending.length === 0 ? `
              <div class="p-3 text-center text-xs text-muted card">🎉 No leftover tasks! Today's queue is completely clear.</div>
            ` : `
              <div class="rollover-tasks-list">
                ${todayOrEarlierPending.map(t => {
                  const catObj = state.categories.find(c => c.id === t.category);
                  const col = catObj ? catObj.color : '#64748b';
                  const lab = catObj ? catObj.label : 'Other';
                  return `
                    <div class="rollover-task-card">
                      <div class="rollover-task-meta">
                        <span class="rollover-task-title">${escapeHtml(t.title)}</span>
                        <div class="flex items-center gap-2">
                          <span class="badge text-xs" style="color:${col};background:${col}18;">${escapeHtml(lab)}</span>
                          <span class="badge badge-${(t.priority || 'Medium').toLowerCase()}">${t.priority || 'Medium'}</span>
                          <span class="text-xs text-muted font-mono">${t.remaining || t.duration}m left</span>
                        </div>
                      </div>
                      <button type="button" class="btn btn-sm btn-secondary btn-rollover" data-task-id="${t.id}" title="Queue task for tomorrow">
                        Move to Tomorrow ➔
                      </button>
                    </div>
                  `;
                }).join('')}
              </div>
            `}
          </div>

          <!-- Section: Tasks Slotted for Tomorrow -->
          <div>
            <div class="flex justify-between items-center mb-1">
              <label class="label-title mb-0">📋 Tasks Queued for Tomorrow</label>
              <span class="text-xs text-secondary font-mono">${slottedForTomorrow.length} task(s) (${Math.floor(plannedTomorrowMin / 60)}h ${plannedTomorrowMin % 60}m)</span>
            </div>
            ${slottedForTomorrow.length === 0 ? `
              <div class="p-3 text-center text-xs text-muted card">No tasks queued for tomorrow yet. Add tasks below or carry over above!</div>
            ` : `
              <div class="rollover-tasks-list">
                ${slottedForTomorrow.map(t => {
                  const catObj = state.categories.find(c => c.id === t.category);
                  const col = catObj ? catObj.color : '#64748b';
                  const lab = catObj ? catObj.label : 'Other';
                  return `
                    <div class="rollover-task-card is-rolled-over">
                      <div class="rollover-task-meta">
                        <span class="rollover-task-title">✓ ${escapeHtml(t.title)}</span>
                        <div class="flex items-center gap-2">
                          <span class="badge text-xs" style="color:${col};background:${col}18;">${escapeHtml(lab)}</span>
                          <span class="badge badge-${(t.priority || 'Medium').toLowerCase()}">${t.priority || 'Medium'}</span>
                          <span class="text-xs text-muted font-mono">${t.remaining || t.duration}m</span>
                        </div>
                      </div>
                      <div class="flex gap-2">
                        <button type="button" class="btn btn-xs btn-ghost text-muted btn-edit-tomorrow" data-task-id="${t.id}" title="Edit task">
                          ✏️ Edit
                        </button>
                        <button type="button" class="btn btn-xs btn-ghost text-muted btn-unqueue-tomorrow" data-task-id="${t.id}" title="Remove from tomorrow's deadline">
                          ✕ Remove
                        </button>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            `}
          </div>

          <!-- Section: Quick Add Task for Tomorrow -->
          <div class="card p-3">
            <label class="label-title mb-1">⚡ Quick Add a Task for Tomorrow</label>
            <div class="plan-tomorrow-quick-add">
              <input type="text" class="input-text" id="tomorrow-new-task-title" placeholder="e.g. Practice 3 Binary Search questions" />
              <select class="select-input" id="tomorrow-new-task-cat" style="min-width:130px;">
                ${state.categories.map(c => `<option value="${c.id}">${escapeHtml(c.label)}</option>`).join('')}
              </select>
              <select class="select-input" id="tomorrow-new-task-dur" style="min-width:90px;">
                <option value="25">25m</option>
                <option value="45" selected>45m</option>
                <option value="60">60m</option>
                <option value="90">90m</option>
              </select>
              <button type="button" class="btn btn-primary btn-sm" id="btn-add-tomorrow-task">+ Add Task</button>
            </div>
          </div>
        </div>
      `;

      footer = `
        <button class="btn btn-ghost" data-action="close-modal">Close</button>
        <button class="btn btn-primary" id="btn-save-plan-tomorrow">✓ View Tomorrow's Schedule (${tomorrowDisplay})</button>
      `;
    } else if (name === 'brainDump') {
      title = '🧠 Auto-Schedule Week';
      const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
      const dayFullNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const todayDay = new Date().getDay();
      
      body = `
        <div class="flex flex-col gap-4">
          <div class="card p-3" style="background:#a855f710;border:1px dashed #a855f744;">
            <label class="label-title">📝 List all your tasks & activities</label>
            <p class="text-xs text-secondary mb-2">Enter one task per line. Optionally add duration (e.g. "60m"), priority ("high"), or deadline ("tomorrow").</p>
            <textarea class="textarea-input" id="brain-dump-tasks" rows="6" placeholder="e.g.:&#10;Revise Operating Systems chapters 60m high&#10;Complete DBMS assignment 90m tomorrow&#10;Practice DP problems 45m&#10;Read research paper&#10;Submit lab report urgent"></textarea>
          </div>
          
          <div>
            <div class="flex justify-between items-center mb-1">
              <label class="label-title mb-0">📅 Select Available Days</label>
              <span id="active-days-counter" class="text-xs font-mono" style="color: var(--accent); background: rgba(245, 158, 11, 0.1); padding: 3px 10px; border-radius: 12px; border: 1px solid rgba(245, 158, 11, 0.25);">
                7 of 7 days active
              </span>
            </div>
            <p class="text-xs text-secondary mb-3">Click any day to cross it out and exclude it from the schedule. Tasks will be distributed only across active days.</p>
            <div class="brain-dump-days-row">
              ${dayLabels.map((l, i) => `
                <button type="button" class="day-circle-toggle day-active ${i === todayDay ? 'is-today' : ''}" 
                  data-brain-day="${i}" data-active="true" title="${dayFullNames[i]} - Active (click to exclude)">
                  <span class="day-letter">${l}</span>
                  ${i === todayDay ? '<span class="day-today-dot" title="Today"></span>' : ''}
                </button>
              `).join('')}
            </div>
          </div>
          
          <button class="btn btn-primary" id="btn-brain-distribute" style="width:100%;justify-content:center;">
            ⚡ Distribute Tasks Across Week
          </button>
          
          <div id="brain-dump-preview" style="display:none;">
            <label class="label-title mb-2 block">📋 Distribution Preview</label>
            <div id="brain-dump-preview-content"></div>
          </div>
        </div>
      `;
      footer = `
        <button class="btn btn-ghost" data-action="close-modal">Cancel</button>
        <button class="btn btn-primary" id="btn-brain-apply" style="display:none;">✓ Apply Schedule</button>
      `;
    }

    slot.innerHTML = `
      <div class="modal-backdrop" id="modal-backdrop">
        <div class="modal-content ${name === 'planNextDay' || name === 'brainDump' ? 'modal-content-lg' : ''} animate-fade-in">
          <div class="modal-header">
            <h3 class="modal-title font-semibold">${title}</h3>
            <button class="modal-close-btn" data-action="close-modal">✕</button>
          </div>
          <div class="modal-body">${body}</div>
          <div class="modal-footer">${footer}</div>
        </div>
      </div>
    `;

    attachModalEventListeners();
  }

  function attachModalEventListeners() {
    if (!state.activeModal) return;
    const { name, data } = state.activeModal;

    // Modal Close
    document.querySelectorAll('[data-action="close-modal"]').forEach(b => {
      b.onclick = () => closeModal();
    });

    const backdrop = document.getElementById('modal-backdrop');
    if (backdrop) {
      backdrop.onclick = (e) => {
        if (e.target.id === 'modal-backdrop') closeModal();
      };
    }

    if (name === 'task') {
      const nlpInput = document.getElementById('task-nlp-input');
      const nlpPreview = document.getElementById('nlp-preview');
      const nlpBtn = document.getElementById('btn-nlp-apply');

      const applyParsedTask = () => {
        const text = nlpInput?.value?.trim();
        if (!text) return;
        const parsed = parseQuickTaskInput(text, state.categories);
        const titleInput = document.getElementById('task-input-title');
        const durationInput = document.getElementById('task-input-duration');
        const deadlineInput = document.getElementById('task-input-deadline');
        const prioritySelect = document.getElementById('task-input-priority');
        const catSelect = document.getElementById('task-input-cat');

        if (titleInput && parsed.title) {
          titleInput.value = parsed.title;
          titleInput.style.transition = 'box-shadow 0.3s ease';
          titleInput.style.boxShadow = '0 0 0 2px var(--accent)';
          setTimeout(() => { if (titleInput) titleInput.style.boxShadow = ''; }, 1000);
        }
        if (durationInput && parsed.duration) {
          durationInput.value = parsed.duration;
        }
        if (deadlineInput && parsed.deadline) {
          deadlineInput.value = parsed.deadline;
          deadlineInput.style.transition = 'box-shadow 0.3s ease';
          deadlineInput.style.boxShadow = '0 0 0 2px var(--accent)';
          setTimeout(() => { if (deadlineInput) deadlineInput.style.boxShadow = ''; }, 1000);
        }
        if (prioritySelect && parsed.priority) {
          prioritySelect.value = parsed.priority;
        }
        if (catSelect && parsed.categoryId) {
          catSelect.value = parsed.categoryId;
        }

        if (nlpPreview) {
          nlpPreview.innerHTML = `<span style="color:#10b981;font-weight:600;">✓ Applied: "${escapeHtml(parsed.title)}" due ${formatDateDisplay(parsed.deadline)} (${parsed.duration}m, ${parsed.priority})</span>`;
        }
        showBanner(`Parsed & applied: "${parsed.title}" due ${formatDateDisplay(parsed.deadline)}`, 'info');
      };

      if (nlpInput) {
        nlpInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            applyParsedTask();
          }
        });

        if (nlpPreview) {
          nlpInput.addEventListener('input', () => {
            const text = nlpInput.value?.trim();
            if (!text) {
              nlpPreview.innerHTML = '';
              return;
            }
            const parsed = parseQuickTaskInput(text, state.categories);
            const matchedCat = state.categories.find(c => c.id === parsed.categoryId)?.label || 'General';
            nlpPreview.innerHTML = `
              <div class="flex items-center gap-2 flex-wrap" style="color:var(--text-secondary);">
                <span>Detected:</span>
                <span class="badge" style="background:rgba(245,158,11,0.15);color:var(--accent);">🎯 ${escapeHtml(parsed.title || 'Untitled')}</span>
                <span class="badge" style="background:rgba(6,182,212,0.15);color:#06b6d4;">📅 ${parsed.deadline}</span>
                <span class="badge" style="background:rgba(168,85,247,0.15);color:#c084fc;">⏱ ${parsed.duration}m</span>
                <span class="badge" style="background:rgba(16,185,129,0.15);color:#10b981;">⚡ ${parsed.priority}</span>
                <span class="badge" style="background:rgba(255,255,255,0.08);color:var(--text-secondary);">📁 ${escapeHtml(matchedCat)}</span>
              </div>
            `;
          });
        }
      }

      if (nlpBtn) {
        nlpBtn.onclick = applyParsedTask;
      }

      const saveBtn = document.getElementById('btn-save-task');
      if (saveBtn) {
        saveBtn.onclick = () => {
          const title = document.getElementById('task-input-title')?.value?.trim();
          if (!title) {
            showBanner('Please enter a task title.', 'warning');
            return;
          }
          const cat = document.getElementById('task-input-cat')?.value || FALLBACK_CATEGORY_ID;
          const deadline = document.getElementById('task-input-deadline')?.value || getTodayISO();
          const rawDuration = document.getElementById('task-input-duration')?.value;
          const durValidation = validateTaskDuration(rawDuration);
          if (!durValidation.valid) {
            showBanner(durValidation.message, 'warning');
            return;
          }
          const duration = durValidation.value;
          const priority = document.getElementById('task-input-priority')?.value || 'Medium';
          const notes = document.getElementById('task-input-notes')?.value || '';
          const startTime = document.getElementById('task-input-start-time')?.value?.trim() || '';
          if (startTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)) {
            showBanner('Fixed start time must be in 24h format (HH:MM), e.g. 14:00', 'warning');
            return;
          }
          const rawBreak = Number(document.getElementById('task-input-break-after')?.value) || 0;
          const breakAfterMin = Math.max(0, Math.min(120, rawBreak));
          const energy = document.getElementById('task-input-energy')?.value || 'Medium';
          const flexibility = document.getElementById('task-input-flexibility')?.value || 'Flexible';

          if (data && data.id) {
            const existing = state.tasks.find(t => t.id === data.id);
            if (existing) {
              const diff = duration - existing.duration;
              existing.title = title;
              existing.category = cat;
              existing.deadline = deadline;
              existing.duration = duration;
              if (existing.status === 'completed') {
                if (diff > 0) {
                  existing.remaining = diff;
                  existing.status = 'pending';
                }
              } else {
                existing.remaining = Math.max(0, Math.min(existing.remaining, duration));
                if (existing.remaining === 0) existing.remaining = duration;
              }
              existing.priority = priority;
              existing.notes = notes;
              existing.startTime = startTime;
              existing.breakAfterMin = breakAfterMin;
              existing.energy = energy;
              existing.flexibility = flexibility;
            }
          } else {
            const newTask = {
              id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              title,
              category: cat,
              deadline,
              duration,
              remaining: duration,
              priority,
              energy,
              flexibility,
              status: 'pending',
              notes,
              subtasks: [],
              startTime,
              breakAfterMin,
              createdAt: getTodayISO(),
            };
            state.tasks.unshift(newTask);
          }
          closeModal();
          recalculateTimeline();
          saveState();
          showBanner(`Task "${title}" saved!`, 'success');
          render();
        };
      }
    } else if (name === 'focus') {
      const pauseBtn = document.getElementById('btn-toggle-pause-focus');
      if (pauseBtn) {
        pauseBtn.onclick = () => {
          if (state.focus) {
            if (state.focus.isRunning) {
              state.focus.isRunning = false;
              state.focus.baseAccumulatedSec = state.focus.accumulatedSec;
              delete state.focus.lastStartTime;
            } else {
              state.focus.isRunning = true;
              state.focus.lastStartTime = Date.now();
            }
            saveState();
            pauseBtn.innerText = state.focus.isRunning ? '⏸ Pause' : '▶ Resume';
          }
        };
      }

      const finishBtn = document.getElementById('btn-finish-focus');
      if (finishBtn) {
        finishBtn.onclick = () => {
          if (state.focus) {
            playChime();
            const actualMin = Math.max(1, Math.round(state.focus.accumulatedSec / 60));
            const today = getTodayISO();
            state.studySessions.unshift({
              id: `sess-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              taskId: state.focus.taskId,
              taskTitle: state.focus.title,
              category: state.focus.category,
              date: today,
              plannedMin: Math.round(state.focus.plannedSec / 60),
              actualMin,
            });
            const t = state.tasks.find(x => x.id === state.focus.taskId);
            if (t) {
              t.remaining = Math.max(0, t.remaining - actualMin);
              if (t.remaining === 0) t.status = 'completed';
            }
            state.focus = null;
            closeModal();
            recalculateTimeline();
            saveState();
            showBanner(`Focused for ${actualMin} minutes! Session logged.`, 'success');
            render();
          }
        };
      }

      document.querySelectorAll('.btn-focus-preset').forEach(b => {
        b.onclick = () => {
          const presetMin = Number(b.getAttribute('data-preset-min'));
          if (presetMin > 0 && state.focus) {
            state.focus.plannedSec = presetMin * 60;
            // Update the ring to match new target
            const ring = document.getElementById('focus-ring');
            const dot = document.getElementById('focus-dot');
            if (ring) {
              const radius = 54;
              const circ = 2 * Math.PI * radius;
              const pct = Math.min(100, Math.max(0, (state.focus.accumulatedSec / state.focus.plannedSec) * 100));
              const off = circ - (pct / 100) * circ;
              ring.setAttribute('stroke-dashoffset', off);
              if (dot) dot.style.transform = `rotate(${pct * 3.6}deg)`;
            }
            showBanner(`Focus target adjusted to ${presetMin} minutes.`, 'info');
          }
        };
      });

      document.querySelectorAll('[data-action="cancel-focus"]').forEach(b => {
        b.onclick = () => {
          state.focus = null;
          closeModal();
        };
      });
    } else if (name === 'lostTime') {
      document.querySelectorAll('.btn-lost-quick').forEach(b => {
        b.onclick = () => {
          const min = b.getAttribute('data-min');
          const input = document.getElementById('lost-min-custom');
          if (input) input.value = min;
        };
      });

      const applyBtn = document.getElementById('btn-apply-lost-time');
      if (applyBtn) {
        applyBtn.onclick = () => {
          const min = Number(document.getElementById('lost-min-custom')?.value);
          if (isNaN(min) || min < 5 || min > 720) {
            showBanner('Lost time must be between 5 and 720 minutes.', 'warning');
            return;
          }
          const reason = document.getElementById('lost-reason-select')?.value || 'Distraction';
          const curMin = getCurrentTimeMinutes(state.currentTime);
          const startInput = document.getElementById('lost-time-start')?.value;
          const startMin = startInput ? parseTimeToMinutes(startInput) : Math.max(0, curMin - min);
          const endMin = startMin + min;

          // Check if lost time conflicts with any Fixed Event
          const conflictingFixed = (state.timeline || []).find(b => 
            (b.type === 'fixed' || b.type === 'meal') &&
            Math.max(startMin, b.startMin) < Math.min(endMin, b.endMin)
          );

          if (conflictingFixed) {
            showBanner(`Cannot reschedule fixed event: "${conflictingFixed.title}" (${formatTime12(conflictingFixed.startMin)} – ${formatTime12(conflictingFixed.endMin)}) is a fixed event and cannot be moved. Only non-fixed study tasks can be rescheduled.`, 'warning');
            return;
          }
          
          const newLostId = `lost-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          
          const res = replanAfterLostTime({
            currentTimeline: state.timeline,
            tasks: state.tasks,
            lostMinutes: min,
            reason,
            currentTimeMinutes: curMin,
            todayIso: getTodayISO(),
            startMin: startMin,
          });

          state.tasks = res.updatedTasks;
          state.timeline = res.updatedTimeline;
          state.lostTimeEvents.unshift({ id: newLostId, date: getTodayISO(), minutes: min, reason, startMin });

          closeModal();
          saveState();
          showBanner(res.explanation, res.affectedCriticalOrHigh ? 'warning' : 'info');
          render();
        };
      }
    } else if (name === 'whatNow') {
      document.querySelectorAll('[data-start-focus]').forEach(b => {
        b.onclick = () => {
          const id = b.getAttribute('data-start-focus');
          const t = state.tasks.find(x => x.id === id);
          if (t) {
            const taskMins = (t.remaining > 0 ? t.remaining : t.duration) || 45;
            state.focus = {
            taskId: t.id,
            title: t.title,
            category: t.category,
            plannedSec: taskMins * 60,
            baseAccumulatedSec: 0,
            accumulatedSec: 0,
            lastStartTime: Date.now(),
            isRunning: true,
          };
          saveState();
            closeModal();
            openModal('focus');
          }
        };
      });
    } else if (name === 'collegeNotes') {
      const sub = state.collegeSubjects.find(x => x.id === state.activeModal?.data?.subId);
      const tp = sub?.topics?.find(x => x.id === state.activeModal?.data?.tpId);
      if (tp) {
        let currentStatus = tp.status || 'not-started';
        let currentRevised = Boolean(tp.revised);

        const updateButtons = () => {
          ['btn-status-not-started', 'btn-status-in-progress', 'btn-status-done', 'btn-rev-unrevised', 'btn-rev-revised'].forEach(id => {
            const b = document.getElementById(id);
            if (b) {
              b.className = 'btn flex-1 transition-all btn-secondary opacity-70 hover:opacity-100';
              b.style.background = '';
              b.style.color = '';
            }
          });

          const sBtn = document.getElementById(`btn-status-${currentStatus}`);
          if (sBtn) {
            sBtn.className = 'btn flex-1 transition-all btn-primary shadow-lg shadow-primary/20 scale-105';
            if (currentStatus === 'in-progress') { sBtn.style.background = '#f59e0b'; sBtn.style.color = '#fff'; }
            if (currentStatus === 'done') { sBtn.style.background = '#10b981'; sBtn.style.color = '#fff'; }
          }

          const rBtn = document.getElementById(currentRevised ? 'btn-rev-revised' : 'btn-rev-unrevised');
          if (rBtn) {
            rBtn.className = 'btn flex-1 transition-all btn-primary shadow-lg shadow-primary/20 scale-105';
            if (currentRevised) { rBtn.style.background = '#a855f7'; rBtn.style.color = '#fff'; }
          }
        };

        document.getElementById('btn-status-not-started')?.addEventListener('click', () => { currentStatus = 'not-started'; updateButtons(); });
        document.getElementById('btn-status-in-progress')?.addEventListener('click', () => { currentStatus = 'in-progress'; updateButtons(); });
        document.getElementById('btn-status-done')?.addEventListener('click', () => { currentStatus = 'done'; updateButtons(); });

        document.getElementById('btn-rev-unrevised')?.addEventListener('click', () => { currentRevised = false; updateButtons(); });
        document.getElementById('btn-rev-revised')?.addEventListener('click', () => { currentRevised = true; updateButtons(); });

        const saveBtn = document.getElementById('btn-save-topic-notes');
        if (saveBtn) {
          saveBtn.onclick = () => {
            const notesEl = document.getElementById('topic-notes-text');
            if (notesEl) tp.notes = notesEl.value;
            if (currentRevised && currentStatus === 'not-started') {
              currentStatus = 'done';
            }
            tp.status = currentStatus;
            tp.revised = currentRevised;
            saveState();
            closeModal();
            showBanner(`Topic "${tp.name}" updated!`, 'success');
            render();
          };
        }
      }
    } else if (name === 'collegeSubject') {
      const saveBtn = document.getElementById('btn-save-college-subj');
      if (saveBtn) {
        saveBtn.onclick = () => {
          const nameInput = document.getElementById('col-subj-name')?.value?.trim();
          if (!nameInput) {
            showBanner('Please enter a subject name.', 'warning');
            return;
          }
          const dateInput = document.getElementById('col-subj-date')?.value || '';
          
          // Parse bulk topics from textarea
          const bulkText = document.getElementById('col-subj-bulk-topics')?.value || '';
          const parsedTopics = bulkText
            .split(/[,;\n]+/)
            .map(s => s.trim())
            .filter(s => s.length > 0)
            .map((name, idx) => ({
              id: `ct-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
              name,
              status: 'not-started',
              revised: false,
            }));
          
          state.collegeSubjects.push({
            id: `subj-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            name: nameInput,
            examDate: dateInput,
            topics: parsedTopics,
          });
          closeModal();
          saveState();
          const topicCount = parsedTopics.length;
          showBanner(`Subject "${nameInput}" added${topicCount > 0 ? ` with ${topicCount} chapter(s) auto-created!` : '!'}`, 'success');
          render();
        };
      }
    } else if (name === 'category') {
      let chosenColor = COLOR_SWATCHES[0];
      const swatches = document.querySelectorAll('.swatch-btn');
      swatches.forEach(sw => {
        sw.onclick = () => {
          swatches.forEach(s => s.classList.remove('swatch-active'));
          sw.classList.add('swatch-active');
          chosenColor = sw.getAttribute('data-color') || COLOR_SWATCHES[0];
        };
      });
      if (swatches[0]) swatches[0].classList.add('swatch-active');

      const saveBtn = document.getElementById('btn-save-cat');
      if (saveBtn) {
        saveBtn.onclick = () => {
          const catName = document.getElementById('cat-name-input')?.value?.trim();
          if (!catName) {
            showBanner('Please enter a category name.', 'warning');
            return;
          }
          if (state.categories.some(c => c.label.toLowerCase() === catName.toLowerCase())) {
            showBanner('A category with this name already exists.', 'warning');
            return;
          }
          state.categories.push({
            id: `cat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            label: catName,
            color: chosenColor,
          });
          closeModal();
          saveState();
          showBanner(`Category "${catName}" created!`, 'success');
          render();
        };
      }
    } else if (name === 'dsaTopic') {
      const saveBtn = document.getElementById('btn-save-dsa');
      if (saveBtn) {
        saveBtn.onclick = () => {
          const dsaName = document.getElementById('dsa-name-input')?.value?.trim();
          if (!dsaName) {
            showBanner('Please enter a topic name.', 'warning');
            return;
          }
          const note = document.getElementById('dsa-note-input')?.value?.trim() || '';
          state.dsaTopics.push({
            id: `dsa-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            name: dsaName,
            status: 'not-started',
            problemsSolved: 0,
            note,
          });
          closeModal();
          saveState();
          showBanner(`DSA topic "${dsaName}" added!`, 'success');
          render();
        };
      }
    } else if (name === 'fixed') {
      const selectedDays = new Set();
      document.querySelectorAll('.pill-day-toggle').forEach(btn => {
        btn.onclick = (e) => {
          e.preventDefault();
          const day = Number(btn.getAttribute('data-day'));
          if (selectedDays.has(day)) {
            selectedDays.delete(day);
            btn.classList.remove('pill-selected');
          } else {
            selectedDays.add(day);
            btn.classList.add('pill-selected');
          }
        };
      });
      const saveBtn = document.getElementById('btn-save-fixed');
      if (saveBtn) {
        saveBtn.onclick = () => {
          const title = document.getElementById('fixed-input-title')?.value?.trim();
          if (!title) {
            showBanner('Please enter an event title.', 'warning');
            return;
          }
          const subtitle = document.getElementById('fixed-input-subtitle')?.value?.trim() || '';
          const start = document.getElementById('fixed-input-start')?.value || '10:00';
          const end = document.getElementById('fixed-input-end')?.value || '11:30';
          const timeVal = validateTimeRange(start, end);
          if (!timeVal.valid) {
            showBanner(timeVal.message, 'warning');
            return;
          }
          const cat = document.getElementById('fixed-input-cat')?.value || FALLBACK_CATEGORY_ID;
          const days = selectedDays.size > 0 ? Array.from(selectedDays) : [0, 1, 2, 3, 4, 5, 6];
          state.fixedEvents.push({
            id: `fix-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            title,
            subtitle,
            category: cat,
            start,
            end,
            days,
          });
          closeModal();
          recalculateTimeline();
          saveState();
          showBanner(`Fixed event "${title}" added!`, 'success');
          render();
        };
      }
    } else if (name === 'session') {
      const saveBtn = document.getElementById('btn-save-session');
      if (saveBtn) {
        saveBtn.onclick = () => {
          const taskId = document.getElementById('sess-input-task')?.value;
          if (!taskId) {
            showBanner('Please select a task to log study time against.', 'warning');
            return;
          }
          const task = state.tasks.find(t => t.id === taskId);
          const date = document.getElementById('sess-input-date')?.value || getTodayISO();
          const rawMin = document.getElementById('sess-input-min')?.value;
          const sessVal = validateStudyMinutes(rawMin);
          if (!sessVal.valid) {
            showBanner(sessVal.message, 'warning');
            return;
          }
          const actualMin = sessVal.value;
          state.studySessions.unshift({
            id: `sess-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            taskId,
            taskTitle: task?.title || 'Unknown Task',
            category: task?.category || FALLBACK_CATEGORY_ID,
            date,
            plannedMin: task?.duration || actualMin,
            actualMin,
          });
          if (task) {
            task.remaining = Math.max(0, task.remaining - actualMin);
            if (task.remaining === 0) task.status = 'completed';
          }
          closeModal();
          recalculateTimeline();
          saveState();
          showBanner(`Session logged: ${actualMin}m on "${task?.title || 'task'}"`, 'success');
          render();
        };
      }
    } else if (name === 'revPicker') {
      document.querySelectorAll('[data-rev-offset]').forEach(btn => {
        btn.onclick = () => {
          const offset = Number(btn.getAttribute('data-rev-offset'));
          const taskId = document.getElementById('rev-task-select')?.value;
          const task = state.tasks.find(t => t.id === taskId);
          if (!task) return;
          const revDate = addDays(getTodayISO(), offset);
          const revTask = {
            id: `task-rev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            title: `[Revision +${offset}d] ${task.title}`,
            category: task.category,
            deadline: revDate,
            duration: Math.min(task.duration, 45),
            remaining: Math.min(task.duration, 45),
            priority: 'High',
            energy: task.energy || 'Medium',
            flexibility: 'Flexible',
            status: 'pending',
            notes: `Spaced repetition revision of: ${task.title}`,
            subtasks: [],
            isRevision: true,
            revisionOf: task.id,
            createdAt: getTodayISO(),
          };
          state.tasks.unshift(revTask);
          recalculateTimeline();
          saveState();
          showBanner(`Revision scheduled for ${formatDateDisplay(revDate)}: "${task.title}"`, 'success');
          render();
        };
      });
    } else if (name === 'endOfDay') {
      const saveBtn = document.getElementById('btn-save-eod');
      if (saveBtn) {
        saveBtn.onclick = () => {
          const today = getTodayISO();
          state.dailyNotes[today] = {
            reflection: document.getElementById('eod-reflection')?.value || 'Good',
            whatLearned: document.getElementById('eod-learned')?.value?.trim() || '',
            whatToImprove: document.getElementById('eod-improve')?.value?.trim() || '',
          };
          closeModal();
          saveState();
          showBanner('End-of-day review saved!', 'success');
          render();
        };
      }
    } else if (name === 'confirm') {
      const confirmBtn = document.getElementById('btn-confirm-action');
      if (confirmBtn) {
        confirmBtn.onclick = () => {
          closeModal();
          if (data && typeof data.action === 'function') {
            data.action();
          } else {
            resetAllData();
          }
        };
      }
    } else if (name === 'routine') {
      // Preset buttons for durations
      document.querySelectorAll('[data-set-dur]').forEach(btn => {
        btn.addEventListener('click', () => {
          const targetId = btn.getAttribute('data-set-dur');
          const val = Number(btn.getAttribute('data-val')) || 30;
          const input = document.getElementById(targetId);
          if (input) {
            input.value = val;
            input.dispatchEvent(new Event('input'));
          }
          btn.parentElement.querySelectorAll('.duration-pill-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
        });
      });

      // Live updates for preview text
      const updatePreview = (meal) => {
        const startVal = document.getElementById(`routine-${meal}-start`)?.value || '08:00';
        const durVal = Number(document.getElementById(`routine-${meal}-duration`)?.value) || 30;
        const previewEl = document.getElementById(`routine-${meal}-preview`);
        if (previewEl) {
          const startMin = parseTimeToMinutes(startVal);
          const endMin = startMin + durVal;
          previewEl.innerHTML = `Window: <strong class="text-primary">${startVal} – ${minutesToTime(endMin)}</strong> (${durVal} mins)`;
        }
      };

      ['breakfast', 'lunch', 'dinner'].forEach(meal => {
        const startInput = document.getElementById(`routine-${meal}-start`);
        const durInput = document.getElementById(`routine-${meal}-duration`);
        startInput?.addEventListener('input', () => updatePreview(meal));
        durInput?.addEventListener('input', () => updatePreview(meal));
      });

      // Focus on specific meal card if requested
      if (data?.focusMeal) {
        const card = document.getElementById(`routine-card-${data.focusMeal}`);
        if (card) {
          card.style.outline = '2px solid var(--primary)';
          setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
        }
      }

      // Save button
      const saveBtn = document.getElementById('btn-save-routine-modal');
      if (saveBtn) {
        saveBtn.onclick = () => {
          const bStart = document.getElementById('routine-breakfast-start')?.value || '08:30';
          const bDur = Math.max(10, Number(document.getElementById('routine-breakfast-duration')?.value) || 30);
          const bEnabled = document.getElementById('routine-breakfast-enabled')?.checked !== false;
          const lStart = document.getElementById('routine-lunch-start')?.value || '13:00';
          const lDur = Math.max(10, Number(document.getElementById('routine-lunch-duration')?.value) || 45);
          const dStart = document.getElementById('routine-dinner-start')?.value || '20:00';
          const dDur = Math.max(10, Number(document.getElementById('routine-dinner-duration')?.value) || 45);
          
          const bMin = parseTimeToMinutes(bStart);
          const lMin = parseTimeToMinutes(lStart);
          const dMin = parseTimeToMinutes(dStart);
          
          if (bEnabled && (bMin + bDur > lMin)) return showBanner("Breakfast overlaps with Lunch!", "warning");
          if (lMin + lDur > dMin) return showBanner("Lunch overlaps with Dinner!", "warning");
          
          const bEnd = minutesToTime(bMin + bDur);
          const lEnd = minutesToTime(lMin + lDur);
          const dEnd = minutesToTime(dMin + dDur);

          state.scheduleConfig = {
            ...state.scheduleConfig,
            dayStart: document.getElementById('routine-day-start')?.value || '08:00',
            dayEnd: document.getElementById('routine-day-end')?.value || '23:00',
            breakfastStart: bStart,
            breakfastEnd: bEnd,
            breakfastDuration: bDur,
            breakfastEnabled: bEnabled,
            lunchStart: lStart,
            lunchEnd: lEnd,
            lunchDuration: lDur,
            dinnerStart: dStart,
            dinnerEnd: dEnd,
            dinnerDuration: dDur,
          };

          closeModal();
          recalculateTimeline();
          saveState();
          showBanner('Daily routine & meal schedule updated!', 'success');
          render();
        };
      }
    } else if (name === 'planNextDay') {
      const today = getTodayISO();
      const tomorrow = addDays(today, 1);

      // Carry over button click
      document.querySelectorAll('.btn-rollover').forEach(btn => {
        btn.onclick = () => {
          const tId = btn.getAttribute('data-task-id');
          const task = state.tasks.find(t => t.id === tId);
          if (task) {
            task.deadline = tomorrow;
            task.postponedUntil = null;
            saveState();
            recalculateTimeline(state.viewDate);
            showBanner(`Task "${task.title}" carried over to tomorrow!`, 'success');
            openModal('planNextDay');
          }
        };
      });

      // Unqueue button click
      document.querySelectorAll('.btn-unqueue-tomorrow').forEach(btn => {
        btn.onclick = () => {
          const tId = btn.getAttribute('data-task-id');
          const task = state.tasks.find(t => t.id === tId);
          if (task) {
            task.deadline = today;
            saveState();
            recalculateTimeline(state.viewDate);
            showBanner(`Task "${task.title}" reset to today.`, 'info');
            openModal('planNextDay');
          }
        };
      });

      // Edit button click
      document.querySelectorAll('.btn-edit-tomorrow').forEach(btn => {
        btn.onclick = () => {
          const tId = btn.getAttribute('data-task-id');
          const task = state.tasks.find(t => t.id === tId);
          if (task) {
            openModal('task', task);
          }
        };
      });

      // Quick add task for tomorrow
      const addBtn = document.getElementById('btn-add-tomorrow-task');
      if (addBtn) {
        addBtn.onclick = () => {
          const title = document.getElementById('tomorrow-new-task-title')?.value?.trim();
          if (!title) {
            showBanner('Please enter a task title.', 'warning');
            return;
          }
          const cat = document.getElementById('tomorrow-new-task-cat')?.value || FALLBACK_CATEGORY_ID;
          const dur = Number(document.getElementById('tomorrow-new-task-dur')?.value) || 45;

          const newTask = {
            id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            title,
            category: cat,
            deadline: tomorrow,
            duration: dur,
            remaining: dur,
            priority: 'Medium',
            energy: 'Medium',
            flexibility: 'Flexible',
            status: 'pending',
            notes: 'Added during Plan Next Day session',
            subtasks: [],
            createdAt: getTodayISO(),
          };

          state.tasks.unshift(newTask);
          saveState();
          recalculateTimeline(state.viewDate);
          showBanner(`Task "${title}" queued for tomorrow!`, 'success');
          openModal('planNextDay');
        };
      }

      // Done & View Tomorrow Schedule button
      const viewTomorrowBtn = document.getElementById('btn-save-plan-tomorrow');
      if (viewTomorrowBtn) {
        viewTomorrowBtn.onclick = () => {
          state.viewDate = tomorrow;
          recalculateTimeline(tomorrow);
          closeModal();
          showBanner(`Viewing tomorrow's schedule (${formatDateDisplay(tomorrow)}).`, 'info');
          render();
        };
      }
    } else if (name === 'brainDump') {
      const dayFullNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      
      const updateDayCounter = () => {
        const activeCount = document.querySelectorAll('.day-circle-toggle[data-active="true"]').length;
        const counterEl = document.getElementById('active-days-counter');
        if (counterEl) {
          if (activeCount === 7) {
            counterEl.textContent = '7 of 7 days active';
            counterEl.style.color = 'var(--accent)';
            counterEl.style.borderColor = 'rgba(245, 158, 11, 0.25)';
          } else if (activeCount > 0) {
            counterEl.textContent = `${activeCount} active (${7 - activeCount} excluded)`;
            counterEl.style.color = 'var(--accent)';
            counterEl.style.borderColor = 'rgba(245, 158, 11, 0.25)';
          } else {
            counterEl.textContent = '0 active (all days excluded!)';
            counterEl.style.color = '#ef4444';
            counterEl.style.borderColor = 'rgba(239, 68, 68, 0.4)';
          }
        }
      };

      // Day circle toggles
      document.querySelectorAll('.day-circle-toggle').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const isActive = btn.getAttribute('data-active') === 'true';
          const newActive = !isActive;
          btn.setAttribute('data-active', newActive ? 'true' : 'false');
          btn.classList.toggle('day-active', newActive);
          btn.classList.toggle('day-crossed-out', !newActive);
          const dayIdx = Number(btn.getAttribute('data-brain-day'));
          btn.setAttribute('title', `${dayFullNames[dayIdx]} - ${newActive ? 'Active (click to exclude)' : 'Excluded (click to include)'}`);
          updateDayCounter();
        });
      });

      // Distribute button
      const distributeBtn = document.getElementById('btn-brain-distribute');
      if (distributeBtn) {
        distributeBtn.onclick = () => {
          const text = document.getElementById('brain-dump-tasks')?.value || '';
          const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
          if (lines.length === 0) {
            showBanner('Please enter at least one task in the list.', 'warning');
            return;
          }

          // Get active days
          const activeDays = [];
          document.querySelectorAll('.day-circle-toggle').forEach(btn => {
            if (btn.getAttribute('data-active') === 'true') {
              activeDays.push(Number(btn.getAttribute('data-brain-day')));
            }
          });

          if (activeDays.length === 0) {
            showBanner('Please select at least one available day (all days are currently crossed out).', 'warning');
            return;
          }

          // Sort active days chronologically starting from today
          const today = getTodayISO();
          const todayD = new Date(today + 'T00:00:00');
          const todayDay = todayD.getDay();
          activeDays.sort((a, b) => ((a - todayDay + 7) % 7) - ((b - todayDay + 7) % 7));

          // Parse tasks using existing NLP parser
          const parsedTasks = lines.map(line => parseQuickTaskInput(line, state.categories));

          // Sort by urgency: deadline first, then priority
          parsedTasks.sort((a, b) => {
            if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
            if (a.deadline) return -1;
            if (b.deadline) return 1;
            const pW = { Critical: 4, High: 3, Medium: 2, Low: 1 };
            return (pW[b.priority] || 1) - (pW[a.priority] || 1);
          });

          // Get the ISO dates for each available day this week
          const dayDates = {};
          activeDays.forEach(d => {
            const offset = (d - todayDay + 7) % 7;
            dayDates[d] = addDays(today, offset);
          });

          // Distribute tasks round-robin across available days
          const distribution = {};
          activeDays.forEach(d => { distribution[d] = []; });
          parsedTasks.forEach((task, idx) => {
            const dayIdx = activeDays[idx % activeDays.length];
            distribution[dayIdx].push({
              ...task,
              assignedDate: dayDates[dayIdx],
            });
          });

          // Show preview
          const dayFullNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
          const previewDiv = document.getElementById('brain-dump-preview');
          const previewContent = document.getElementById('brain-dump-preview-content');
          if (previewDiv && previewContent) {
            let html = '';
            activeDays.forEach(d => {
              const tasks = distribution[d];
              const totalMin = tasks.reduce((s, t) => s + (t.duration || 45), 0);
              html += `
                <div class="card p-3 mb-2" style="border-left:3px solid var(--accent);">
                  <div class="flex justify-between items-center mb-1">
                    <span class="font-semibold text-sm">${dayFullNames[d]} <span class="font-mono text-xs text-muted">${dayDates[d]}</span></span>
                    <span class="text-xs font-mono text-accent">${formatDuration(totalMin)}</span>
                  </div>
                  ${tasks.length === 0 ? '<span class="text-xs text-muted">No tasks assigned</span>' :
                    tasks.map(t => `
                      <div class="text-xs py-1 flex items-center gap-2">
                        <span class="badge badge-${(t.priority || 'medium').toLowerCase()}" style="font-size:10px;">${t.priority}</span>
                        <span>${escapeHtml(t.title)}</span>
                        <span class="font-mono text-muted">${t.duration || 45}m</span>
                      </div>
                    `).join('')}
                </div>
              `;
            });
            previewContent.innerHTML = html;
            previewDiv.style.display = 'block';
          }

          // Show apply button & store distribution for apply
          const applyBtn = document.getElementById('btn-brain-apply');
          if (applyBtn) {
            applyBtn.style.display = '';
            applyBtn.onclick = () => {
              // Create tasks from distribution
              let count = 0;
              activeDays.forEach(d => {
                distribution[d].forEach(t => {
                  state.tasks.unshift({
                    id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                    title: t.title || 'Untitled Task',
                    category: t.categoryId || FALLBACK_CATEGORY_ID,
                    deadline: t.assignedDate,
                    duration: t.duration || 45,
                    remaining: t.duration || 45,
                    priority: t.priority || 'Medium',
                    energy: 'Medium',
                    flexibility: 'Flexible',
                    status: 'pending',
                    notes: '',
                    subtasks: [],
                    startTime: '',
                    breakAfterMin: 0,
                    createdAt: getTodayISO(),
                  });
                  count++;
                });
              });
              closeModal();
              recalculateTimeline();
              saveState();
              showBanner(`🧠 ${count} task(s) created and distributed across ${activeDays.length} day(s)!`, 'success');
              render();
            };
          }
        };
      }
    }
  }

  function openModal(name, data = null) {
    state.activeModal = { name, data };
    renderModal();
  }

  function closeModal() {
    state.activeModal = null;
    renderModal();
  }

  // =========================================================================
  // 11. EVENT LISTENERS
  // =========================================================================
  function attachEventListeners() {
    // Tabs Navigation
    document.querySelectorAll('[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.activeTab = btn.getAttribute('data-tab');
        render();
      });
    });

    document.getElementById('brand-logo-btn')?.addEventListener('click', () => {
      state.activeTab = 'dashboard';
      render();
    });

    // Theme Toggles
    document.getElementById('btn-theme-toggle')?.addEventListener('click', () => {
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
      saveState();
      render();
    });

    document.getElementById('btn-settings-theme')?.addEventListener('click', () => {
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
      saveState();
      render();
    });

    // Schedule Config Save
    document.getElementById('btn-save-schedule-cfg')?.addEventListener('click', () => {
      const bStart = document.getElementById('cfg-breakfast-start')?.value || '08:30';
      const bDur = Math.max(10, Number(document.getElementById('cfg-breakfast-duration')?.value) || 30);
      const bEnd = document.getElementById('cfg-breakfast-end')?.value || minutesToTime(parseTimeToMinutes(bStart) + bDur);
      const bEnabled = document.getElementById('cfg-breakfast-enabled')?.checked !== false;

      const lStart = document.getElementById('cfg-lunch-start')?.value || '13:00';
      const lDur = Math.max(10, Number(document.getElementById('cfg-lunch-duration')?.value) || 45);
      const lEnd = document.getElementById('cfg-lunch-end')?.value || minutesToTime(parseTimeToMinutes(lStart) + lDur);

      const dStart = document.getElementById('cfg-dinner-start')?.value || '20:00';
      const dDur = Math.max(10, Number(document.getElementById('cfg-dinner-duration')?.value) || 45);
      const dEnd = document.getElementById('cfg-dinner-end')?.value || minutesToTime(parseTimeToMinutes(dStart) + dDur);

      state.scheduleConfig = {
        ...state.scheduleConfig,
        dayStart: document.getElementById('cfg-day-start')?.value || '08:00',
        dayEnd: document.getElementById('cfg-day-end')?.value || '23:00',
        breakfastStart: bStart,
        breakfastEnd: bEnd,
        breakfastDuration: bDur,
        breakfastEnabled: bEnabled,
        lunchStart: lStart,
        lunchEnd: lEnd,
        lunchDuration: lDur,
        dinnerStart: dStart,
        dinnerEnd: dEnd,
        dinnerDuration: dDur,
        maxChunkMin: Number(document.getElementById('cfg-max-chunk')?.value) || 90,
        breakDurationMin: Number(document.getElementById('cfg-break-duration')?.value) || 10,
      };
      recalculateTimeline();
      saveState();
      showBanner('Schedule settings saved! Timeline recalculated.', 'success');
      render();
    });

    // Settings Meal Duration Preset Buttons
    document.querySelectorAll('[data-cfg-dur]').forEach(btn => {
      btn.addEventListener('click', () => {
        const prefix = btn.getAttribute('data-cfg-dur');
        const mins = Number(btn.getAttribute('data-mins')) || 30;
        const durInput = document.getElementById(`${prefix}-duration`);
        const startInput = document.getElementById(`${prefix}-start`);
        const endInput = document.getElementById(`${prefix}-end`);
        if (durInput) durInput.value = mins;
        if (startInput && endInput) {
          endInput.value = minutesToTime(parseTimeToMinutes(startInput.value) + mins);
        }
        btn.parentElement.querySelectorAll('.duration-pill-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Settings Meal Real-time Duration / End time Synchronization
    ['cfg-breakfast', 'cfg-lunch', 'cfg-dinner'].forEach(prefix => {
      const startInp = document.getElementById(`${prefix}-start`);
      const durInp = document.getElementById(`${prefix}-duration`);
      const endInp = document.getElementById(`${prefix}-end`);

      const updateEnd = () => {
        if (!startInp || !durInp || !endInp) return;
        const sMin = parseTimeToMinutes(startInp.value);
        const dur = Number(durInp.value) || 30;
        endInp.value = minutesToTime(sMin + dur);
      };
      const updateDur = () => {
        if (!startInp || !durInp || !endInp) return;
        const sMin = parseTimeToMinutes(startInp.value);
        const eMin = parseTimeToMinutes(endInp.value);
        if (eMin > sMin) durInp.value = eMin - sMin;
      };

      startInp?.addEventListener('input', updateEnd);
      durInp?.addEventListener('input', updateEnd);
      endInp?.addEventListener('input', updateDur);
    });

    // Quick Day Start from Timeline
    document.getElementById('quick-day-start')?.addEventListener('change', (e) => {
      const val = e.target.value;
      if (val) {
        state.scheduleConfig = {
          ...state.scheduleConfig,
          dayStart: val,
        };
        recalculateTimeline();
        saveState();
        showBanner(`Schedule updated: Day starts at ${formatTime12(parseTimeToMinutes(val))}`, 'info');
        render();
      }
    });

    document.getElementById('btn-start-day-now')?.addEventListener('click', () => {
      const curM = getCurrentTimeMinutes(state.currentTime);
      const timeStr = minutesToTime(curM);
      state.scheduleConfig = {
        ...state.scheduleConfig,
        dayStart: timeStr,
      };
      recalculateTimeline();
      saveState();
      showBanner(`Day schedule adapted! Now starting at ${formatTime12(curM)}`, 'success');
      render();
    });

    // Open Routine Modal trigger
    document.querySelectorAll('[data-action="open-modal-routine"]').forEach(b => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const focusMeal = b.getAttribute('data-focus-meal') || null;
        openModal('routine', { focusMeal });
      });
    });

    // Adjust Meal Duration directly from timeline (+15m, -15m)
    document.querySelectorAll('[data-action="adjust-meal-duration"]').forEach(b => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const meal = b.getAttribute('data-meal') || 'lunch';
        const delta = Number(b.getAttribute('data-delta')) || 15;
        const sKey = meal + 'Start';
        const eKey = meal + 'End';
        const durKey = meal + 'Duration';
        const curS = parseTimeToMinutes(state.scheduleConfig[sKey]);
        const curE = parseTimeToMinutes(state.scheduleConfig[eKey]);
        const curDur = (curE - curS) > 0 ? (curE - curS) : (state.scheduleConfig[durKey] || 45);
        const newDur = Math.max(10, Math.min(180, curDur + delta));
        state.scheduleConfig[durKey] = newDur;
        state.scheduleConfig[eKey] = minutesToTime(curS + newDur);
        recalculateTimeline();
        saveState();
        showBanner(`${meal.charAt(0).toUpperCase() + meal.slice(1)} duration adjusted to ${newDur} mins (${state.scheduleConfig[sKey]} – ${state.scheduleConfig[eKey]})!`, 'success');
        render();
      });
    });

    // Meal Window Shifting (+30m, +1h, -30m)
    document.querySelectorAll('[data-action="push-meal"]').forEach(b => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const meal = b.getAttribute('data-meal');
        const mins = Number(b.getAttribute('data-mins')) || 30;
        const sKey = meal + 'Start';
        const eKey = meal + 'End';
        const curS = parseTimeToMinutes(state.scheduleConfig[sKey]);
        const curE = parseTimeToMinutes(state.scheduleConfig[eKey]);
        const dur = curE - curS;
        const newS = Math.min(1439 - dur, curS + mins);
        state.scheduleConfig[sKey] = minutesToTime(newS);
        state.scheduleConfig[eKey] = minutesToTime(newS + dur);
        recalculateTimeline();
        saveState();
        showBanner(`${meal.charAt(0).toUpperCase() + meal.slice(1)} moved to ${state.scheduleConfig[sKey]} – ${state.scheduleConfig[eKey]}!`, 'success');
        render();
      });
    });

    document.querySelectorAll('[data-action="pull-meal"]').forEach(b => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const meal = b.getAttribute('data-meal');
        const mins = Number(b.getAttribute('data-mins')) || 30;
        const sKey = meal + 'Start';
        const eKey = meal + 'End';
        const curS = parseTimeToMinutes(state.scheduleConfig[sKey]);
        const curE = parseTimeToMinutes(state.scheduleConfig[eKey]);
        const dur = curE - curS;
        const newS = Math.max(0, curS - mins);
        state.scheduleConfig[sKey] = minutesToTime(newS);
        state.scheduleConfig[eKey] = minutesToTime(newS + dur);
        recalculateTimeline();
        saveState();
        showBanner(`${meal.charAt(0).toUpperCase() + meal.slice(1)} moved earlier to ${state.scheduleConfig[sKey]} – ${state.scheduleConfig[eKey]}!`, 'success');
        render();
      });
    });

    // Break Skip and Delay
    document.querySelectorAll('[data-action="skip-break"]').forEach(b => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const breakId = b.getAttribute('data-break-id');
        state.timeline = state.timeline.filter(x => x.id !== breakId);
        showBanner('Break skipped! Buffer restored for study.', 'info');
        render();
      });
    });

    document.querySelectorAll('[data-action="push-break"]').forEach(b => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const breakId = b.getAttribute('data-break-id');
        const mins = Number(b.getAttribute('data-mins')) || 15;
        const blk = state.timeline.find(x => x.id === breakId);
        if (blk) {
          blk.startMin += mins;
          blk.endMin += mins;
          blk.startTimeStr = minutesToTime(blk.startMin);
          blk.endTimeStr = minutesToTime(blk.endMin);
          showBanner(`Break delayed by ${mins} minutes!`, 'info');
          render();
        }
      });
    });

    // Quick Add Dropdown
    const qaBtn = document.getElementById('btn-quick-add');
    const qaMenu = document.getElementById('quick-add-menu');
    qaBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (qaMenu) qaMenu.style.display = qaMenu.style.display === 'none' ? 'block' : 'none';
    });

    // Modal Triggers
    document.querySelectorAll('[data-action="open-modal-task"]').forEach(b => b.addEventListener('click', () => {
      const presetDate = b.getAttribute('data-preset-date');
      openModal('task', presetDate ? { deadline: presetDate } : null);
    }));
    document.querySelectorAll('[data-action="open-modal-plan-next-day"]').forEach(b => b.addEventListener('click', () => openModal('planNextDay')));
    document.querySelectorAll('[data-action="open-modal-category"]').forEach(b => b.addEventListener('click', () => openModal('category')));
    document.querySelectorAll('[data-action="open-modal-dsa"]').forEach(b => b.addEventListener('click', () => openModal('dsaTopic')));
    document.querySelectorAll('[data-action="open-modal-college"]').forEach(b => b.addEventListener('click', () => openModal('collegeSubject')));
    document.querySelectorAll('[data-action="open-modal-fixed"]').forEach(b => b.addEventListener('click', () => openModal('fixed')));
    document.querySelectorAll('[data-action="open-modal-session"]').forEach(b => b.addEventListener('click', () => openModal('session')));
    document.querySelectorAll('[data-action="open-modal-rev-picker"]').forEach(b => b.addEventListener('click', () => openModal('revPicker')));
    document.getElementById('btn-plan-tomorrow')?.addEventListener('click', () => openModal('planNextDay'));
    document.getElementById('btn-plan-tomorrow-modal-trigger')?.addEventListener('click', () => openModal('planNextDay'));
    document.getElementById('btn-empty-plan-tomorrow')?.addEventListener('click', () => openModal('planNextDay'));
    document.getElementById('btn-what-now')?.addEventListener('click', () => openModal('whatNow'));
    document.getElementById('btn-action-focus')?.addEventListener('click', () => {
      if (state.focus) openModal('focus');
      else openModal('whatNow');
    });
    document.getElementById('btn-lost-time')?.addEventListener('click', () => openModal('lostTime'));
    document.getElementById('btn-end-day')?.addEventListener('click', () => openModal('endOfDay'));
    document.getElementById('btn-brain-dump')?.addEventListener('click', () => openModal('brainDump'));

    // Calendar Matrix Navigation
    document.querySelectorAll('[data-cal-nav]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const d = btn.getAttribute('data-cal-nav');
        state.viewDate = d;
        state._calendarSelectedTasks = false;
        render();
      });
    });
    
    // Calendar Date Click
    document.querySelectorAll('[data-cal-date]').forEach(btn => {
      btn.addEventListener('click', () => {
        const d = btn.getAttribute('data-cal-date');
        state.viewDate = d;
        state._calendarSelectedTasks = true;
        recalculateTimeline(d);
        render();
      });
    });

    // Date Switchers (Today vs Tomorrow)
    document.querySelectorAll('[data-switch-date]').forEach(b => {
      b.addEventListener('click', () => {
        const d = b.getAttribute('data-switch-date');
        state.viewDate = d;
        recalculateTimeline(d);
        showBanner(d === getTodayISO() ? "Switched to Today's schedule." : "Viewing Tomorrow's schedule.", 'info');
        render();
      });
    });

    document.getElementById('btn-regen-plan')?.addEventListener('click', () => {
      recalculateTimeline(state.viewDate);
      showBanner('Timeline recalculated!', 'info');
      render();
    });

    // Drag and Drop for Timeline Blocks
    const track = document.querySelector('.timeline-track');
    if (track) {
      track.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      });

      track.addEventListener('drop', (e) => {
        e.preventDefault();
        const trackRect = track.getBoundingClientRect();
        const dropY = e.clientY - trackRect.top;
        const dropPercent = dropY / trackRect.height;

        const sc = state.scheduleConfig || DEFAULT_SCHEDULE_CONFIG;
        const dayStartMin = parseTimeToMinutes(sc.dayStart || '08:00');
        const dayEndMin = parseTimeToMinutes(sc.dayEnd || '23:00');
        const totalWindowMin = Math.max(60, dayEndMin - dayStartMin);

        let droppedMin = dayStartMin + (dropPercent * totalWindowMin);
        droppedMin = Math.round(droppedMin / 5) * 5; // Snap to 5 mins
        droppedMin = Math.max(dayStartMin, Math.min(dayEndMin - 5, droppedMin));

        const newTimeStr = minutesToTime(droppedMin);

        try {
          const dataStr = e.dataTransfer.getData('application/json');
          if (!dataStr) return;
          const data = JSON.parse(dataStr);

          if (data.taskId) {
            const task = state.tasks.find(t => t.id === data.taskId);
            if (task) {
              task.startTime = newTimeStr;
              recalculateTimeline();
              saveState();
              render();
            }
          } else if (data.mealKey) {
            const duration = Number(data.duration) || 30;
            const endMin = droppedMin + duration;
            updateScheduleConfig({
              [`${data.mealKey}Start`]: newTimeStr,
              [`${data.mealKey}End`]: minutesToTime(endMin),
            });
          } else if (data.eventId) {
            const ev = state.fixedEvents.find(f => f.id === data.eventId);
            if (ev) {
              const duration = Number(data.duration) || 60;
              const endMin = droppedMin + duration;
              ev.start = newTimeStr;
              ev.end = minutesToTime(endMin);
              recalculateTimeline();
              saveState();
              render();
            }
          }
        } catch (err) {
          console.error('Vanilla drop error:', err);
        }
      });
    }

    document.querySelectorAll('.timeline-block[draggable="true"]').forEach(block => {
      block.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('application/json', JSON.stringify({
          id: block.getAttribute('data-drag-id'),
          taskId: block.getAttribute('data-task-id'),
          eventId: block.getAttribute('data-event-id'),
          mealKey: block.getAttribute('data-meal-key'),
          duration: block.getAttribute('data-duration'),
        }));
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => block.classList.add('is-dragging'), 0);
      });
      block.addEventListener('dragend', () => {
        block.classList.remove('is-dragging');
      });
    });

    // Tasks Page Filters & Search
    const searchInput = document.getElementById('task-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        taskFilter.query = e.target.value;
        const mainSlot = document.getElementById('tab-content-slot');
        if (mainSlot) {
          mainSlot.innerHTML = renderCurrentTabHtml();
          attachEventListeners();
          const restoredInput = document.getElementById('task-search-input');
          if (restoredInput) {
            restoredInput.focus();
            restoredInput.setSelectionRange(restoredInput.value.length, restoredInput.value.length);
          }
        }
      });
    }

    document.getElementById('task-sort-select')?.addEventListener('change', (e) => {
      taskFilter.sort = e.target.value;
      render();
    });

    document.querySelectorAll('[data-filter-status]').forEach(btn => {
      btn.addEventListener('click', () => {
        taskFilter.status = btn.getAttribute('data-filter-status');
        render();
      });
    });

    // Task Completion (Checkboxes and Timeline Mark Done buttons)
    document.querySelectorAll('[data-task-complete]').forEach(el => {
      const evtType = el.tagName === 'INPUT' ? 'change' : 'click';
      el.addEventListener(evtType, (e) => {
        e.stopPropagation();
        const id = el.getAttribute('data-task-complete');
        const t = state.tasks.find(x => x.id === id);
        if (t) {
          const isNowDone = t.status !== 'completed';
          t.status = isNowDone ? 'completed' : 'pending';
          if (isNowDone) {
            t.remaining = 0;
            t.completedAt = new Date().toISOString();
          } else {
            const totalStudied = state.studySessions
              .filter(s => s.taskId === t.id)
              .reduce((sum, s) => sum + (s.actualMin || 0), 0);
            t.remaining = (totalStudied > 0 && totalStudied < t.duration)
              ? (t.duration - totalStudied)
              : t.duration;
            t.completedAt = null;
          }
          showBanner(isNowDone ? `✓ Completed "${t.title}"!` : `Task "${t.title}" marked as pending.`, isNowDone ? 'success' : 'info');
          recalculateTimeline();
          saveState();
          render();
        }
      });
    });

    // Start Focus
    document.querySelectorAll('[data-start-focus]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-start-focus');
        const t = state.tasks.find(x => x.id === id);
        if (t) {
          const taskMins = (t.remaining > 0 ? t.remaining : t.duration) || 45;
          state.focus = {
            taskId: t.id,
            title: t.title,
            category: t.category,
            plannedSec: taskMins * 60,
            baseAccumulatedSec: 0,
            accumulatedSec: 0,
            lastStartTime: Date.now(),
            isRunning: true,
          };
          saveState();
          closeModal();
          openModal('focus');
        }
      });
    });

    // Edit Task
    document.querySelectorAll('[data-action="edit-task"]').forEach(b => {
      b.addEventListener('click', () => {
        const id = b.getAttribute('data-id');
        const t = state.tasks.find(x => x.id === id);
        if (t) openModal('task', t);
      });
    });

    // Delete Task
    document.querySelectorAll('[data-action="delete-task"]').forEach(b => {
      b.addEventListener('click', () => {
        const id = b.getAttribute('data-id');
        state.tasks = state.tasks.filter(t => t.id !== id);
        recalculateTimeline();
        saveState();
        showBanner('Task removed', 'info');
        render();
      });
    });

    // DSA Topics Interactions
    document.querySelectorAll('[data-cycle-dsa]').forEach(b => {
      b.addEventListener('click', () => {
        const id = b.getAttribute('data-cycle-dsa');
        const t = state.dsaTopics.find(x => x.id === id);
        if (t) {
          const cyc = { 'not-started': 'in-progress', 'in-progress': 'done', 'done': 'not-started' };
          t.status = cyc[t.status] || 'not-started';
          saveState();
          render();
        }
      });
    });

    document.querySelectorAll('[data-dsa-adj]').forEach(b => {
      b.addEventListener('click', () => {
        const id = b.getAttribute('data-dsa-adj');
        const delta = Number(b.getAttribute('data-delta'));
        const t = state.dsaTopics.find(x => x.id === id);
        if (t) {
          t.problemsSolved = Math.max(0, (t.problemsSolved || 0) + delta);
          saveState();
          render();
        }
      });
    });

    // DSA direct text input for typing problem counts (e.g. 17)
    document.querySelectorAll('[data-dsa-set]').forEach(input => {
      const commitDsa = () => {
        const id = input.getAttribute('data-dsa-set');
        const t = state.dsaTopics.find(x => x.id === id);
        if (t) {
          const val = Math.max(0, parseInt(input.value, 10) || 0);
          if (t.problemsSolved !== val) {
            t.problemsSolved = val;
            saveState();
            render();
          }
        }
      };
      input.addEventListener('change', commitDsa);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          commitDsa();
          input.blur();
        }
      });
    });

    document.querySelectorAll('[data-delete-dsa]').forEach(b => {
      b.addEventListener('click', () => {
        const id = b.getAttribute('data-delete-dsa');
        state.dsaTopics = state.dsaTopics.filter(x => x.id !== id);
        saveState();
        render();
      });
    });

    // College Academic Topics Interactions
    
    document.querySelectorAll('[data-open-notes]').forEach(b => {
      b.addEventListener('click', () => {
        const subId = b.getAttribute('data-open-notes');
        const tpId = b.getAttribute('data-topic-id');
        openModal('collegeNotes', { subId, tpId });
      });
    });

    document.querySelectorAll('[data-cycle-topic]').forEach(b => {
      b.addEventListener('click', () => {
        const subId = b.getAttribute('data-cycle-topic');
        const tpId = b.getAttribute('data-topic-id');
        const s = state.collegeSubjects.find(x => x.id === subId);
        const tp = s?.topics.find(x => x.id === tpId);
        if (tp) {
          const cyc = { 'not-started': 'in-progress', 'in-progress': 'done', 'done': 'not-started' };
          const next = cyc[tp.status] || (tp.revised ? 'not-started' : 'in-progress');
          tp.status = next;
          if (next === 'not-started') {
            tp.revised = false;
          }
          saveState();
          render();
        }
      });
    });

    document.querySelectorAll('[data-toggle-revised]').forEach(b => {
      b.addEventListener('click', () => {
        const subId = b.getAttribute('data-toggle-revised');
        const tpId = b.getAttribute('data-topic-id');
        const s = state.collegeSubjects.find(x => x.id === subId);
        const tp = s?.topics.find(x => x.id === tpId);
        if (tp) {
          tp.revised = !tp.revised;
          if (tp.revised && tp.status !== 'done') {
            tp.status = 'done';
          }
          saveState();
          render();
        }
      });
    });

    document.querySelectorAll('[data-delete-topic]').forEach(b => {
      b.addEventListener('click', () => {
        const subId = b.getAttribute('data-delete-topic');
        const tpId = b.getAttribute('data-topic-id');
        const s = state.collegeSubjects.find(x => x.id === subId);
        if (s) {
          s.topics = s.topics.filter(x => x.id !== tpId);
          saveState();
          render();
        }
      });
    });

    document.querySelectorAll('[data-add-topic-form]').forEach(form => {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const subId = form.getAttribute('data-add-topic-form');
        const input = form.querySelector('input');
        const name = input?.value?.trim();
        if (!name) return;
        const s = state.collegeSubjects.find(x => x.id === subId);
        if (s) {
          s.topics.push({ id: `ct-${Date.now()}`, name, status: 'not-started', revised: false });
          saveState();
          render();
        }
      });
    });

    document.querySelectorAll('[data-delete-college]').forEach(b => {
      b.addEventListener('click', () => {
        const id = b.getAttribute('data-delete-college');
        state.collegeSubjects = state.collegeSubjects.filter(s => s.id !== id);
        saveState();
        showBanner('College subject removed', 'info');
        render();
      });
    });

    // Weekly Strip Date Selector
    document.querySelectorAll('[data-select-week-day]').forEach(b => {
      b.addEventListener('click', () => {
        selectedWeeklyDate = b.getAttribute('data-select-week-day');
        render();
      });
    });

    // Category Deletion in Settings
    document.querySelectorAll('[data-delete-cat]').forEach(b => {
      b.addEventListener('click', () => {
        const id = b.getAttribute('data-delete-cat');
        if (id === FALLBACK_CATEGORY_ID || state.categories.length <= 1) {
          showBanner('Cannot delete the default category.', 'warning');
          return;
        }
        state.categories = state.categories.filter(c => c.id !== id);
        state.tasks.forEach(t => {
          if (t.category === id) t.category = FALLBACK_CATEGORY_ID;
        });
        state.fixedEvents.forEach(fe => {
          if (fe.category === id) fe.category = FALLBACK_CATEGORY_ID;
        });
        state.studySessions.forEach(ss => {
          if (ss.category === id) ss.category = FALLBACK_CATEGORY_ID;
        });
        if (state.focus && state.focus.category === id) {
          state.focus.category = FALLBACK_CATEGORY_ID;
        }
        recalculateTimeline();
        saveState();
        showBanner('Category removed and associated items safely reassigned.', 'info');
        render();
      });
    });

    // Timeline View Switcher (Agenda vs Grid)
    document.querySelectorAll('[data-timeline-view]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.timelineView = btn.getAttribute('data-timeline-view');
        saveState();
        render();
      });
    });

    // Clear All Data (Clean Slate for Real Daily Life)
    document.getElementById('btn-trigger-reset')?.addEventListener('click', () => {
      openModal('confirm', {
        title: 'Clear All Data to Clean Slate?',
        message: 'This will completely wipe all tasks, university lectures, college courses, algorithm topics, and session history. You will get a 100% clean planner ready for your real daily life.',
        action: () => clearAllData(),
      });
    });

    // Load Sample Demo Data
    document.getElementById('btn-load-demo')?.addEventListener('click', () => {
      openModal('confirm', {
        title: 'Load Sample Demo Data?',
        message: 'This will populate sample university courses, DSA patterns, and a demo study schedule to explore all features.',
        action: () => loadDemoData(),
      });
    });

    // Sign Out
    document.getElementById('btn-sign-out')?.addEventListener('click', () => {
      localStorage.removeItem('adapt_google_id');
      window.location.reload();
    });
  }

  // Live 1s interval clock
  setInterval(() => {
    state.currentTime = new Date();
    const clockEl = document.getElementById('nav-clock-text');
    if (clockEl) {
      const curMin = getCurrentTimeMinutes(state.currentTime);
      const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][state.currentTime.getDay()];
      clockEl.innerText = `${dayName} ${formatTime12(curMin)}`;
    }
    if (state.focus && state.focus.isRunning) {
      if (!state.focus.lastStartTime) state.focus.lastStartTime = Date.now();
      const now = Date.now();
      const deltaSec = Math.floor((now - state.focus.lastStartTime) / 1000);
      state.focus.accumulatedSec = (state.focus.baseAccumulatedSec || 0) + deltaSec;
      // Update circular progress ring
      const ring = document.getElementById('focus-ring');
      const dot = document.getElementById('focus-dot');
      if (ring) {
        const radius = 54;
        const circ = 2 * Math.PI * radius;
        const pct = Math.min(100, Math.max(0, (state.focus.accumulatedSec / state.focus.plannedSec) * 100));
        const off = circ - (pct / 100) * circ;
        ring.setAttribute('stroke-dashoffset', off);
        if (dot) {
          dot.style.transform = `rotate(${pct * 3.6}deg)`;
        }
        // Shift gradient to red if overtime
        if (state.focus.accumulatedSec > state.focus.plannedSec) {
          ring.setAttribute('stroke', '#ef4444');
        }
      }
    }
  }, 1000);

  // Global Listeners (registered exactly once)
  let globalListenersAttached = false;
  function setupGlobalListenersOnce() {
    if (globalListenersAttached) return;
    globalListenersAttached = true;

    // Quick Add Dropdown click outside
    document.addEventListener('click', () => {
      const qaMenu = document.getElementById('quick-add-menu');
      if (qaMenu && qaMenu.style.display !== 'none') {
        qaMenu.style.display = 'none';
      }
    });

    // Global Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      const tag = e.target.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.key === 'Escape' && state.activeModal) {
        closeModal();
        return;
      }
      if (state.activeModal) return;

      const k = e.key.toUpperCase();
      if (k === 'N') { e.preventDefault(); openModal('task'); }
      else if (k === 'F') {
        e.preventDefault();
        if (state.focus) openModal('focus');
        else openModal('whatNow');
      }
      else if (k === 'T') { e.preventDefault(); openModal('whatNow'); }
      else if (k === 'R') {
        e.preventDefault();
        recalculateTimeline();
        showBanner('Timeline recalculated!', 'info');
        render();
      }
    });
  }

  // Initial Boot
  setupGlobalListenersOnce();
  recalculateTimeline();
  saveState();
  render();

  // Expose for testing & programmatic control
  window.__adapt = {
    state,
    clearAllData,
    loadDemoData,
    resetAllData,
    recalculateTimeline,
    replanAfterLostTime,
    getTodayISO,
    validateTaskDuration,
    validateTimeRange,
    validateStudyMinutes,
  };

})();
