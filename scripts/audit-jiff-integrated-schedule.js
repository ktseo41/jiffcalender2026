#!/usr/bin/env node

const fs = require('fs');
const https = require('https');
const path = require('path');
const vm = require('vm');

const ROOT_DIR = path.resolve(__dirname, '..');
const BASE_URL = 'https://www.jeonjufest.kr';
const REQUEST_DELAY_MS = 300;
const REQUEST_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; jiffcalendar2026-integrated-audit/1.0)',
  Accept: 'text/html,application/xhtml+xml',
};

const SOURCE_FILES = {
  config: path.join(ROOT_DIR, 'jiff2026', 'config.js'),
  data: path.join(ROOT_DIR, 'jiff2026', 'data.js'),
  talktalk: path.join(ROOT_DIR, 'jiff2026', 'talktalk.js'),
  alley: path.join(ROOT_DIR, 'jiff2026', 'alley-screening.js'),
  forum: path.join(ROOT_DIR, 'jiff2026', 'forum-programs.js'),
  outdoor: path.join(ROOT_DIR, 'jiff2026', 'outdoor-screening.js'),
};

const EVENT_URLS = {
  talktalk: 'https://jeonjufest.kr/event/jeonju_talktalk.asp',
  alley: 'https://archive.jeonjufest.kr/community/news/view.asp?idx=9351',
  forum: 'https://jeonjufest.kr/event/jeonju_forum.asp',
  outdoor: 'https://jeonjufest.kr/event/special_program.asp',
};

main().catch(error => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});

async function main() {
  const config = loadWindowValue(SOURCE_FILES.config, 'JIFF_SCHEDULE_CONFIG');
  const localRows = loadIntegratedLocalRows();
  const officialRows = dedupeRows(await fetchIntegratedOfficialRows(config.days));
  const report = compareRows(localRows, officialRows);

  printSummary(localRows, officialRows, report);

  if (report.hasIssues) {
    process.exitCode = 2;
  }
}

function loadIntegratedLocalRows() {
  return [
    ...loadLocalTicketRows(),
    ...loadLocalTalkTalkRows(),
    ...loadLocalAlleyRows(),
    ...loadLocalForumRows(),
    ...loadLocalOutdoorRows(),
  ];
}

function loadLocalTicketRows() {
  const data = loadWindowValue(SOURCE_FILES.data, 'JIFF_SCHEDULE_DATA');
  return parseCsv(data.csvRaw).map(columns => makeRow({
    source: 'local:data',
    code: columns[8],
    date: columns[0],
    venue: columns[1],
    round: columns[2],
    title: columns[4],
    startTime: columns[6],
    endTime: columns[7],
  }));
}

function loadLocalTalkTalkRows() {
  const data = loadWindowValue(SOURCE_FILES.talktalk, 'JIFF_TALKTALK_DATA');
  const duration = Number(data.overview.durationMinutes) || 40;

  return data.items.map(item => makeRow({
    source: 'local:talktalk',
    code: item.code,
    date: item.date,
    venue: data.overview.venue,
    title: [item.seriesLabel, item.title].filter(Boolean).join(' - '),
    startTime: item.startTime,
    endTime: addMinutesToTime(item.startTime, duration),
  }));
}

function loadLocalAlleyRows() {
  const data = loadWindowValue(SOURCE_FILES.alley, 'JIFF_ALLEY_SCREENING_DATA');

  return data.items.map(item => makeRow({
    source: 'local:alley',
    id: item.id,
    date: item.date,
    venue: item.venue,
    title: item.title,
    startTime: item.startTime,
    endTime: item.endTime || addMinutesToTime(item.startTime, Number(item.durationMinutes) || 0),
  }));
}

function loadLocalForumRows() {
  const data = loadWindowValue(SOURCE_FILES.forum, 'JIFF_FORUM_PROGRAMS_DATA');

  return data.items.map(item => makeRow({
    source: 'local:forum',
    id: item.id,
    date: item.date,
    venue: item.venue,
    venueDetail: item.venueDetail,
    title: item.title,
    startTime: item.startTime,
    endTime: item.endTime,
  }));
}

function loadLocalOutdoorRows() {
  const data = loadWindowValue(SOURCE_FILES.outdoor, 'JIFF_OUTDOOR_SCREENING_DATA');

  return data.items.map(item => makeRow({
    source: 'local:outdoor',
    id: item.id,
    date: item.date,
    venue: item.venue,
    title: item.title,
    startTime: item.startTime,
    endTime: item.endTime,
  }));
}

async function fetchIntegratedOfficialRows(days) {
  const rows = [];

  rows.push(...await fetchOfficialTicketRows(days));
  rows.push(...parseOfficialTalkTalkRows(await fetchTextWithDelay(EVENT_URLS.talktalk)));
  rows.push(...parseOfficialAlleyRows(await fetchTextWithDelay(EVENT_URLS.alley)));
  rows.push(...parseOfficialForumRows(await fetchTextWithDelay(EVENT_URLS.forum)));
  rows.push(...parseOfficialOutdoorRows(await fetchTextWithDelay(EVENT_URLS.outdoor)));

  return rows;
}

async function fetchOfficialTicketRows(days) {
  const rows = [];

  for (let dayNum = 0; dayNum < days.length; dayNum += 1) {
    const html = await fetchTextWithDelay(`${BASE_URL}/Ticket/timetable_day.asp?dayNum=${dayNum}`);
    rows.push(...parseOfficialDayPage(html, days[dayNum].date));
  }

  return rows;
}

function parseOfficialDayPage(html, date) {
  const primaryHtml = html.split('<div class="background-grey" id="time-table-vr"')[0];
  const venuePattern = /<div class="thearter-name[^>]*>\s*<h3>([\s\S]*?)<\/h3>\s*<\/div>\s*<div class="card-row[^>]*>\s*<div class="swiper-wrapper[^>]*">([\s\S]*?)<\/div><!--swiper-wrapper/gi;
  const rows = [];
  let venueMatch = venuePattern.exec(primaryHtml);

  while (venueMatch) {
    const venue = cleanText(venueMatch[1]);
    rows.push(...parseOfficialCards(venueMatch[2], date, venue));
    venueMatch = venuePattern.exec(primaryHtml);
  }

  return rows;
}

function parseOfficialCards(wrapperHtml, date, venue) {
  const rows = [];
  const cardPattern = /<div class="screen-sort(?![^"]*empty)[^"]*swiper-slide[^"]*">[\s\S]*?<\/div>\s*<\/div>\s*(?=(?:<div class="(?:empty )?screen-sort|$))/gi;
  let cardMatch = cardPattern.exec(wrapperHtml);

  while (cardMatch) {
    const cardHtml = cardMatch[0];
    const timeRange = extractTicketTimeRange(cardHtml);

    rows.push(makeRow({
      source: 'official:ticket',
      code: cleanText(matchFirst(cardHtml, /<span class="number">([\s\S]*?)<\/span>/i)),
      date,
      venue,
      round: cleanText(matchFirst(cardHtml, /<div class="round-text">([\s\S]*?)<\/div>/i)),
      title: cleanText(matchFirst(cardHtml, /<div class="title">(?:\s*<a [^>]*>)?([\s\S]*?)(?:<\/a>)?<\/div>/i)),
      startTime: timeRange.startTime,
      endTime: timeRange.endTime,
    }));

    cardMatch = cardPattern.exec(wrapperHtml);
  }

  return rows;
}

function parseOfficialTalkTalkRows(html) {
  return parseInfoOverviewCards(html, {
    source: 'official:talktalk',
    defaultVenue: '전주시네마타운 7관',
    titleFromHeading: heading => heading.replace(/\s+/g, ' - '),
  });
}

function parseOfficialForumRows(html) {
  const rows = [];
  const cards = splitInfoOverviewCards(html);

  cards.forEach(block => {
    const heading = cleanText(matchFirst(block, /<h3[^>]*>([\s\S]*?)<\/h3>/i));

    if (heading === '2026 한국독립영화 연속포럼') {
      rows.push(...parseForumSeriesRows(block));
      return;
    }

    rows.push(parseInfoOverviewBlock(block, {
      source: 'official:forum',
      codeFromBlock: cardHtml => cleanText(matchFirst(cardHtml, /상영코드\s*([0-9]+)/i)),
    }));
  });

  return rows.filter(row => row.date && row.startTime && row.title);
}

function parseInfoOverviewCards(html, options) {
  const cards = splitInfoOverviewCards(html);

  return cards
    .map(block => parseInfoOverviewBlock(block, options))
    .filter(row => row.date && row.startTime && row.title);
}

function parseInfoOverviewBlock(block, options) {
  const schedule = parseKoreanDateTimeRange(extractLabeledValue(block, '일정'));
  const venueParts = splitVenueDetail(extractLabeledValue(block, '장소') || options.defaultVenue || '');
  const heading = cleanText(matchFirst(block, /<h3[^>]*>([\s\S]*?)<\/h3>/i));
  const code = extractLabeledValue(block, '상영코드') || (options.codeFromBlock ? options.codeFromBlock(block) : '');

  return makeRow({
    source: options.source,
    code,
    date: schedule.date,
    venue: venueParts.venue,
    venueDetail: venueParts.venueDetail,
    title: options.titleFromHeading ? options.titleFromHeading(heading) : heading,
    startTime: schedule.startTime,
    endTime: schedule.endTime,
  });
}

function parseForumSeriesRows(block) {
  const rows = [];
  const sessionParts = block.split(/<div class="title">(?=\[세션\s*\d+\])/i).slice(1);

  sessionParts.forEach(part => {
    const sessionTitle = cleanText(matchFirst(part, /^([\s\S]*?)<\/div>/i))
      .replace(/^\[세션\s*\d+\]\s*/, '');
    const schedule = parseKoreanDateTimeRange(extractLabeledValue(part, '일정'));
    const venueParts = splitVenueDetail(extractLabeledValue(part, '장소'));

    rows.push(makeRow({
      source: 'official:forum',
      date: schedule.date,
      venue: venueParts.venue,
      venueDetail: venueParts.venueDetail,
      title: sessionTitle,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
    }));
  });

  return rows;
}

function splitInfoOverviewCards(html) {
  return stripHtmlComments(html)
    .split(/<div class="jiff-info-overview/i)
    .slice(1)
    .map(part => '<div class="jiff-info-overview' + part)
    .filter(block => /<h3[^>]*>[\s\S]*?<\/h3>/i.test(block) && /일정/.test(block));
}

function parseOfficialAlleyRows(html) {
  const rows = [];
  const tableHtml = matchFirst(stripHtmlComments(html), /제27회 전주국제영화제 골목상영 상영 스케쥴[\s\S]*?(<table[\s\S]*?<\/table>)/i);
  const rowPattern = /<tr>([\s\S]*?)<\/tr>/gi;
  let rowMatch = rowPattern.exec(tableHtml);

  while (rowMatch) {
    const cells = extractTableCells(rowMatch[1]);
    if (cells.length < 4 || /상영\s*일시/.test(cells[0])) {
      rowMatch = rowPattern.exec(tableHtml);
      continue;
    }

    const schedule = parseKoreanDateTimeRange(cells[0]);
    rows.push(makeRow({
      source: 'official:alley',
      date: schedule.date,
      venue: cells[1],
      title: cells[2],
      startTime: schedule.startTime,
      endTime: schedule.endTime,
    }));

    rowMatch = rowPattern.exec(tableHtml);
  }

  return rows;
}

function parseOfficialOutdoorRows(html) {
  const block = matchFirst(stripHtmlComments(html), /(야외 상영회\s*<슈퍼 마리오 브라더스>[\s\S]*?)(?=<div class="place-info|<\/main>|$)/i);
  const scheduleText = cleanText(matchFirst(block, /일정\s*:<\/span>\s*<div[^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>/i));
  const venue = cleanText(matchFirst(block, /장소\s*:<\/span>\s*<div[^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>/i));
  const range = parseKoreanDateRange(scheduleText);

  return range.dates.map(date => makeRow({
    source: 'official:outdoor',
    date,
    venue,
    title: '슈퍼 마리오 브라더스',
    startTime: range.startTime,
    endTime: range.endTime,
  }));
}

function compareRows(localRows, officialRows) {
  const localByIdentity = indexRows(localRows);
  const officialByIdentity = indexRows(officialRows);
  const localDuplicates = findIdentityDuplicates(localRows);
  const officialDuplicates = findIdentityDuplicates(officialRows);
  const localOnly = [];
  const officialOnly = [];
  const mismatches = [];
  const keys = Array.from(new Set([
    ...localByIdentity.keys(),
    ...officialByIdentity.keys(),
  ])).sort();

  keys.forEach(key => {
    const local = localByIdentity.get(key);
    const official = officialByIdentity.get(key);

    if (local && !official) {
      localOnly.push(local);
      return;
    }

    if (official && !local) {
      officialOnly.push(official);
      return;
    }

    const diff = compareTimeAndPlace(local, official);
    if (diff.length > 0) {
      mismatches.push({ key, local, official, diff });
    }
  });

  return {
    localOnly,
    officialOnly,
    mismatches,
    localDuplicates,
    officialDuplicates,
    hasIssues:
      localOnly.length > 0
      || officialOnly.length > 0
      || mismatches.length > 0
      || localDuplicates.length > 0
      || officialDuplicates.length > 0,
  };
}

function compareTimeAndPlace(local, official) {
  const diffs = [];

  [
    ['date', local.date, official.date, sameText],
    ['startTime', local.startTime, official.startTime, sameText],
    ['venue', local.venueCompare, official.venueCompare, sameVenue],
  ].forEach(([field, left, right, compare]) => {
    if (!compare(left, right)) diffs.push({ field, local: left, official: right });
  });

  if (official.endTime && !sameText(local.endTime, official.endTime)) {
    diffs.push({ field: 'endTime', local: local.endTime || '(empty)', official: official.endTime });
  }

  return diffs;
}

function printSummary(localRows, officialRows, report) {
  console.log('JIFF integrated schedule audit');
  console.log(`- local rows: ${localRows.length}`);
  console.log(`- official rows: ${officialRows.length}`);
  console.log(`- local-only entries: ${report.localOnly.length}`);
  console.log(`- official-only entries: ${report.officialOnly.length}`);
  console.log(`- time/place mismatches: ${report.mismatches.length}`);
  console.log(`- local duplicate identities: ${report.localDuplicates.length}`);
  console.log(`- official duplicate identities: ${report.officialDuplicates.length}`);

  printRows('Local-only entries', report.localOnly);
  printRows('Official-only entries', report.officialOnly);
  printMismatches(report.mismatches);
  printDuplicates('Local duplicate identities', report.localDuplicates);
  printDuplicates('Official duplicate identities', report.officialDuplicates);
}

function printRows(label, rows) {
  if (rows.length === 0) return;

  console.log(`\n${label}`);
  rows.forEach(row => {
    console.log(`- ${formatRow(row)}`);
  });
}

function printMismatches(mismatches) {
  if (mismatches.length === 0) return;

  console.log('\nTime/place mismatches');
  mismatches.forEach(entry => {
    console.log(`- ${formatRow(entry.local)}`);
    entry.diff.forEach(item => {
      console.log(`  - ${item.field}: local="${item.local}" official="${item.official}"`);
    });
  });
}

function printDuplicates(label, groups) {
  if (groups.length === 0) return;

  console.log(`\n${label}`);
  groups.forEach(group => {
    console.log(`- ${group.key}`);
    group.rows.forEach(row => {
      console.log(`  - ${formatRow(row)}`);
    });
  });
}

function formatRow(row) {
  const code = row.code ? `code ${row.code}` : row.id || identityKey(row);
  const time = row.endTime ? `${row.startTime}-${row.endTime}` : row.startTime;
  return `${row.date} ${time} | ${row.venueCompare} | ${code} | ${row.title} | ${row.source}`;
}

function makeRow(input) {
  const venueCompare = input.venueDetail
    ? `${input.venue || ''}(${input.venueDetail})`
    : input.venue || '';

  return {
    source: input.source || '',
    id: cleanText(input.id || ''),
    code: cleanText(input.code || ''),
    date: cleanText(input.date || ''),
    venue: cleanText(input.venue || ''),
    venueDetail: cleanText(input.venueDetail || ''),
    venueCompare: cleanText(venueCompare),
    round: cleanText(input.round || ''),
    title: cleanText(input.title || ''),
    startTime: normalizeTime(input.startTime || ''),
    endTime: normalizeTime(input.endTime || ''),
  };
}

function dedupeRows(rows) {
  const seen = new Map();

  rows.forEach(row => {
    const key = identityKey(row);
    if (!key || !row.date || !row.startTime) return;
    if (!seen.has(key)) {
      seen.set(key, row);
      return;
    }

    const current = seen.get(key);
    if (current.source === 'official:ticket') return;
    if (row.source === 'official:ticket') seen.set(key, row);
  });

  return Array.from(seen.values());
}

function indexRows(rows) {
  const indexed = new Map();

  rows.forEach(row => {
    const key = identityKey(row);
    if (!key) return;
    indexed.set(key, row);
  });

  return indexed;
}

function findIdentityDuplicates(rows) {
  const grouped = new Map();

  rows.forEach(row => {
    const key = identityKey(row);
    if (!key) return;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  });

  return Array.from(grouped.entries())
    .filter(([, groupRows]) => groupRows.length > 1)
    .map(([key, groupRows]) => ({ key, rows: groupRows }))
    .sort((left, right) => left.key.localeCompare(right.key, 'ko'));
}

function identityKey(row) {
  if (row.code) return `code:${normalizeText(row.code)}`;
  return `title:${row.date}|${normalizeTitle(row.title)}`;
}

function extractTicketTimeRange(cardHtml) {
  const valueHtml = matchFirst(cardHtml, /<div class="time">[\s\S]*?<span class="value">([\s\S]*?)<\/span>/i);
  return {
    startTime: cleanText(matchFirst(valueHtml, /^([\d:]+)/i)),
    endTime: cleanText(matchFirst(valueHtml, /<em class="end">([\s\S]*?)<\/em>/i)),
  };
}

function extractLabeledValue(block, label) {
  const pattern = new RegExp(
    '<div class="movie-info[^"]*"[^>]*>\\s*<div[^>]*>\\s*' + escapeRegExp(label) + '\\s*<\\/div>\\s*\\|\\s*<\\/div>\\s*<div class="movie-desc">([\\s\\S]*?)<\\/div>',
    'i'
  );
  return cleanText(matchFirst(block, pattern));
}

function extractTableCells(rowHtml) {
  const cells = [];
  const cellPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  let cellMatch = cellPattern.exec(rowHtml);

  while (cellMatch) {
    cells.push(cleanText(cellMatch[1]));
    cellMatch = cellPattern.exec(rowHtml);
  }

  return cells;
}

function splitVenueDetail(value) {
  const cleaned = cleanText(value);
  const match = /^(.*?)\s*\((.*?)\)\s*$/.exec(cleaned);
  if (!match) return { venue: cleaned, venueDetail: '' };
  return { venue: cleanText(match[1]), venueDetail: cleanText(match[2]) };
}

function parseKoreanDateTimeRange(value) {
  const cleaned = cleanText(value);
  const match = /(\d{1,2})월\s*(\d{1,2})일.*?(\d{1,2}:\d{2})(?:\s*-\s*(\d{1,2}:\d{2}))?/.exec(cleaned);

  if (!match) return { date: '', startTime: '', endTime: '' };

  return {
    date: toDate(match[1], match[2]),
    startTime: normalizeTime(match[3]),
    endTime: normalizeTime(match[4] || ''),
  };
}

function parseKoreanDateRange(value) {
  const cleaned = cleanText(value);
  const match = /(\d{1,2})월\s*(\d{1,2})일.*?-\s*(\d{1,2})월\s*(\d{1,2})일.*?,\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/.exec(cleaned);

  if (!match) return { dates: [], startTime: '', endTime: '' };

  const startMonth = Number(match[1]);
  const startDay = Number(match[2]);
  const endMonth = Number(match[3]);
  const endDay = Number(match[4]);
  const dates = [];
  const cursor = new Date(Date.UTC(2026, startMonth - 1, startDay));
  const end = new Date(Date.UTC(2026, endMonth - 1, endDay));

  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return {
    dates,
    startTime: normalizeTime(match[5]),
    endTime: normalizeTime(match[6]),
  };
}

function addMinutesToTime(time, minutes) {
  if (!time || !minutes) return '';
  const [hour, minute] = time.split(':').map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return '';
  const total = hour * 60 + minute + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function toDate(month, day) {
  return `2026-${String(Number(month)).padStart(2, '0')}-${String(Number(day)).padStart(2, '0')}`;
}

async function fetchTextWithDelay(url) {
  await delay(REQUEST_DELAY_MS);
  return fetchText(url);
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: REQUEST_HEADERS,
        rejectUnauthorized: false,
      },
      response => {
        if (response.statusCode && response.statusCode >= 400) {
          response.resume();
          reject(new Error(`Request failed for ${url}: ${response.statusCode}`));
          return;
        }

        const chunks = [];
        response.setEncoding('utf8');
        response.on('data', chunk => chunks.push(chunk));
        response.on('end', () => resolve(chunks.join('')));
      }
    );

    request.on('error', reject);
  });
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function loadWindowValue(filePath, key) {
  const source = fs.readFileSync(filePath, 'utf8');
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(source, context);

  if (!context.window[key]) {
    throw new Error(`Failed to load window.${key} from ${path.relative(ROOT_DIR, filePath)}`);
  }

  return context.window[key];
}

function parseCsv(csvText) {
  const rows = [];
  let row = [];
  let value = '';
  let inQuotes = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index];
    const next = csvText[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        value += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(value);
      value = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(value);
      value = '';
      if (row.length > 1 || row[0]) rows.push(row);
      row = [];
      continue;
    }

    value += char;
  }

  if (value || row.length > 0) {
    row.push(value);
    rows.push(row);
  }

  return rows.slice(1);
}

function sameText(left, right) {
  return normalizeText(left) === normalizeText(right);
}

function sameVenue(left, right) {
  return normalizeVenue(left) === normalizeVenue(right);
}

function normalizeText(value) {
  return cleanText(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeVenue(value) {
  return normalizeText(value)
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, '');
}

function normalizeTitle(value) {
  return normalizeText(value)
    .replace(/[〈〉<>]/g, '')
    .replace(/\s+/g, '')
    .replace(/\+/g, '+');
}

function normalizeTime(value) {
  const match = /(\d{1,2}):(\d{2})/.exec(String(value || ''));
  if (!match) return '';
  return `${String(Number(match[1])).padStart(2, '0')}:${match[2]}`;
}

function matchFirst(text, pattern) {
  const match = pattern.exec(text || '');
  return match ? match[1] : '';
}

function stripHtmlComments(value) {
  return String(value || '').replace(/<!--[\s\S]*?-->/g, '');
}

function cleanText(value) {
  return decodeHtml(String(value || ''))
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<([가-힣][^<>]*)>/g, '〈$1〉')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtml(value) {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&ndash;/g, '–')
    .replace(/&middot;/g, '·')
    .replace(/&lsquo;/g, '‘')
    .replace(/&rsquo;/g, '’');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
