/**
 * MapScrubber - Year-based scrubber for the map view
 *
 * A horizontal slider with year-level precision (1760-1975),
 * chapter markers as visual reference, play/pause, and current year display.
 * Calls onChange(chapterNum) when the selected year crosses into a new chapter.
 */
export class MapScrubber {
  constructor(timelineData, onChange) {
    this.timeline = timelineData;
    this.onChange = onChange;
    this.chapters = timelineData.chapters || [];

    // Overall time range
    this.yearMin = timelineData.timeRange[0]; // 1760
    this.yearMax = timelineData.timeRange[1]; // 1975

    this.currentYear = this.yearMin;
    this.currentChapter = 1;
    this.playing = false;
    this.playInterval = null;
    this.playSpeed = 120; // ms per year tick

    this.container = null;
    this._render();
    this._syncChapterFromYear(this.currentYear);
  }

  _render() {
    this.container = document.createElement('div');
    this.container.className = 'map-scrubber';

    // Top row: chapter labels positioned proportionally
    const chapterBar = document.createElement('div');
    chapterBar.className = 'scrubber-chapters';
    chapterBar.style.position = 'relative';
    chapterBar.style.height = '22px';
    chapterBar.style.marginBottom = '4px';

    const totalYears = this.yearMax - this.yearMin;

    for (let i = 0; i < this.chapters.length; i++) {
      const ch = this.chapters[i];
      const chStart = ch.timeRange[0];
      const chEnd = ch.timeRange[1];
      const leftPct = ((chStart - this.yearMin) / totalYears) * 100;
      const widthPct = ((chEnd - chStart) / totalYears) * 100;

      const chEl = document.createElement('div');
      chEl.className = 'scrubber-chapter';
      chEl.style.position = 'absolute';
      chEl.style.left = `${leftPct}%`;
      chEl.style.width = `${widthPct}%`;
      chEl.textContent = ch.title;
      chEl.title = `${ch.subtitle} (${chStart}-${chEnd})`;
      chEl.dataset.chapterNum = i + 1;

      // Click on chapter label to jump to that chapter's start year
      chEl.style.cursor = 'pointer';
      chEl.addEventListener('click', () => {
        this._setYear(chStart);
      });

      chapterBar.appendChild(chEl);
    }
    this.container.appendChild(chapterBar);

    // Middle row: slider + controls
    const sliderRow = document.createElement('div');
    sliderRow.className = 'scrubber-slider-row';

    // Play button
    this.playBtn = document.createElement('button');
    this.playBtn.className = 'scrubber-play-btn';
    this.playBtn.innerHTML = '&#9654;';
    this.playBtn.title = '自动播放';
    this.playBtn.addEventListener('click', () => this.togglePlay());
    sliderRow.appendChild(this.playBtn);

    // Slider track container (for chapter tick marks)
    const sliderContainer = document.createElement('div');
    sliderContainer.className = 'scrubber-slider-container';
    sliderContainer.style.position = 'relative';
    sliderContainer.style.flex = '1';

    // Chapter boundary tick marks on the slider track
    for (let i = 1; i < this.chapters.length; i++) {
      const ch = this.chapters[i];
      const tickPct = ((ch.timeRange[0] - this.yearMin) / totalYears) * 100;
      const tick = document.createElement('div');
      tick.className = 'scrubber-tick';
      tick.style.cssText = `
        position: absolute;
        left: ${tickPct}%;
        top: 50%;
        transform: translate(-50%, -50%);
        width: 1px;
        height: 12px;
        background: rgba(212, 168, 83, 0.35);
        pointer-events: none;
        z-index: 1;
      `;
      sliderContainer.appendChild(tick);
    }

    // Slider input
    this.slider = document.createElement('input');
    this.slider.type = 'range';
    this.slider.className = 'scrubber-slider';
    this.slider.min = this.yearMin;
    this.slider.max = this.yearMax;
    this.slider.value = this.currentYear;
    this.slider.step = 1;
    this.slider.addEventListener('input', (e) => {
      this._setYear(parseInt(e.target.value), true);
    });
    sliderContainer.appendChild(this.slider);
    sliderRow.appendChild(sliderContainer);

    // Year display
    this.yearDisplay = document.createElement('div');
    this.yearDisplay.className = 'scrubber-chapter-display';
    this.yearDisplay.style.minWidth = '55px';
    this.yearDisplay.textContent = `${this.currentYear}`;
    sliderRow.appendChild(this.yearDisplay);

    this.container.appendChild(sliderRow);

    // Bottom row: info text
    this.infoText = document.createElement('div');
    this.infoText.className = 'scrubber-info';
    this.container.appendChild(this.infoText);

    this._updateInfo();
  }

  _setYear(year, fromSlider = false) {
    year = Math.max(this.yearMin, Math.min(this.yearMax, year));
    this.currentYear = year;

    if (!fromSlider) {
      this.slider.value = year;
    }

    this.yearDisplay.textContent = `${year}`;
    this._syncChapterFromYear(year);
    this._updateInfo();
    this._updateChapterHighlight();
  }

  _syncChapterFromYear(year) {
    // Find which chapter this year falls in
    let newChapter = 1;
    for (let i = 0; i < this.chapters.length; i++) {
      const ch = this.chapters[i];
      if (year >= ch.timeRange[0] && year <= ch.timeRange[1]) {
        newChapter = i + 1;
        break;
      }
      // If between chapters (gap), pick the nearest
      if (i < this.chapters.length - 1) {
        const nextCh = this.chapters[i + 1];
        if (year > ch.timeRange[1] && year < nextCh.timeRange[0]) {
          // Closer to next or current?
          newChapter = (year - ch.timeRange[1]) < (nextCh.timeRange[0] - year) ? i + 1 : i + 2;
          break;
        }
      }
      // Past last chapter
      if (i === this.chapters.length - 1 && year > ch.timeRange[1]) {
        newChapter = i + 1;
      }
    }

    if (newChapter !== this.currentChapter) {
      this.currentChapter = newChapter;
      if (this.onChange) this.onChange(newChapter);
    }
  }

  /** Called externally to set the scrubber to a specific chapter */
  setChapter(chapterNum) {
    if (chapterNum < 1 || chapterNum > this.chapters.length) return;
    const ch = this.chapters[chapterNum - 1];
    // Jump to the chapter's start year
    this._setYear(ch.timeRange[0]);
  }

  _updateInfo() {
    const ch = this.chapters[this.currentChapter - 1];
    if (ch) {
      this.infoText.textContent = `第${this.currentChapter}章 · ${ch.title} · ${ch.subtitle} (${ch.timeRange[0]}-${ch.timeRange[1]})`;
    }
  }

  _updateChapterHighlight() {
    const ch = this.currentChapter;
    const chEls = this.container.querySelectorAll('.scrubber-chapter');
    chEls.forEach((el) => {
      const num = parseInt(el.dataset.chapterNum);
      if (num === ch) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });
  }

  togglePlay() {
    this.playing = !this.playing;

    if (this.playing) {
      this.playBtn.innerHTML = '&#9646;&#9646;';
      this.playBtn.title = '暂停';
      this.playInterval = setInterval(() => {
        let nextYear = this.currentYear + 1;
        if (nextYear > this.yearMax) nextYear = this.yearMin;
        this._setYear(nextYear);
      }, this.playSpeed);
    } else {
      this.playBtn.innerHTML = '&#9654;';
      this.playBtn.title = '自动播放';
      clearInterval(this.playInterval);
    }
  }

  getElement() {
    return this.container;
  }

  destroy() {
    if (this.playInterval) clearInterval(this.playInterval);
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }
}
