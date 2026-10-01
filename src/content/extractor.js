import { LANGUAGE_EXTENSIONS } from '../config/constants.js';

const TITLE_SELECTORS = [
  '[data-cy="question-title"]',
  '[data-e2e-locator="problem-title"]',
  'a[href*="/problems/"][class*="title"]',
  'div[class*="text-title-large"]',
];

const LANGUAGE_SELECTORS = [
  'button[id*="lang"]',
  '[data-e2e-locator="console-submit-button"] ~ * [class*="lang"]',
  '[class*="ant-select-selection-item"]',
];

export function extractSubmission(document, location, captured = {}) {
  const identity = problemIdentity(location.href, document.title);
  const currentCapture = captured.problemSlug && captured.problemSlug !== identity.slug ? {} : captured;
  const titleText = firstText(document, TITLE_SELECTORS);
  const parsedTitle = parseTitle(titleText || identity.title);
  const code = currentCapture.code || extractVisibleCode(document);
  const language = normalizeLanguage(currentCapture.language || firstText(document, LANGUAGE_SELECTORS));

  return {
    problemSlug: identity.slug,
    problemId: parsedTitle.id || '0',
    title: parsedTitle.title || identity.title,
    language,
    code,
    stats: currentCapture.stats || extractStats(document.body?.innerText || ''),
    description: extractDescription(document),
    difficulty: extractDifficulty(document),
    url: `https://leetcode.com/problems/${identity.slug}/`,
  };
}

export function problemIdentity(url, pageTitle = '') {
  const match = new URL(url).pathname.match(/^\/problems\/([a-z0-9-]+)/i);
  if (!match) throw new Error('This is not a supported LeetCode problem page.');
  const slug = match[1].toLowerCase();
  const fallbackTitle = slug.split('-').map(capitalize).join(' ');
  const title = pageTitle.split(/\s[-|]\s/)[0]?.trim() || fallbackTitle;
  return { slug, title };
}

export function parseTitle(value = '') {
  const cleaned = value.trim();
  const match = cleaned.match(/^(\d+)\.\s*(.+)$/);
  return match ? { id: match[1], title: match[2].trim() } : { id: '', title: cleaned };
}

export function normalizeLanguage(value = '') {
  const candidates = value.toLowerCase().replace(/\s+/g, ' ').trim().split(/\s*[|(]\s*/);
  return candidates.find((candidate) => LANGUAGE_EXTENSIONS[candidate]) || '';
}

export function extractStats(text = '') {
  const runtime = text.match(/(?:runtime\s*)?(\d+(?:\.\d+)?\s*(?:ms|s))\b/i)?.[1];
  const memory = text.match(/(?:memory\s*)?(\d+(?:\.\d+)?\s*(?:mb|kb))\b/i)?.[1];
  return runtime || memory ? { runtime: runtime || null, memory: memory || null } : null;
}

export function isAcceptedResult(document) {
  const selectors = [
    '[data-e2e-locator="submission-result"]',
    '[data-e2e-locator="submission-result-title"]',
    '[class*="result"] [class*="success"]',
  ];
  return selectors.some((selector) => [...document.querySelectorAll(selector)]
    .some((element) => element.textContent.trim().toLowerCase() === 'accepted'));
}

function firstText(document, selectors) {
  for (const selector of selectors) {
    const text = document.querySelector(selector)?.textContent?.trim();
    if (text) return text;
  }
  return '';
}

function extractVisibleCode(document) {
  const lines = document.querySelectorAll('.monaco-editor .view-lines .view-line');
  if (lines.length) return [...lines].map((line) => line.textContent).join('\n');
  for (const selector of ['textarea[data-mode-id]', '.CodeMirror-code', 'pre code']) {
    const element = document.querySelector(selector);
    const value = element?.value || element?.textContent;
    if (value?.trim()) return value;
  }
  return '';
}

function extractDescription(document) {
  const element = document.querySelector('[data-track-load="description_content"]')
    || document.querySelector('[data-cy="question-content"]');
  if (!element) return '';
  return [...element.children].map((child) => child.textContent.trim()).filter(Boolean).join('\n\n').slice(0, 20_000);
}

function extractDifficulty(document) {
  const candidates = document.querySelectorAll('[class*="difficulty"], [class*="text-difficulty"]');
  for (const element of candidates) {
    const value = element.textContent.trim().toLowerCase();
    if (['easy', 'medium', 'hard'].includes(value)) return capitalize(value);
  }
  return '';
}

function capitalize(value) {
  return value ? value[0].toUpperCase() + value.slice(1) : '';
}
