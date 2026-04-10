(function initScheduleApp() {
  const dataSource = window.JIFF_SCHEDULE_DATA;
  const config = window.JIFF_SCHEDULE_CONFIG;

  if (!dataSource || !config) {
    throw new Error('JIFF schedule assets are missing.');
  }

  const state = {
    allData: parseCSV(dataSource.csvRaw),
    currentDay: config.defaultState.currentDay,
    activeGroups: new Set(config.defaultState.activeGroups),
    activeSections: null,
    bookmarks: new Set(),
    bookmarkHighlight: false,
    densityMode: config.defaultState.densityMode,
    resolvedDensityKey: null,
    mouseX: 0,
    mouseY: 0,
  };

  const dom = {};
  const dayLookup = new Map(config.days.map(day => [day.date, day]));

  cacheDom();
  bindEvents();
  buildStaticUI();
  applyDensitySettings();
  renderApp();
  queueTimelineScroll(100);

  window.JIFFScheduleApp = {
    state,
    renderApp,
    switchDay,
    toggleGroup,
    toggleSection,
    setDensityMode,
    toggleBookmarkHighlight,
  };

  function cacheDom() {
    dom.dayTabs = document.getElementById('dayTabs');
    dom.venueFilters = document.getElementById('venueFilters');
    dom.legend = document.getElementById('legend');
    dom.densitySelector = document.getElementById('densitySelector');
    dom.densityHint = document.getElementById('densityHint');
    dom.bookmarkBtn = document.getElementById('bookmarkBtn');
    dom.bookmarkCount = document.getElementById('bmCount');
    dom.bookmarkHighlightBtn = document.getElementById('bmHighlightBtn');
    dom.venueLabelScroll = document.getElementById('venue-label-scroll');
    dom.timelineScroll = document.getElementById('timeline-scroll');
    dom.timeAxis = document.getElementById('time-axis');
    dom.timelineContent = document.getElementById('timeline-content');
    dom.tooltip = document.getElementById('tooltip');
    dom.overlay = document.getElementById('overlay');
    dom.bookmarksPanel = document.getElementById('bookmarks-panel');
    dom.bookmarksList = document.getElementById('bookmarks-list');
    dom.bookmarksCloseBtn = document.getElementById('bookmarksCloseBtn');
  }

  function bindEvents() {
    dom.dayTabs.addEventListener('click', handleDayTabClick);
    dom.venueFilters.addEventListener('click', handleVenueFilterClick);
    dom.legend.addEventListener('click', handleLegendClick);
    dom.densitySelector.addEventListener('click', handleDensityClick);
    dom.bookmarksList.addEventListener('click', handleBookmarkListClick);
    dom.bookmarkBtn.addEventListener('click', toggleBookmarksPanel);
    dom.bookmarkHighlightBtn.addEventListener('click', toggleBookmarkHighlight);
    dom.bookmarksCloseBtn.addEventListener('click', closeBookmarksPanel);
    dom.overlay.addEventListener('click', closeBookmarksPanel);
    dom.timelineScroll.addEventListener('scroll', syncLabelScroll);
    document.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('resize', handleWindowResize);
  }

  function buildStaticUI() {
    buildDayTabs();
    buildVenueFilters();
    buildLegend();
    buildDensityControls();
  }

  function buildDayTabs() {
    const fragment = document.createDocumentFragment();

    config.days.forEach(day => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'day-tab';
      button.dataset.day = day.date;
      button.textContent = day.label + ' ' + day.sub;
      fragment.appendChild(button);
    });

    dom.dayTabs.innerHTML = '';
    dom.dayTabs.appendChild(fragment);
  }

  function buildVenueFilters() {
    const fragment = document.createDocumentFragment();

    config.venueGroups.forEach(group => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'vf-btn';
      button.dataset.group = group.id;
      button.textContent = group.label;
      fragment.appendChild(button);
    });

    dom.venueFilters.innerHTML = '';
    dom.venueFilters.appendChild(fragment);
  }

  function buildLegend() {
    const fragment = document.createDocumentFragment();

    config.legendSections.forEach(section => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'legend-item';
      item.dataset.section = section;
      item.title = section + ' 필터';
      item.innerHTML = '<div class="legend-dot" style="background:' + getSectionColor(section) + '"></div>' + escapeHtml(section);
      fragment.appendChild(item);
    });

    dom.legend.innerHTML = '';
    dom.legend.appendChild(fragment);
  }

  function buildDensityControls() {
    const fragment = document.createDocumentFragment();

    config.densityModes.forEach(mode => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'density-btn';
      button.dataset.density = mode.id;
      button.textContent = mode.label;
      fragment.appendChild(button);
    });

    dom.densitySelector.innerHTML = '';
    dom.densitySelector.appendChild(fragment);
  }

  function handleDayTabClick(event) {
    const button = event.target.closest('[data-day]');
    if (!button) return;
    switchDay(button.dataset.day);
  }

  function handleVenueFilterClick(event) {
    const button = event.target.closest('[data-group]');
    if (!button) return;
    toggleGroup(button.dataset.group);
  }

  function handleLegendClick(event) {
    const item = event.target.closest('[data-section]');
    if (!item) return;
    toggleSection(item.dataset.section);
  }

  function handleDensityClick(event) {
    const button = event.target.closest('[data-density]');
    if (!button) return;
    setDensityMode(button.dataset.density);
  }

  function handleBookmarkListClick(event) {
    const button = event.target.closest('[data-bookmark-remove]');
    if (!button) return;
    removeBookmark(button.dataset.bookmarkRemove);
  }

  function handleMouseMove(event) {
    state.mouseX = event.clientX;
    state.mouseY = event.clientY;
  }

  function handleWindowResize() {
    if (state.densityMode !== 'auto') return;

    const nextDensityKey = getResolvedDensityKey();
    if (nextDensityKey === state.resolvedDensityKey) return;

    rerenderDayWithDensity(nextDensityKey);
  }

  function renderApp() {
    renderControls();
    renderDay();
    renderBookmarks();
    updateBookmarkCount();
  }

  function renderControls() {
    renderDayTabState();
    renderVenueFilterState();
    renderLegendState();
    renderDensityControls();
    renderBookmarkHighlightState();
  }

  function renderDayTabState() {
    dom.dayTabs.querySelectorAll('[data-day]').forEach(button => {
      button.classList.toggle('active', button.dataset.day === state.currentDay);
    });
  }

  function renderVenueFilterState() {
    dom.venueFilters.querySelectorAll('[data-group]').forEach(button => {
      button.classList.toggle('active', state.activeGroups.has(button.dataset.group));
    });
  }

  function renderLegendState() {
    dom.legend.querySelectorAll('[data-section]').forEach(item => {
      const shouldDim = state.activeSections && !state.activeSections.has(item.dataset.section);
      item.classList.toggle('dimmed', Boolean(shouldDim));
    });
  }

  function renderBookmarkHighlightState() {
    dom.bookmarkHighlightBtn.classList.toggle('active', state.bookmarkHighlight);
  }

  function renderDensityControls() {
    dom.densitySelector.querySelectorAll('[data-density]').forEach(button => {
      button.classList.toggle('active', button.dataset.density === state.densityMode);
    });

    dom.densityHint.textContent = state.densityMode === 'auto'
      ? '현재 ' + getDensityLabel(state.resolvedDensityKey)
      : getDensityLabel(state.resolvedDensityKey) + ' 고정';
  }

  function renderDay() {
    const totalWidth = getTotalWidth();
    const dayData = getCurrentDayData();
    const venuesByGroup = getVenuesForDay(dayData);
    const filmsByVenue = groupFilmsByVenue(dayData);

    dom.venueLabelScroll.innerHTML = '';
    dom.timelineContent.innerHTML = '';
    dom.timelineContent.style.width = totalWidth + 'px';
    dom.timeAxis.innerHTML = '';
    dom.timeAxis.style.width = totalWidth + 'px';

    const gridLines = document.createElement('div');
    gridLines.id = 'grid-lines';
    gridLines.style.width = totalWidth + 'px';
    dom.timelineContent.appendChild(gridLines);

    renderTimeAxis(gridLines);

    config.venueGroups.forEach(group => {
      const venues = venuesByGroup[group.id];
      if (!state.activeGroups.has(group.id) || venues.length === 0) return;
      renderVenueGroup(group, venues, filmsByVenue, totalWidth);
    });

    syncLabelScroll();
  }

  function renderTimeAxis(gridLines) {
    for (let minutes = Math.ceil(config.timeRange.start / 30) * 30; minutes <= config.timeRange.end; minutes += 30) {
      const x = timeToX(minutes);
      const isHour = minutes % 60 === 0;
      const hour = Math.floor(minutes / 60);
      const remainder = minutes % 60;

      const mark = document.createElement('div');
      mark.className = 'time-mark' + (isHour ? ' full-hour' : '');
      mark.style.left = x + 'px';
      mark.textContent = isHour ? hour + ':00' : hour + ':' + String(remainder).padStart(2, '0');
      dom.timeAxis.appendChild(mark);

      const line = document.createElement('div');
      line.className = isHour ? 'grid-line-hour' : 'grid-line-half';
      line.style.left = x + 'px';
      gridLines.appendChild(line);
    }
  }

  function renderVenueGroup(group, venues, filmsByVenue, totalWidth) {
    const labelHeader = document.createElement('div');
    labelHeader.className = 'venue-group-header';
    labelHeader.textContent = group.label;
    dom.venueLabelScroll.appendChild(labelHeader);

    const timelineHeader = document.createElement('div');
    timelineHeader.className = 'venue-group-header-timeline';
    timelineHeader.style.width = totalWidth + 'px';
    dom.timelineContent.appendChild(timelineHeader);

    venues.forEach(venue => {
      dom.venueLabelScroll.appendChild(createVenueLabel(venue, group));
      dom.timelineContent.appendChild(createVenueRow(filmsByVenue.get(venue) || [], totalWidth));
    });
  }

  function createVenueLabel(venue, group) {
    const label = document.createElement('div');
    label.className = 'venue-label';

    const dot = document.createElement('div');
    dot.className = 'vgroup-dot';
    dot.style.background = group.color;

    label.appendChild(dot);
    label.appendChild(document.createTextNode(shortenVenueName(venue)));

    return label;
  }

  function createVenueRow(films, totalWidth) {
    const row = document.createElement('div');
    row.className = 'row-wrapper';
    row.style.width = totalWidth + 'px';

    films.forEach(film => {
      row.appendChild(createFilmBlock(film));
    });

    return row;
  }

  function createFilmBlock(film) {
    const startMinutes = timeToMinutes(film.startTime);
    const endMinutes = timeToMinutes(film.endTime);

    if (!startMinutes || !endMinutes || startMinutes > config.timeRange.end) {
      return document.createDocumentFragment();
    }

    const x = timeToX(startMinutes);
    const width = Math.max(4, timeToX(Math.min(endMinutes, config.timeRange.end)) - x);
    const color = getSectionColor(film.section);
    const isBookmarked = state.bookmarks.has(film.code);
    const isDimmed = shouldDimFilm(film, isBookmarked);

    const block = document.createElement('div');
    block.className = 'film-block' + (isBookmarked ? ' bookmarked' : '');
    block.style.left = x + 'px';
    block.style.width = width + 'px';
    block.style.background = getFilmBackground(color, isBookmarked, isDimmed);
    block.style.borderColor = getFilmBorderColor(color, isBookmarked, isDimmed);
    block.style.opacity = isDimmed ? '0.15' : '1';
    block.style.boxShadow = getFilmShadow(isBookmarked);

    if (width > 20) {
      const title = document.createElement('div');
      title.className = 'film-title-text';
      title.textContent = film.title;
      block.appendChild(title);
    }

    block.addEventListener('mouseenter', () => showTooltip(film, color));
    block.addEventListener('mousemove', moveTooltip);
    block.addEventListener('mouseleave', hideTooltip);
    block.addEventListener('click', event => {
      event.stopPropagation();
      toggleBookmark(film);
      renderDay();
    });

    return block;
  }

  function shouldDimFilm(film, isBookmarked) {
    if (state.bookmarkHighlight && state.bookmarks.size > 0) {
      return !isBookmarked;
    }

    if (state.activeSections) {
      return !state.activeSections.has(film.section);
    }

    return false;
  }

  function getFilmBackground(color, isBookmarked, isDimmed) {
    if (state.bookmarkHighlight && isBookmarked) {
      return color + 'ee';
    }

    return color + (isDimmed ? '22' : 'cc');
  }

  function getFilmBorderColor(color, isBookmarked, isDimmed) {
    if (state.bookmarkHighlight && isBookmarked) {
      return '#ffd700';
    }

    return color + (isDimmed ? '55' : 'ff');
  }

  function getFilmShadow(isBookmarked) {
    if (state.bookmarkHighlight && isBookmarked) {
      return '0 0 0 2px #ffd70088, 0 2px 8px rgba(0,0,0,0.5)';
    }

    return '';
  }

  function renderBookmarks() {
    if (state.bookmarks.size === 0) {
      dom.bookmarksList.innerHTML = '<div class="bp-empty">관심 목록이 비어 있어요.<br>영화 블록을 클릭해서<br>추가해 보세요.</div>';
      return;
    }

    const grouped = new Map();

    state.allData.forEach(row => {
      if (!state.bookmarks.has(row.code)) return;
      if (!grouped.has(row.date)) grouped.set(row.date, []);
      grouped.get(row.date).push(row);
    });

    let html = '';

    Array.from(grouped.keys()).sort().forEach(date => {
      const day = dayLookup.get(date);
      const heading = day ? day.label + ' ' + day.sub : date;
      html += '<div class="bm-day-heading">' + escapeHtml(heading) + '</div>';

      grouped.get(date)
        .sort((a, b) => a.startTime.localeCompare(b.startTime))
        .forEach(row => {
          html += renderBookmarkRow(row);
        });
    });

    dom.bookmarksList.innerHTML = html;
  }

  function renderBookmarkRow(row) {
    const color = getSectionColor(row.section);
    const venue = formatBookmarkVenue(row.venue);

    return [
      '<div class="bm-item">',
      '<div class="bm-color" style="background:' + color + '"></div>',
      '<div class="bm-info">',
      '<div class="bm-title">' + escapeHtml(row.title) + '</div>',
      '<div class="bm-meta">' + escapeHtml(row.startTime + '–' + row.endTime + ' · ' + venue) + '</div>',
      '</div>',
      '<button type="button" class="bm-remove" data-bookmark-remove="' + escapeHtml(row.code) + '">✕</button>',
      '</div>',
    ].join('');
  }

  function updateBookmarkCount() {
    dom.bookmarkCount.textContent = state.bookmarks.size > 0 ? '(' + state.bookmarks.size + ')' : '';
    dom.bookmarkBtn.classList.toggle('has-items', state.bookmarks.size > 0);

    if (state.bookmarks.size === 0 && state.bookmarkHighlight) {
      state.bookmarkHighlight = false;
      renderBookmarkHighlightState();
    }
  }

  function toggleBookmark(film) {
    if (state.bookmarks.has(film.code)) state.bookmarks.delete(film.code);
    else state.bookmarks.add(film.code);

    renderBookmarks();
    updateBookmarkCount();
  }

  function removeBookmark(code) {
    state.bookmarks.delete(code);
    renderBookmarks();
    updateBookmarkCount();
    renderDay();
  }

  function toggleBookmarksPanel() {
    renderBookmarks();
    dom.bookmarksPanel.classList.toggle('open');
    dom.overlay.classList.toggle('open');
  }

  function closeBookmarksPanel() {
    dom.bookmarksPanel.classList.remove('open');
    dom.overlay.classList.remove('open');
  }

  function showTooltip(film, color) {
    const tags = getMetaTags(film.meta);
    const parts = [];

    parts.push('<div class="tt-section" style="color:' + color + '">' + escapeHtml(film.section || '—') + '</div>');
    parts.push('<div class="tt-title">' + escapeHtml(film.title) + '</div>');
    parts.push('<div class="tt-meta">');
    parts.push('<strong>상영관</strong> ' + escapeHtml(film.venue) + '<br>');
    parts.push('<strong>시간</strong> ' + escapeHtml(film.startTime + ' – ' + film.endTime));
    if (film.session) parts.push(' (' + escapeHtml(film.session) + ')');
    parts.push('<br>');
    if (film.code) parts.push('<strong>코드</strong> ' + escapeHtml(film.code));
    parts.push('</div>');

    if (film.shorts) {
      parts.push('<div class="tt-shorts">📽 ' + escapeHtml(film.shorts) + '</div>');
    }

    parts.push('<div class="tt-tags">');
    if (film.meta && film.meta.includes('GV')) {
      parts.push('<span class="tt-tag gv">GV</span>');
    }
    tags.forEach(tag => {
      parts.push('<span class="tt-tag">' + escapeHtml(tag) + '</span>');
    });
    parts.push('</div>');
    parts.push('<div class="tt-bookmark-hint">' + (state.bookmarks.has(film.code) ? '★ 관심 등록됨 (클릭으로 해제)' : '클릭하여 관심 목록에 추가') + '</div>');

    dom.tooltip.innerHTML = parts.join('');
    dom.tooltip.classList.add('visible');
    positionTooltip();
  }

  function moveTooltip() {
    positionTooltip();
  }

  function positionTooltip() {
    const tooltipWidth = 280;
    const tooltipHeight = dom.tooltip.offsetHeight || 150;
    const mouseX = state.mouseX;
    const mouseY = state.mouseY;
    let left = mouseX + 16;
    let top = mouseY + 16;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    if (left + tooltipWidth > viewportWidth) left = mouseX - tooltipWidth - 10;
    if (top + tooltipHeight > viewportHeight) top = mouseY - tooltipHeight - 10;

    dom.tooltip.style.left = left + 'px';
    dom.tooltip.style.top = top + 'px';
  }

  function hideTooltip() {
    dom.tooltip.classList.remove('visible');
  }

  function setDensityMode(mode) {
    if (!config.densityModes.some(item => item.id === mode)) return;
    if (mode === state.densityMode) return;

    state.densityMode = mode;
    rerenderDayWithDensity(getResolvedDensityKey());
  }

  function rerenderDayWithDensity(nextDensityKey) {
    const scrollRatio = dom.timelineScroll.scrollLeft / (dom.timelineScroll.scrollWidth || 1);

    applyDensitySettings(nextDensityKey);
    renderControls();
    renderDay();

    requestAnimationFrame(() => {
      dom.timelineScroll.scrollLeft = scrollRatio * dom.timelineScroll.scrollWidth;
    });
  }

  function applyDensitySettings(nextDensityKey = getResolvedDensityKey()) {
    const profile = config.densityProfiles[nextDensityKey];
    const rootStyle = document.documentElement.style;

    state.resolvedDensityKey = nextDensityKey;

    rootStyle.setProperty('--row-h', profile.rowHeight + 'px');
    rootStyle.setProperty('--label-w', profile.labelWidth + 'px');
    rootStyle.setProperty('--header-h', profile.headerHeight + 'px');
    rootStyle.setProperty('--time-scale', String(profile.scale));
    rootStyle.setProperty('--font-body', profile.bodyFont + 'px');
    rootStyle.setProperty('--font-ui', profile.uiFont + 'px');
    rootStyle.setProperty('--font-small', profile.smallFont + 'px');
    rootStyle.setProperty('--font-tiny', profile.tinyFont + 'px');
    rootStyle.setProperty('--font-tab', profile.tabFont + 'px');
    rootStyle.setProperty('--font-logo', profile.logoFont + 'px');
    rootStyle.setProperty('--font-logo-sub', profile.logoSubFont + 'px');
    rootStyle.setProperty('--font-tooltip-title', profile.tooltipTitleFont + 'px');
    rootStyle.setProperty('--font-bookmark-title', profile.bookmarkTitleFont + 'px');
  }

  function toggleBookmarkHighlight() {
    if (state.bookmarks.size === 0) return;

    state.bookmarkHighlight = !state.bookmarkHighlight;

    if (state.bookmarkHighlight && state.activeSections) {
      state.activeSections = null;
      renderLegendState();
    }

    renderBookmarkHighlightState();
    renderDay();
  }

  function switchDay(date) {
    state.currentDay = date;
    renderDayTabState();
    renderDay();
    queueTimelineScroll(50);
  }

  function toggleGroup(groupId) {
    if (state.activeGroups.has(groupId)) {
      if (state.activeGroups.size > 1) state.activeGroups.delete(groupId);
    } else {
      state.activeGroups.add(groupId);
    }

    renderVenueFilterState();
    renderDay();
  }

  function toggleSection(section) {
    if (state.bookmarkHighlight) {
      state.bookmarkHighlight = false;
      renderBookmarkHighlightState();
    }

    if (!state.activeSections) {
      state.activeSections = new Set([section]);
    } else if (state.activeSections.has(section) && state.activeSections.size === 1) {
      state.activeSections = null;
    } else {
      if (state.activeSections.has(section)) state.activeSections.delete(section);
      else state.activeSections.add(section);
      if (state.activeSections.size === 0) state.activeSections = null;
    }

    renderLegendState();
    renderDay();
  }

  function queueTimelineScroll(delay) {
    window.setTimeout(() => {
      dom.timelineScroll.scrollLeft = timeToX(config.timeRange.initialScroll) - 20;
    }, delay);
  }

  function syncLabelScroll() {
    dom.venueLabelScroll.scrollTop = dom.timelineScroll.scrollTop;
  }

  function getCurrentDayData() {
    return state.allData.filter(row => row.date === state.currentDay);
  }

  function groupFilmsByVenue(dayData) {
    const byVenue = new Map();

    dayData.forEach(row => {
      if (!byVenue.has(row.venue)) byVenue.set(row.venue, []);
      byVenue.get(row.venue).push(row);
    });

    return byVenue;
  }

  function getVenuesForDay(dayData) {
    const venueToGroup = new Map();

    dayData.forEach(row => {
      if (!venueToGroup.has(row.venue)) {
        venueToGroup.set(row.venue, getVenueGroup(row.venue));
      }
    });

    const grouped = { cgv: [], mega: [], other: [] };

    venueToGroup.forEach((group, venue) => {
      grouped[group.id].push(venue);
    });

    grouped.cgv.sort(sortVenueNames);
    grouped.mega.sort(sortVenueNames);
    grouped.other.sort();

    return grouped;
  }

  function sortVenueNames(a, b) {
    const numberA = parseInt(a.replace(/\D/g, '').slice(-2), 10) || 0;
    const numberB = parseInt(b.replace(/\D/g, '').slice(-2), 10) || 0;
    return numberA - numberB;
  }

  function getVenueGroup(venue) {
    return config.venueGroups.find(group => group.match(venue)) || config.venueGroups[config.venueGroups.length - 1];
  }

  function getSectionColor(section) {
    if (!section) return '#4a4a5a';

    for (const [key, color] of Object.entries(config.sectionColors)) {
      const normalizedKey = key.replace('특별전: ', '').replace('특별상영: ', '');
      if (section === key || section.includes(normalizedKey)) return color;
    }

    return '#5a5a6a';
  }

  function getResolvedDensityKey() {
    if (state.densityMode !== 'auto') return state.densityMode;
    return getAutoDensityKey(window.innerWidth, window.innerHeight);
  }

  function getAutoDensityKey(width, height) {
    const rules = config.autoDensityRules;

    if (width >= rules.wideMinWidth && height >= rules.wideMinHeight) {
      return 'wide';
    }

    if (width <= rules.compactMaxWidth || height <= rules.compactMaxHeight) {
      return 'compact';
    }

    return 'default';
  }

  function getActiveDensityProfile() {
    return config.densityProfiles[state.resolvedDensityKey || getResolvedDensityKey()];
  }

  function getDensityLabel(densityKey) {
    const mode = config.densityModes.find(item => item.id === densityKey);
    return mode ? mode.label : densityKey;
  }

  function getTotalWidth() {
    return Math.round((config.timeRange.end - config.timeRange.start) * getActiveDensityProfile().scale);
  }

  function timeToX(minutes) {
    return (minutes - config.timeRange.start) * getActiveDensityProfile().scale;
  }

  function timeToMinutes(value) {
    if (!value) return null;
    const [hours, minutes] = value.split(':').map(Number);
    return hours * 60 + minutes;
  }

  function parseCSV(text) {
    const lines = text.trim().split('\n');
    const rows = [];

    for (let index = 1; index < lines.length; index += 1) {
      const fields = parseCSVLine(lines[index]);
      if (fields.length < 8) continue;

      const [date, venue, session, section, title, shorts, startTime, endTime, code, meta = ''] = fields;
      if (!startTime || !endTime) continue;

      rows.push({
        date,
        venue,
        session,
        section,
        title,
        shorts,
        startTime,
        endTime,
        code,
        meta,
      });
    }

    return rows;
  }

  function parseCSVLine(line) {
    const fields = [];
    let current = '';
    let inQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];

      if (character === '"' && !inQuotes) {
        inQuotes = true;
        continue;
      }

      if (character === '"' && inQuotes) {
        inQuotes = false;
        continue;
      }

      if (character === ',' && !inQuotes) {
        fields.push(current);
        current = '';
        continue;
      }

      current += character;
    }

    fields.push(current);
    return fields;
  }

  function shortenVenueName(venue) {
    return venue
      .replace('CGV전주고사 ', '')
      .replace('메가박스 전주객사 ', '')
      .replace('전주디지털독립영화관', '전주디지털')
      .replace('전북대학교 삼성문화회관', '전북대 삼성')
      .replace('한국소리문화의전당 모악당', '소리문화전당');
  }

  function formatBookmarkVenue(venue) {
    return venue
      .replace('CGV전주고사 ', 'CGV ')
      .replace('메가박스 전주객사 ', '메가박스 ');
  }

  function getMetaTags(meta) {
    if (!meta) return [];
    return meta
      .replace('GV', '')
      .replace(/([A-Z])(\d+|All)/g, '$1$2 ')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
})();
