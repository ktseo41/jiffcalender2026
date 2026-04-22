(function initScheduleApp() {
  const dataSource = window.JIFF_SCHEDULE_DATA;
  const config = window.JIFF_SCHEDULE_CONFIG;
  const talkTalkSource = window.JIFF_TALKTALK_DATA || { overview: null, items: [] };
  const alleyScreeningSource = window.JIFF_ALLEY_SCREENING_DATA || { overview: null, items: [] };
  const forumProgramsSource = window.JIFF_FORUM_PROGRAMS_DATA || { overview: null, items: [] };
  const outdoorScreeningSource = window.JIFF_OUTDOOR_SCREENING_DATA || { overview: null, items: [] };
  const xMajungSource = window.JIFF_X_MAJUNG_DATA || { byCode: {} };
  const talkTalkRuntimeFactory = window.JIFF_TALKTALK_RUNTIME && window.JIFF_TALKTALK_RUNTIME.createTalkTalkRuntime;
  const BOOKMARK_STORAGE_KEY = 'jiff2026-bookmarks';
  const DAY_QUERY_PARAM = 'day';
  const MOBILE_NOTICE_STORAGE_KEY = 'jiff2026-mobile-notice-dismissed';
  const LAYOUT_MODE_STORAGE_KEY = 'jiff2026-layout-mode';
  const STAR_SYMBOL_URL = './jiff2026/icons/star.svg#bookmark-star';
  const OPEN_ENDED_SLOT_FALLBACK_MINUTES = 120;
  const MOBILE_COMPACT_TITLE_PRESERVERS = [
    { pattern: /^라이브 필름 퍼포먼스/, label: '라이브 필름 퍼포먼스' },
    { pattern: /^영화보다 낯선 단편 \d+/, extract: true },
    { pattern: /^하버드 필름 아카이브 단편/, label: '하버드 필름 아카이브 단편' },
    { pattern: /^박세영, 모든 것은 영화가 된다: 단편$/, label: '박세영, 모든 것은 영화가 된다: 단편' },
    { pattern: /^수상작 상영 \d+/, extract: true },
  ];
  const COMBINED_PROGRAM_LANES = Object.freeze([
    Object.freeze({ id: 'talktalk', label: '전주톡톡', mobileLabel: '톡톡', color: '#637ad0' }),
    Object.freeze({ id: 'events', label: '특별행사', mobileLabel: '행사', color: '#b98649' }),
    Object.freeze({ id: 'awards', label: '수상작 상영', mobileLabel: '수상작', color: '#7d8996' }),
  ]);
  const ALLEY_SCREENING_COLOR = '#6f8a67';
  const FORUM_PROGRAM_COLOR = '#8a6f9f';
  const OUTDOOR_SCREENING_COLOR = '#6c8f80';
  const ALLEY_SCREENING_VENUE_LABELS = Object.freeze({
    '치평주차장 옆': '치평주차장',
    '전주중앙교회 광장': '중앙교회',
    '티아라 네일샵 옆': '티아라 네일샵',
    '전주 풍남문': '풍남문',
    '완판본문화관': '완판본',
  });

  if (!dataSource || !config) {
    throw new Error('JIFF schedule assets are missing.');
  }

  const allData = inferOpenEndedRows(enrichRows(parseCSV(dataSource.csvRaw)));

  const state = {
    allData,
    currentDay: resolveInitialDay(),
    viewMode: 'schedule',
    activeGroups: new Set(config.defaultState.activeGroups),
    activeSections: null,
    searchQuery: '',
    normalizedSearchQuery: '',
    bookmarks: loadBookmarks(allData),
    bookmarkHighlight: false,
    densityMode: config.defaultState.densityMode,
    resolvedDensityKey: null,
    compactViewport: false,
    mobileLayout: false,
    desktopViewForced: readDesktopViewForced(),
    mobileHeaderSearchOpen: false,
    mobileControlsOpen: false,
    mobileVenueColumns: [],
    mobileNoticeDismissed: readMobileNoticeDismissed(),
    mouseX: 0,
    mouseY: 0,
  };

  const dom = {};
  const dayLookup = new Map(config.days.map(day => [day.date, day]));
  const talkTalk = talkTalkRuntimeFactory
    ? talkTalkRuntimeFactory({ source: talkTalkSource, dayLookup, normalizeSearchValue, getVenueGroup })
    : null;

  if (!talkTalk) {
    throw new Error('JIFF talktalk runtime is missing.');
  }

  cacheDom();
  syncViewportMode();
  bindEvents();
  buildStaticUI();
  applyDensitySettings();
  renderApp();
  syncCurrentDayUrl();
  queueTimelineScroll(100);
  requestAnimationFrame(() => {
    document.body.classList.add('app-ready');
  });

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
    dom.controls = document.getElementById('controls');
    dom.logo = document.querySelector('#app-header .logo');
    dom.dayTabsShell = document.getElementById('dayTabsShell');
    dom.dayTabs = document.getElementById('dayTabs');
    dom.desktopViewModeTabs = document.getElementById('desktopViewModeTabs');
    dom.mobileViewModeTabs = document.getElementById('mobileViewModeTabs');
    dom.venueFilters = document.getElementById('venueFilters');
    dom.legend = document.getElementById('legend');
    dom.searchInput = document.getElementById('searchInput');
    dom.searchClearBtn = document.getElementById('searchClearBtn');
    dom.mobileHeaderSearch = document.getElementById('mobileHeaderSearch');
    dom.mobileSearchInput = document.getElementById('mobileSearchInput');
    dom.mobileSearchClearBtn = document.getElementById('mobileSearchClearBtn');
    dom.mobileDesktopToggleBtn = document.getElementById('mobileDesktopToggleBtn');
    dom.mobileLayoutToggleBtn = document.getElementById('mobileLayoutToggleBtn');
    dom.mobileSearchToggleBtn = document.getElementById('mobileSearchToggleBtn');
    dom.mobileControlsToggleBtn = document.getElementById('mobileControlsToggleBtn');
    dom.bookmarkBtn = document.getElementById('bookmarkBtn');
    dom.bookmarkCount = document.getElementById('bmCount');
    dom.bookmarkHighlightBtn = document.getElementById('bmHighlightBtn');
    dom.venueLabelScroll = document.getElementById('venue-label-scroll');
    dom.timelineScroll = document.getElementById('timeline-scroll');
    dom.timeAxis = document.getElementById('time-axis');
    dom.timelineContent = document.getElementById('timeline-content');
    dom.mobileNotice = document.getElementById('mobile-notice');
    dom.mobileNoticeCloseBtn = document.getElementById('mobileNoticeCloseBtn');
    dom.mobileTimeLabelScroll = document.getElementById('mobile-time-label-scroll');
    dom.mobileGridScroll = document.getElementById('mobile-grid-scroll');
    dom.mobileVenueAxis = document.getElementById('mobile-venue-axis');
    dom.mobileGridContent = document.getElementById('mobile-grid-content');
    dom.mobileVenueCurrent = null;
    dom.programsView = document.getElementById('programs-view');
    dom.programsViewContent = document.getElementById('programs-view-content');
    dom.programsTimelineScroll = null;
    dom.programsMobileGridScroll = null;
    dom.tooltip = document.getElementById('tooltip');
    dom.overlay = document.getElementById('overlay');
    dom.detailChooserPanel = document.getElementById('detail-chooser-panel');
    dom.detailChooserTitle = document.getElementById('detailChooserTitle');
    dom.detailChooserSubtitle = document.getElementById('detailChooserSubtitle');
    dom.detailChooserList = document.getElementById('detailChooserList');
    dom.detailChooserCloseBtn = document.getElementById('detailChooserCloseBtn');
    dom.bookmarksPanel = document.getElementById('bookmarks-panel');
    dom.bookmarksTitle = document.getElementById('bookmarksTitle');
    dom.bookmarksList = document.getElementById('bookmarks-list');
    dom.bookmarksClearBtn = document.getElementById('bookmarksClearBtn');
    dom.bookmarksDownloadBtn = document.getElementById('bookmarksDownloadBtn');
    dom.bookmarksCloseBtn = document.getElementById('bookmarksCloseBtn');
  }

  function bindEvents() {
    dom.dayTabs.addEventListener('click', handleDayTabClick);
    dom.dayTabs.addEventListener('scroll', updateDayTabOverflowHints, { passive: true });
    dom.venueFilters.addEventListener('click', handleVenueFilterClick);
    dom.legend.addEventListener('click', handleLegendClick);
    dom.searchInput.addEventListener('input', handleSearchInput);
    dom.searchClearBtn.addEventListener('click', clearSearch);
    dom.mobileSearchInput.addEventListener('input', handleMobileSearchInput);
    dom.mobileSearchClearBtn.addEventListener('click', handleMobileSearchClearClick);
    dom.mobileDesktopToggleBtn.addEventListener('click', toggleDesktopViewMode);
    dom.mobileLayoutToggleBtn.addEventListener('click', toggleDesktopViewMode);
    dom.mobileSearchToggleBtn.addEventListener('click', openMobileHeaderSearch);
    dom.mobileControlsToggleBtn.addEventListener('click', toggleMobileControls);
    if (dom.desktopViewModeTabs) dom.desktopViewModeTabs.addEventListener('click', handleViewModeClick);
    if (dom.mobileViewModeTabs) dom.mobileViewModeTabs.addEventListener('click', handleViewModeClick);
    dom.bookmarksList.addEventListener('click', handleBookmarkListClick);
    dom.bookmarkBtn.addEventListener('click', toggleBookmarksPanel);
    dom.bookmarkHighlightBtn.addEventListener('click', toggleBookmarkHighlight);
    dom.bookmarksClearBtn.addEventListener('click', clearAllBookmarks);
    dom.bookmarksDownloadBtn.addEventListener('click', downloadBookmarksCSV);
    dom.bookmarksCloseBtn.addEventListener('click', closeBookmarksPanel);
    dom.mobileNoticeCloseBtn.addEventListener('click', dismissMobileNotice);
    dom.detailChooserCloseBtn.addEventListener('click', closeDetailChooser);
    dom.detailChooserList.addEventListener('click', handleDetailChooserListClick);
    dom.overlay.addEventListener('click', closeOpenPanels);
    dom.timelineScroll.addEventListener('scroll', syncLabelScroll);
    dom.mobileGridScroll.addEventListener('scroll', syncMobileTimeLabelScroll);
    document.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('resize', handleWindowResize);
  }

  function buildStaticUI() {
    buildDayTabs();
    buildVenueFilters();
    buildLegend();
    renderMobileNotice();
    renderMobileControlsState();
    renderViewportToggle();
    renderViewModeTabs();
    updateDayTabOverflowHints();
  }

  function syncViewportMode() {
    const nextCompactViewport = isMobileViewport();
    const nextMobileLayout = nextCompactViewport && !state.desktopViewForced;
    const hasChanged = nextCompactViewport !== state.compactViewport || nextMobileLayout !== state.mobileLayout;

    state.compactViewport = nextCompactViewport;
    state.mobileLayout = nextMobileLayout;
    state.mobileHeaderSearchOpen = nextCompactViewport ? (hasSearchQuery() || state.mobileHeaderSearchOpen) : false;
    state.mobileControlsOpen = false;
    document.body.classList.toggle('compact-viewport', nextCompactViewport);
    document.body.classList.toggle('mobile-layout', nextMobileLayout);

    return hasChanged;
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
      item.innerHTML = '<div class="legend-dot" style="background:' + getSectionColor(section) + '"></div><span class="legend-label">' + escapeHtml(section) + '</span>';
      fragment.appendChild(item);
    });

    dom.legend.innerHTML = '';
    dom.legend.appendChild(fragment);
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

  function handleSearchInput(event) {
    setSearchQuery(event.target.value);
  }

  function handleMobileSearchInput(event) {
    setSearchQuery(event.target.value);
  }

  function handleViewModeClick(event) {
    const button = event.target.closest('[data-view-mode]');
    if (!button || button.disabled) return;
    setViewMode(button.dataset.viewMode);
  }

  function handleBookmarkListClick(event) {
    const button = event.target.closest('[data-bookmark-remove]');
    if (!button) return;
    removeBookmark(button.dataset.bookmarkRemove);
  }

  function handleDetailChooserListClick(event) {
    const closeButton = event.target.closest('[data-detail-close]');
    if (closeButton) {
      closeDetailChooser();
      return;
    }

    const scrollButton = event.target.closest('[data-detail-scroll]');
    if (scrollButton) {
      const target = dom.detailChooserList.querySelector('[data-detail-section="' + scrollButton.dataset.detailScroll + '"]');
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      return;
    }

    const bookmarkButton = event.target.closest('[data-detail-bookmark]');
    if (!bookmarkButton) return;

    const film = getFilmByCode(bookmarkButton.dataset.detailBookmark);
    if (!film) return;

    toggleBookmark(film);
    renderDay();
    renderDetailChooser(film);
  }

  function handleMouseMove(event) {
    state.mouseX = event.clientX;
    state.mouseY = event.clientY;
  }

  function handleMobileSearchClearClick() {
    if (hasSearchQuery()) {
      clearSearch();
      return;
    }

    closeMobileHeaderSearch();
  }

  function handleWindowResize() {
    const layoutChanged = syncViewportMode();

    renderMobileNotice();
    renderViewportToggle();
    updateDayTabOverflowHints();

    if (layoutChanged) {
      hideTooltip();
      closeOpenPanels();

      if (state.densityMode === 'auto') {
        applyDensitySettings();
      }

      renderApp();

      if (!state.mobileLayout) {
        queueTimelineScroll(50);
      }
      return;
    }

    if (state.densityMode !== 'auto') return;

    const nextDensityKey = getResolvedDensityKey();
    if (nextDensityKey === state.resolvedDensityKey) return;

    rerenderDayWithDensity(nextDensityKey);
  }

  function handlePopState() {
    const nextDay = resolveInitialDay();
    if (nextDay === state.currentDay) return;

    closeOpenPanels();
    state.currentDay = nextDay;
    renderDayTabState();
    renderDay();
    queueTimelineScroll(50);
  }

  function renderApp() {
    renderControls();
    renderDay();
    renderBookmarks();
    updateBookmarkCount();
  }

  function renderControls() {
    renderDayTabState();
    renderViewModeTabs();
    renderVenueFilterState();
    renderLegendState();
    renderSearchControls();
    renderBookmarkHighlightState();
    renderMobileControlsState();
    renderViewportToggle();
  }

  function renderViewModeTabs() {
    const tabGroups = [dom.desktopViewModeTabs, dom.mobileViewModeTabs].filter(Boolean);
    if (tabGroups.length === 0) return;
    const searchMatchViewModes = getViewModeSearchMatches();

    document.body.classList.toggle('programs-view-mode', state.viewMode === 'programs');
    document.body.classList.toggle('combined-view-mode', state.viewMode === 'combined');

    tabGroups.forEach(group => {
      const useMobileLabel = group === dom.mobileViewModeTabs;

      group.querySelectorAll('[data-view-mode]').forEach(button => {
        const isActive = button.dataset.viewMode === state.viewMode;
        const nextLabel = useMobileLabel
          ? (button.dataset.mobileLabel || button.textContent)
          : (button.dataset.desktopLabel || button.textContent);
        button.classList.toggle('active', isActive);
        button.classList.toggle('has-search-match', searchMatchViewModes.has(button.dataset.viewMode));
        button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        if (button.textContent !== nextLabel) {
          button.textContent = nextLabel;
        }
      });
    });
  }

  function renderDayTabState() {
    const searchMatchDates = getSearchMatchDates();

    dom.dayTabs.querySelectorAll('[data-day]').forEach(button => {
      button.classList.toggle('active', button.dataset.day === state.currentDay);
      button.classList.toggle('has-search-match', searchMatchDates.has(button.dataset.day));
    });

    updateDayTabOverflowHints();
  }

  function updateDayTabOverflowHints() {
    if (!dom.dayTabsShell) return;

    const maxScrollLeft = Math.max(0, dom.dayTabs.scrollWidth - dom.dayTabs.clientWidth);
    const canScrollLeft = dom.dayTabs.scrollLeft > 4;
    const canScrollRight = dom.dayTabs.scrollLeft < maxScrollLeft - 4;

    dom.dayTabsShell.classList.toggle('can-scroll-left', canScrollLeft);
    dom.dayTabsShell.classList.toggle('can-scroll-right', canScrollRight);
  }

  function renderVenueFilterState() {
    dom.venueFilters.querySelectorAll('[data-group]').forEach(button => {
      const isActive = state.activeGroups.has(button.dataset.group);
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  function renderLegendState() {
    dom.legend.querySelectorAll('[data-section]').forEach(item => {
      const shouldDim = state.activeSections && !state.activeSections.has(item.dataset.section);
      item.classList.toggle('active', !shouldDim);
      item.classList.toggle('dimmed', Boolean(shouldDim));
      item.setAttribute('aria-pressed', shouldDim ? 'false' : 'true');
    });
  }

  function renderBookmarkHighlightState() {
    dom.bookmarkHighlightBtn.classList.toggle('active', state.bookmarkHighlight);
    dom.bookmarkHighlightBtn.setAttribute('aria-pressed', state.bookmarkHighlight ? 'true' : 'false');
  }

  function renderMobileControlsState() {
    const isOpen = state.compactViewport && state.mobileControlsOpen;

    dom.controls.classList.toggle('mobile-open', isOpen);
    dom.mobileControlsToggleBtn.classList.toggle('is-active', isOpen);
    dom.mobileControlsToggleBtn.setAttribute('aria-label', isOpen ? '필터 닫기' : '필터 열기');
    dom.mobileControlsToggleBtn.setAttribute('title', isOpen ? '필터 닫기' : '필터');
  }

  function renderSearchControls() {
    const isMobileSearchVisible = state.compactViewport && (state.mobileHeaderSearchOpen || hasSearchQuery());

    if (dom.searchInput.value !== state.searchQuery) {
      dom.searchInput.value = state.searchQuery;
    }

    if (dom.mobileSearchInput.value !== state.searchQuery) {
      dom.mobileSearchInput.value = state.searchQuery;
    }

    dom.searchClearBtn.classList.toggle('hidden', !hasSearchQuery());
    dom.mobileHeaderSearch.classList.toggle('is-open', isMobileSearchVisible);
    dom.logo.classList.toggle('hidden-by-search', isMobileSearchVisible);
    dom.mobileSearchToggleBtn.classList.toggle('is-active', isMobileSearchVisible);
    dom.bookmarkBtn.classList.toggle('hidden-by-search', isMobileSearchVisible);
    dom.bookmarkBtn.setAttribute('aria-hidden', isMobileSearchVisible ? 'true' : 'false');
    dom.mobileSearchClearBtn.setAttribute('aria-label', hasSearchQuery() ? '검색 지우기' : '검색 닫기');
  }

  function renderViewportToggle() {
    const shouldShow = state.compactViewport;
    const isDesktopMode = shouldShow && !state.mobileLayout;
    const currentModeLabel = isDesktopMode ? '가로' : '세로';
    const nextModeLabel = isDesktopMode ? '세로' : '가로';

    dom.mobileDesktopToggleBtn.hidden = true;
    dom.mobileDesktopToggleBtn.classList.remove('is-active');
    dom.mobileDesktopToggleBtn.dataset.viewMode = isDesktopMode ? 'horizontal' : 'vertical';
    dom.mobileDesktopToggleBtn.setAttribute('aria-pressed', 'false');
    dom.mobileDesktopToggleBtn.setAttribute('aria-label', '현재 ' + currentModeLabel + ' 보기, 눌러서 ' + nextModeLabel + ' 보기로 전환');
    dom.mobileDesktopToggleBtn.setAttribute('title', nextModeLabel + ' 보기로 전환');

    dom.mobileLayoutToggleBtn.hidden = !shouldShow;
    dom.mobileLayoutToggleBtn.classList.toggle('is-active', isDesktopMode);
    dom.mobileLayoutToggleBtn.setAttribute('aria-pressed', isDesktopMode ? 'true' : 'false');
    dom.mobileLayoutToggleBtn.setAttribute('aria-label', '현재 ' + currentModeLabel + ' 보기, 눌러서 ' + nextModeLabel + ' 보기로 전환');
    dom.mobileLayoutToggleBtn.setAttribute('title', nextModeLabel + ' 보기로 전환');
    dom.mobileLayoutToggleBtn.textContent = '보기 방향: ' + currentModeLabel;
  }

  function renderMobileNotice() {
    if (!dom.mobileNotice) return;

    const hasOpenPanel = state.mobileControlsOpen
      || dom.bookmarksPanel.classList.contains('open')
      || dom.detailChooserPanel.classList.contains('open');
    const hasActiveFilter = state.bookmarkHighlight
      || Boolean(state.activeSections)
      || hasSearchQuery()
      || state.activeGroups.size !== config.venueGroups.length;
    const shouldShow = !state.mobileNoticeDismissed
      && state.compactViewport
      && !hasOpenPanel
      && !hasActiveFilter;

    dom.mobileNotice.classList.toggle('visible', shouldShow);
    dom.mobileNotice.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
  }

  function dismissMobileNotice() {
    if (state.mobileNoticeDismissed) return;

    state.mobileNoticeDismissed = true;
    writeMobileNoticeDismissed(true);
    renderMobileNotice();
  }

  function renderDay() {
    const dayData = getCurrentDayData();

    if (state.viewMode === 'programs') {
      renderProgramsTimelineDay(dayData);
      return;
    }

    if (state.mobileLayout) {
      renderMobileDay(dayData);
    } else {
      renderTimelineDay(dayData);
    }

    clearProgramsView();
  }

  function clearProgramsView() {
    dom.programsTimelineScroll = null;
    dom.programsMobileGridScroll = null;
    if (dom.programsViewContent) {
      dom.programsViewContent.innerHTML = '';
    }
  }

  function renderProgramsTimelineDay(dayData) {
    const lanes = getProgramsViewLanes(dayData);
    const totalItems = lanes.reduce((count, lane) => count + lane.items.length, 0);

    dom.programsViewContent.innerHTML = '';
    dom.programsViewContent.classList.toggle('is-combined-mode', state.viewMode === 'combined');
    dom.programsViewContent.classList.toggle('is-programs-mode', state.viewMode === 'programs');

    if (lanes.length === 0) {
      dom.programsViewContent.appendChild(createProgramsEmptyState());
      return;
    }

    dom.programsViewContent.appendChild(createProgramsTimelineHeader(totalItems));
    dom.programsViewContent.appendChild(
      state.mobileLayout
        ? createMobileProgramsTimeline(lanes)
        : createDesktopProgramsTimeline(lanes)
    );
  }

  function createProgramsEmptyState() {
    const emptyState = document.createElement('div');

    emptyState.className = 'programs-empty';
    emptyState.innerHTML = [
      '<div class="programs-empty-card">',
      '<div class="programs-empty-title">조건에 맞는 별도 프로그램이 없어요.</div>',
      '<div class="programs-empty-copy">검색어를 지우거나 상영관, 섹션, 관심 필터를 조금 넓혀 보세요.</div>',
      '</div>',
    ].join('');

    return emptyState;
  }

  function createProgramsTimelineHeader(totalItems) {
    const header = document.createElement('div');
    const title = document.createElement('h3');
    const meta = document.createElement('div');

    header.className = 'programs-timeline-header';
    title.className = 'programs-timeline-title';
    title.textContent = '별도 프로그램';
    meta.className = 'programs-timeline-meta';
    meta.textContent = totalItems + '건';

    header.appendChild(title);
    header.appendChild(meta);
    return header;
  }

  function createDesktopProgramsTimeline(lanes) {
    const timelineRows = getCombinedProgramTimelineRows(lanes);
    const timelineEnd = getTimelineEnd(timelineRows);
    const totalWidth = getTotalWidth(timelineEnd);
    const area = document.createElement('div');
    const labels = document.createElement('div');
    const spacer = document.createElement('div');
    const labelScroll = document.createElement('div');
    const scroll = document.createElement('div');
    const timeAxis = document.createElement('div');
    const content = document.createElement('div');
    const gridLines = document.createElement('div');

    area.className = 'programs-timetable-area';
    labels.className = 'programs-venue-labels';
    spacer.className = 'programs-venue-label-spacer';
    labelScroll.className = 'programs-venue-label-scroll';
    scroll.className = 'programs-timeline-scroll';
    timeAxis.className = 'programs-time-axis';
    content.className = 'programs-timeline-content';
    content.style.width = totalWidth + 'px';
    timeAxis.style.width = totalWidth + 'px';
    gridLines.className = 'programs-grid-lines';
    gridLines.style.width = totalWidth + 'px';
    content.appendChild(gridLines);

    renderProgramsDesktopTimeAxis(timeAxis, gridLines, timelineEnd);

    lanes.forEach(lane => {
      labelScroll.appendChild(createCombinedProgramLaneLabel(lane));
      content.appendChild(createCombinedProgramLaneRow(lane, totalWidth, timelineEnd));
    });

    scroll.addEventListener('scroll', () => {
      labelScroll.scrollTop = scroll.scrollTop;
    }, { passive: true });

    labels.appendChild(spacer);
    labels.appendChild(labelScroll);
    scroll.appendChild(timeAxis);
    scroll.appendChild(content);
    area.appendChild(labels);
    area.appendChild(scroll);

    requestAnimationFrame(() => {
      const fallbackScrollLeft = timeToX(config.timeRange.initialScroll) - 20;
      scroll.scrollLeft = state.viewMode === 'combined' && dom.timelineScroll
        ? dom.timelineScroll.scrollLeft
        : fallbackScrollLeft;
    });

    dom.programsTimelineScroll = scroll;

    return area;
  }

  function renderProgramsDesktopTimeAxis(timeAxis, gridLines, timelineEnd) {
    for (let minutes = Math.ceil(config.timeRange.start / 30) * 30; minutes <= timelineEnd; minutes += 30) {
      const x = timeToX(minutes);
      const isHour = minutes % 60 === 0;
      const mark = document.createElement('div');
      const line = document.createElement('div');

      mark.className = 'time-mark' + (isHour ? ' full-hour' : '');
      mark.style.left = x + 'px';
      mark.textContent = formatAxisTime(minutes);
      timeAxis.appendChild(mark);

      line.className = isHour ? 'grid-line-hour' : 'grid-line-half';
      line.style.left = x + 'px';
      gridLines.appendChild(line);
    }
  }

  function createMobileProgramsTimeline(lanes) {
    const columns = getMobileCombinedProgramColumns(lanes);
    const timelineRows = getCombinedProgramTimelineRows(lanes);
    const timelineEnd = getTimelineEnd(timelineRows);
    const totalWidth = getMobileGridWidth(columns.length);
    const totalHeight = getMobileGridHeight(timelineEnd);
    const shell = document.createElement('div');
    const timeLabels = document.createElement('div');
    const spacer = document.createElement('div');
    const timeLabelScroll = document.createElement('div');
    const gridScroll = document.createElement('div');
    const venueAxis = document.createElement('div');
    const gridContent = document.createElement('div');
    const gridLines = document.createElement('div');

    shell.className = 'programs-mobile-schedule';
    timeLabels.className = 'programs-mobile-time-labels';
    spacer.className = 'mobile-time-label-spacer programs-mobile-time-label-spacer';
    timeLabelScroll.className = 'programs-mobile-time-label-scroll';
    gridScroll.className = 'programs-mobile-grid-scroll';
    venueAxis.className = 'programs-mobile-venue-axis';
    gridContent.className = 'programs-mobile-grid-content';
    gridContent.style.width = totalWidth + 'px';
    gridContent.style.height = totalHeight + 'px';
    venueAxis.style.width = totalWidth + 'px';
    gridLines.className = 'programs-mobile-grid-lines';
    gridLines.style.width = totalWidth + 'px';
    gridLines.style.height = totalHeight + 'px';
    gridContent.appendChild(gridLines);

    renderProgramsMobileTimeAxis(timeLabelScroll, timelineEnd, totalHeight);
    renderProgramsMobileVenueAxis(venueAxis, columns);
    renderProgramsMobileGridLines(gridLines, columns.length, timelineEnd);

    columns.forEach((entry, index) => {
      entry.lane.items.forEach(programEntry => {
        const block = createMobileCombinedProgramBlock(programEntry, entry.lane, index, timelineEnd);
        if (block) gridContent.appendChild(block);
      });
    });

    gridScroll.addEventListener('scroll', () => {
      timeLabelScroll.scrollTop = gridScroll.scrollTop;
    }, { passive: true });

    timeLabels.appendChild(spacer);
    timeLabels.appendChild(timeLabelScroll);
    gridScroll.appendChild(venueAxis);
    gridScroll.appendChild(gridContent);
    shell.appendChild(timeLabels);
    shell.appendChild(gridScroll);

    requestAnimationFrame(() => {
      if (state.viewMode === 'combined' && dom.mobileGridScroll) {
        gridScroll.scrollLeft = dom.mobileGridScroll.scrollLeft;
      }
    });

    dom.programsMobileGridScroll = gridScroll;

    return shell;
  }

  function renderProgramsMobileTimeAxis(timeLabelScroll, timelineEnd, totalHeight) {
    const rail = document.createElement('div');

    rail.className = 'mobile-time-rail';
    rail.style.height = totalHeight + 'px';

    for (let minutes = Math.ceil(config.timeRange.start / 30) * 30; minutes <= timelineEnd; minutes += 30) {
      const mark = document.createElement('div');
      const isHour = minutes % 60 === 0;

      mark.className = 'mobile-time-mark' + (isHour ? ' full-hour' : '');
      mark.style.top = mobileTimeToY(minutes) + 'px';
      mark.textContent = formatAxisTime(minutes);
      rail.appendChild(mark);
    }

    timeLabelScroll.appendChild(rail);
  }

  function renderProgramsMobileVenueAxis(venueAxis, columns) {
    const columnWidth = getMobileVenueColumnWidth();
    const groups = [];
    let activeGroup = null;

    columns.forEach((entry, index) => {
      const parts = getMobileColumnHeaderParts(entry);

      if (!activeGroup || activeGroup.label !== parts.primary) {
        activeGroup = {
          label: parts.primary,
          startIndex: index,
          count: 1,
        };
        groups.push(activeGroup);
      } else {
        activeGroup.count += 1;
      }
    });

    groups.forEach(group => {
      const groupHead = document.createElement('div');

      groupHead.className = 'mobile-venue-grouphead';
      groupHead.style.left = String(group.startIndex * columnWidth) + 'px';
      groupHead.style.width = String(group.count * columnWidth) + 'px';
      groupHead.textContent = group.label;
      venueAxis.appendChild(groupHead);
    });

    columns.forEach((entry, index) => {
      const header = document.createElement('div');
      const secondary = document.createElement('div');
      const parts = getMobileColumnHeaderParts(entry);

      header.className = 'mobile-venue-roomhead';
      header.style.left = String(index * columnWidth) + 'px';
      header.style.width = String(columnWidth) + 'px';

      secondary.className = 'mobile-venue-room';
      secondary.textContent = parts.secondary || parts.primary;
      header.appendChild(secondary);
      venueAxis.appendChild(header);
    });
  }

  function renderProgramsMobileGridLines(gridLines, venueCount, timelineEnd) {
    const columnWidth = getMobileVenueColumnWidth();

    for (let minutes = Math.ceil(config.timeRange.start / 30) * 30; minutes <= timelineEnd; minutes += 30) {
      const line = document.createElement('div');
      const isHour = minutes % 60 === 0;

      line.className = isHour ? 'mobile-grid-line-hour' : 'mobile-grid-line-half';
      line.style.top = mobileTimeToY(minutes) + 'px';
      gridLines.appendChild(line);
    }

    for (let index = 1; index < venueCount; index += 1) {
      const line = document.createElement('div');

      line.className = 'mobile-grid-line-venue';
      line.style.left = String(index * columnWidth) + 'px';
      gridLines.appendChild(line);
    }
  }


  function renderTimelineDay(dayData) {
    const scheduleRows = getScheduleRowsForCurrentMode(dayData);
    const supplementalProgramLanes = state.viewMode === 'combined'
      ? getCombinedProgramLanes(dayData)
      : state.viewMode === 'schedule'
        ? getScheduleSupplementalProgramLanes()
        : [];
    const talkTalkDayItems = [];
    const timelineTalkTalkItems = talkTalkDayItems;
    const timelineEnd = getTimelineEnd(
      scheduleRows
        .concat(talkTalk.getTimelineRows(timelineTalkTalkItems))
        .concat(getCombinedProgramTimelineRows(supplementalProgramLanes))
    );
    const totalWidth = getTotalWidth(timelineEnd);
    const venuesByGroup = getVenuesForDay(scheduleRows, talkTalkDayItems);
    const filmsByVenue = groupFilmsByVenue(scheduleRows);
    const talkTalkByVenue = talkTalk.groupByVenue(talkTalkDayItems);

    dom.venueLabelScroll.innerHTML = '';
    dom.timelineContent.innerHTML = '';
    dom.timelineContent.style.width = totalWidth + 'px';
    dom.timeAxis.innerHTML = '';
    dom.timeAxis.style.width = totalWidth + 'px';

    const gridLines = document.createElement('div');
    gridLines.id = 'grid-lines';
    gridLines.style.width = totalWidth + 'px';
    dom.timelineContent.appendChild(gridLines);

    renderTimeAxis(gridLines, timelineEnd);

    config.venueGroups.forEach(group => {
      const venues = venuesByGroup[group.id];
      if (!state.activeGroups.has(group.id) || venues.length === 0) return;
      renderVenueGroup(group, venues, filmsByVenue, talkTalkByVenue, totalWidth, timelineEnd);
    });

    if (supplementalProgramLanes.length > 0) {
      renderCombinedProgramLanes(supplementalProgramLanes, totalWidth, timelineEnd, '별도 프로그램');
    }

    syncLabelScroll();
  }

  function renderTimeAxis(gridLines, timelineEnd) {
    for (let minutes = Math.ceil(config.timeRange.start / 30) * 30; minutes <= timelineEnd; minutes += 30) {
      const x = timeToX(minutes);
      const isHour = minutes % 60 === 0;

      const mark = document.createElement('div');
      mark.className = 'time-mark' + (isHour ? ' full-hour' : '');
      mark.style.left = x + 'px';
      mark.textContent = formatAxisTime(minutes);
      dom.timeAxis.appendChild(mark);

      const line = document.createElement('div');
      line.className = isHour ? 'grid-line-hour' : 'grid-line-half';
      line.style.left = x + 'px';
      gridLines.appendChild(line);
    }
  }

  function renderVenueGroup(group, venues, filmsByVenue, talkTalkByVenue, totalWidth, timelineEnd) {
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
      dom.timelineContent.appendChild(createVenueRow(
        filmsByVenue.get(venue) || [],
        talkTalkByVenue.get(venue) || [],
        totalWidth,
        timelineEnd
      ));
    });
  }

  function renderCombinedProgramLanes(lanes, totalWidth, timelineEnd, headingLabel = '별도 프로그램') {
    let currentHeading = '';

    lanes.forEach(lane => {
      const nextHeading = lane.groupLabel || headingLabel;

      if (nextHeading !== currentHeading) {
        const labelHeader = document.createElement('div');
        const timelineHeader = document.createElement('div');

        labelHeader.className = 'venue-group-header';
        labelHeader.textContent = nextHeading;
        dom.venueLabelScroll.appendChild(labelHeader);

        timelineHeader.className = 'venue-group-header-timeline';
        timelineHeader.style.width = totalWidth + 'px';
        dom.timelineContent.appendChild(timelineHeader);
        currentHeading = nextHeading;
      }

      dom.venueLabelScroll.appendChild(createCombinedProgramLaneLabel(lane));
      dom.timelineContent.appendChild(createCombinedProgramLaneRow(lane, totalWidth, timelineEnd));
    });
  }

  function createCombinedProgramLaneLabel(lane) {
    const label = document.createElement('div');

    label.className = 'venue-label program-lane-label';
    label.textContent = lane.label;

    return label;
  }

  function createCombinedProgramLaneRow(lane, totalWidth, timelineEnd) {
    const row = document.createElement('div');

    row.className = 'row-wrapper program-lane-row';
    row.style.width = totalWidth + 'px';

    lane.items.forEach(entry => {
      const block = entry.kind === 'talktalk'
        ? createTalkTalkBlock(entry.item, timelineEnd, 'talktalk-slot program-lane-block program-lane-block-talktalk')
        : entry.kind === 'alley'
          ? createCombinedAlleyProgramBlock(entry.item, lane, timelineEnd)
          : entry.kind === 'forum'
            ? createCombinedForumProgramBlock(entry.item, lane, timelineEnd)
            : entry.kind === 'outdoor'
              ? createCombinedOutdoorProgramBlock(entry.item, lane, timelineEnd)
          : createCombinedProgramRowBlock(entry.row, lane, timelineEnd);

      if (block) row.appendChild(block);
    });

    return row;
  }

  function createVenueLabel(venue, group) {
    const label = document.createElement('div');
    label.className = 'venue-label';

    const dot = document.createElement('div');
    dot.className = 'vgroup-dot';
    dot.style.background = group.color;

    label.appendChild(dot);
    label.appendChild(document.createTextNode(getVenueLabelText(venue, group)));

    return label;
  }

  function createVenueRow(films, talkTalkEntries, totalWidth, timelineEnd) {
    const row = document.createElement('div');
    row.className = 'row-wrapper';
    row.style.width = totalWidth + 'px';

    films.forEach(film => {
      row.appendChild(createFilmBlock(film, timelineEnd));

      const eventBlock = createLinkedProgramEventBlock(film, timelineEnd);
      if (eventBlock) {
        row.appendChild(eventBlock);
      }
    });

    talkTalkEntries
      .slice()
      .sort((left, right) => left.startTime.localeCompare(right.startTime))
      .forEach(item => {
        const talkTalkBlock = createTalkTalkBlock(item, timelineEnd);
        if (talkTalkBlock) row.appendChild(talkTalkBlock);
      });

    return row;
  }

  function createTalkTalkBlock(item, timelineEnd, className = 'talktalk-slot') {
    const startMinutes = timeToMinutes(item.startTime);
    const endMinutes = talkTalk.getEndMinutes(item);

    if (startMinutes === null || endMinutes === null || startMinutes > timelineEnd) {
      return null;
    }

    const x = timeToX(startMinutes);
    const width = Math.max(18, timeToX(Math.min(endMinutes, timelineEnd)) - x);
    const useCompactDetailDrawer = state.compactViewport;
    const block = document.createElement(useCompactDetailDrawer ? 'button' : 'a');
    const label = document.createElement('span');

    block.className = className;
    block.style.left = x + 'px';
    block.style.width = width + 'px';
    if (useCompactDetailDrawer) {
      block.type = 'button';
      block.setAttribute('aria-label', item.title + ' 상세 열기');
    } else {
      block.href = talkTalk.getPageUrl(item);
      block.target = '_blank';
      block.rel = 'noopener noreferrer';
      block.setAttribute('aria-label', item.title + ' 전주톡톡 페이지 새 탭 열기');
      block.setAttribute('title', item.title + ' 전주톡톡 페이지 새 탭 열기');
    }

    label.className = 'talktalk-slot-text';
    label.textContent = talkTalk.getSlotLabel(item, width);
    block.appendChild(label);

    block.addEventListener('mouseenter', () => showTalkTalkTooltip(item));
    block.addEventListener('mousemove', moveTooltip);
    block.addEventListener('mouseleave', hideTooltip);

    if (useCompactDetailDrawer) {
      block.addEventListener('click', event => {
        event.stopPropagation();
        openTalkTalkDetail(item);
      });
    }

    return block;
  }

  function createCombinedProgramRowBlock(row, lane, timelineEnd) {
    const startMinutes = timeToMinutes(row.startTime);
    const endMinutes = getFilmEndMinutes(row);

    if (startMinutes === null || endMinutes === null || startMinutes > timelineEnd) {
      return null;
    }

    const x = timeToX(startMinutes);
    const width = Math.max(18, timeToX(Math.min(endMinutes, timelineEnd)) - x);
    const isBookmarked = state.bookmarks.has(row.code);
    const isSearchMatch = filmMatchesSearch(row);
    const isDimmed = shouldDimFilm(row, isBookmarked, isSearchMatch);
    const block = document.createElement('div');
    const detailLink = row.detailUrl ? createFilmDetailLink(row) : null;

    block.className = 'program-lane-block';
    block.style.left = x + 'px';
    block.style.width = width + 'px';
    block.style.background = getCombinedProgramBackground(lane.color, isSearchMatch, isDimmed, isBookmarked);
    block.style.borderColor = getCombinedProgramBorderColor(lane.color, isSearchMatch, isDimmed, isBookmarked);
    block.style.opacity = isDimmed ? '0.16' : '1';
    block.style.boxShadow = getCombinedProgramShadow(isBookmarked, isSearchMatch);

    if (detailLink) {
      block.appendChild(detailLink);
    }

    if (width > 28) {
      const title = document.createElement('div');
      title.className = 'program-lane-text';
      title.textContent = row.title;
      (detailLink || block).appendChild(title);
    }

    if (row.hasMultipleDetails) {
      block.setAttribute('role', 'button');
      block.setAttribute('tabindex', '0');
      block.setAttribute('aria-label', row.title + ' 상세 열기');
      block.addEventListener('click', event => {
        event.stopPropagation();
        openDetailChooser(row);
      });
      block.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        openDetailChooser(row);
      });
    } else if (!row.detailUrl) {
      block.classList.add('no-detail-action');
    }

    block.addEventListener('mouseenter', () => showTooltip(row, lane.color));
    block.addEventListener('mousemove', moveTooltip);
    block.addEventListener('mouseleave', hideTooltip);

    return block;
  }

  function createCombinedAlleyProgramBlock(item, lane, timelineEnd) {
    const startMinutes = timeToMinutes(item.startTime);
    const endMinutes = getAlleyScreeningEndMinutes(item);

    if (startMinutes === null || endMinutes === null || startMinutes > timelineEnd) {
      return null;
    }

    const x = timeToX(startMinutes);
    const width = Math.max(18, timeToX(Math.min(endMinutes, timelineEnd)) - x);
    const isSearchMatch = matchesAlleyScreeningSearch(item);
    const isDimmed = hasSearchQuery() && !isSearchMatch;
    const useCompactDetailDrawer = state.compactViewport;
    const block = document.createElement(useCompactDetailDrawer ? 'button' : 'a');

    block.className = 'program-lane-block';
    block.style.left = x + 'px';
    block.style.width = width + 'px';
    block.style.background = getCombinedProgramBackground(lane.color, isSearchMatch, isDimmed, false);
    block.style.borderColor = getCombinedProgramBorderColor(lane.color, isSearchMatch, isDimmed, false);
    block.style.opacity = isDimmed ? '0.16' : '1';
    block.style.boxShadow = getCombinedProgramShadow(false, isSearchMatch);

    if (useCompactDetailDrawer) {
      block.type = 'button';
      block.setAttribute('aria-label', item.title + ' 정보 열기');
      block.addEventListener('click', event => {
        event.stopPropagation();
        openAlleyProgramDetail(item);
      });
    } else {
      block.href = getAlleyScreeningPageUrl(item);
      block.target = '_blank';
      block.rel = 'noopener noreferrer';
      block.setAttribute('aria-label', item.title + ' 공식 페이지 새 탭 열기');
      block.setAttribute('title', item.title + ' 공식 페이지 새 탭 열기');
    }

    if (width > 28) {
      const title = document.createElement('div');
      title.className = 'program-lane-text';
      title.textContent = item.title;
      block.appendChild(title);
    }

    block.addEventListener('mouseenter', () => showAlleyProgramTooltip(item, lane.color));
    block.addEventListener('mousemove', moveTooltip);
    block.addEventListener('mouseleave', hideTooltip);

    return block;
  }

  function createCombinedForumProgramBlock(item, lane, timelineEnd) {
    const startMinutes = timeToMinutes(item.startTime);
    const endMinutes = getForumProgramEndMinutes(item);

    if (startMinutes === null || endMinutes === null || startMinutes > timelineEnd) {
      return null;
    }

    const x = timeToX(startMinutes);
    const width = Math.max(18, timeToX(Math.min(endMinutes, timelineEnd)) - x);
    const isSearchMatch = matchesForumProgramSearch(item);
    const isDimmed = hasSearchQuery() && !isSearchMatch;
    const pageUrl = getForumProgramPageUrl(item);
    const useLink = !state.compactViewport && Boolean(pageUrl);
    const block = document.createElement(useLink ? 'a' : 'button');

    block.className = 'program-lane-block';
    block.style.left = x + 'px';
    block.style.width = width + 'px';
    block.style.background = getCombinedProgramBackground(lane.color, isSearchMatch, isDimmed, false);
    block.style.borderColor = getCombinedProgramBorderColor(lane.color, isSearchMatch, isDimmed, false);
    block.style.opacity = isDimmed ? '0.16' : '1';
    block.style.boxShadow = getCombinedProgramShadow(false, isSearchMatch);

    if (useLink) {
      block.href = pageUrl;
      block.target = '_blank';
      block.rel = 'noopener noreferrer';
      block.setAttribute('aria-label', item.title + ' 공식 페이지 새 탭 열기');
      block.setAttribute('title', item.title + ' 공식 페이지 새 탭 열기');
    } else {
      block.type = 'button';
      block.setAttribute('aria-label', item.title + ' 정보 열기');
      block.addEventListener('click', event => {
        event.stopPropagation();
        openForumProgramDetail(item);
      });
    }

    if (width > 28) {
      const title = document.createElement('div');
      title.className = 'program-lane-text';
      title.textContent = item.title;
      block.appendChild(title);
    }

    block.addEventListener('mouseenter', () => showForumProgramTooltip(item, lane.color));
    block.addEventListener('mousemove', moveTooltip);
    block.addEventListener('mouseleave', hideTooltip);

    return block;
  }

  function createCombinedOutdoorProgramBlock(item, lane, timelineEnd) {
    const startMinutes = timeToMinutes(item.startTime);
    const endMinutes = getOutdoorScreeningEndMinutes(item);

    if (startMinutes === null || endMinutes === null || startMinutes > timelineEnd) {
      return null;
    }

    const x = timeToX(startMinutes);
    const width = Math.max(18, timeToX(Math.min(endMinutes, timelineEnd)) - x);
    const isSearchMatch = matchesOutdoorScreeningSearch(item);
    const isDimmed = hasSearchQuery() && !isSearchMatch;
    const pageUrl = getOutdoorScreeningPageUrl(item);
    const useLink = !state.compactViewport && Boolean(pageUrl);
    const block = document.createElement(useLink ? 'a' : 'button');

    block.className = 'program-lane-block';
    block.style.left = x + 'px';
    block.style.width = width + 'px';
    block.style.background = getCombinedProgramBackground(lane.color, isSearchMatch, isDimmed, false);
    block.style.borderColor = getCombinedProgramBorderColor(lane.color, isSearchMatch, isDimmed, false);
    block.style.opacity = isDimmed ? '0.16' : '1';
    block.style.boxShadow = getCombinedProgramShadow(false, isSearchMatch);

    if (useLink) {
      block.href = pageUrl;
      block.target = '_blank';
      block.rel = 'noopener noreferrer';
      block.setAttribute('aria-label', item.title + ' 공식 페이지 새 탭 열기');
      block.setAttribute('title', item.title + ' 공식 페이지 새 탭 열기');
    } else {
      block.type = 'button';
      block.setAttribute('aria-label', item.title + ' 정보 열기');
      block.addEventListener('click', event => {
        event.stopPropagation();
        openOutdoorScreeningDetail(item);
      });
    }

    if (width > 28) {
      const title = document.createElement('div');
      title.className = 'program-lane-text';
      title.textContent = item.title;
      block.appendChild(title);
    }

    block.addEventListener('mouseenter', () => showOutdoorScreeningTooltip(item, lane.color));
    block.addEventListener('mousemove', moveTooltip);
    block.addEventListener('mouseleave', hideTooltip);

    return block;
  }

  function createFilmBlock(film, timelineEnd) {
    const startMinutes = timeToMinutes(film.startTime);
    const endMinutes = getFilmEndMinutes(film);

    if (startMinutes === null || endMinutes === null || startMinutes > timelineEnd) {
      return document.createDocumentFragment();
    }

    const x = timeToX(startMinutes);
    const width = Math.max(4, timeToX(Math.min(endMinutes, timelineEnd)) - x);
    const color = getSectionColor(film.section);
    const isBookmarked = state.bookmarks.has(film.code);
    const isSearchMatch = filmMatchesSearch(film);
    const isDimmed = shouldDimFilm(film, isBookmarked, isSearchMatch);
    const useCompactDetailDrawer = state.compactViewport;
    const hasBlockAction = useCompactDetailDrawer || Boolean(film.detailUrl || film.hasMultipleDetails);

    const block = document.createElement('div');
    block.className = 'film-block' + (isBookmarked ? ' bookmarked' : '') + (hasBlockAction ? '' : ' no-detail-action');
    block.style.left = x + 'px';
    block.style.width = width + 'px';
    block.style.background = getFilmBackground(color, isBookmarked, isSearchMatch, isDimmed);
    block.style.borderColor = getFilmBorderColor(color, isBookmarked, isSearchMatch, isDimmed);
    block.style.opacity = isDimmed ? '0.15' : '1';
    block.style.boxShadow = getFilmShadow(isBookmarked, isSearchMatch);

    const detailLink = !useCompactDetailDrawer && film.detailUrl ? createFilmDetailLink(film) : null;

    if (detailLink) {
      block.appendChild(detailLink);
    }

    if (width > 20) {
      const title = createFilmTitleText(film.title);
      (detailLink || block).appendChild(title);
    }

    if (width >= 22) {
      block.classList.add('has-bookmark-toggle');
      block.appendChild(createFilmBookmarkToggle(film, isBookmarked, block));
    }

    if (useCompactDetailDrawer) {
      block.setAttribute('role', 'button');
      block.setAttribute('tabindex', '0');
      block.setAttribute('aria-label', film.title + ' 정보 열기');
    }

    block.addEventListener('mouseenter', () => showTooltip(film, color));
    block.addEventListener('mousemove', moveTooltip);
    block.addEventListener('mouseleave', hideTooltip);

    if (useCompactDetailDrawer) {
      block.addEventListener('click', event => {
        event.stopPropagation();
        openDetailChooser(film);
      });
      block.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        openDetailChooser(film);
      });
    } else if (film.hasMultipleDetails) {
      block.addEventListener('click', event => {
        event.stopPropagation();
        openDetailChooser(film);
      });
    }

    return block;
  }

  function createFilmDetailLink(film) {
    const link = document.createElement('a');

    link.className = 'film-block-link';
    link.href = film.detailUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', film.title + ' 상세 페이지 새 탭 열기');
    link.setAttribute('title', film.title + ' 상세 페이지 새 탭 열기');
    link.addEventListener('click', event => {
      event.stopPropagation();
    });

    return link;
  }

  function createFilmTitleText(titleText) {
    const title = document.createElement('div');

    title.className = 'film-title-text';
    title.textContent = titleText;

    return title;
  }

  function createLinkedProgramEventBlock(film, timelineEnd) {
    const relatedEvent = getFollowUpProgramEvent(film);
    const filmEndMinutes = getFilmEndMinutes(film);
    const eventEndMinutes = getProgramEventEndMinutes(film);

    if (!relatedEvent || filmEndMinutes === null || eventEndMinutes === null || filmEndMinutes > timelineEnd) {
      return null;
    }

    const x = timeToX(filmEndMinutes);
    const width = Math.max(4, timeToX(Math.min(eventEndMinutes, timelineEnd)) - x);
    const color = getSectionColor(film.section);
    const isBookmarked = state.bookmarks.has(film.code);
    const isSearchMatch = filmMatchesSearch(film);
    const isDimmed = shouldDimFilm(film, isBookmarked, isSearchMatch);
    const useCompactDetailDrawer = state.compactViewport;
    const block = document.createElement('div');

    block.className = 'program-event-block';
    block.style.left = x + 'px';
    block.style.width = width + 'px';
    block.style.background = getProgramEventBackground(color, isSearchMatch, isDimmed);
    block.style.borderColor = getProgramEventBorderColor(color, isSearchMatch, isDimmed);
    block.style.opacity = isDimmed ? '0.15' : '1';
    block.style.boxShadow = getProgramEventShadow(isSearchMatch);

    const eventLink = !useCompactDetailDrawer && relatedEvent.url ? createProgramEventLink(film, relatedEvent) : null;

    if (eventLink) {
      block.appendChild(eventLink);
    }

    if (width > 28) {
      (eventLink || block).appendChild(createProgramEventText(relatedEvent.label));
    }

    if (useCompactDetailDrawer) {
      block.setAttribute('role', 'button');
      block.setAttribute('tabindex', '0');
      block.setAttribute('aria-label', film.title + ' 관련 행사 정보 열기');
      block.addEventListener('click', event => {
        event.stopPropagation();
        openDetailChooser(film);
      });
      block.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        openDetailChooser(film);
      });
    }

    block.addEventListener('mouseenter', () => showProgramEventTooltip(film, relatedEvent, color));
    block.addEventListener('mousemove', moveTooltip);
    block.addEventListener('mouseleave', hideTooltip);

    return block;
  }

  function createProgramEventLink(film, relatedEvent) {
    const link = document.createElement('a');

    link.className = 'program-event-link';
    link.href = relatedEvent.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', film.title + ' 관련 ' + relatedEvent.label + ' 이벤트 페이지 새 탭 열기');
    link.setAttribute('title', relatedEvent.label + ' 이벤트 페이지 새 탭 열기');
    link.addEventListener('click', event => {
      event.stopPropagation();
    });

    return link;
  }

  function createProgramEventText(text) {
    const label = document.createElement('div');

    label.className = 'program-event-text';
    label.textContent = text;

    return label;
  }

  function createFilmBookmarkToggle(film, isBookmarked, block) {
    const button = document.createElement('button');

    button.type = 'button';
    button.className = 'film-bookmark-toggle' + (isBookmarked ? ' is-active' : '');
    button.setAttribute('aria-label', isBookmarked ? film.title + ' 관심 해제' : film.title + ' 관심 등록');
    button.setAttribute('title', isBookmarked ? '관심 해제' : '관심 등록');
    button.appendChild(createBookmarkIcon());
    button.addEventListener('mouseenter', () => {
      block.classList.add('bookmark-hovering');
    });
    button.addEventListener('mouseleave', () => {
      block.classList.remove('bookmark-hovering');
    });
    button.addEventListener('focus', () => {
      block.classList.add('bookmark-hovering');
    });
    button.addEventListener('blur', () => {
      block.classList.remove('bookmark-hovering');
    });
    button.addEventListener('click', event => {
      event.stopPropagation();
      toggleBookmark(film);
      renderDay();
    });

    return button;
  }

  function createBookmarkIcon() {
    const namespace = 'http://www.w3.org/2000/svg';
    const icon = document.createElementNS(namespace, 'svg');
    const use = document.createElementNS(namespace, 'use');

    icon.setAttribute('class', 'film-bookmark-icon');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('aria-hidden', 'true');
    use.setAttribute('href', STAR_SYMBOL_URL);
    use.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', STAR_SYMBOL_URL);
    icon.appendChild(use);

    return icon;
  }

  function shouldDimFilm(film, isBookmarked, isSearchMatch) {
    let hasActiveFilter = false;
    let isVisible = true;

    if (state.bookmarkHighlight && state.bookmarks.size > 0) {
      hasActiveFilter = true;
      isVisible = isVisible && isBookmarked;
    }

    if (state.activeSections) {
      hasActiveFilter = true;
      isVisible = isVisible && state.activeSections.has(film.section);
    }

    if (hasSearchQuery()) {
      hasActiveFilter = true;
      isVisible = isVisible && isSearchMatch;
    }

    return hasActiveFilter && !isVisible;
  }

  function getFilmBackground(color, isBookmarked, isSearchMatch, isDimmed) {
    if (hasSearchQuery() && isSearchMatch) {
      return color + 'f0';
    }

    if (state.bookmarkHighlight && isBookmarked) {
      return color + 'ee';
    }

    return color + (isDimmed ? '22' : 'cc');
  }

  function getFilmBorderColor(color, isBookmarked, isSearchMatch, isDimmed) {
    if (hasSearchQuery() && isSearchMatch) {
      return '#f0d58a';
    }

    if (state.bookmarkHighlight && isBookmarked) {
      return '#ffd700';
    }

    return color + (isDimmed ? '55' : 'ff');
  }

  function getFilmShadow(isBookmarked, isSearchMatch) {
    if (hasSearchQuery() && isSearchMatch) {
      return '0 0 0 1px rgba(240,213,138,0.75), 0 6px 18px rgba(0,0,0,0.32)';
    }

    if (state.bookmarkHighlight && isBookmarked) {
      return '0 0 0 2px #ffd70088, 0 2px 8px rgba(0,0,0,0.5)';
    }

    return '';
  }

  function getCombinedProgramBackground(color, isSearchMatch, isDimmed, isBookmarked) {
    if (hasSearchQuery() && isSearchMatch) {
      return color + '34';
    }

    if (state.bookmarkHighlight && isBookmarked) {
      return color + '30';
    }

    return color + (isDimmed ? '10' : '20');
  }

  function getCombinedProgramBorderColor(color, isSearchMatch, isDimmed, isBookmarked) {
    if (hasSearchQuery() && isSearchMatch) {
      return '#f0d58a';
    }

    if (state.bookmarkHighlight && isBookmarked) {
      return '#ffd700';
    }

    return color + (isDimmed ? '4a' : 'c2');
  }

  function getCombinedProgramShadow(isBookmarked, isSearchMatch) {
    if (hasSearchQuery() && isSearchMatch) {
      return '0 0 0 1px rgba(240,213,138,0.4), 0 6px 14px rgba(0,0,0,0.2)';
    }

    if (state.bookmarkHighlight && isBookmarked) {
      return '0 0 0 1px rgba(255,215,0,0.48)';
    }

    return '';
  }

  function getProgramEventBackground(color, isSearchMatch, isDimmed) {
    if (hasSearchQuery() && isSearchMatch) {
      return color + '38';
    }

    return color + (isDimmed ? '10' : '20');
  }

  function getProgramEventBorderColor(color, isSearchMatch, isDimmed) {
    if (hasSearchQuery() && isSearchMatch) {
      return '#f0d58a';
    }

    return color + (isDimmed ? '55' : 'd8');
  }

  function getMobileFilmBackground(color, isBookmarked, isSearchMatch, isDimmed) {
    if (!isDimmed) return getFilmBackground(color, isBookmarked, isSearchMatch, false);
    return color + '34';
  }

  function getMobileFilmBorderColor(color, isBookmarked, isSearchMatch, isDimmed) {
    if (!isDimmed) return getFilmBorderColor(color, isBookmarked, isSearchMatch, false);
    return color + '5c';
  }

  function getMobileProgramEventBackground(color, isSearchMatch, isDimmed) {
    if (!isDimmed) return getProgramEventBackground(color, isSearchMatch, false);
    return color + '16';
  }

  function getMobileProgramEventBorderColor(color, isSearchMatch, isDimmed) {
    if (!isDimmed) return getProgramEventBorderColor(color, isSearchMatch, false);
    return color + '58';
  }

  function getProgramEventShadow(isSearchMatch) {
    if (hasSearchQuery() && isSearchMatch) {
      return '0 0 0 1px rgba(240,213,138,0.5)';
    }

    return '';
  }

  function renderBookmarks() {
    renderBookmarkActionState();

    if (state.bookmarks.size === 0) {
      dom.bookmarksList.innerHTML = '<div class="bp-empty">관심 목록이 비어 있어요.<br>오른쪽 별 아이콘으로<br>추가해 보세요.</div>';
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
      '<div class="bm-meta">' + escapeHtml(formatFilmTimeRange(row, '–') + ' · ' + venue) + '</div>',
      '</div>',
      '<button type="button" class="bm-remove" data-bookmark-remove="' + escapeHtml(row.code) + '">✕</button>',
      '</div>',
    ].join('');
  }

  function updateBookmarkCount() {
    const bookmarkCount = state.bookmarks.size;
    const hasBookmarks = bookmarkCount > 0;

    dom.bookmarkCount.textContent = hasBookmarks ? String(bookmarkCount) : '';
    dom.bookmarkBtn.classList.toggle('has-items', hasBookmarks);
    dom.bookmarksTitle.textContent = hasBookmarks
      ? '★ 관심 목록 (' + bookmarkCount + ')'
      : '★ 관심 목록';
    dom.bookmarkBtn.setAttribute('aria-label', hasBookmarks
      ? '관심 목록 열기, ' + bookmarkCount + '개 저장됨'
      : '관심 목록 열기');
    dom.bookmarkBtn.setAttribute('title', hasBookmarks
      ? '관심 목록 ' + bookmarkCount + '개'
      : '관심 목록');
    renderBookmarkActionState();

    if (!hasBookmarks && state.bookmarkHighlight) {
      state.bookmarkHighlight = false;
      renderBookmarkHighlightState();
    }
  }

  function toggleBookmark(film) {
    if (state.bookmarks.has(film.code)) state.bookmarks.delete(film.code);
    else state.bookmarks.add(film.code);

    persistBookmarks();
    renderBookmarks();
    updateBookmarkCount();
  }

  function removeBookmark(code) {
    state.bookmarks.delete(code);
    persistBookmarks();
    renderBookmarks();
    updateBookmarkCount();
    renderDay();
  }

  function clearAllBookmarks() {
    if (state.bookmarks.size === 0) return;
    if (!window.confirm('관심 목록을 모두 비울까요?')) return;

    state.bookmarks.clear();
    persistBookmarks();
    renderBookmarks();
    updateBookmarkCount();
    renderDay();
  }

  function clearSearch() {
    setSearchQuery('');
    if (state.compactViewport && state.mobileHeaderSearchOpen) {
      dom.mobileSearchInput.focus();
      return;
    }

    dom.searchInput.focus();
  }

  function openMobileHeaderSearch() {
    if (!state.compactViewport) {
      dom.searchInput.focus();
      return;
    }

    closeMobileControls();
    state.mobileHeaderSearchOpen = true;
    renderSearchControls();
    window.requestAnimationFrame(() => {
      dom.mobileSearchInput.focus();
    });
  }

  function closeMobileHeaderSearch(shouldRestoreFocus = true) {
    if (!state.mobileHeaderSearchOpen) return;

    state.mobileHeaderSearchOpen = false;
    renderSearchControls();
    if (shouldRestoreFocus) {
      dom.mobileSearchToggleBtn.focus();
    }
  }

  function toggleMobileControls() {
    if (!state.compactViewport) return;

    if (state.mobileControlsOpen) {
      closeMobileControls();
      return;
    }

    openMobileControls();
  }

  function openMobileControls() {
    if (!state.compactViewport) return;

    closeBookmarksPanel();
    closeDetailChooser();
    closeMobileHeaderSearch(false);
    state.mobileControlsOpen = true;
    renderMobileControlsState();
    syncOverlayState();
  }

  function closeMobileControls() {
    if (!state.mobileControlsOpen) return;

    state.mobileControlsOpen = false;
    renderMobileControlsState();
    syncOverlayState();
  }

  function downloadBookmarksCSV() {
    const rows = getBookmarkedRows();
    if (rows.length === 0) return;

    const header = [
      '날짜',
      '요일',
      '상영관',
      '상영회차',
      '섹션',
      '제목',
      '감독',
      '상영작(단편 목록)',
      '시작시간',
      '종료시간',
      '상영코드',
      '언어/등급/이벤트',
    ];

    const csvRows = [header].concat(rows.map(row => {
      const day = dayLookup.get(row.date);
      return [
        row.date,
        day ? day.sub : '',
        row.venue,
        row.session,
        row.section,
        row.title,
        row.directorLabel || '',
        row.shorts,
        row.startTime,
        getFilmDisplayEndTime(row),
        row.code,
        row.meta,
      ];
    }));

    const csvText = '\ufeff' + csvRows
      .map(columns => columns.map(escapeCSVField).join(','))
      .join('\n');
    const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = 'jiff2026-bookmarks.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function toggleBookmarksPanel() {
    if (dom.bookmarksPanel.classList.contains('open')) {
      closeBookmarksPanel();
      return;
    }

    closeMobileControls();
    closeDetailChooser();
    renderBookmarks();
    dom.bookmarksPanel.classList.add('open');
    syncOverlayState();
  }

  function closeBookmarksPanel() {
    dom.bookmarksPanel.classList.remove('open');
    syncOverlayState();
  }

  function openDetailChooser(film) {
    closeMobileControls();
    closeBookmarksPanel();
    hideTooltip();
    renderDetailChooser(film);
    dom.detailChooserPanel.dataset.filmCode = film && film.code ? film.code : '';
    dom.detailChooserPanel.setAttribute('aria-hidden', 'false');
    dom.detailChooserPanel.classList.add('open');
    syncOverlayState();
  }

  function openTalkTalkDetail(item) {
    if (!item) return;

    closeMobileControls();
    closeBookmarksPanel();
    hideTooltip();
    renderTalkTalkDetail(item);
    dom.detailChooserPanel.dataset.filmCode = '';
    dom.detailChooserPanel.setAttribute('aria-hidden', 'false');
    dom.detailChooserPanel.classList.add('open');
    syncOverlayState();
  }

  function openAlleyProgramDetail(item) {
    if (!item) return;

    closeMobileControls();
    closeBookmarksPanel();
    hideTooltip();
    renderAlleyProgramDetail(item);
    dom.detailChooserPanel.dataset.filmCode = '';
    dom.detailChooserPanel.setAttribute('aria-hidden', 'false');
    dom.detailChooserPanel.classList.add('open');
    syncOverlayState();
  }

  function openForumProgramDetail(item) {
    if (!item) return;

    closeMobileControls();
    closeBookmarksPanel();
    hideTooltip();
    renderForumProgramDetail(item);
    dom.detailChooserPanel.dataset.filmCode = '';
    dom.detailChooserPanel.setAttribute('aria-hidden', 'false');
    dom.detailChooserPanel.classList.add('open');
    syncOverlayState();
  }

  function openOutdoorScreeningDetail(item) {
    if (!item) return;

    closeMobileControls();
    closeBookmarksPanel();
    hideTooltip();
    renderOutdoorScreeningDetail(item);
    dom.detailChooserPanel.dataset.filmCode = '';
    dom.detailChooserPanel.setAttribute('aria-hidden', 'false');
    dom.detailChooserPanel.classList.add('open');
    syncOverlayState();
  }

  function closeDetailChooser() {
    dom.detailChooserPanel.classList.remove('open');
    dom.detailChooserPanel.setAttribute('aria-hidden', 'true');
    dom.detailChooserTitle.textContent = state.compactViewport ? '상영 정보' : '상영작 목록';
    dom.detailChooserSubtitle.textContent = '';
    dom.detailChooserList.innerHTML = '';
    dom.detailChooserCloseBtn.setAttribute('aria-label', state.compactViewport ? '상영 정보 닫기' : '상영작 목록 닫기');
    dom.detailChooserCloseBtn.setAttribute('title', state.compactViewport ? '상영 정보 닫기' : '상영작 목록 닫기');
    delete dom.detailChooserPanel.dataset.filmCode;
    syncOverlayState();
  }

  function closeOpenPanels() {
    closeMobileControls();
    closeBookmarksPanel();
    closeDetailChooser();
  }

  function syncOverlayState() {
    const hasOpenPanel = (state.compactViewport && state.mobileControlsOpen)
      || dom.bookmarksPanel.classList.contains('open')
      || dom.detailChooserPanel.classList.contains('open');
    dom.overlay.classList.toggle('open', hasOpenPanel);
    document.body.classList.toggle('has-mobile-panel-open', hasOpenPanel);
    renderMobileNotice();
  }

  function renderDetailChooser(film) {
    if (state.compactViewport) {
      dom.detailChooserCloseBtn.setAttribute('aria-label', '상영 정보 닫기');
      dom.detailChooserCloseBtn.setAttribute('title', '상영 정보 닫기');
      renderCompactDetailChooser(film);
      return;
    }

    dom.detailChooserCloseBtn.setAttribute('aria-label', '상영작 목록 닫기');
    dom.detailChooserCloseBtn.setAttribute('title', '상영작 목록 닫기');
    dom.detailChooserTitle.textContent = film.title || '상영작 목록';
    dom.detailChooserSubtitle.textContent = [formatFilmTimeRange(film, ' - '), film.venue, film.section]
      .filter(Boolean)
      .join(' · ');

    dom.detailChooserList.innerHTML = film.detailCandidates.map((candidate, index) => {
      const title = candidate.title || film.title || ('상영작 ' + String(index + 1));

      return [
        '<a class="dc-item" href="' + escapeHtml(candidate.url) + '" target="_blank" rel="noopener noreferrer">',
        '<span class="dc-item-title">' + escapeHtml(title) + '</span>',
        '<span class="dc-item-meta">상세 페이지 새 탭 열기</span>',
        '</a>',
      ].join('');
    }).join('');
  }

  function renderTalkTalkDetail(item) {
    const overview = talkTalk.overview || {};
    const pageUrl = talkTalk.getPageUrl(item);
    const infoRows = [
      ['일정', talkTalk.formatDayLabel(item) + ' · ' + talkTalk.formatTimeRange(item)],
      ['장소', talkTalk.getVenue(item)],
      ['진행', talkTalk.getDurationMinutes(item) + '분'],
      ['참가비', overview.feeLabel || '12,000원(영화 미포함)'],
      ['게스트', item.guestLabel || '—'],
      ['모더레이터', item.moderator || '—'],
      ['상영코드', item.code || '—'],
    ];

    dom.detailChooserCloseBtn.setAttribute('aria-label', '전주톡톡 상세 닫기');
    dom.detailChooserCloseBtn.setAttribute('title', '전주톡톡 상세 닫기');
    dom.detailChooserTitle.textContent = item.title || item.seriesLabel || '전주톡톡';
    dom.detailChooserSubtitle.textContent = [item.seriesLabel, talkTalk.getVenue(item)].filter(Boolean).join(' · ');

    dom.detailChooserList.innerHTML = [
      '<div class="talktalk-detail">',
      '<div class="talktalk-detail-series">' + escapeHtml(item.seriesLabel || '전주톡톡') + '</div>',
      pageUrl
        ? '<div class="dc-mobile-actions dc-mobile-actions-primary"><a class="dc-mobile-action" href="' + escapeHtml(pageUrl) + '" target="_blank" rel="noopener noreferrer">상세보기 (새 탭 열기)</a></div>'
        : '',
      '<p class="talktalk-detail-summary">' + escapeHtml(item.summary || '') + '</p>',
      '<div class="talktalk-detail-grid">',
      infoRows.map(row => [
        '<div class="talktalk-detail-row">',
        '<span class="talktalk-detail-row-label">' + escapeHtml(row[0]) + '</span>',
        '<span class="talktalk-detail-row-value">' + escapeHtml(row[1]) + '</span>',
        '</div>',
      ].join('')).join(''),
      '</div>',
      overview.note
        ? '<p class="talktalk-detail-note">' + escapeHtml(overview.note) + '</p>'
        : '',
      '</div>',
    ].join('');
  }

  function renderAlleyProgramDetail(item) {
    const overview = alleyScreeningSource.overview || {};
    const pageUrl = getAlleyScreeningPageUrl(item);
    const infoRows = [
      ['일정', formatDayLabel(item.date) + ' · ' + formatAlleyScreeningTimeRange(item)],
      ['장소', item.venue || '—'],
      ['프로그램', overview.label || '골목상영'],
      ['참가비', overview.feeLabel || '무료'],
      ['비고', getAlleyScreeningTagsText(item) || '—'],
      ['참석자', item.guestLabel || '—'],
    ];

    dom.detailChooserCloseBtn.setAttribute('aria-label', '골목상영 상세 닫기');
    dom.detailChooserCloseBtn.setAttribute('title', '골목상영 상세 닫기');
    dom.detailChooserTitle.textContent = item.title || overview.label || '골목상영';
    dom.detailChooserSubtitle.textContent = [overview.label || '골목상영', item.venue].filter(Boolean).join(' · ');

    dom.detailChooserList.innerHTML = [
      '<div class="talktalk-detail">',
      '<div class="talktalk-detail-series">' + escapeHtml(overview.label || '골목상영') + '</div>',
      pageUrl
        ? '<div class="dc-mobile-actions dc-mobile-actions-primary"><a class="dc-mobile-action" href="' + escapeHtml(pageUrl) + '" target="_blank" rel="noopener noreferrer">공식 페이지 (새 탭 열기)</a></div>'
        : '',
      '<p class="talktalk-detail-summary">' + escapeHtml(overview.description || '전주 곳곳의 야외 공간에서 진행되는 무료 상영 프로그램입니다.') + '</p>',
      '<div class="talktalk-detail-grid">',
      infoRows.map(row => [
        '<div class="talktalk-detail-row">',
        '<span class="talktalk-detail-row-label">' + escapeHtml(row[0]) + '</span>',
        '<span class="talktalk-detail-row-value">' + escapeHtml(row[1]) + '</span>',
        '</div>',
      ].join('')).join(''),
      '</div>',
      overview.note
        ? '<p class="talktalk-detail-note">' + escapeHtml(overview.note) + '</p>'
        : '',
      '</div>',
    ].join('');
  }

  function renderForumProgramDetail(item) {
    const overview = forumProgramsSource.overview || {};
    const pageUrl = getForumProgramPageUrl(item);
    const venueText = getForumProgramVenueText(item);
    const infoRows = [
      ['일정', formatDayLabel(item.date) + ' · ' + formatForumProgramTimeRange(item)],
      ['장소', venueText],
      ['프로그램', item.seriesLabel || overview.label || '전주포럼'],
      ['참가비', item.feeLabel || overview.feeLabel || '무료 또는 별도 안내'],
      ['사회', item.moderator || '—'],
      ['발제', item.speakers || '—'],
      ['패널', item.panelists || '—'],
    ];

    if (item.hostLabel) infoRows.push(['주최', item.hostLabel]);
    if (item.organizerLabel) infoRows.push(['주관', item.organizerLabel]);

    dom.detailChooserCloseBtn.setAttribute('aria-label', '전주포럼 상세 닫기');
    dom.detailChooserCloseBtn.setAttribute('title', '전주포럼 상세 닫기');
    dom.detailChooserTitle.textContent = item.title || overview.label || '전주포럼';
    dom.detailChooserSubtitle.textContent = [item.seriesLabel || overview.label || '전주포럼', venueText].filter(Boolean).join(' · ');

    dom.detailChooserList.innerHTML = [
      '<div class="talktalk-detail">',
      '<div class="talktalk-detail-series">' + escapeHtml(item.seriesLabel || overview.label || '전주포럼') + '</div>',
      pageUrl
        ? '<div class="dc-mobile-actions dc-mobile-actions-primary"><a class="dc-mobile-action" href="' + escapeHtml(pageUrl) + '" target="_blank" rel="noopener noreferrer">공식 페이지 (새 탭 열기)</a></div>'
        : '',
      '<p class="talktalk-detail-summary">' + escapeHtml(item.summary || overview.description || '') + '</p>',
      '<div class="talktalk-detail-grid">',
      infoRows.map(row => [
        '<div class="talktalk-detail-row">',
        '<span class="talktalk-detail-row-label">' + escapeHtml(row[0]) + '</span>',
        '<span class="talktalk-detail-row-value">' + escapeHtml(row[1]) + '</span>',
        '</div>',
      ].join('')).join(''),
      '</div>',
      overview.note
        ? '<p class="talktalk-detail-note">' + escapeHtml(overview.note) + '</p>'
        : '',
      '</div>',
    ].join('');
  }

  function renderOutdoorScreeningDetail(item) {
    const overview = outdoorScreeningSource.overview || {};
    const pageUrl = getOutdoorScreeningPageUrl(item);
    const infoRows = [
      ['일정', formatDayLabel(item.date) + ' · ' + formatOutdoorScreeningTimeRange(item)],
      ['장소', item.venue || '—'],
      ['프로그램', item.seriesLabel || overview.label || '야외 상영'],
      ['참가비', overview.feeLabel || '무료'],
      ['비고', getOutdoorScreeningTagsText(item) || '—'],
    ];

    dom.detailChooserCloseBtn.setAttribute('aria-label', '야외 상영 상세 닫기');
    dom.detailChooserCloseBtn.setAttribute('title', '야외 상영 상세 닫기');
    dom.detailChooserTitle.textContent = item.title || overview.label || '야외 상영';
    dom.detailChooserSubtitle.textContent = [item.seriesLabel || overview.label || '야외 상영', item.venue].filter(Boolean).join(' · ');

    dom.detailChooserList.innerHTML = [
      '<div class="talktalk-detail">',
      '<div class="talktalk-detail-series">' + escapeHtml(item.seriesLabel || overview.label || '야외 상영') + '</div>',
      pageUrl
        ? '<div class="dc-mobile-actions dc-mobile-actions-primary"><a class="dc-mobile-action" href="' + escapeHtml(pageUrl) + '" target="_blank" rel="noopener noreferrer">공식 페이지 (새 탭 열기)</a></div>'
        : '',
      '<p class="talktalk-detail-summary">' + escapeHtml(item.summary || overview.description || '') + '</p>',
      '<div class="talktalk-detail-grid">',
      infoRows.map(row => [
        '<div class="talktalk-detail-row">',
        '<span class="talktalk-detail-row-label">' + escapeHtml(row[0]) + '</span>',
        '<span class="talktalk-detail-row-value">' + escapeHtml(row[1]) + '</span>',
        '</div>',
      ].join('')).join(''),
      '</div>',
      overview.note
        ? '<p class="talktalk-detail-note">' + escapeHtml(overview.note) + '</p>'
        : '',
      '</div>',
    ].join('');
  }

  function renderCompactDetailChooser(film) {
    const tags = getMetaTags(film.meta);
    const relatedEvent = film.relatedEvent || null;
    const detailCandidates = film.detailCandidates || [];
    const isBookmarked = state.bookmarks.has(film.code);
    const primaryActions = [];
    const infoRows = [
      ['시간', formatFilmTimeRange(film)],
      ['상영관', film.venue || '—'],
      ['섹션', film.section || '—'],
    ];

    if (film.directorLabel) infoRows.push(['감독', film.directorLabel]);
    if (film.code) infoRows.push(['상영코드', film.code]);

    if (film.code) {
      primaryActions.push(
        '<button type="button" class="dc-mobile-action dc-mobile-action-bookmark' + (isBookmarked ? ' is-active' : '') + '" data-detail-bookmark="' + escapeHtml(film.code) + '">'
        + (isBookmarked ? '★ 관심 해제' : '☆ 관심 등록')
        + '</button>'
      );
    }

    if (detailCandidates.length === 1) {
      primaryActions.push(
        '<a class="dc-mobile-action" href="' + escapeHtml(detailCandidates[0].url) + '" target="_blank" rel="noopener noreferrer">상세보기 (새 탭 열기)</a>'
      );
    } else if (detailCandidates.length > 1) {
      primaryActions.push(
        '<button type="button" class="dc-mobile-action" data-detail-scroll="detail-links">상세보기</button>'
      );
    }

    dom.detailChooserTitle.textContent = film.title || '상영 정보';
    dom.detailChooserSubtitle.textContent = '';

    dom.detailChooserList.innerHTML = [
      '<div class="dc-mobile-sheet">',
      primaryActions.length > 0
        ? '<div class="dc-mobile-actions dc-mobile-actions-primary">' + primaryActions.join('') + '</div>'
        : '',
      '<div class="dc-mobile-summary">',
      '<div class="dc-mobile-section" style="color:' + escapeHtml(getSectionColor(film.section)) + '">' + escapeHtml(film.section || '—') + '</div>',
      '<div class="dc-mobile-grid">',
      infoRows.map(row => [
        '<div class="dc-mobile-row">',
        '<span class="dc-mobile-label">' + escapeHtml(row[0]) + '</span>',
        '<span class="dc-mobile-value">' + escapeHtml(row[1]) + '</span>',
        '</div>',
      ].join('')).join(''),
      '</div>',
      film.shorts
        ? '<div class="dc-mobile-block"><div class="dc-mobile-label">상영작</div><div class="dc-mobile-copy">' + escapeHtml(film.shorts) + '</div></div>'
        : '',
      relatedEvent
        ? [
            '<div class="dc-mobile-block">',
            '<div class="dc-mobile-label">연결 행사</div>',
            '<div class="dc-mobile-copy">',
            escapeHtml(relatedEvent.label),
            relatedEvent.scheduleMode === 'separate'
              ? ' · ' + escapeHtml(relatedEvent.separateDate + ' ' + relatedEvent.separateStartTime + ' ' + relatedEvent.separateVenue)
              : ' · 상영 후 ' + escapeHtml(String(relatedEvent.durationMinutes)) + '분',
            '</div>',
            relatedEvent.guestLabel
              ? '<div class="dc-mobile-copy">게스트 · ' + escapeHtml(relatedEvent.guestLabel) + '</div>'
              : '',
            relatedEvent.moderator
              ? '<div class="dc-mobile-copy">모더레이터 · ' + escapeHtml(relatedEvent.moderator) + '</div>'
              : '',
            '</div>',
          ].join('')
        : '',
      '</div>',
      relatedEvent && relatedEvent.url
        ? '<div class="dc-mobile-actions dc-mobile-actions-secondary"><a class="dc-mobile-action dc-mobile-action-secondary is-full" href="' + escapeHtml(relatedEvent.url) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(relatedEvent.label) + ' 보기 (새 탭 열기)</a></div>'
        : '',
      detailCandidates.length > 1
        ? '<div class="dc-mobile-detail-links" data-detail-section="detail-links"><div class="dc-mobile-label">상세 링크</div><div class="dc-mobile-list">' + detailCandidates.map((candidate, index) => {
            const title = candidate.title || film.title || ('상영작 ' + String(index + 1));

            return [
              '<a class="dc-item" href="' + escapeHtml(candidate.url) + '" target="_blank" rel="noopener noreferrer">',
              '<span class="dc-item-title">' + escapeHtml(title) + '</span>',
              '<span class="dc-item-meta">상세 페이지 새 탭 열기</span>',
              '</a>',
            ].join('');
          }).join('') + '</div></div>'
        : '',
      '</div>',
    ].join('');
  }

  function showTooltip(film, color) {
    if (state.compactViewport) return;

    const tags = getMetaTags(film.meta);
    const parts = [];

    parts.push('<div class="tt-section" style="color:' + color + '">' + escapeHtml(film.section || '—') + '</div>');
    parts.push('<div class="tt-title">' + escapeHtml(film.title) + '</div>');
    parts.push('<div class="tt-meta">');
    parts.push('<strong>상영관</strong> ' + escapeHtml(film.venue) + '<br>');
    parts.push('<strong>시간</strong> ' + escapeHtml(formatFilmTimeRange(film)));
    if (film.session) parts.push(' (' + escapeHtml(film.session) + ')');
    if (film.directorLabel) parts.push('<br><strong>감독</strong> ' + escapeHtml(film.directorLabel));
    parts.push('<br>');
    if (film.code) parts.push('<strong>코드</strong> ' + escapeHtml(film.code));
    parts.push('</div>');

    if (film.shorts) {
      parts.push('<div class="tt-shorts">📽 ' + escapeHtml(film.shorts) + '</div>');
    }

    if (film.relatedEvent) {
      const relatedEvent = film.relatedEvent;
      const relatedEventLabel = relatedEvent.label + ' · ' + relatedEvent.durationMinutes + '분';

      parts.push('<div class="tt-shorts">🗣 ' + escapeHtml(relatedEventLabel));
      if (relatedEvent.scheduleMode === 'separate') {
        parts.push(' · ' + escapeHtml(relatedEvent.separateDate + ' ' + relatedEvent.separateStartTime + ' ' + relatedEvent.separateVenue));
      } else {
        parts.push(' · 상영 후 진행');
      }
      parts.push('</div>');

      if (relatedEvent.guestLabel) {
        parts.push('<div class="tt-shorts">👥 게스트 · ' + escapeHtml(relatedEvent.guestLabel) + '</div>');
      }

      if (relatedEvent.moderator) {
        parts.push('<div class="tt-shorts">🎙 모더레이터 · ' + escapeHtml(relatedEvent.moderator) + '</div>');
      }
    }

    parts.push('<div class="tt-tags">');
    if (film.meta && film.meta.includes('GV')) {
      parts.push('<span class="tt-tag gv">GV</span>');
    }
    tags.forEach(tag => {
      parts.push('<span class="tt-tag">' + escapeHtml(tag) + '</span>');
    });
    parts.push('</div>');
    const bookmarkHint = state.bookmarks.has(film.code)
      ? '별 아이콘으로 관심 해제'
      : '별 아이콘으로 관심 등록';
    const detailHint = film.detailUrl
      ? ' · 클릭 시 새 탭 열기'
      : film.hasMultipleDetails
        ? ' · 블록 클릭 시 상영작 목록 열기'
        : '';
    const eventHint = film.relatedEvent && film.relatedEvent.url
      ? film.relatedEvent.scheduleMode === 'separate'
        ? ' · 관련 행사 일정은 툴팁 참고'
        : ' · 점선 블록 클릭 시 이벤트 페이지 열기'
      : '';

    parts.push('<div class="tt-bookmark-hint">' + bookmarkHint + detailHint + eventHint + '</div>');

    dom.tooltip.innerHTML = parts.join('');
    dom.tooltip.classList.add('visible');
    positionTooltip();
  }

  function showAlleyProgramTooltip(item, color) {
    if (state.compactViewport) return;

    const parts = [];

    parts.push('<div class="tt-section" style="color:' + color + '">골목상영</div>');
    parts.push('<div class="tt-title">' + escapeHtml(item.title) + '</div>');
    parts.push('<div class="tt-meta">');
    parts.push('<strong>장소</strong> ' + escapeHtml(item.venue) + '<br>');
    parts.push('<strong>시간</strong> ' + escapeHtml(formatAlleyScreeningTimeRange(item)));
    parts.push('</div>');

    if (item.guestLabel) {
      parts.push('<div class="tt-shorts">👥 참석자 · ' + escapeHtml(item.guestLabel) + '</div>');
    }

    if (getAlleyScreeningTagsText(item)) {
      parts.push('<div class="tt-shorts">📝 ' + escapeHtml(getAlleyScreeningTagsText(item)) + '</div>');
    }

    parts.push('<div class="tt-bookmark-hint">클릭 시 공식 페이지 새 탭 열기</div>');

    dom.tooltip.innerHTML = parts.join('');
    dom.tooltip.classList.add('visible');
    positionTooltip();
  }

  function showForumProgramTooltip(item, color) {
    if (state.compactViewport) return;

    const parts = [];
    const venueText = getForumProgramVenueText(item);

    parts.push('<div class="tt-section" style="color:' + color + '">' + escapeHtml(item.seriesLabel || '전주포럼') + '</div>');
    parts.push('<div class="tt-title">' + escapeHtml(item.title) + '</div>');
    parts.push('<div class="tt-meta">');
    parts.push('<strong>장소</strong> ' + escapeHtml(venueText) + '<br>');
    parts.push('<strong>시간</strong> ' + escapeHtml(formatForumProgramTimeRange(item)));
    if (item.feeLabel) parts.push('<br><strong>참가비</strong> ' + escapeHtml(item.feeLabel));
    if (item.moderator) parts.push('<br><strong>사회</strong> ' + escapeHtml(item.moderator));
    parts.push('</div>');

    if (item.speakers) {
      parts.push('<div class="tt-shorts">발제 · ' + escapeHtml(item.speakers) + '</div>');
    }

    if (item.panelists) {
      parts.push('<div class="tt-shorts">패널 · ' + escapeHtml(item.panelists) + '</div>');
    }

    parts.push('<div class="tt-bookmark-hint">클릭 시 공식 페이지 새 탭 열기</div>');

    dom.tooltip.innerHTML = parts.join('');
    dom.tooltip.classList.add('visible');
    positionTooltip();
  }

  function showOutdoorScreeningTooltip(item, color) {
    if (state.compactViewport) return;

    const parts = [];

    parts.push('<div class="tt-section" style="color:' + color + '">' + escapeHtml(item.seriesLabel || '야외 상영') + '</div>');
    parts.push('<div class="tt-title">' + escapeHtml(item.title) + '</div>');
    parts.push('<div class="tt-meta">');
    parts.push('<strong>장소</strong> ' + escapeHtml(item.venue || '—') + '<br>');
    parts.push('<strong>시간</strong> ' + escapeHtml(formatOutdoorScreeningTimeRange(item)) + '<br>');
    parts.push('<strong>참가비</strong> 무료');
    parts.push('</div>');

    if (item.summary) {
      parts.push('<div class="tt-shorts">🎬 ' + escapeHtml(item.summary) + '</div>');
    }

    if (getOutdoorScreeningTagsText(item)) {
      parts.push('<div class="tt-shorts">📝 ' + escapeHtml(getOutdoorScreeningTagsText(item)) + '</div>');
    }

    const detailHint = getOutdoorScreeningPageUrl(item)
      ? '클릭 시 공식 페이지 새 탭 열기'
      : '클릭 시 상세 정보 열기';
    parts.push('<div class="tt-bookmark-hint">' + escapeHtml(detailHint) + '</div>');

    dom.tooltip.innerHTML = parts.join('');
    dom.tooltip.classList.add('visible');
    positionTooltip();
  }

  function showProgramEventTooltip(film, relatedEvent, color) {
    if (state.compactViewport) return;

    const parts = [];

    parts.push('<div class="tt-section" style="color:' + color + '">연결 행사</div>');
    parts.push('<div class="tt-title">' + escapeHtml(relatedEvent.label) + '</div>');
    parts.push('<div class="tt-meta">');
    parts.push('<strong>연결 상영</strong> ' + escapeHtml(film.title) + '<br>');

    if (relatedEvent.scheduleMode === 'separate') {
      parts.push('<strong>일정</strong> ' + escapeHtml(relatedEvent.separateDate + ' ' + relatedEvent.separateStartTime) + '<br>');
      parts.push('<strong>장소</strong> ' + escapeHtml(relatedEvent.separateVenue));
    } else {
      parts.push('<strong>진행</strong> 상영 후 ' + escapeHtml(String(relatedEvent.durationMinutes)) + '분<br>');
      parts.push('<strong>시작</strong> ' + escapeHtml(film.endTime) + ' 이후');
    }

    if (relatedEvent.guestLabel) {
      parts.push('<br><strong>게스트</strong> ' + escapeHtml(relatedEvent.guestLabel));
    }

    if (relatedEvent.moderator) {
      parts.push('<br><strong>모더레이터</strong> ' + escapeHtml(relatedEvent.moderator));
    }

    parts.push('</div>');
    parts.push('<div class="tt-bookmark-hint">클릭 시 공식 이벤트 페이지 새 탭 열기</div>');

    dom.tooltip.innerHTML = parts.join('');
    dom.tooltip.classList.add('visible');
    positionTooltip();
  }

  function showTalkTalkTooltip(item) {
    if (state.compactViewport) return;

    const overview = talkTalk.overview || {};
    const parts = [];

    parts.push('<div class="tt-section" style="color:#d7b35a">전주톡톡</div>');
    parts.push('<div class="tt-title">' + escapeHtml(item.title) + '</div>');
    parts.push('<div class="tt-meta">');
    parts.push('<strong>일정</strong> ' + escapeHtml(talkTalk.formatDayLabel(item) + ' ' + talkTalk.formatTimeRange(item)) + '<br>');
    parts.push('<strong>장소</strong> ' + escapeHtml(talkTalk.getVenue(item)) + '<br>');
    parts.push('<strong>게스트</strong> ' + escapeHtml(item.guestLabel || '—') + '<br>');
    parts.push('<strong>모더레이터</strong> ' + escapeHtml(item.moderator || '—'));
    if (item.code) {
      parts.push('<br><strong>코드</strong> ' + escapeHtml(item.code));
    }
    parts.push('</div>');

    if (item.summary) {
      parts.push('<div class="tt-shorts">' + escapeHtml(item.summary) + '</div>');
    }

    if (overview.note) {
      const detailHint = state.compactViewport
        ? overview.note
        : '클릭 시 전주톡톡 페이지 새 탭 열기 · ' + overview.note;
      parts.push('<div class="tt-bookmark-hint">' + escapeHtml(detailHint) + '</div>');
    }

    dom.tooltip.innerHTML = parts.join('');
    dom.tooltip.classList.add('visible');
    positionTooltip();
  }

  function moveTooltip() {
    if (state.compactViewport) return;
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

  function setViewMode(mode) {
    if (!mode || mode === state.viewMode) return;
    if (mode !== 'schedule' && mode !== 'combined' && mode !== 'programs') return;

    state.viewMode = mode;
    closeOpenPanels();
    renderApp();

    if (!state.mobileLayout) {
      queueTimelineScroll(50);
    }
  }

  function rerenderDayWithDensity(nextDensityKey) {
    if (state.mobileLayout) {
      const scrollLeft = dom.mobileGridScroll.scrollLeft;
      const scrollTop = dom.mobileGridScroll.scrollTop;

      applyDensitySettings(nextDensityKey);
      renderControls();
      renderDay();

      requestAnimationFrame(() => {
        dom.mobileGridScroll.scrollLeft = scrollLeft;
        dom.mobileGridScroll.scrollTop = scrollTop;
        dom.mobileTimeLabelScroll.scrollTop = scrollTop;
      });
      return;
    }

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
    if (!isValidDay(date) || state.currentDay === date) return;

    state.currentDay = date;
    syncCurrentDayUrl();
    renderDayTabState();
    renderDay();
    queueTimelineScroll(50);
  }

  function resolveInitialDay() {
    const urlDay = readCurrentDayFromUrl();
    return urlDay || config.defaultState.currentDay;
  }

  function readCurrentDayFromUrl() {
    try {
      const url = new URL(window.location.href);
      const date = url.searchParams.get(DAY_QUERY_PARAM);
      return isValidDay(date) ? date : '';
    } catch (error) {
      return '';
    }
  }

  function isValidDay(date) {
    return config.days.some(day => day.date === date);
  }

  function syncCurrentDayUrl() {
    if (!window.history || typeof window.history.replaceState !== 'function') return;

    try {
      const url = new URL(window.location.href);

      if (state.currentDay === config.defaultState.currentDay) {
        url.searchParams.delete(DAY_QUERY_PARAM);
      } else {
        url.searchParams.set(DAY_QUERY_PARAM, state.currentDay);
      }

      window.history.replaceState(
        Object.assign({}, window.history.state, { currentDay: state.currentDay }),
        '',
        url.toString()
      );
    } catch (error) {
      // Ignore URL sync failures so the schedule still renders normally.
    }
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

  function setSearchQuery(query) {
    state.searchQuery = query;
    state.normalizedSearchQuery = normalizeSearchValue(query);

    if (state.compactViewport) {
      state.mobileHeaderSearchOpen = hasSearchQuery() || state.mobileHeaderSearchOpen;
    }

    renderControls();
    renderDay();
  }

  function queueTimelineScroll(delay) {
    window.setTimeout(() => {
      const nextScrollLeft = timeToX(config.timeRange.initialScroll) - 20;

      if (!state.mobileLayout && dom.timelineScroll) {
        dom.timelineScroll.scrollLeft = nextScrollLeft;
      }

      if (!state.mobileLayout && dom.programsTimelineScroll) {
        dom.programsTimelineScroll.scrollLeft = state.viewMode === 'combined' && dom.timelineScroll
          ? dom.timelineScroll.scrollLeft
          : nextScrollLeft;
      }
    }, delay);
  }

  function syncLabelScroll() {
    dom.venueLabelScroll.scrollTop = dom.timelineScroll.scrollTop;
  }

  function syncMobileTimeLabelScroll() {
    dom.mobileTimeLabelScroll.scrollTop = dom.mobileGridScroll.scrollTop;
    updateMobileVenueContextIndicator();
  }

  function renderMobileDay(dayData) {
    const scheduleRows = getScheduleRowsForCurrentMode(dayData);
    const filmsInActiveGroups = scheduleRows.filter(isFilmInActiveGroup);
    const supplementalProgramLanes = state.viewMode === 'combined'
      ? getCombinedProgramLanes(dayData)
      : state.viewMode === 'schedule'
        ? getScheduleSupplementalProgramLanes()
        : [];
    const talkTalkItemsInActiveGroups = [];
    const timelineTalkTalkItems = talkTalkItemsInActiveGroups;
    const talkTalkTimelineRows = talkTalk.getTimelineRows(timelineTalkTalkItems);
    const combinedTimelineRows = getCombinedProgramTimelineRows(supplementalProgramLanes);
    const timelineSource = filmsInActiveGroups.concat(talkTalkTimelineRows, combinedTimelineRows);
    const fallbackTimelineSource = scheduleRows.concat(
      talkTalk.getTimelineRows(talkTalkItemsInActiveGroups),
      combinedTimelineRows
    );
    const timelineEnd = getTimelineEnd(timelineSource.length > 0 ? timelineSource : fallbackTimelineSource);
    const venueColumns = getMobileVenueColumns(scheduleRows, talkTalkItemsInActiveGroups)
      .concat(getMobileCombinedProgramColumns(supplementalProgramLanes));
    const filmsByVenue = groupFilmsByVenue(filmsInActiveGroups);
    const talkTalkByVenue = talkTalk.groupByVenue(talkTalkItemsInActiveGroups);
    const totalWidth = getMobileGridWidth(venueColumns.length);
    const totalHeight = getMobileGridHeight(timelineEnd);

    state.mobileVenueColumns = venueColumns;
    dom.mobileTimeLabelScroll.innerHTML = '';
    dom.mobileVenueAxis.innerHTML = '';
    dom.mobileGridContent.innerHTML = '';
    dom.mobileVenueAxis.style.width = totalWidth + 'px';
    dom.mobileGridContent.style.width = totalWidth + 'px';
    dom.mobileGridContent.style.height = totalHeight + 'px';

    renderMobileTimeAxis(timelineEnd, totalHeight);
    renderMobileVenueAxis(venueColumns);
    renderMobileGridLines(venueColumns.length, timelineEnd, totalWidth, totalHeight);

    venueColumns.forEach((entry, index) => {
      if (entry.type === 'program-lane') {
        entry.lane.items.forEach(programEntry => {
          const block = createMobileCombinedProgramBlock(programEntry, entry.lane, index, timelineEnd);
          if (block) dom.mobileGridContent.appendChild(block);
        });
        return;
      }

      const films = filmsByVenue.get(entry.venue) || [];
      const talkTalkEntries = talkTalkByVenue.get(entry.venue) || [];

      films.forEach(film => {
        const block = createMobileFilmBlock(film, index, timelineEnd);
        if (block) dom.mobileGridContent.appendChild(block);

        const eventBlock = createMobileLinkedProgramEventBlock(film, index, timelineEnd);
        if (eventBlock) dom.mobileGridContent.appendChild(eventBlock);
      });

      talkTalkEntries.forEach(item => {
        const talkTalkBlock = createMobileTalkTalkBlock(item, index, timelineEnd);
        if (talkTalkBlock) dom.mobileGridContent.appendChild(talkTalkBlock);
      });
    });

    const hasCombinedProgramItems = supplementalProgramLanes.some(lane => lane.items.length > 0);

    if (venueColumns.length === 0 || (filmsInActiveGroups.length === 0
      && talkTalkItemsInActiveGroups.length === 0
      && !hasCombinedProgramItems)) {
      renderMobileEmptyState(totalWidth, totalHeight);
    }

    syncMobileTimeLabelScroll();
  }

  function renderMobileTimeAxis(timelineEnd, totalHeight) {
    const rail = document.createElement('div');

    rail.className = 'mobile-time-rail';
    rail.style.height = totalHeight + 'px';

    for (let minutes = Math.ceil(config.timeRange.start / 30) * 30; minutes <= timelineEnd; minutes += 30) {
      const mark = document.createElement('div');
      const isHour = minutes % 60 === 0;

      mark.className = 'mobile-time-mark' + (isHour ? ' full-hour' : '');
      mark.style.top = mobileTimeToY(minutes) + 'px';
      mark.textContent = formatAxisTime(minutes);
      rail.appendChild(mark);
    }

    dom.mobileTimeLabelScroll.appendChild(rail);
  }

  function renderMobileVenueAxis(venueColumns) {
    const columnWidth = getMobileVenueColumnWidth();
    const groups = [];
    let activeGroup = null;
    const current = document.createElement('div');

    current.className = 'mobile-venue-current';
    dom.mobileVenueCurrent = current;
    dom.mobileVenueAxis.appendChild(current);

    venueColumns.forEach((entry, index) => {
      const parts = getMobileColumnHeaderParts(entry);

      if (parts.singleHeader) {
        activeGroup = null;
        return;
      }

      if (!activeGroup || activeGroup.label !== parts.primary) {
        activeGroup = {
          label: parts.primary,
          startIndex: index,
          count: 1,
        };
        groups.push(activeGroup);
      } else {
        activeGroup.count += 1;
      }
    });

    groups.forEach(group => {
      const groupHead = document.createElement('div');

      groupHead.className = 'mobile-venue-grouphead';
      groupHead.style.left = String(group.startIndex * columnWidth) + 'px';
      groupHead.style.width = String(group.count * columnWidth) + 'px';
      groupHead.setAttribute('aria-hidden', 'true');
      dom.mobileVenueAxis.appendChild(groupHead);
    });

    venueColumns.forEach((entry, index) => {
      const header = document.createElement('div');
      const secondary = document.createElement('div');
      const parts = getMobileColumnHeaderParts(entry);

      header.className = 'mobile-venue-roomhead' + (parts.singleHeader ? ' mobile-venue-roomhead-single' : '');
      header.style.left = String(index * columnWidth) + 'px';
      header.style.width = String(columnWidth) + 'px';

      secondary.className = 'mobile-venue-room'
        + (parts.singleHeader ? ' is-full-label' : '')
        + (entry.type !== 'program-lane' && entry.venue === '전북대학교 삼성문화회관' ? ' is-samsung-hall' : '');
      secondary.textContent = parts.singleHeader ? parts.primary : (parts.secondary || parts.primary);

      header.appendChild(secondary);
      dom.mobileVenueAxis.appendChild(header);
    });

    updateMobileVenueContextIndicator();
  }

  function renderMobileGridLines(venueCount, timelineEnd, totalWidth, totalHeight) {
    const columnWidth = getMobileVenueColumnWidth();
    const gridLines = document.createElement('div');

    gridLines.id = 'mobile-grid-lines';
    gridLines.style.width = totalWidth + 'px';
    gridLines.style.height = totalHeight + 'px';

    for (let minutes = Math.ceil(config.timeRange.start / 30) * 30; minutes <= timelineEnd; minutes += 30) {
      const line = document.createElement('div');
      const isHour = minutes % 60 === 0;

      line.className = isHour ? 'mobile-grid-line-hour' : 'mobile-grid-line-half';
      line.style.top = mobileTimeToY(minutes) + 'px';
      gridLines.appendChild(line);
    }

    for (let index = 1; index < venueCount; index += 1) {
      const line = document.createElement('div');

      line.className = 'mobile-grid-line-venue';
      line.style.left = String(index * columnWidth) + 'px';
      gridLines.appendChild(line);
    }

    dom.mobileGridContent.appendChild(gridLines);
  }

  function updateMobileVenueContextIndicator() {
    if (!state.mobileLayout || !dom.mobileVenueCurrent) return;

    const venueColumns = state.mobileVenueColumns || [];
    if (venueColumns.length === 0) {
      dom.mobileVenueCurrent.textContent = '';
      dom.mobileVenueCurrent.classList.remove('is-visible');
      return;
    }

    const columnWidth = getMobileVenueColumnWidth();
    const firstVisibleIndex = Math.max(0, Math.min(
      venueColumns.length - 1,
      Math.floor((dom.mobileGridScroll.scrollLeft + 4) / columnWidth)
    ));
    const currentVenue = venueColumns[firstVisibleIndex];
    const parts = currentVenue ? getMobileColumnHeaderParts(currentVenue) : null;

    if (!parts || !parts.primary) {
      dom.mobileVenueCurrent.textContent = '';
      dom.mobileVenueCurrent.classList.remove('is-visible');
      return;
    }

    dom.mobileVenueCurrent.textContent = parts.primary;
    dom.mobileVenueCurrent.classList.add('is-visible');
  }

  function createMobileFilmBlock(film, venueIndex, timelineEnd) {
    const startMinutes = timeToMinutes(film.startTime);
    const endMinutes = getFilmEndMinutes(film);

    if (startMinutes === null || endMinutes === null || startMinutes > timelineEnd) {
      return null;
    }

    const columnWidth = getMobileVenueColumnWidth();
    const x = venueIndex * columnWidth;
    const y = mobileTimeToY(startMinutes);
    const height = Math.max(28, mobileTimeToY(Math.min(endMinutes, timelineEnd)) - y);
    const color = getSectionColor(film.section);
    const isBookmarked = state.bookmarks.has(film.code);
    const isSearchMatch = filmMatchesSearch(film);
    const isDimmed = shouldDimFilm(film, isBookmarked, isSearchMatch);
    const block = document.createElement('div');

    block.className = 'mobile-film-block'
      + (isBookmarked ? ' bookmarked' : '')
      + (isDimmed ? ' is-dimmed' : '');
    block.style.left = x + 4 + 'px';
    block.style.top = y + 4 + 'px';
    block.style.width = Math.max(28, columnWidth - 8) + 'px';
    block.style.height = Math.max(28, height - 8) + 'px';
    block.style.background = getMobileFilmBackground(color, isBookmarked, isSearchMatch, isDimmed);
    block.style.borderColor = getMobileFilmBorderColor(color, isBookmarked, isSearchMatch, isDimmed);
    block.style.boxShadow = getFilmShadow(isBookmarked, isSearchMatch);
    block.setAttribute('role', 'button');
    block.setAttribute('tabindex', '0');
    block.setAttribute('aria-label', film.title + ' 정보 열기');

    if (isBookmarked) {
      block.appendChild(createMobileFilmBookmarkMarker());
    }

    const titleConfig = getMobileFilmTitleConfig(film, height);
    if (titleConfig) {
      block.appendChild(createMobileFilmTitleText(titleConfig.text, titleConfig.mode, height));
    }

    block.addEventListener('click', event => {
      event.stopPropagation();
      openDetailChooser(film);
    });
    block.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      openDetailChooser(film);
    });

    return block;
  }

  function createMobileFilmBookmarkMarker() {
    const marker = document.createElement('div');

    marker.className = 'mobile-film-bookmark-marker';
    marker.setAttribute('aria-hidden', 'true');
    marker.textContent = '★';

    return marker;
  }

  function createMobileTalkTalkBlock(item, venueIndex, timelineEnd, className = 'mobile-talktalk-slot') {
    const startMinutes = timeToMinutes(item.startTime);
    const endMinutes = talkTalk.getEndMinutes(item);

    if (startMinutes === null || endMinutes === null || startMinutes > timelineEnd) {
      return null;
    }

    const columnWidth = getMobileVenueColumnWidth();
    const x = venueIndex * columnWidth;
    const y = mobileTimeToY(startMinutes);
    const height = Math.max(28, mobileTimeToY(Math.min(endMinutes, timelineEnd)) - y);
    const block = document.createElement('button');
    const label = document.createElement('span');

    block.type = 'button';
    block.className = className;
    block.style.left = x + 6 + 'px';
    block.style.top = y + 5 + 'px';
    block.style.width = Math.max(26, columnWidth - 12) + 'px';
    block.style.height = Math.max(28, height - 10) + 'px';
    block.setAttribute('aria-label', item.title + ' 상세 열기');

    label.className = 'mobile-talktalk-slot-text';
    label.textContent = talkTalk.getSlotLabel(item, height, true);
    block.appendChild(label);

    block.addEventListener('click', event => {
      event.stopPropagation();
      openTalkTalkDetail(item);
    });

    return block;
  }

  function createMobileCombinedProgramBlock(entry, lane, venueIndex, timelineEnd) {
    if (entry.kind === 'talktalk') {
      return createMobileTalkTalkBlock(
        entry.item,
        venueIndex,
        timelineEnd,
        'mobile-talktalk-slot mobile-combined-program-block mobile-combined-program-block-talktalk'
      );
    }

    if (entry.kind === 'alley') {
      return createMobileCombinedAlleyProgramBlock(entry.item, lane, venueIndex, timelineEnd);
    }

    if (entry.kind === 'forum') {
      return createMobileCombinedForumProgramBlock(entry.item, lane, venueIndex, timelineEnd);
    }

    if (entry.kind === 'outdoor') {
      return createMobileCombinedOutdoorProgramBlock(entry.item, lane, venueIndex, timelineEnd);
    }

    return createMobileCombinedProgramRowBlock(entry.row, lane, venueIndex, timelineEnd);
  }

  function createMobileCombinedAlleyProgramBlock(item, lane, venueIndex, timelineEnd) {
    const startMinutes = timeToMinutes(item.startTime);
    const endMinutes = getAlleyScreeningEndMinutes(item);

    if (startMinutes === null || endMinutes === null || startMinutes > timelineEnd) {
      return null;
    }

    const columnWidth = getMobileVenueColumnWidth();
    const x = venueIndex * columnWidth;
    const y = mobileTimeToY(startMinutes);
    const height = Math.max(28, mobileTimeToY(Math.min(endMinutes, timelineEnd)) - y);
    const isSearchMatch = matchesAlleyScreeningSearch(item);
    const isDimmed = hasSearchQuery() && !isSearchMatch;
    const block = document.createElement('button');
    const title = document.createElement('div');

    block.type = 'button';
    block.className = 'mobile-combined-program-block';
    block.style.left = x + 6 + 'px';
    block.style.top = y + 4 + 'px';
    block.style.width = Math.max(24, columnWidth - 12) + 'px';
    block.style.height = Math.max(26, height - 8) + 'px';
    block.style.background = getCombinedProgramBackground(lane.color, isSearchMatch, isDimmed, false);
    block.style.borderColor = getCombinedProgramBorderColor(lane.color, isSearchMatch, isDimmed, false);
    block.style.boxShadow = getCombinedProgramShadow(false, isSearchMatch);
    block.style.opacity = isDimmed ? '0.16' : '1';
    block.setAttribute('aria-label', item.title + ' 정보 열기');

    title.className = 'mobile-combined-program-text';
    title.textContent = getMobileCombinedProgramLabel(item.title, height);
    block.appendChild(title);

    block.addEventListener('click', event => {
      event.stopPropagation();
      openAlleyProgramDetail(item);
    });

    return block;
  }

  function createMobileCombinedForumProgramBlock(item, lane, venueIndex, timelineEnd) {
    const startMinutes = timeToMinutes(item.startTime);
    const endMinutes = getForumProgramEndMinutes(item);

    if (startMinutes === null || endMinutes === null || startMinutes > timelineEnd) {
      return null;
    }

    const columnWidth = getMobileVenueColumnWidth();
    const x = venueIndex * columnWidth;
    const y = mobileTimeToY(startMinutes);
    const height = Math.max(28, mobileTimeToY(Math.min(endMinutes, timelineEnd)) - y);
    const isSearchMatch = matchesForumProgramSearch(item);
    const isDimmed = hasSearchQuery() && !isSearchMatch;
    const block = document.createElement('button');
    const title = document.createElement('div');

    block.type = 'button';
    block.className = 'mobile-combined-program-block';
    block.style.left = x + 6 + 'px';
    block.style.top = y + 4 + 'px';
    block.style.width = Math.max(24, columnWidth - 12) + 'px';
    block.style.height = Math.max(26, height - 8) + 'px';
    block.style.background = getCombinedProgramBackground(lane.color, isSearchMatch, isDimmed, false);
    block.style.borderColor = getCombinedProgramBorderColor(lane.color, isSearchMatch, isDimmed, false);
    block.style.boxShadow = getCombinedProgramShadow(false, isSearchMatch);
    block.style.opacity = isDimmed ? '0.16' : '1';
    block.setAttribute('aria-label', item.title + ' 정보 열기');

    title.className = 'mobile-combined-program-text';
    title.textContent = getMobileCombinedProgramLabel(item.title, height);
    block.appendChild(title);

    block.addEventListener('click', event => {
      event.stopPropagation();
      openForumProgramDetail(item);
    });

    return block;
  }

  function createMobileCombinedOutdoorProgramBlock(item, lane, venueIndex, timelineEnd) {
    const startMinutes = timeToMinutes(item.startTime);
    const endMinutes = getOutdoorScreeningEndMinutes(item);

    if (startMinutes === null || endMinutes === null || startMinutes > timelineEnd) {
      return null;
    }

    const columnWidth = getMobileVenueColumnWidth();
    const x = venueIndex * columnWidth;
    const y = mobileTimeToY(startMinutes);
    const height = Math.max(28, mobileTimeToY(Math.min(endMinutes, timelineEnd)) - y);
    const isSearchMatch = matchesOutdoorScreeningSearch(item);
    const isDimmed = hasSearchQuery() && !isSearchMatch;
    const block = document.createElement('button');
    const title = document.createElement('div');

    block.type = 'button';
    block.className = 'mobile-combined-program-block';
    block.style.left = x + 6 + 'px';
    block.style.top = y + 4 + 'px';
    block.style.width = Math.max(24, columnWidth - 12) + 'px';
    block.style.height = Math.max(26, height - 8) + 'px';
    block.style.background = getCombinedProgramBackground(lane.color, isSearchMatch, isDimmed, false);
    block.style.borderColor = getCombinedProgramBorderColor(lane.color, isSearchMatch, isDimmed, false);
    block.style.boxShadow = getCombinedProgramShadow(false, isSearchMatch);
    block.style.opacity = isDimmed ? '0.16' : '1';
    block.setAttribute('aria-label', item.title + ' 정보 열기');

    title.className = 'mobile-combined-program-text';
    title.textContent = getMobileCombinedProgramLabel(item.title, height);
    block.appendChild(title);

    block.addEventListener('click', event => {
      event.stopPropagation();
      openOutdoorScreeningDetail(item);
    });

    return block;
  }

  function createMobileCombinedProgramRowBlock(row, lane, venueIndex, timelineEnd) {
    const startMinutes = timeToMinutes(row.startTime);
    const endMinutes = getFilmEndMinutes(row);

    if (startMinutes === null || endMinutes === null || startMinutes > timelineEnd) {
      return null;
    }

    const columnWidth = getMobileVenueColumnWidth();
    const x = venueIndex * columnWidth;
    const y = mobileTimeToY(startMinutes);
    const height = Math.max(28, mobileTimeToY(Math.min(endMinutes, timelineEnd)) - y);
    const isBookmarked = state.bookmarks.has(row.code);
    const isSearchMatch = filmMatchesSearch(row);
    const isDimmed = shouldDimFilm(row, isBookmarked, isSearchMatch);
    const block = document.createElement('div');
    const title = document.createElement('div');

    block.className = 'mobile-combined-program-block';
    block.style.left = x + 6 + 'px';
    block.style.top = y + 4 + 'px';
    block.style.width = Math.max(24, columnWidth - 12) + 'px';
    block.style.height = Math.max(26, height - 8) + 'px';
    block.style.background = getCombinedProgramBackground(lane.color, isSearchMatch, isDimmed, isBookmarked);
    block.style.borderColor = getCombinedProgramBorderColor(lane.color, isSearchMatch, isDimmed, isBookmarked);
    block.style.boxShadow = getCombinedProgramShadow(isBookmarked, isSearchMatch);
    block.style.opacity = isDimmed ? '0.16' : '1';
    block.setAttribute('role', 'button');
    block.setAttribute('tabindex', '0');
    block.setAttribute('aria-label', row.title + ' 정보 열기');

    title.className = 'mobile-combined-program-text';
    title.textContent = getMobileCombinedProgramLabel(row.title, height);
    block.appendChild(title);

    block.addEventListener('click', event => {
      event.stopPropagation();
      openDetailChooser(row);
    });
    block.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      openDetailChooser(row);
    });

    return block;
  }

  function getMobileCombinedProgramLabel(title, height) {
    if (height >= 68) return title;
    if (title.startsWith('라이브 필름 퍼포먼스')) return '라이브 퍼포먼스';
    if (title.startsWith('버추얼 프로덕션 세미나')) return '버추얼 세미나';
    return title;
  }

  function getMobileFilmTitleConfig(film, height) {
    const defaultTitle = film && film.title ? film.title : '';
    if (!defaultTitle) return null;

    if (height > 40) {
      return { text: defaultTitle, mode: 'default' };
    }

    if (height < 28) return null;

    const compactTitle = getMobileCompactFilmTitle(film);
    if (!compactTitle) return null;

    return { text: compactTitle, mode: 'compact' };
  }

  function getMobileCompactFilmTitle(film) {
    const eventLabelTitle = getMobileCompactEventLabel(film);
    if (eventLabelTitle) return eventLabelTitle;

    const candidates = [];

    if (film && film.shorts) {
      candidates.push(...film.shorts.split('/').map(part => part.trim()).filter(Boolean));
    }

    if (film && film.title) {
      candidates.push(...film.title.split(' + ').map(part => part.trim()).filter(Boolean));
      candidates.push(film.title.trim());
    }

    return candidates.find(title => {
      const normalizedTitle = String(title || '').replace(/\s+/g, '');
      return normalizedTitle.length > 0 && normalizedTitle.length <= 5;
    }) || '';
  }

  function getMobileCompactEventLabel(film) {
    const title = film && film.title ? film.title.trim() : '';
    if (!title) return '';

    const matchedPreserver = MOBILE_COMPACT_TITLE_PRESERVERS.find(item => item.pattern.test(title));
    if (!matchedPreserver) return '';

    if (matchedPreserver.extract) {
      const match = title.match(matchedPreserver.pattern);
      return match ? match[0] : '';
    }

    return matchedPreserver.label || '';
  }

  function createMobileFilmTitleText(titleText, mode = 'default', height = 0) {
    const title = document.createElement('div');

    title.className = 'mobile-film-title-text' + (mode === 'compact' ? ' is-compact' : '');
    title.textContent = titleText;
    if (mode !== 'compact') {
      title.style.setProperty('-webkit-line-clamp', String(getMobileFilmLineClamp(height)));
    }

    return title;
  }

  function getMobileFilmLineClamp(height) {
    if (height >= 140) return 10;
    if (height >= 110) return 8;
    if (height >= 80) return 7;
    return 6;
  }

  function createMobileLinkedProgramEventBlock(film, venueIndex, timelineEnd) {
    const relatedEvent = getFollowUpProgramEvent(film);
    const filmEndMinutes = getFilmEndMinutes(film);
    const eventEndMinutes = getProgramEventEndMinutes(film);

    if (!relatedEvent || filmEndMinutes === null || eventEndMinutes === null || filmEndMinutes > timelineEnd) {
      return null;
    }

    const columnWidth = getMobileVenueColumnWidth();
    const x = venueIndex * columnWidth;
    const y = mobileTimeToY(filmEndMinutes);
    const height = Math.max(20, mobileTimeToY(Math.min(eventEndMinutes, timelineEnd)) - y);
    const color = getSectionColor(film.section);
    const isSearchMatch = filmMatchesSearch(film);
    const isDimmed = shouldDimFilm(film, state.bookmarks.has(film.code), isSearchMatch);
    const block = document.createElement('div');

    block.className = 'mobile-program-event-block' + (isDimmed ? ' is-dimmed' : '');
    block.style.left = x + 8 + 'px';
    block.style.top = y + 3 + 'px';
    block.style.width = Math.max(20, columnWidth - 16) + 'px';
    block.style.height = Math.max(20, height - 6) + 'px';
    block.style.background = getMobileProgramEventBackground(color, isSearchMatch, isDimmed);
    block.style.borderColor = getMobileProgramEventBorderColor(color, isSearchMatch, isDimmed);
    block.style.boxShadow = getProgramEventShadow(isSearchMatch);
    block.setAttribute('role', 'button');
    block.setAttribute('tabindex', '0');
    block.setAttribute('aria-label', film.title + ' 관련 행사 정보 열기');

    const eventTextConfig = getMobileProgramEventTextConfig(relatedEvent.label, height);
    if (eventTextConfig) {
      block.appendChild(createMobileProgramEventText(eventTextConfig.text, eventTextConfig.compact));
    }

    block.addEventListener('click', event => {
      event.stopPropagation();
      openDetailChooser(film);
    });
    block.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      openDetailChooser(film);
    });

    return block;
  }

  function createMobileProgramEventText(text, compact = false) {
    const label = document.createElement('div');

    label.className = 'mobile-program-event-text' + (compact ? ' is-compact' : '');
    label.textContent = text;

    return label;
  }

  function getMobileProgramEventTextConfig(label, height) {
    if (height > 56) {
      return { text: label, compact: false };
    }

    if (height >= 32) {
      if (label === '전주와이드토크') {
        return { text: '와이드 토크', compact: true };
      }

      return { text: label, compact: true };
    }

    return null;
  }

  function renderMobileEmptyState(totalWidth, totalHeight) {
    const emptyState = document.createElement('div');

    emptyState.className = 'mobile-grid-empty';
    emptyState.style.width = totalWidth + 'px';
    emptyState.style.height = totalHeight + 'px';
    emptyState.innerHTML = [
      '<div class="mobile-grid-empty-card">',
      '<div class="mobile-grid-empty-title">조건에 맞는 상영이 없어요.</div>',
      '<div class="mobile-grid-empty-copy">검색어를 지우거나 상영관, 섹션, 관심 필터를 조금 넓혀 보세요.</div>',
      '</div>',
    ].join('');

    dom.mobileGridContent.appendChild(emptyState);
  }

  function matchesActiveListFilters(film) {
    if (state.bookmarkHighlight && !state.bookmarks.has(film.code)) return false;
    if (state.activeSections && !state.activeSections.has(film.section)) return false;
    if (hasSearchQuery() && !filmMatchesSearch(film)) return false;
    return true;
  }

  function isFilmInActiveGroup(film) {
    return state.activeGroups.has(getVenueGroup(film.venue).id);
  }

  function getFilmByCode(code) {
    if (!code) return null;
    return state.allData.find(row => row.code === code) || null;
  }

  function getMobileVenueColumns(dayData, talkTalkDayItems = []) {
    const venuesByGroup = getVenuesForDay(dayData, talkTalkDayItems);
    const columns = [];

    config.venueGroups.forEach(group => {
      if (!state.activeGroups.has(group.id)) return;

      venuesByGroup[group.id].forEach(venue => {
        columns.push({ venue, group });
      });
    });

    return columns;
  }

  function getMobileCombinedProgramColumns(lanes) {
    return lanes.map(lane => ({
      type: 'program-lane',
      venue: '__program__' + lane.id,
      lane,
    }));
  }

  function getMobileVenueColumnWidth() {
    const profile = getActiveDensityProfile();
    return Math.round(Math.min(122, Math.max(92, profile.labelWidth * 0.64)) * 0.84) - 14;
  }

  function getMobileGridWidth(venueCount) {
    return Math.max(getMobileVenueColumnWidth(), venueCount * getMobileVenueColumnWidth());
  }

  function getMobileTimeScale() {
    return Math.min(1.3, Math.max(1.04, getActiveDensityProfile().scale - 0.26));
  }

  function getMobileGridHeight(timelineEnd) {
    return Math.max(360, Math.round((timelineEnd - config.timeRange.start) * getMobileTimeScale()));
  }

  function mobileTimeToY(minutes) {
    return (minutes - config.timeRange.start) * getMobileTimeScale();
  }

  function getCurrentDayData() {
    return state.allData.filter(row => row.date === state.currentDay);
  }

  function getBookmarkedRows() {
    return state.allData
      .filter(row => state.bookmarks.has(row.code))
      .sort((left, right) => {
        if (left.date !== right.date) return left.date.localeCompare(right.date);
        if (left.startTime !== right.startTime) return left.startTime.localeCompare(right.startTime);
        return left.venue.localeCompare(right.venue, 'ko');
      });
  }

  function loadBookmarks(rows) {
    const storedCodes = readStoredBookmarkCodes();
    if (storedCodes.length === 0) return new Set();

    const validCodes = new Set(rows.map(row => row.code).filter(Boolean));
    const bookmarks = new Set(storedCodes.filter(code => validCodes.has(code)));

    if (bookmarks.size !== storedCodes.length) {
      writeStoredBookmarkCodes(Array.from(bookmarks));
    }

    return bookmarks;
  }

  function persistBookmarks() {
    writeStoredBookmarkCodes(Array.from(state.bookmarks));
  }

  function readStoredBookmarkCodes() {
    try {
      const rawValue = window.localStorage.getItem(BOOKMARK_STORAGE_KEY);
      if (!rawValue) return [];

      const parsed = JSON.parse(rawValue);
      return Array.isArray(parsed) ? uniqueValues(parsed.map(value => String(value || '').trim())) : [];
    } catch (error) {
      return [];
    }
  }

  function writeStoredBookmarkCodes(codes) {
    try {
      if (codes.length === 0) {
        window.localStorage.removeItem(BOOKMARK_STORAGE_KEY);
        return;
      }

      window.localStorage.setItem(BOOKMARK_STORAGE_KEY, JSON.stringify(uniqueValues(codes)));
    } catch (error) {
      // Ignore storage failures so the app still works in restrictive contexts.
    }
  }

  function isMobileViewport() {
    if (!window.matchMedia) return window.innerWidth <= 960;

    const touchNarrow = window.matchMedia('(max-width: 960px) and (pointer: coarse)').matches;
    const compactViewport = window.matchMedia('(max-width: 760px)').matches;

    return touchNarrow || compactViewport;
  }

  function toggleDesktopViewMode() {
    if (!state.compactViewport) return;

    state.desktopViewForced = !state.desktopViewForced;
    writeDesktopViewForced(state.desktopViewForced);

    syncViewportMode();
    hideTooltip();
    closeOpenPanels();

    if (state.densityMode === 'auto') {
      applyDensitySettings();
    }

    renderApp();

    if (!state.mobileLayout) {
      queueTimelineScroll(50);
    }
  }

  function readMobileNoticeDismissed() {
    try {
      return window.sessionStorage.getItem(MOBILE_NOTICE_STORAGE_KEY) === '1';
    } catch (error) {
      return false;
    }
  }

  function writeMobileNoticeDismissed(value) {
    try {
      if (!value) {
        window.sessionStorage.removeItem(MOBILE_NOTICE_STORAGE_KEY);
        return;
      }

      window.sessionStorage.setItem(MOBILE_NOTICE_STORAGE_KEY, '1');
    } catch (error) {
      // Ignore storage failures so the notice still works without persistence.
    }
  }

  function readDesktopViewForced() {
    try {
      return window.localStorage.getItem(LAYOUT_MODE_STORAGE_KEY) === 'desktop';
    } catch (error) {
      return false;
    }
  }

  function writeDesktopViewForced(value) {
    try {
      if (!value) {
        window.localStorage.removeItem(LAYOUT_MODE_STORAGE_KEY);
        return;
      }

      window.localStorage.setItem(LAYOUT_MODE_STORAGE_KEY, 'desktop');
    } catch (error) {
      // Ignore storage failures so the layout mode still works without persistence.
    }
  }

  function getSearchMatchDates() {
    if (!hasSearchQuery()) return new Set();

    const dates = new Set();
    state.allData.forEach(row => {
      if (filmMatchesSearch(row)) dates.add(row.date);
    });
    talkTalk.items.forEach(item => {
      if (talkTalk.matchesSearch(item, state.normalizedSearchQuery)) dates.add(item.date);
    });
    alleyScreeningSource.items.forEach(item => {
      if (matchesAlleyScreeningSearch(item)) dates.add(item.date);
    });
    forumProgramsSource.items.forEach(item => {
      if (matchesForumProgramSearch(item)) dates.add(item.date);
    });
    outdoorScreeningSource.items.forEach(item => {
      if (matchesOutdoorScreeningSearch(item)) dates.add(item.date);
    });
    return dates;
  }

  function getViewModeSearchMatches() {
    if (!hasSearchQuery()) return new Set();

    const dayData = getCurrentDayData();
    const matches = new Set();

    if (getScheduleViewSearchMatchCount(dayData) > 0) {
      matches.add('schedule');
    }

    if (getProgramsViewSearchMatchCount(dayData) > 0) {
      matches.add('programs');
    }

    if (getCombinedViewSearchMatchCount(dayData) > 0) {
      matches.add('combined');
    }

    return matches;
  }

  function getScheduleViewSearchMatchCount(dayData) {
    const scheduleRows = dayData.filter(row => !isCombinedProgramRow(row));
    const filmMatches = scheduleRows.filter(row => isFilmInActiveGroup(row) && matchesActiveListFilters(row)).length;
    const alleyMatches = getAlleyScreeningItemsForDay().filter(item => isAlleyScreeningInActiveGroup(item)).length;
    const outdoorMatches = getOutdoorScreeningItemsForDay().filter(item => isOutdoorScreeningInActiveGroup(item)).length;

    return filmMatches + alleyMatches + outdoorMatches;
  }

  function getProgramsViewSearchMatchCount(dayData) {
    const talkTalkMatches = getCombinedTalkTalkItems()
      .filter(item => talkTalk.isInActiveGroup(item, state.activeGroups))
      .length;
    const forumMatches = getForumProgramItemsForDay()
      .filter(item => isForumProgramInActiveGroup(item))
      .length;
    const combinedRowMatches = dayData
      .filter(row => isCombinedProgramRow(row) && isFilmInActiveGroup(row) && matchesActiveListFilters(row))
      .length;

    return talkTalkMatches + forumMatches + combinedRowMatches;
  }

  function getCombinedViewSearchMatchCount(dayData) {
    return getScheduleViewSearchMatchCount(dayData) + getProgramsViewSearchMatchCount(dayData);
  }

  function groupFilmsByVenue(dayData) {
    const byVenue = new Map();

    dayData.forEach(row => {
      if (!byVenue.has(row.venue)) byVenue.set(row.venue, []);
      byVenue.get(row.venue).push(row);
    });

    return byVenue;
  }

  function getVenuesForDay(dayData, talkTalkDayItems = []) {
    const venueToGroup = new Map();

    dayData.forEach(row => {
      if (!venueToGroup.has(row.venue)) {
        venueToGroup.set(row.venue, getVenueGroup(row.venue));
      }
    });

    talkTalkDayItems.forEach(item => {
      const venue = talkTalk.getVenue(item);
      if (!venueToGroup.has(venue)) {
        venueToGroup.set(venue, getVenueGroup(venue));
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

  function sortProgramVenueLanes(left, right) {
    const leftGroup = getVenueGroup(left.venue);
    const rightGroup = getVenueGroup(right.venue);
    const leftIndex = config.venueGroups.findIndex(group => group.id === leftGroup.id);
    const rightIndex = config.venueGroups.findIndex(group => group.id === rightGroup.id);

    if (leftIndex !== rightIndex) return leftIndex - rightIndex;

    if (leftGroup.id === 'cgv' || leftGroup.id === 'mega') {
      return sortVenueNames(left.venue, right.venue);
    }

    return left.venue.localeCompare(right.venue, 'ko');
  }

  function getVenueGroup(venue) {
    return config.venueGroups.find(group => group.match(venue)) || config.venueGroups[config.venueGroups.length - 1];
  }

  function getTalkTalkItemsForDay() {
    return talkTalk.items.filter(item => item.date === state.currentDay);
  }

  function getCombinedTalkTalkItems() {
    const items = getTalkTalkItemsForDay();
    if (!hasSearchQuery()) return items;
    return items.filter(item => talkTalk.matchesSearch(item, state.normalizedSearchQuery));
  }

  function getAlleyScreeningItemsForDay() {
    const items = alleyScreeningSource.items.filter(item => item.date === state.currentDay);
    if (!hasSearchQuery()) return items;
    return items.filter(item => matchesAlleyScreeningSearch(item));
  }

  function getForumProgramItemsForDay() {
    const items = forumProgramsSource.items.filter(item => item.date === state.currentDay);
    if (!hasSearchQuery()) return items;
    return items.filter(item => matchesForumProgramSearch(item));
  }

  function getOutdoorScreeningItemsForDay() {
    const items = outdoorScreeningSource.items.filter(item => item.date === state.currentDay);
    if (!hasSearchQuery()) return items;
    return items.filter(item => matchesOutdoorScreeningSearch(item));
  }

  function getScheduleRowsForCurrentMode(dayData) {
    if (state.viewMode === 'programs') return [];
    if (state.viewMode === 'schedule' || state.viewMode === 'combined') {
      return dayData.filter(row => !isCombinedProgramRow(row));
    }
    return dayData;
  }

  function getProgramViewSections(dayData) {
    if (state.viewMode === 'schedule') return [];

    const sections = COMBINED_PROGRAM_LANES.map(def => ({
      id: def.id,
      label: def.label,
      mobileLabel: def.mobileLabel,
      color: def.color,
      items: [],
    }));
    const sectionMap = new Map(sections.map(section => [section.id, section]));

    getCombinedTalkTalkItems()
      .filter(item => talkTalk.isInActiveGroup(item, state.activeGroups))
      .forEach(item => {
        sectionMap.get('talktalk').items.push({ kind: 'talktalk', item });
      });

    dayData
      .filter(row => isCombinedProgramRow(row) && isFilmInActiveGroup(row))
      .forEach(row => {
        const laneId = getCombinedProgramLaneId(row);
        if (!laneId || !sectionMap.has(laneId)) return;
        sectionMap.get(laneId).items.push({ kind: 'row', row });
      });

    const alleyItems = getAlleyScreeningItemsForDay()
      .filter(item => isAlleyScreeningInActiveGroup(item))
      .map(item => ({ kind: 'alley', item }))
      .sort((left, right) => getCombinedProgramEntryStartTime(left).localeCompare(getCombinedProgramEntryStartTime(right)));

    if (alleyItems.length > 0) {
      sections.push({
        id: 'alley',
        label: alleyScreeningSource.overview && alleyScreeningSource.overview.label ? alleyScreeningSource.overview.label : '골목상영',
        mobileLabel: '골목',
        color: ALLEY_SCREENING_COLOR,
        items: alleyItems,
      });
    }

    sections.forEach(section => {
      section.items.sort((left, right) => getCombinedProgramEntryStartTime(left).localeCompare(getCombinedProgramEntryStartTime(right)));
    });

    return sections.filter(section => section.items.length > 0);
  }

  function getProgramsViewLanes(dayData) {
    const grouped = new Map();
    const talkTalkItems = getCombinedTalkTalkItems()
      .filter(item => talkTalk.isInActiveGroup(item, state.activeGroups));
    const forumItems = getForumProgramItemsForDay()
      .filter(item => isForumProgramInActiveGroup(item));
    const combinedRows = dayData
      .filter(row => isCombinedProgramRow(row) && isFilmInActiveGroup(row));

    talkTalkItems.forEach(item => {
      const venue = talkTalk.getVenue(item);
      const lane = ensureProgramsViewVenueLane(grouped, venue, COMBINED_PROGRAM_LANES[0].color);
      lane.items.push({ kind: 'talktalk', item });
    });

    forumItems.forEach(item => {
      const lane = ensureProgramsViewVenueLane(grouped, item.venue, FORUM_PROGRAM_COLOR);
      lane.items.push({ kind: 'forum', item });
    });

    combinedRows.forEach(row => {
      const laneId = getCombinedProgramLaneId(row);
      const laneColor = laneId === 'awards'
        ? COMBINED_PROGRAM_LANES.find(item => item.id === 'awards').color
        : COMBINED_PROGRAM_LANES.find(item => item.id === 'events').color;
      const lane = ensureProgramsViewVenueLane(grouped, row.venue, laneColor);
      lane.items.push({ kind: 'row', row });
    });

    return Array.from(grouped.values())
      .map(lane => {
        lane.items.sort((left, right) => getCombinedProgramEntryStartTime(left).localeCompare(getCombinedProgramEntryStartTime(right)));
        return lane;
      })
      .sort(sortProgramVenueLanes);
  }

  function ensureProgramsViewVenueLane(grouped, venue, color) {
    if (!grouped.has(venue)) {
      grouped.set(venue, {
        id: 'program-venue:' + venue,
        groupLabel: '별도 프로그램',
        venue,
        label: venue,
        mobileLabel: shortenVenueName(venue),
        color,
        items: [],
      });
    }

    const lane = grouped.get(venue);
    if (!lane.color && color) lane.color = color;
    return lane;
  }

  function getCombinedProgramLanes(dayData) {
    if (state.viewMode === 'schedule') return [];
    return getProgramsViewLanes(dayData).concat(getScheduleSupplementalProgramLanes());
  }

  function getScheduleSupplementalProgramLanes() {
    return getAlleyCombinedProgramLanes().concat(getOutdoorCombinedProgramLanes());
  }

  function getAlleyCombinedProgramLanes() {
    const grouped = new Map();

    getAlleyScreeningItemsForDay()
      .filter(item => isAlleyScreeningInActiveGroup(item))
      .forEach(item => {
        const venue = item.venue || '기타 공간';
        if (!grouped.has(venue)) {
          grouped.set(venue, {
            id: 'alley:' + venue,
            groupLabel: alleyScreeningSource.overview && alleyScreeningSource.overview.label
              ? alleyScreeningSource.overview.label
              : '골목상영',
            label: venue,
            mobileLabel: getAlleyVenueMobileLabel(venue),
            color: ALLEY_SCREENING_COLOR,
            items: [],
          });
        }
        grouped.get(venue).items.push({ kind: 'alley', item });
      });

    return Array.from(grouped.values()).map(lane => {
      lane.items.sort((left, right) => getCombinedProgramEntryStartTime(left).localeCompare(getCombinedProgramEntryStartTime(right)));
      return lane;
    });
  }

  function getOutdoorCombinedProgramLanes() {
    const grouped = new Map();

    getOutdoorScreeningItemsForDay()
      .filter(item => isOutdoorScreeningInActiveGroup(item))
      .forEach(item => {
        const venue = item.venue || '기타 공간';
        if (!grouped.has(venue)) {
          grouped.set(venue, {
            id: 'outdoor:' + venue,
            groupLabel: outdoorScreeningSource.overview && outdoorScreeningSource.overview.label
              ? outdoorScreeningSource.overview.label
              : '야외 상영',
            venue,
            label: venue,
            mobileLabel: shortenVenueName(venue),
            color: OUTDOOR_SCREENING_COLOR,
            items: [],
          });
        }
        grouped.get(venue).items.push({ kind: 'outdoor', item });
      });

    return Array.from(grouped.values()).map(lane => {
      lane.items.sort((left, right) => getCombinedProgramEntryStartTime(left).localeCompare(getCombinedProgramEntryStartTime(right)));
      return lane;
    });
  }

  function getCombinedProgramTimelineRows(lanes) {
    return lanes.flatMap(lane => lane.items.map(entry => {
      if (entry.kind === 'talktalk') {
        return {
          startTime: entry.item.startTime,
          endTime: talkTalk.getEndTime(entry.item),
        };
      }

      if (entry.kind === 'alley') {
        return {
          startTime: entry.item.startTime,
          endTime: getAlleyScreeningEndTime(entry.item),
        };
      }

      if (entry.kind === 'forum') {
        return {
          startTime: entry.item.startTime,
          endTime: getForumProgramEndTime(entry.item),
        };
      }

      if (entry.kind === 'outdoor') {
        return {
          startTime: entry.item.startTime,
          endTime: getOutdoorScreeningEndTime(entry.item),
        };
      }

      return {
        startTime: entry.row.startTime,
        endTime: entry.row.endTime || entry.row.provisionalEndTime,
      };
    }));
  }

  function getCombinedProgramEntryStartTime(entry) {
    if (!entry) return '99:99';
    if (entry.kind === 'talktalk') return entry.item.startTime || '99:99';
    if (entry.kind === 'alley') return entry.item.startTime || '99:99';
    if (entry.kind === 'forum') return entry.item.startTime || '99:99';
    if (entry.kind === 'outdoor') return entry.item.startTime || '99:99';
    return entry.row.startTime || '99:99';
  }

  function getCombinedProgramLaneId(row) {
    if (!row) return '';

    if (row.title && row.title.startsWith('수상작 상영')) {
      return 'awards';
    }

    if (row.section === '라운드테이블' || row.section === '세미나' || (row.title && row.title.startsWith('라이브 필름 퍼포먼스'))) {
      return 'events';
    }

    return '';
  }

  function isCombinedProgramRow(row) {
    return Boolean(getCombinedProgramLaneId(row));
  }

  function getSectionColor(section) {
    if (!section) return '#4a4a5a';

    for (const [key, color] of Object.entries(config.sectionColors)) {
      const normalizedKey = key.replace('특별전: ', '').replace('특별상영: ', '');
      if (section === key || section.includes(normalizedKey)) return color;
    }

    return '#5a5a6a';
  }

  function hasSearchQuery() {
    return state.normalizedSearchQuery.length > 0;
  }

  function filmMatchesSearch(film) {
    if (!hasSearchQuery()) return true;

    const haystack = normalizeSearchValue([
      film.title,
      film.directorLabel,
      film.directorSearchText,
      film.shorts,
      film.section,
      film.code,
      film.relatedEvent ? film.relatedEvent.label : '',
      film.relatedEvent ? film.relatedEvent.searchText : '',
      film.relatedEvent ? film.relatedEvent.guestLabel : '',
      film.relatedEvent ? film.relatedEvent.moderator : '',
    ].filter(Boolean).join(' '));

    return haystack.includes(state.normalizedSearchQuery);
  }

  function matchesAlleyScreeningSearch(item) {
    if (!hasSearchQuery()) return true;

    const haystack = normalizeSearchValue([
      alleyScreeningSource.overview && alleyScreeningSource.overview.label ? alleyScreeningSource.overview.label : '골목상영',
      item.title,
      item.venue,
      item.guestLabel,
      Array.isArray(item.tags) ? item.tags.join(' ') : '',
    ].filter(Boolean).join(' '));

    return haystack.includes(state.normalizedSearchQuery);
  }

  function matchesForumProgramSearch(item) {
    if (!hasSearchQuery()) return true;

    const haystack = normalizeSearchValue([
      forumProgramsSource.overview && forumProgramsSource.overview.label ? forumProgramsSource.overview.label : '전주포럼',
      item.seriesLabel,
      item.title,
      item.summary,
      item.venue,
      item.venueDetail,
      item.moderator,
      item.speakers,
      item.panelists,
      item.hostLabel,
      item.organizerLabel,
      item.feeLabel,
    ].filter(Boolean).join(' '));

    return haystack.includes(state.normalizedSearchQuery);
  }

  function matchesOutdoorScreeningSearch(item) {
    if (!hasSearchQuery()) return true;

    const haystack = normalizeSearchValue([
      outdoorScreeningSource.overview && outdoorScreeningSource.overview.label ? outdoorScreeningSource.overview.label : '야외 상영',
      item.seriesLabel,
      item.title,
      item.summary,
      item.venue,
      Array.isArray(item.tags) ? item.tags.join(' ') : '',
    ].filter(Boolean).join(' '));

    return haystack.includes(state.normalizedSearchQuery);
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

  function getTimelineEnd(dayData) {
    const latestEnd = dayData.reduce((maxEnd, film) => {
      const filmEnd = getFilmEndMinutes(film);
      const programEventEnd = getProgramEventEndMinutes(film);
      const latestFilmEnd = filmEnd === null ? maxEnd : Math.max(maxEnd, filmEnd);
      return programEventEnd === null ? latestFilmEnd : Math.max(latestFilmEnd, programEventEnd);
    }, config.timeRange.end);

    return Math.max(config.timeRange.end, Math.ceil(latestEnd / 30) * 30);
  }

  function getTotalWidth(timelineEnd = config.timeRange.end) {
    return Math.round((timelineEnd - config.timeRange.start) * getActiveDensityProfile().scale);
  }

  function timeToX(minutes) {
    return (minutes - config.timeRange.start) * getActiveDensityProfile().scale;
  }

  function timeToMinutes(value) {
    if (!value) return null;
    const [hours, minutes] = value.split(':').map(Number);
    return hours * 60 + minutes;
  }

  function getFilmEndMinutes(film) {
    const startMinutes = timeToMinutes(film.startTime);
    const endMinutes = timeToMinutes(film.endTime || film.provisionalEndTime);

    if (startMinutes === null || endMinutes === null) return null;

    return endMinutes <= startMinutes
      ? endMinutes + (24 * 60)
      : endMinutes;
  }

  function getFilmDisplayEndTime(film) {
    return film && film.endTime ? film.endTime : '종료 미정';
  }

  function formatFilmTimeRange(film, separator = ' – ') {
    if (!film || !film.startTime) return '—';
    return film.startTime + separator + getFilmDisplayEndTime(film);
  }

  function getFollowUpProgramEvent(film) {
    if (!film || !film.relatedEvent || film.relatedEvent.scheduleMode === 'separate') {
      return null;
    }

    return film.relatedEvent;
  }

  function getProgramEventEndMinutes(film) {
    const relatedEvent = getFollowUpProgramEvent(film);
    const filmEnd = getFilmEndMinutes(film);

    if (!relatedEvent || filmEnd === null) return null;

    return filmEnd + relatedEvent.durationMinutes;
  }

  function formatAxisTime(totalMinutes) {
    const minutesInDay = 24 * 60;
    const normalizedMinutes = totalMinutes >= minutesInDay
      ? totalMinutes - minutesInDay
      : totalMinutes;
    const hours = Math.floor(normalizedMinutes / 60);
    const minutes = normalizedMinutes % 60;

    return hours + ':' + String(minutes).padStart(2, '0');
  }

  function parseCSV(text) {
    const lines = text.trim().split('\n');
    const rows = [];

    for (let index = 1; index < lines.length; index += 1) {
      const fields = parseCSVLine(lines[index]);
      if (fields.length < 8) continue;

      const [date, venue, session, section, title, shorts, startTime, endTime, code, meta = ''] = fields;
      if (!startTime) continue;

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

  function inferOpenEndedRows(rows) {
    const clonedRows = rows.map(row => Object.assign({}, row));
    const grouped = new Map();

    clonedRows.forEach(row => {
      const key = row.date + '|' + row.venue;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(row);
    });

    grouped.forEach(groupRows => {
      const sortedRows = groupRows
        .slice()
        .sort((left, right) => left.startTime.localeCompare(right.startTime));

      sortedRows.forEach((row, index) => {
        if (row.endTime || !row.startTime) return;

        const startMinutes = timeToMinutes(row.startTime);
        const nextRow = sortedRows.slice(index + 1).find(candidate => timeToMinutes(candidate.startTime) !== null);
        const nextStartMinutes = nextRow ? timeToMinutes(nextRow.startTime) : null;
        let fallbackEndMinutes = startMinutes + OPEN_ENDED_SLOT_FALLBACK_MINUTES;

        if (nextStartMinutes !== null) {
          fallbackEndMinutes = Math.min(fallbackEndMinutes, nextStartMinutes);
        }

        if (fallbackEndMinutes <= startMinutes) {
          fallbackEndMinutes = startMinutes + OPEN_ENDED_SLOT_FALLBACK_MINUTES;
        }

        row.provisionalEndTime = minutesToClockLabel(fallbackEndMinutes);
      });
    });

    return clonedRows;
  }

  function minutesToClockLabel(totalMinutes) {
    const normalizedMinutes = ((totalMinutes % (24 * 60)) + (24 * 60)) % (24 * 60);
    const hours = Math.floor(normalizedMinutes / 60);
    const minutes = normalizedMinutes % 60;
    return String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0');
  }

  function enrichRows(rows) {
    const scheduleMetaSource = window.JIFF_SCHEDULE_META;

    return rows.map(row => {
      const enrichedRow = Object.assign({}, row);
      const linkedEvent = getLinkedProgramEvent(row);
      const manualDetailLink = getManualDetailLink(row);
      const manualMetaEntry = manualDetailLink
        ? createManualDetailMetaEntry(enrichedRow, manualDetailLink)
        : null;

      if (linkedEvent) {
        enrichedRow.relatedEvent = linkedEvent;
      }

      const metaEntry = scheduleMetaSource
        ? getScheduleMetaEntry(enrichedRow, scheduleMetaSource)
        : null;
      const resolvedMetaEntry = manualDetailLink && manualDetailLink.overrideGeneratedDetail
        ? manualMetaEntry
        : (metaEntry || manualMetaEntry);

      if (!resolvedMetaEntry) return enrichedRow;

      return Object.assign(enrichedRow, {
        directorLabel: resolvedMetaEntry.directorLabel || '',
        directorNames: resolvedMetaEntry.directorNames || [],
        directorSearchText: (resolvedMetaEntry.directorNames || []).join(' '),
        detailMovieId: resolvedMetaEntry.detailMovieId || '',
        detailUrl: resolvedMetaEntry.detailUrl || '',
        detailCandidates: resolvedMetaEntry.detailCandidates || [],
        hasMultipleDetails: Boolean(resolvedMetaEntry.hasMultipleDetails),
      });
    });
  }

  function getManualDetailLink(row) {
    if (!row || !row.code || !config.manualDetailLinksByCode) return null;
    return config.manualDetailLinksByCode[row.code] || null;
  }

  function createManualDetailMetaEntry(row, link) {
    if (!link || !link.url) return null;

    return {
      detailMovieId: '',
      detailUrl: link.url,
      detailCandidates: [
        {
          movieId: 'manual-' + String(row.code || ''),
          title: link.title || row.title || '상세보기',
          url: link.url,
        },
      ],
      hasMultipleDetails: false,
      directorLabel: '',
      directorNames: [],
    };
  }

  function getLinkedProgramEvent(row) {
    if (!row || !row.code || !config.linkedProgramEventsByCode) return null;

    const baseEvent = config.linkedProgramEventsByCode[row.code] || null;
    const majungMeta = xMajungSource.byCode && xMajungSource.byCode[row.code]
      ? xMajungSource.byCode[row.code]
      : null;

    if (!baseEvent) return null;
    if (!majungMeta) return baseEvent;

    return Object.assign({}, baseEvent, majungMeta);
  }

  function getScheduleMetaEntry(row, scheduleMetaSource) {
    if (!scheduleMetaSource) return null;

    const candidates = getDirectorLookupCandidates(row);
    const matches = candidates
      .map(candidate => scheduleMetaSource.byTitle && scheduleMetaSource.byTitle[candidate]
        ? scheduleMetaSource.byTitle[candidate]
        : scheduleMetaSource.byNormalizedTitle
          ? scheduleMetaSource.byNormalizedTitle[normalizeSearchValue(candidate)]
          : null)
      .filter(Boolean);
    const codeMatch = scheduleMetaSource.byCode && scheduleMetaSource.byCode[row.code]
      ? scheduleMetaSource.byCode[row.code]
      : null;

    if (codeMatch && codeEntryMatchesRowTitle(codeMatch, candidates)) {
      return codeMatch;
    }

    if (matches.length > 0) {
      return mergeScheduleMetaEntries(matches);
    }

    return codeMatch;
  }

  function getDirectorLookupCandidates(row) {
    const candidates = [row.title];

    if (row.title && row.title.includes(':')) {
      candidates.push(row.title.split(':').pop().trim());
    }

    if (row.title && row.title.includes(' + ')) {
      candidates.push(...row.title.split(' + ').map(part => part.trim()));
    }

    if (row.shorts) {
      candidates.push(...row.shorts.split('/').map(part => part.trim()));
    }

    return uniqueValues(candidates.filter(Boolean));
  }

  function codeEntryMatchesRowTitle(entry, candidates) {
    if (!entry || !Array.isArray(entry.titles) || entry.titles.length === 0) return false;

    const normalizedTitles = new Set(entry.titles.map(title => normalizeSearchValue(title)));

    return candidates.some(candidate => normalizedTitles.has(normalizeSearchValue(candidate)));
  }

  function mergeScheduleMetaEntries(entries) {
    const detailCandidates = mergeDetailCandidates(entries.flatMap(entry => entry.detailCandidates || []));
    const detailMovieId = detailCandidates.length === 1 ? detailCandidates[0].movieId : '';
    const detailUrl = detailCandidates.length === 1 ? detailCandidates[0].url : '';
    const directorDisplays = uniqueValues(entries.flatMap(entry => entry.directorDisplays || []));
    const directorNames = uniqueValues(entries.flatMap(entry => entry.directorNames || []));

    return {
      detailMovieId,
      detailUrl,
      detailCandidates,
      hasMultipleDetails: detailCandidates.length > 1,
      directorDisplays,
      directorLabel: directorDisplays.join(' · '),
      directorNames,
    };
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
      .replace('전주디지털독립영화관', '전주디지털독립영화관')
      .replace('전북대학교 삼성문화회관', '삼성문화회관')
      .replace('한국소리문화의전당 모악당', '소리문화전당');
  }

  function getVenueLabelText(venue, group) {
    if (!(state.compactViewport && !state.mobileLayout)) {
      return shortenVenueName(venue);
    }

    if (group && (group.id === 'cgv' || group.id === 'mega')) {
      const parts = getMobileVenueHeaderParts(venue);
      return parts.secondary || parts.primary;
    }

    if (venue === '전주디지털독립영화관') {
      return '전주디지털독립영화관';
    }

    if (venue === '전북대학교 삼성문화회관') {
      return '삼성문화회관';
    }

    if (venue === '한국소리문화의전당 모악당') {
      return '소리문화 모악';
    }

    return shortenVenueName(venue);
  }

  function getMobileColumnHeaderParts(entry) {
    if (entry && entry.type === 'program-lane') {
      if (entry.lane && entry.lane.venue) {
        return getMobileVenueHeaderParts(entry.lane.venue);
      }

      return {
        primary: entry.lane.groupLabel || '별도 프로그램',
        secondary: entry.lane.mobileLabel || entry.lane.label,
      };
    }

    return getMobileVenueHeaderParts(entry.venue);
  }

  function getMobileVenueHeaderParts(venue) {
    if (venue.startsWith('CGV전주고사 ')) {
      return {
        primary: 'CGV 전주고사',
        secondary: venue.replace('CGV전주고사 ', '').trim(),
      };
    }

    if (venue.startsWith('메가박스 전주객사 ')) {
      return {
        primary: '메가박스 전주객사',
        secondary: venue.replace('메가박스 전주객사 ', '').trim(),
      };
    }

    if (venue === '전주디지털독립영화관') {
      return { primary: '전주디지털독립영화관', secondary: '', singleHeader: true };
    }

    if (venue === '전북대학교 삼성문화회관') {
      return { primary: '삼성문화회관', secondary: '', singleHeader: true };
    }

    if (venue === '한국소리문화의전당 모악당') {
      return { primary: '소리문화전당', secondary: '모악당' };
    }

    const lastSpaceIndex = venue.lastIndexOf(' ');
    if (lastSpaceIndex > 0) {
      return {
        primary: venue.slice(0, lastSpaceIndex).trim(),
        secondary: venue.slice(lastSpaceIndex + 1).trim(),
      };
    }

    return { primary: venue, secondary: '' };
  }

  function formatBookmarkVenue(venue) {
    return venue
      .replace('CGV전주고사 ', 'CGV ')
      .replace('메가박스 전주객사 ', '메가박스 ');
  }

  function getAlleyScreeningPageUrl(item) {
    if (item && item.pageUrl) return item.pageUrl;
    return alleyScreeningSource.overview && alleyScreeningSource.overview.pageUrl
      ? alleyScreeningSource.overview.pageUrl
      : 'https://archive.jeonjufest.kr/community/news/view.asp?idx=9351';
  }

  function getForumProgramPageUrl(item) {
    if (item && item.pageUrl) return item.pageUrl;
    return forumProgramsSource.overview && forumProgramsSource.overview.pageUrl
      ? forumProgramsSource.overview.pageUrl
      : '';
  }

  function getOutdoorScreeningPageUrl(item) {
    if (item && item.pageUrl) return item.pageUrl;
    return outdoorScreeningSource.overview && outdoorScreeningSource.overview.pageUrl
      ? outdoorScreeningSource.overview.pageUrl
      : '';
  }

  function getAlleyScreeningDurationMinutes(item) {
    const itemDuration = item && item.durationMinutes ? Number(item.durationMinutes) : NaN;
    return Number.isFinite(itemDuration) && itemDuration > 0
      ? itemDuration
      : OPEN_ENDED_SLOT_FALLBACK_MINUTES;
  }

  function getAlleyScreeningEndMinutes(item) {
    const startMinutes = timeToMinutes(item && item.startTime ? item.startTime : '');
    if (startMinutes === null) return null;
    return startMinutes + getAlleyScreeningDurationMinutes(item);
  }

  function getAlleyScreeningEndTime(item) {
    const endMinutes = getAlleyScreeningEndMinutes(item);
    return endMinutes === null ? '' : minutesToClockLabel(endMinutes);
  }

  function formatAlleyScreeningTimeRange(item) {
    if (!item || !item.startTime) return '—';
    return item.endTime ? item.startTime + ' – ' + item.endTime : item.startTime;
  }

  function getAlleyScreeningTagsText(item) {
    const tags = Array.isArray(item && item.tags) ? item.tags.filter(Boolean) : [];
    return tags.join(' · ');
  }

  function isAlleyScreeningInActiveGroup(item) {
    return state.activeGroups.has(getVenueGroup(item.venue).id);
  }

  function getForumProgramEndMinutes(item) {
    const startMinutes = timeToMinutes(item && item.startTime ? item.startTime : '');
    const endMinutes = timeToMinutes(item && item.endTime ? item.endTime : '');

    if (startMinutes === null) return null;
    if (endMinutes !== null) return endMinutes;
    return startMinutes + OPEN_ENDED_SLOT_FALLBACK_MINUTES;
  }

  function getForumProgramEndTime(item) {
    const endMinutes = getForumProgramEndMinutes(item);
    return endMinutes === null ? '' : minutesToClockLabel(endMinutes);
  }

  function formatForumProgramTimeRange(item) {
    if (!item || !item.startTime) return '—';
    return item.endTime ? item.startTime + ' – ' + item.endTime : item.startTime;
  }

  function getForumProgramVenueText(item) {
    if (!item) return '—';
    if (item.venue && item.venueDetail) {
      return item.venue + ' · ' + item.venueDetail;
    }
    return item.venue || '—';
  }

  function isForumProgramInActiveGroup(item) {
    return state.activeGroups.has(getVenueGroup(item.venue).id);
  }

  function getOutdoorScreeningEndMinutes(item) {
    const startMinutes = timeToMinutes(item && item.startTime ? item.startTime : '');
    const endMinutes = timeToMinutes(item && item.endTime ? item.endTime : '');

    if (startMinutes === null) return null;
    if (endMinutes !== null) return endMinutes;
    return startMinutes + 90;
  }

  function getOutdoorScreeningEndTime(item) {
    const endMinutes = getOutdoorScreeningEndMinutes(item);
    return endMinutes === null ? '' : minutesToClockLabel(endMinutes);
  }

  function formatOutdoorScreeningTimeRange(item) {
    if (!item || !item.startTime) return '—';
    return item.endTime ? item.startTime + ' – ' + item.endTime : item.startTime;
  }

  function getOutdoorScreeningTagsText(item) {
    const tags = Array.isArray(item && item.tags) ? item.tags.filter(Boolean) : [];
    return tags.join(' · ');
  }

  function isOutdoorScreeningInActiveGroup(item) {
    return state.activeGroups.has(getVenueGroup(item.venue).id);
  }

  function getAlleyVenueMobileLabel(venue) {
    return ALLEY_SCREENING_VENUE_LABELS[venue] || venue;
  }

  function formatDayLabel(dateValue) {
    const day = dateValue ? dayLookup.get(dateValue) : null;
    if (!day) return dateValue || '—';
    return day.label + ' ' + day.sub;
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

  function renderBookmarkActionState() {
    const isEmpty = state.bookmarks.size === 0;

    dom.bookmarksClearBtn.disabled = isEmpty;
    dom.bookmarksDownloadBtn.disabled = isEmpty;
  }

  function normalizeSearchValue(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function uniqueValues(values) {
    return Array.from(new Set(values.filter(Boolean)));
  }

  function mergeDetailCandidates(candidates) {
    const seen = new Set();

    return candidates.filter(candidate => {
      if (!candidate || !candidate.movieId || seen.has(candidate.movieId)) return false;
      seen.add(candidate.movieId);
      return true;
    });
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeCSVField(value) {
    const text = String(value || '');
    return /[",\n]/.test(text)
      ? '"' + text.replace(/"/g, '""') + '"'
      : text;
  }
})();
