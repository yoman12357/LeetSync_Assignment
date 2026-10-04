import { normalizeLanguage } from './extractor.js';

// Query fields also used by LeetHub's LeetCode integration:
// https://github.com/arunbhardwaj/LeetHub-2.0/blob/main/scripts/leetcode/versions.js
const QUERY = `query LeetSyncSubmission($submissionId: Int!, $titleSlug: String!) {
  submissionDetails(submissionId: $submissionId) {
    code timestamp statusCode runtimeDisplay memoryDisplay
    lang { name verboseName }
    question { title titleSlug content difficulty }
  }
  question(titleSlug: $titleSlug) { questionFrontendId }
}`;

export function submissionIdFromUrl(url) {
  const parsed = new URL(url);
  if (parsed.origin !== 'https://leetcode.com') return '';
  return parsed.pathname.match(/^\/problems\/[a-z0-9-]+\/submissions\/(\d+)(?:\/|$)/)?.[1] || '';
}

export async function readLatestSubmissionId({ problemSlug, submittedAt, fetch: request = globalThis.fetch.bind(globalThis) }) {
  if (!/^[a-z0-9-]+$/.test(problemSlug)) throw new Error('LeetCode problem slug is invalid.');
  const response = await request(`https://leetcode.com/api/submissions/${problemSlug}/?offset=0&limit=10`, {
    credentials: 'same-origin', signal: AbortSignal.timeout(10_000), cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Could not read recent LeetCode submissions (HTTP ${response.status}).`);
  const body = await response.json();
  const submissions = body.submissions_dump || body.submissions;
  if (!Array.isArray(submissions)) throw new Error('LeetCode did not return your submissions. Make sure you are signed in to LeetCode.');
  const recent = submissions.filter((entry) => /^\d+$/.test(String(entry.id)) &&
    Number.isFinite(Number(entry.timestamp)) && Number(entry.timestamp) * 1000 >= submittedAt - 5000)
    .sort((first, second) => Number(second.timestamp) - Number(first.timestamp) || Number(second.id) - Number(first.id));
  if (/pending|judging|queue|running/i.test(recent[0]?.status_display || '')) return '';
  return recent[0] ? String(recent[0].id) : '';
}

export async function readAcceptedSubmission({ submissionId, problemSlug, submittedAt, cookie = '', fetch: request = globalThis.fetch.bind(globalThis) }) {
  if (!/^\d+$/.test(String(submissionId)) || !Number.isSafeInteger(Number(submissionId))) {
    throw new Error('LeetCode submission ID is invalid.');
  }
  const headers = { 'Content-Type': 'application/json' };
  const csrf = cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/)?.[1];
  if (csrf) headers['x-csrftoken'] = csrf;
  const response = await request('https://leetcode.com/graphql/', {
    method: 'POST', credentials: 'same-origin', headers,
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({
      operationName: 'LeetSyncSubmission', query: QUERY,
      variables: { submissionId: Number(submissionId), titleSlug: problemSlug },
    }),
  });
  if (!response.ok) throw new Error(`Could not read the LeetCode submission (HTTP ${response.status}).`);
  const body = await response.json();
  const details = body.data?.submissionDetails;
  if (body.errors?.length || !details) {
    throw new Error('LeetCode could not return the submitted solution. Make sure you are signed in to LeetCode.');
  }
  if (details.statusCode == null || Number(details.statusCode) <= 0) return { pending: true };
  // Match the bridge's accepted verdict; unknown final codes must not be synced.
  if (Number(details.statusCode) !== 10 || details.question?.titleSlug !== problemSlug) {
    return null;
  }
  const timestamp = Number(details.timestamp) * 1000;
  if (!Number.isFinite(timestamp) || timestamp < submittedAt - 60_000) {
    return null;
  }
  const language = normalizeLanguage(details.lang?.name || details.lang?.verboseName || '');
  if (!details.code?.trim() || !language) throw new Error('LeetCode did not return the full code or a supported language.');
  return {
    submissionId: String(submissionId), problemSlug,
    problemId: String(body.data.question?.questionFrontendId || ''),
    title: details.question.title, code: details.code, language,
    stats: { runtime: details.runtimeDisplay || null, memory: details.memoryDisplay || null },
    description: details.question.content || '', difficulty: details.question.difficulty || '',
    url: `https://leetcode.com/problems/${problemSlug}/`, capturedAt: submittedAt,
  };
}
