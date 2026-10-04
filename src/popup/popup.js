import { MESSAGE } from '../config/constants.js';
import { createRequestId } from '../utils/helpers.js';

const byId = (id) => document.getElementById(id);
const elements = {
  authPanel: byId('authPanel'),
  autoSync: byId('autoSync'),
  avatar: byId('avatar'),
  cancelCreate: byId('cancelCreate'),
  changeRepository: byId('changeRepository'),
  connectButton: byId('connectButton'),
  connectionState: byId('connectionState'),
  copyRedirect: byId('copyRedirect'),
  createForm: byId('createForm'),
  dashboard: byId('dashboard'),
  displayName: byId('displayName'),
  generateReadme: byId('generateReadme'),
  history: byId('history'),
  includePerformance: byId('includePerformance'),
  loading: byId('loading'),
  loadingText: byId('loadingText'),
  loginName: byId('loginName'),
  notice: byId('notice'),
  logoutButton: byId('logoutButton'),
  privateRepository: byId('privateRepository'),
  redirectUri: byId('redirectUri'),
  repositoryName: byId('repositoryName'),
  repositoryPicker: byId('repositoryPicker'),
  repositorySelect: byId('repositorySelect'),
  selectRepository: byId('selectRepository'),
  selectedRepository: byId('selectedRepository'),
  showCreateForm: byId('showCreateForm'),
};

let repositories = [];

document.addEventListener('DOMContentLoaded', async () => {
  byId('extensionVersion').textContent = `v${chrome.runtime.getManifest().version}`;
  elements.redirectUri.value = chrome.identity.getRedirectURL();
  bindEvents();
  await refreshStatus();
});

function bindEvents() {
  elements.connectButton.addEventListener('click', connectGitHub);
  elements.copyRedirect.addEventListener('click', copyRedirectUri);
  elements.logoutButton.addEventListener('click', disconnectGitHub);
  elements.repositorySelect.addEventListener('change', () => {
    elements.selectRepository.disabled = !elements.repositorySelect.value;
  });
  elements.selectRepository.addEventListener('click', selectRepository);
  elements.changeRepository.addEventListener('click', showRepositoryPicker);
  elements.showCreateForm.addEventListener('click', () => toggleCreateForm(true));
  elements.cancelCreate.addEventListener('click', () => toggleCreateForm(false));
  elements.createForm.addEventListener('submit', createRepository);
  for (const input of [elements.autoSync, elements.generateReadme, elements.includePerformance]) {
    input.addEventListener('change', saveSettings);
  }
}

async function refreshStatus() {
  try {
    const status = await send(MESSAGE.statusGet);
    if (!status.authenticated) return renderSignedOut();
    renderSignedIn(status);
    if (!status.repository) await loadRepositories();
  } catch (error) {
    renderSignedOut();
    setNotice(error.message);
  }
}

async function connectGitHub() {
  setLoading(true, 'Opening GitHub authentication...');
  setNotice('');
  try {
    const response = await send(MESSAGE.authStart);
    if (!response.success) throw new Error(response.error);
    await refreshStatus();
  } catch (error) {
    setNotice(error.message);
  } finally {
    setLoading(false);
  }
}

async function disconnectGitHub() {
  setLoading(true, 'Disconnecting...');
  try {
    await send(MESSAGE.authLogout);
    renderSignedOut();
  } catch (error) {
    setNotice(error.message);
  } finally {
    setLoading(false);
  }
}

async function loadRepositories() {
  elements.repositorySelect.replaceChildren(option('Loading repositories...', ''));
  elements.repositorySelect.disabled = true;
  try {
    const response = await send(MESSAGE.repoList);
    if (!response.success) throw new Error(response.error);
    repositories = response.repositories;
    elements.repositorySelect.replaceChildren(option('Select a repository...', ''));
    for (const repository of repositories) {
      elements.repositorySelect.append(option(`${repository.private ? 'Private' : 'Public'} - ${repository.fullName}`, repository.id));
    }
  } catch (error) {
    elements.repositorySelect.replaceChildren(option('Repositories could not be loaded', ''));
    setNotice(error.message);
  } finally {
    elements.repositorySelect.disabled = false;
  }
}

async function selectRepository() {
  const repository = repositories.find((item) => String(item.id) === elements.repositorySelect.value);
  if (!repository) return;
  setLoading(true, 'Checking repository access...');
  try {
    const response = await send(MESSAGE.repoSelect, { owner: repository.owner, name: repository.name });
    if (!response.success) throw new Error(response.error);
    renderRepository(response.repository);
  } catch (error) {
    setNotice(error.message);
  } finally {
    setLoading(false);
  }
}

async function createRepository(event) {
  event.preventDefault();
  setLoading(true, 'Creating repository...');
  try {
    const response = await send(MESSAGE.repoCreate, {
      name: elements.repositoryName.value.trim(),
      private: elements.privateRepository.checked,
    });
    if (!response.success) throw new Error(response.error);
    toggleCreateForm(false);
    renderRepository(response.repository);
  } catch (error) {
    setNotice(error.message);
  } finally {
    setLoading(false);
  }
}

async function saveSettings() {
  const response = await send(MESSAGE.settingsSave, {
    autoSync: elements.autoSync.checked,
    generateReadme: elements.generateReadme.checked,
    includePerformance: elements.includePerformance.checked,
  });
  if (!response.success) setNotice(response.error);
}

function renderSignedOut() {
  elements.authPanel.classList.remove('hidden');
  elements.dashboard.classList.add('hidden');
  elements.connectionState.textContent = 'Offline';
  elements.connectionState.classList.remove('online');
}

function renderSignedIn(status) {
  elements.authPanel.classList.add('hidden');
  elements.dashboard.classList.remove('hidden');
  elements.connectionState.textContent = 'Connected';
  elements.connectionState.classList.add('online');
  elements.avatar.src = status.user.avatarUrl;
  elements.displayName.textContent = status.user.name || status.user.login;
  elements.loginName.textContent = `@${status.user.login}`;
  elements.autoSync.checked = status.settings.autoSync;
  elements.generateReadme.checked = status.settings.generateReadme;
  elements.includePerformance.checked = status.settings.includePerformance;
  renderRepository(status.repository);
  renderHistory(status.history);
}

function renderRepository(repository) {
  const configured = Boolean(repository);
  elements.selectedRepository.classList.toggle('hidden', !configured);
  elements.changeRepository.classList.toggle('hidden', !configured);
  elements.repositoryPicker.classList.toggle('hidden', configured);
  elements.selectedRepository.replaceChildren();
  if (configured) {
    const link = document.createElement('a');
    link.href = `https://github.com/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = repository.fullName;
    elements.selectedRepository.append(link);
  }
}

function showRepositoryPicker() {
  elements.selectedRepository.classList.add('hidden');
  elements.changeRepository.classList.add('hidden');
  elements.repositoryPicker.classList.remove('hidden');
  void loadRepositories();
}

function renderHistory(history) {
  elements.history.replaceChildren();
  if (!history?.length) {
    const empty = document.createElement('li');
    empty.className = 'history-empty';
    empty.textContent = 'No synchronized submissions yet.';
    elements.history.append(empty);
    return;
  }
  for (const item of history.slice(0, 8)) {
    const row = document.createElement('li');
    const title = document.createElement('span');
    const action = document.createElement('span');
    const meta = document.createElement('span');
    row.className = 'history-item';
    title.className = 'history-title';
    action.className = 'history-action';
    meta.className = 'history-meta';
    title.textContent = item.title;
    action.textContent = item.action === 'skipped' ? 'Already saved' : item.action;
    meta.textContent = `${new Date(item.timestamp).toLocaleString()} - ${item.requestId}`;
    row.append(title, action, meta);
    if (item.url?.startsWith('https://github.com/')) {
      const link = document.createElement('a');
      link.className = 'history-link';
      link.href = item.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = `Open ${item.path || 'saved solution'}`;
      row.append(link);
    }
    elements.history.append(row);
  }
}

async function copyRedirectUri() {
  await navigator.clipboard.writeText(elements.redirectUri.value);
  setNotice('Callback URL copied.', true);
}

function toggleCreateForm(visible) {
  elements.createForm.classList.toggle('hidden', !visible);
  elements.showCreateForm.classList.toggle('hidden', visible);
  if (visible) elements.repositoryName.focus();
  else elements.createForm.reset();
}

function setLoading(visible, text = '') {
  elements.loading.classList.toggle('hidden', !visible);
  elements.loadingText.textContent = text;
}

function setNotice(message, success = false) {
  elements.notice.textContent = message || '';
  elements.notice.classList.toggle('success', success);
}

function send(type, payload) {
  const requestId = createRequestId();
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, payload, requestId }, (response) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(response);
    });
  });
}

function option(label, value) {
  const element = document.createElement('option');
  element.textContent = label;
  element.value = value;
  return element;
}
