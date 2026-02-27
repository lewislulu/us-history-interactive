/**
 * Feedback Component -- floating button + modal to submit GitHub issues
 */
import { t } from '../i18n/index.js';

export class Feedback {
  constructor() {
    this._createButton();
    this._createModal();
    this._bindEvents();
  }

  _createButton() {
    this.btn = document.createElement('button');
    this.btn.className = 'feedback-btn';
    this.btn.title = 'Feedback';
    this.btn.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    `;
  }

  _createModal() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'feedback-overlay hidden';

    this.overlay.innerHTML = `
      <div class="feedback-backdrop"></div>
      <div class="feedback-modal">
        <button class="feedback-close">&times;</button>
        <h3 class="feedback-title">${t('feedbackTitle')}</h3>
        <p class="feedback-desc">${t('feedbackDesc')}</p>
        <form class="feedback-form">
          <label class="feedback-label">
            ${t('feedbackInputTitle')}
            <input type="text" class="feedback-input" name="title"
                   placeholder="${t('feedbackInputPlaceholder')}" required />
          </label>
          <label class="feedback-label">
            ${t('feedbackType')}
            <select class="feedback-select" name="type">
              <option value="suggestion">${t('feedbackFeatureRequest')}</option>
              <option value="bug">${t('feedbackBugReport')}</option>
              <option value="content">${t('feedbackContentCorrection')}</option>
              <option value="other">${t('feedbackOther')}</option>
            </select>
          </label>
          <label class="feedback-label">
            ${t('feedbackDescription')}
            <textarea class="feedback-textarea" name="body" rows="5"
                      placeholder="${t('feedbackDetailPlaceholder')}"></textarea>
          </label>
          <button type="submit" class="feedback-submit">${t('feedbackSubmit')}</button>
          <div class="feedback-status"></div>
        </form>
      </div>
    `;
  }

  _bindEvents() {
    this.btn.addEventListener('click', () => this.show());
    this.overlay.querySelector('.feedback-backdrop').addEventListener('click', () => this.hide());
    this.overlay.querySelector('.feedback-close').addEventListener('click', () => this.hide());

    const form = this.overlay.querySelector('.feedback-form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this._submit(form);
    });
  }

  show() {
    this.overlay.classList.remove('hidden');
    const status = this.overlay.querySelector('.feedback-status');
    status.textContent = '';
    status.className = 'feedback-status';
    this.overlay.querySelector('.feedback-submit').disabled = false;
  }

  hide() {
    this.overlay.classList.add('hidden');
  }

  async _submit(form) {
    const title = form.title.value.trim();
    const type = form.type.value;
    const body = form.body.value.trim();
    const submitBtn = this.overlay.querySelector('.feedback-submit');
    const status = this.overlay.querySelector('.feedback-status');

    if (!title) return;

    submitBtn.disabled = true;
    submitBtn.textContent = t('feedbackSubmitting');
    status.textContent = '';
    status.className = 'feedback-status';

    const labelMap = {
      suggestion: 'enhancement',
      bug: 'bug',
      content: 'content',
      other: 'feedback',
    };

    const issueBody = [
      body,
      '',
      '---',
      `> Source: Storyline Visualization Feedback`,
      `> Type: ${type}`,
      `> Page: ${location.href}`,
    ].join('\n');

    try {
      const res = await fetch('/api/create-issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `[${type}] ${title}`,
          body: issueBody,
          labels: [labelMap[type] || 'feedback'],
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        status.textContent = t('feedbackSuccess', { n: data.issueNumber });
        status.className = 'feedback-status success';
        form.reset();
        setTimeout(() => this.hide(), 2000);
      } else {
        status.textContent = data.error || t('feedbackFailed');
        status.className = 'feedback-status error';
      }
    } catch (err) {
      status.textContent = t('feedbackNetworkError');
      status.className = 'feedback-status error';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = t('feedbackSubmit');
    }
  }

  getButton() {
    return this.btn;
  }

  getOverlay() {
    return this.overlay;
  }
}
