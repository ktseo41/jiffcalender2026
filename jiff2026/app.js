(function initScheduleApp() {
  const dataSource = window.JIFF_SCHEDULE_DATA;
  const config = window.JIFF_SCHEDULE_CONFIG;
  const BOOKMARK_STORAGE_KEY = 'jiff2026-bookmarks';
  const DAY_QUERY_PARAM = 'day';
  const MOBILE_NOTICE_STORAGE_KEY = 'jiff2026-mobile-notice-dismissed';
  const LAYOUT_MODE_STORAGE_KEY = 'jiff2026-layout-mode';
  const STAR_SYMBOL_URL = './jiff2026/icons/star.svg#bookmark-star';

  if (!dataSource || !config) {
    throw new Error('JIFF schedule assets are missing.');
  }

  const allData = enrichRows(parseCSV(dataSource.csvRaw));

  const state = {
    allData,
    currentDay: resolveInitialDay(),
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
    dom.dayTabsShell = document.getElementById('dayTabsShell');
    dom.dayTabs = document.getElementById('dayTabs');
    dom.venueFilters = document.getElementById('venueFilters');
    dom.legend = document.getElementById('legend');
    dom.searchInput = document.getElementById('searchInput');
    dom.searchClearBtn = document.getElementById('searchClearBtn');
    dom.densitySelector = document.getElementById('densitySelector');
    dom.densityHint = document.getElementById('densityHint');
    dom.mobileHeaderSearch = document.getElementById('mobileHeaderSearch');
    dom.mobileSearchInput = document.getElementById('mobileSearchInput');
    dom.mobileSearchClearBtn = document.getElementById('mobileSearchClearBtn');
    dom.mobileDesktopToggleBtn = document.getElementById('mobileDesktopToggleBtn');
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
    dom.tooltip = document.getElementById('tooltip');
    dom.overlay = document.getElementById('overlay');
    dom.detailChooserPanel = document.getElementById('detail-chooser-panel');
    dom.detailChooserTitle = document.getElementById('detailChooserTitle');
    dom.detailChooserSubtitle = document.getElementById('detailChooserSubtitle');
    dom.detailChooserList = document.getElementById('detailChooserList');
    dom.detailChooserCloseBtn = document.getElementById('detailChooserCloseBtn');
    dom.bookmarksPanel = document.getElementById('bookmarks-panel');
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
    dom.mobileSearchToggleBtn.addEventListener('click', openMobileHeaderSearch);
    dom.mobileControlsToggleBtn.addEventListener('click', toggleMobileControls);
    dom.densitySelector.addEventListener('click', handleDensityClick);
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
    buildDensityControls();
    renderMobileNotice();
    renderMobileControlsState();
    renderViewportToggle();
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

  function handleSearchInput(event) {
    setSearchQuery(event.target.value);
  }

  function handleMobileSearchInput(event) {
    setSearchQuery(event.target.value);
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
    renderVenueFilterState();
    renderLegendState();
    renderSearchControls();
    renderDensityControls();
    renderBookmarkHighlightState();
    renderMobileControlsState();
    renderViewportToggle();
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
    dom.mobileSearchToggleBtn.classList.toggle('is-active', isMobileSearchVisible);
    dom.bookmarkBtn.classList.toggle('hidden-by-search', isMobileSearchVisible);
    dom.bookmarkBtn.setAttribute('aria-hidden', isMobileSearchVisible ? 'true' : 'false');
    dom.mobileSearchClearBtn.setAttribute('aria-label', hasSearchQuery() ? '검색 지우기' : '검색 닫기');
  }

  function renderViewportToggle() {
    const shouldShow = state.compactViewport;
    const isDesktopMode = shouldShow && !state.mobileLayout;

    dom.mobileDesktopToggleBtn.hidden = !shouldShow;
    dom.mobileDesktopToggleBtn.classList.toggle('is-active', isDesktopMode);
    dom.mobileDesktopToggleBtn.textContent = isDesktopMode ? 'MO' : 'PC';
    dom.mobileDesktopToggleBtn.setAttribute('aria-label', isDesktopMode ? '모바일 보기로 전환' : 'PC 보기로 전환');
    dom.mobileDesktopToggleBtn.setAttribute('title', isDesktopMode ? '모바일 보기' : 'PC 보기');
  }

  function renderDensityControls() {
    dom.densitySelector.querySelectorAll('[data-density]').forEach(button => {
      button.classList.toggle('active', button.dataset.density === state.densityMode);
    });

    if (dom.densityHint) {
      dom.densityHint.textContent = state.densityMode === 'auto'
        ? '현재 ' + getDensityLabel(state.resolvedDensityKey)
        : getDensityLabel(state.resolvedDensityKey) + ' 고정';
    }
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
      && state.mobileLayout
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

    if (state.mobileLayout) {
      renderMobileDay(dayData);
      return;
    }

    renderTimelineDay(dayData);
  }

  function renderTimelineDay(dayData) {
    const timelineEnd = getTimelineEnd(dayData);
    const totalWidth = getTotalWidth(timelineEnd);
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

    renderTimeAxis(gridLines, timelineEnd);

    config.venueGroups.forEach(group => {
      const venues = venuesByGroup[group.id];
      if (!state.activeGroups.has(group.id) || venues.length === 0) return;
      renderVenueGroup(group, venues, filmsByVenue, totalWidth, timelineEnd);
    });

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

  function renderVenueGroup(group, venues, filmsByVenue, totalWidth, timelineEnd) {
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
      dom.timelineContent.appendChild(createVenueRow(filmsByVenue.get(venue) || [], totalWidth, timelineEnd));
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

  function createVenueRow(films, totalWidth, timelineEnd) {
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

    return row;
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
    const hasBlockAction = Boolean(film.detailUrl || film.hasMultipleDetails);

    const block = document.createElement('div');
    block.className = 'film-block' + (isBookmarked ? ' bookmarked' : '') + (hasBlockAction ? '' : ' no-detail-action');
    block.style.left = x + 'px';
    block.style.width = width + 'px';
    block.style.background = getFilmBackground(color, isBookmarked, isSearchMatch, isDimmed);
    block.style.borderColor = getFilmBorderColor(color, isBookmarked, isSearchMatch, isDimmed);
    block.style.opacity = isDimmed ? '0.15' : '1';
    block.style.boxShadow = getFilmShadow(isBookmarked, isSearchMatch);

    const detailLink = film.detailUrl ? createFilmDetailLink(film) : null;

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

    block.addEventListener('mouseenter', () => showTooltip(film, color));
    block.addEventListener('mousemove', moveTooltip);
    block.addEventListener('mouseleave', hideTooltip);

    if (film.hasMultipleDetails) {
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
    const block = document.createElement('div');

    block.className = 'program-event-block';
    block.style.left = x + 'px';
    block.style.width = width + 'px';
    block.style.background = getProgramEventBackground(color, isSearchMatch, isDimmed);
    block.style.borderColor = getProgramEventBorderColor(color, isSearchMatch, isDimmed);
    block.style.opacity = isDimmed ? '0.15' : '1';
    block.style.boxShadow = getProgramEventShadow(isSearchMatch);

    const eventLink = relatedEvent.url ? createProgramEventLink(film, relatedEvent) : null;

    if (eventLink) {
      block.appendChild(eventLink);
    }

    if (width > 28) {
      (eventLink || block).appendChild(createProgramEventText(relatedEvent.label));
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
      '<div class="bm-meta">' + escapeHtml(row.startTime + '–' + row.endTime + ' · ' + venue) + '</div>',
      '</div>',
      '<button type="button" class="bm-remove" data-bookmark-remove="' + escapeHtml(row.code) + '">✕</button>',
      '</div>',
    ].join('');
  }

  function updateBookmarkCount() {
    dom.bookmarkCount.textContent = state.bookmarks.size > 0 ? '(' + state.bookmarks.size + ')' : '';
    dom.bookmarkBtn.classList.toggle('has-items', state.bookmarks.size > 0);
    renderBookmarkActionState();

    if (state.bookmarks.size === 0 && state.bookmarkHighlight) {
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
        row.endTime,
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
    dom.detailChooserSubtitle.textContent = [film.startTime + ' - ' + film.endTime, film.venue, film.section]
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

  function renderCompactDetailChooser(film) {
    const tags = getMetaTags(film.meta);
    const relatedEvent = film.relatedEvent || null;
    const detailCandidates = film.detailCandidates || [];
    const isBookmarked = state.bookmarks.has(film.code);
    const primaryActions = [];
    const infoRows = [
      ['시간', film.startTime && film.endTime ? film.startTime + ' – ' + film.endTime : '—'],
      ['상영관', film.venue || '—'],
      ['섹션', film.section || '—'],
    ];

    if (film.directorLabel) infoRows.push(['감독', film.directorLabel]);
    if (film.meta) infoRows.push(['정보', film.meta]);

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
      tags.length > 0
        ? '<div class="dc-mobile-tags">' + tags.map(tag => '<span class="dc-mobile-tag">' + escapeHtml(tag) + '</span>').join('') + '</div>'
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
    parts.push('<strong>시간</strong> ' + escapeHtml(film.startTime + ' – ' + film.endTime));
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

    parts.push('</div>');
    parts.push('<div class="tt-bookmark-hint">클릭 시 공식 이벤트 페이지 새 탭 열기</div>');

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
    if (state.mobileLayout) return;

    window.setTimeout(() => {
      dom.timelineScroll.scrollLeft = timeToX(config.timeRange.initialScroll) - 20;
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
    const filmsInActiveGroups = dayData.filter(isFilmInActiveGroup);
    const timelineSource = filmsInActiveGroups.length > 0 ? filmsInActiveGroups : dayData;
    const timelineEnd = getTimelineEnd(timelineSource);
    const venueColumns = getMobileVenueColumns(timelineSource);
    const filmsByVenue = groupFilmsByVenue(filmsInActiveGroups);
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
      const films = filmsByVenue.get(entry.venue) || [];

      films.forEach(film => {
        const block = createMobileFilmBlock(film, index, timelineEnd);
        if (block) dom.mobileGridContent.appendChild(block);

        const eventBlock = createMobileLinkedProgramEventBlock(film, index, timelineEnd);
        if (eventBlock) dom.mobileGridContent.appendChild(eventBlock);
      });
    });

    if (venueColumns.length === 0 || filmsInActiveGroups.length === 0) {
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
      const parts = getMobileVenueHeaderParts(entry.venue);

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
      const parts = getMobileVenueHeaderParts(entry.venue);

      header.className = 'mobile-venue-roomhead';
      header.style.left = String(index * columnWidth) + 'px';
      header.style.width = String(columnWidth) + 'px';

      secondary.className = 'mobile-venue-room';
      secondary.textContent = parts.secondary || parts.primary;

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
    const parts = currentVenue ? getMobileVenueHeaderParts(currentVenue.venue) : null;

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

    const titleMode = getMobileFilmTitleMode(film.title, height);
    if (titleMode) {
      block.appendChild(createMobileFilmTitleText(film.title, titleMode));
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

  function getMobileFilmTitleMode(titleText, height) {
    const normalizedTitle = String(titleText || '').replace(/\s+/g, '');

    if (height > 40) return 'default';
    if (height >= 28 && normalizedTitle.length > 0 && normalizedTitle.length <= 5) return 'compact';
    return '';
  }

  function createMobileFilmTitleText(titleText, mode = 'default') {
    const title = document.createElement('div');

    title.className = 'mobile-film-title-text' + (mode === 'compact' ? ' is-compact' : '');
    title.textContent = titleText;

    return title;
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

    if (height > 56) {
      block.appendChild(createMobileProgramEventText(relatedEvent.label));
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

  function createMobileProgramEventText(text) {
    const label = document.createElement('div');

    label.className = 'mobile-program-event-text';
    label.textContent = text;

    return label;
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

  function getMobileVenueColumns(dayData) {
    const venuesByGroup = getVenuesForDay(dayData);
    const columns = [];

    config.venueGroups.forEach(group => {
      if (!state.activeGroups.has(group.id)) return;

      venuesByGroup[group.id].forEach(venue => {
        columns.push({ venue, group });
      });
    });

    return columns;
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
    return dates;
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

  function getDensityLabel(densityKey) {
    const mode = config.densityModes.find(item => item.id === densityKey);
    return mode ? mode.label : densityKey;
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
    const endMinutes = timeToMinutes(film.endTime);

    if (startMinutes === null || endMinutes === null) return null;

    return endMinutes <= startMinutes
      ? endMinutes + (24 * 60)
      : endMinutes;
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

  function enrichRows(rows) {
    const directorSource = window.JIFF_SCHEDULE_DIRECTORS;

    return rows.map(row => {
      const enrichedRow = Object.assign({}, row);
      const linkedEvent = getLinkedProgramEvent(row);

      if (linkedEvent) {
        enrichedRow.relatedEvent = linkedEvent;
      }

      if (!directorSource) return enrichedRow;

      const metaEntry = getScheduleMetaEntry(enrichedRow, directorSource);

      if (!metaEntry) return enrichedRow;

      return Object.assign(enrichedRow, {
        directorLabel: metaEntry.directorLabel || '',
        directorNames: metaEntry.directorNames || [],
        directorSearchText: (metaEntry.directorNames || []).join(' '),
        detailMovieId: metaEntry.detailMovieId || '',
        detailUrl: metaEntry.detailUrl || '',
        detailCandidates: metaEntry.detailCandidates || [],
        hasMultipleDetails: Boolean(metaEntry.hasMultipleDetails),
      });
    });
  }

  function getLinkedProgramEvent(row) {
    if (!row || !row.code || !config.linkedProgramEventsByCode) return null;
    return config.linkedProgramEventsByCode[row.code] || null;
  }

  function getScheduleMetaEntry(row, directorSource) {
    if (!directorSource) return null;

    const candidates = getDirectorLookupCandidates(row);
    const matches = candidates
      .map(candidate => directorSource.byTitle && directorSource.byTitle[candidate]
        ? directorSource.byTitle[candidate]
        : directorSource.byNormalizedTitle
          ? directorSource.byNormalizedTitle[normalizeSearchValue(candidate)]
          : null)
      .filter(Boolean);
    const codeMatch = directorSource.byCode && directorSource.byCode[row.code]
      ? directorSource.byCode[row.code]
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
      .replace('전주디지털독립영화관', '전주디지털')
      .replace('전북대학교 삼성문화회관', '전북대 삼성')
      .replace('한국소리문화의전당 모악당', '소리문화전당');
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
      return { primary: '전주디지털', secondary: '독립영화관' };
    }

    if (venue === '전북대학교 삼성문화회관') {
      return { primary: '전북대학교', secondary: '삼성문화회관' };
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
