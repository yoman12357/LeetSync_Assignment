import { GITHUB, RETRY } from '../config/constants.js';
import {
  backoffDelay,
  classifyGitHubError,
  decodeBase64,
  encodeBase64,
} from '../utils/helpers.js';

export class GitHubApiError extends Error {
  constructor(details, status) {
    super(details.message);
    this.name = 'GitHubApiError';
    this.status = status;
    this.type = details.type;
    this.retryable = details.retryable;
  }
}

export class GitHubClient {
  constructor(token, options = {}) {
    if (!token) throw new Error('GitHub token is required');
    this.token = token;
    this.fetch = options.fetch || globalThis.fetch.bind(globalThis);
    this.sleep = options.sleep || ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.baseUrl = options.baseUrl || GITHUB.apiBase;
  }

  async request(path, options = {}, retryCount = 0) {
    let response;
    try {
      response = await this.fetch(`${this.baseUrl}${path}`, {
        ...options,
        signal: options.signal || AbortSignal.timeout(15_000),
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...options.headers,
        },
      });
    } catch (error) {
      if (retryCount < RETRY.attempts) {
        await this.sleep(backoffDelay(retryCount));
        return this.request(path, options, retryCount + 1);
      }
      throw new GitHubApiError({ type: 'NETWORK', message: `GitHub could not be reached: ${error.message}`, retryable: true }, 0);
    }

    const contentType = response.headers.get('content-type') || '';
    const body = contentType.includes('application/json') ? await response.json() : null;
    const details = response.ok ? null : classifyGitHubError(response.status, body, response.headers);

    if (details?.retryable && retryCount < RETRY.attempts && response.status !== 409) {
      await this.sleep(backoffDelay(retryCount));
      return this.request(path, options, retryCount + 1);
    }

    return { ok: response.ok, status: response.status, body, headers: response.headers, details };
  }

  async getAuthenticatedUser() {
    const result = await this.request('/user');
    this.assertOk(result);
    return {
      login: result.body.login,
      name: result.body.name,
      avatarUrl: result.body.avatar_url,
      profileUrl: result.body.html_url,
    };
  }

  async listRepositories() {
    const repositories = [];
    for (let page = 1; page <= 10; page += 1) {
      const result = await this.request(`/user/repos?affiliation=owner,collaborator&sort=updated&per_page=100&page=${page}`);
      this.assertOk(result);
      repositories.push(...result.body.filter((repository) => repository.permissions?.push));
      if (result.body.length < 100) break;
    }
    return repositories.map(mapRepository);
  }

  async getRepository(owner, name) {
    const result = await this.request(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`);
    this.assertOk(result);
    if (!result.body.permissions?.push) {
      throw new GitHubApiError({ type: 'PERMISSION', message: 'You do not have write access to this repository.', retryable: false }, 403);
    }
    return mapRepository(result.body);
  }

  async createRepository(name, isPrivate = false) {
    const result = await this.request('/user/repos', {
      method: 'POST',
      body: JSON.stringify({
        name,
        private: Boolean(isPrivate),
        auto_init: true,
        description: 'LeetCode solutions synchronized by LeetSync',
      }),
    });
    this.assertOk(result, [201]);
    return mapRepository(result.body);
  }

  async getFile(owner, repository, path) {
    const result = await this.request(filePath(owner, repository, path));
    if (result.status === 404) return { exists: false, content: null, sha: null };
    this.assertOk(result);
    if (Array.isArray(result.body) || result.body.type !== 'file') {
      throw new Error(`Expected a file at ${path}`);
    }
    return {
      exists: true,
      content: decodeBase64(result.body.content || ''),
      sha: result.body.sha,
      url: result.body.html_url,
    };
  }

  async putFile(owner, repository, path, content, message, sha = null) {
    const payload = { message, content: encodeBase64(content) };
    if (sha) payload.sha = sha;
    const result = await this.request(filePath(owner, repository, path), {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    this.assertOk(result, [200, 201]);
    return {
      path: result.body.content.path,
      sha: result.body.content.sha,
      commitSha: result.body.commit.sha,
      url: result.body.content.html_url,
    };
  }

  assertOk(result, accepted = [200]) {
    if (result.ok && accepted.includes(result.status)) return;
    const details = result.details || classifyGitHubError(result.status, result.body, result.headers);
    throw new GitHubApiError(details, result.status);
  }
}

function filePath(owner, repository, path) {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/contents/${encodedPath}`;
}

function mapRepository(repository) {
  return {
    id: repository.id,
    name: repository.name,
    fullName: repository.full_name,
    owner: repository.owner.login,
    private: repository.private,
    url: repository.html_url,
    defaultBranch: repository.default_branch || 'main',
  };
}
