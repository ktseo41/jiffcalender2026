(function initTalkTalkRuntime(global) {
  function createTalkTalkRuntime(options = {}) {
    const source = options.source || { overview: null, items: [] };
    const overview = source.overview || {};
    const items = Array.isArray(source.items) ? source.items.slice() : [];
    const dayLookup = options.dayLookup instanceof Map ? options.dayLookup : new Map();
    const normalize = typeof options.normalizeSearchValue === 'function'
      ? options.normalizeSearchValue
      : defaultNormalizeSearchValue;
    const getVenueGroup = typeof options.getVenueGroup === 'function'
      ? options.getVenueGroup
      : defaultGetVenueGroup;

    function getCurrentItems(currentDay, normalizedSearchQuery = '') {
      const dayItems = items.filter(item => item.date === currentDay);
      if (!normalizedSearchQuery) return dayItems;
      return dayItems.filter(item => matchesSearch(item, normalizedSearchQuery));
    }

    function getTimelineRows(inputItems = items) {
      return inputItems.map(item => ({
        venue: getVenue(item),
        startTime: item.startTime,
        endTime: getEndTime(item),
      }));
    }

    function groupByVenue(inputItems = items) {
      const byVenue = new Map();

      inputItems.forEach(item => {
        const venue = getVenue(item);
        if (!byVenue.has(venue)) byVenue.set(venue, []);
        byVenue.get(venue).push(item);
      });

      return byVenue;
    }

    function matchesSearch(item, normalizedSearchQuery = '') {
      if (!normalizedSearchQuery) return true;

      const haystack = normalize([
        '전주톡톡',
        item.seriesLabel,
        item.title,
        item.summary,
        item.guestLabel,
        item.moderator,
        item.code,
        overview.venue,
      ].filter(Boolean).join(' '));

      return haystack.includes(normalizedSearchQuery);
    }

    function isInActiveGroup(item, activeGroups) {
      const venueGroup = getVenueGroup(getVenue(item));
      return activeGroups.has(venueGroup.id);
    }

    function formatTimeRange(item) {
      if (!item || !item.startTime) return '—';
      const endTime = getEndTime(item);
      return endTime ? item.startTime + ' – ' + endTime : item.startTime;
    }

    function formatDayLabel(item) {
      const day = item && item.date ? dayLookup.get(item.date) : null;
      if (!day) return item && item.date ? item.date : '—';
      return day.label + ' ' + day.sub;
    }

    function getVenue(item) {
      return item && item.venue
        ? item.venue
        : (overview.venue || '전주시네마타운 7관');
    }

    function getPageUrl(item) {
      if (item && item.pageUrl) return item.pageUrl;
      return overview.pageUrl || 'https://jeonjufest.kr/event/jeonju_talktalk.asp';
    }

    function getDurationMinutes(item) {
      const itemDuration = item && item.durationMinutes ? Number(item.durationMinutes) : NaN;
      if (Number.isFinite(itemDuration) && itemDuration > 0) return itemDuration;

      const overviewDuration = overview.durationMinutes ? Number(overview.durationMinutes) : NaN;
      return Number.isFinite(overviewDuration) && overviewDuration > 0
        ? overviewDuration
        : 40;
    }

    function getEndMinutes(item) {
      const startMinutes = timeToMinutes(item && item.startTime ? item.startTime : '');
      if (startMinutes === null) return null;
      return startMinutes + getDurationMinutes(item);
    }

    function getEndTime(item) {
      const endMinutes = getEndMinutes(item);
      return endMinutes === null ? '' : minutesToClockLabel(endMinutes);
    }

    function getSlotLabel(item, extent, compact = false) {
      const match = String(item && item.seriesLabel ? item.seriesLabel : '').match(/(\d+)$/);
      const baseLabel = match ? '톡톡 ' + match[1] : '전주톡톡';

      if (compact) {
        return match ? '톡톡' + match[1] : '톡톡';
      }

      return extent >= 84 ? baseLabel : baseLabel.replace(/\s+/g, '');
    }

    return Object.freeze({
      overview,
      items: Object.freeze(items.slice()),
      getCurrentItems,
      getTimelineRows,
      groupByVenue,
      matchesSearch,
      isInActiveGroup,
      formatTimeRange,
      formatDayLabel,
      getVenue,
      getPageUrl,
      getDurationMinutes,
      getEndMinutes,
      getEndTime,
      getSlotLabel,
    });
  }

  function timeToMinutes(value) {
    if (!value) return null;
    const [hours, minutes] = value.split(':').map(Number);
    return hours * 60 + minutes;
  }

  function minutesToClockLabel(totalMinutes) {
    const normalizedMinutes = ((totalMinutes % (24 * 60)) + (24 * 60)) % (24 * 60);
    const hours = Math.floor(normalizedMinutes / 60);
    const minutes = normalizedMinutes % 60;
    return String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0');
  }

  function defaultNormalizeSearchValue(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function defaultGetVenueGroup() {
    return { id: 'other' };
  }

  global.JIFF_TALKTALK_RUNTIME = Object.freeze({
    createTalkTalkRuntime,
  });
})(window);
