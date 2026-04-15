#!/usr/bin/env node

const fs = require('fs');
const https = require('https');
const path = require('path');
const vm = require('vm');

const ROOT_DIR = path.resolve(__dirname, '..');
const BASE_URL = 'https://www.jeonjufest.kr';
const DATA_PATH = path.join(ROOT_DIR, 'jiff2026', 'data.js');
const CONFIG_PATH = path.join(ROOT_DIR, 'jiff2026', 'config.js');
const REQUEST_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; jiffcalendar2026-audit/1.0)',
  Accept: 'text/html,application/xhtml+xml',
};

main().catch(error => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});

async function main() {
  const config = loadWindowValue(CONFIG_PATH, 'JIFF_SCHEDULE_CONFIG');
  const localRows = loadLocalRows();
  const officialRows = await fetchOfficialRows(config.days);
  const report = compareRows(localRows, officialRows);

  printSummary(localRows, officialRows, report);

  if (report.hasIssues) {
    process.exitCode = 2;
  }
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

function loadLocalRows() {
  const data = loadWindowValue(DATA_PATH, 'JIFF_SCHEDULE_DATA');
  const rows = parseCsv(data.csvRaw);

  return rows.map(columns => ({
    date: columns[0],
    venue: columns[1],
    round: columns[2],
    section: columns[3],
    title: columns[4],
    shorts: columns[5],
    startTime: columns[6],
    endTime: columns[7],
    code: columns[8],
    badges: columns[9],
  }));
}

async function fetchOfficialRows(days) {
  const rows = [];

  for (let dayNum = 0; dayNum < days.length; dayNum += 1) {
    const html = await fetchText(`${BASE_URL}/Ticket/timetable_day.asp?dayNum=${dayNum}`);
    rows.push(...parseOfficialDayPage(html, days[dayNum].date));
  }

  return rows;
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

function parseOfficialDayPage(html, date) {
  const primaryHtml = html.split('<div class="background-grey" id="time-table-vr"')[0];
  const venuePattern = /<div class="thearter-name[^>]*>\s*<h3>([\s\S]*?)<\/h3>\s*<\/div>\s*<div class="card-row[^>]*>\s*<div class="swiper-wrapper[^>]*">([\s\S]*?)<\/div><!--swiper-wrapper/gi;
  const rows = [];
  let venueMatch = venuePattern.exec(primaryHtml);

  while (venueMatch) {
    const venue = cleanText(venueMatch[1]);
    const wrapperHtml = venueMatch[2];
    const cards = parseOfficialCards(wrapperHtml, date, venue);
    rows.push(...cards);
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
    const optionTitles = extractOptionTitles(cardHtml);
    const timeRange = extractTimeRange(cardHtml);

    rows.push({
      date,
      venue,
      round: cleanText(matchFirst(cardHtml, /<div class="round-text">([\s\S]*?)<\/div>/i)),
      section: cleanText(matchFirst(cardHtml, /<div class="category">\s*<span[^>]*>([\s\S]*?)<\/span>\s*<\/div>/i)),
      title: cleanText(matchFirst(cardHtml, /<div class="title">(?:\s*<a [^>]*>)?([\s\S]*?)(?:<\/a>)?<\/div>/i)),
      shorts: optionTitles.join(' / '),
      startTime: timeRange.startTime,
      endTime: timeRange.endTime,
      code: cleanText(matchFirst(cardHtml, /<span class="number">([\s\S]*?)<\/span>/i)),
      badges: extractBadges(cardHtml),
    });

    cardMatch = cardPattern.exec(wrapperHtml);
  }

  return rows;
}

function extractOptionTitles(cardHtml) {
  const titles = [];
  const optionPattern = /<option[^>]*value="([^"]*)"[^>]*>([\s\S]*?)<\/option>/gi;
  let optionMatch = optionPattern.exec(cardHtml);

  while (optionMatch) {
    const movieId = decodeHtml(optionMatch[1]).trim();
    const title = cleanText(optionMatch[2]);

    if (movieId && title) {
      titles.push(title);
    }

    optionMatch = optionPattern.exec(cardHtml);
  }

  return titles;
}

function extractTimeRange(cardHtml) {
  const valueHtml = matchFirst(cardHtml, /<div class="time">[\s\S]*?<span class="value">([\s\S]*?)<\/span>/i);
  const startTime = cleanText(matchFirst(valueHtml, /^([\d:]+)/i));
  const endTime = cleanText(matchFirst(valueHtml, /<em class="end">([\s\S]*?)<\/em>/i));

  return { startTime, endTime };
}

function extractBadges(cardHtml) {
  const iconListHtml = matchFirst(cardHtml, /<div class="icon-list">([\s\S]*?)<\/div>\s*<\/div>/i);
  if (!iconListHtml) return '';

  const badges = [];
  const spanPattern = /<span>([\s\S]*?)<\/span>/gi;
  let spanMatch = spanPattern.exec(iconListHtml);

  while (spanMatch) {
    const value = cleanText(spanMatch[1]);
    if (value) badges.push(value);
    spanMatch = spanPattern.exec(iconListHtml);
  }

  return badges.join('');
}

function compareRows(localRows, officialRows) {
  const localBySlot = indexBy(localRows, slotKey);
  const officialBySlot = indexBy(officialRows, slotKey);
  const localSlotDuplicates = findDuplicates(localRows, slotKey);
  const officialSlotDuplicates = findDuplicates(officialRows, slotKey);
  const localCodeDuplicates = findDuplicates(localRows, row => row.code);
  const officialCodeDuplicates = findDuplicates(officialRows, row => row.code);
  const localOnly = [];
  const officialOnly = [];
  const mismatches = [];
  const slotKeys = Array.from(new Set([
    ...localBySlot.keys(),
    ...officialBySlot.keys(),
  ])).sort();

  slotKeys.forEach(key => {
    const local = localBySlot.get(key);
    const official = officialBySlot.get(key);

    if (local && !official) {
      localOnly.push(local);
      return;
    }

    if (official && !local) {
      officialOnly.push(official);
      return;
    }

    const diff = compareFields(local, official);
    if (diff.length > 0) {
      mismatches.push({ key, local, official, diff });
    }
  });

  return {
    localOnly,
    officialOnly,
    mismatches,
    localSlotDuplicates,
    officialSlotDuplicates,
    localCodeDuplicates,
    officialCodeDuplicates,
    hasIssues:
      localOnly.length > 0
      || officialOnly.length > 0
      || mismatches.length > 0
      || localSlotDuplicates.length > 0
      || officialSlotDuplicates.length > 0
      || localCodeDuplicates.length > 0
      || officialCodeDuplicates.length > 0,
  };
}

function compareFields(local, official) {
  const diffs = [];

  [
    ['code', local.code, official.code],
    ['section', local.section, official.section],
    ['title', local.title, official.title],
    ['shorts', local.shorts, official.shorts],
    ['startTime', local.startTime, official.startTime],
    ['badges', local.badges, official.badges],
  ].forEach(([field, left, right]) => {
    if (!sameText(left, right)) {
      diffs.push({ field, local: left, official: right });
    }
  });

  return diffs;
}

function printSummary(localRows, officialRows, report) {
  console.log('JIFF schedule audit');
  console.log(`- local rows: ${localRows.length}`);
  console.log(`- official rows: ${officialRows.length}`);
  console.log(`- local-only slots: ${report.localOnly.length}`);
  console.log(`- official-only slots: ${report.officialOnly.length}`);
  console.log(`- mismatched slots: ${report.mismatches.length}`);
  console.log(`- local duplicate slots: ${report.localSlotDuplicates.length}`);
  console.log(`- official duplicate slots: ${report.officialSlotDuplicates.length}`);
  console.log(`- local duplicate codes: ${report.localCodeDuplicates.length}`);
  console.log(`- official duplicate codes: ${report.officialCodeDuplicates.length}`);

  printGroupedRows('Local-only slots', report.localOnly);
  printGroupedRows('Official-only slots', report.officialOnly);
  printMismatches(report.mismatches);
  printDuplicates('Local duplicate codes', report.localCodeDuplicates);
  printDuplicates('Official duplicate codes', report.officialCodeDuplicates);
}

function printGroupedRows(label, rows) {
  if (rows.length === 0) return;

  console.log(`\n${label}`);
  rows.forEach(row => {
    console.log(`- ${slotKey(row)} :: ${row.code} :: ${row.section} :: ${row.title}`);
  });
}

function printMismatches(mismatches) {
  if (mismatches.length === 0) return;

  console.log('\nMismatched slots');
  mismatches.forEach(entry => {
    console.log(`- ${entry.key}`);
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
      console.log(`  - ${slotKey(row)} :: ${row.title}`);
    });
  });
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

function findDuplicates(rows, keyFn) {
  const grouped = new Map();

  rows.forEach(row => {
    const key = keyFn(row);
    if (!key) return;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  });

  return Array.from(grouped.entries())
    .filter(([, groupRows]) => groupRows.length > 1)
    .map(([key, groupRows]) => ({ key, rows: groupRows }))
    .sort((left, right) => left.key.localeCompare(right.key, 'ko'));
}

function indexBy(rows, keyFn) {
  const map = new Map();
  rows.forEach(row => {
    map.set(keyFn(row), row);
  });
  return map;
}

function slotKey(row) {
  return [row.date, row.venue, row.round].join(' | ');
}

function sameText(left, right) {
  return normalizeText(left) === normalizeText(right);
}

function normalizeText(value) {
  return cleanText(value || '').replace(/\s+/g, ' ').trim();
}

function matchFirst(text, pattern) {
  const match = pattern.exec(text);
  return match ? match[1] : '';
}

function cleanText(value) {
  return decodeHtml(String(value || ''))
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
    .replace(/&#39;/g, "'");
}
