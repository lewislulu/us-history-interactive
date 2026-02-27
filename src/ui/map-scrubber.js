/**
 * MapScrubber - Chapter scrubber for the map view
 *
 * A horizontal slider with chapter labels,
 * play/pause button, and current chapter indicator.
 */
export class MapScrubber {
  constructor(timelineData, onChange) {
    this.timeline = timelineData;
    this.onChange = onChange;
    this.currentChapter = 1;
    this.playing = false;
    this.playInterval = null;
    this.playSpeed = 2000; // ms per chapter (slower for 7 chapters)

    this.container = null;
    this._render();
  }

  _render() {
    this.container = document.createElement('div');
    this.container.className = 'map-scrubber';

    // Top row: chapter labels
    const chapterBar = document.createElement('div');
    chapterBar.className = 'scrubber-chapters';
    const chapters = this.timeline.chapters || [];
    const totalChapters = chapters.length;

    for (const ch of chapters) {
      const chEl = document.createElement('div');
      chEl.className = 'scrubber-chapter';
      chEl.style.width = `${100 / totalChapters}%`;
      chEl.textContent = ch.title;
      chEl.title = `${ch.subtitle} (${ch.timeRange[0]}-${ch.timeRange[1]})`;
      chapterBar.appendChild(chEl);
    }
    this.container.appendChild(chapterBar);

    // Middle row: slider
    const sliderRow = document.createElement('div');
    sliderRow.className = 'scrubber-slider-row';

    // Play button
    this.playBtn = document.createElement('button');
    this.playBtn.className = 'scrubber-play-btn';
    this.playBtn.innerHTML = '&#9654;';
    this.playBtn.title = '自动播放';
    this.playBtn.addEventListener('click', () => this.togglePlay());
    sliderRow.appendChild(this.playBtn);

    // Slider
    this.slider = document.createElement('input');
    this.slider.type = 'range';
    this.slider.className = 'scrubber-slider';
    this.slider.min = 1;
    this.slider.max = totalChapters;
    this.slider.value = this.currentChapter;
    this.slider.step = 1;
    this.slider.addEventListener('input', (e) => {
      this.setChapter(parseInt(e.target.value), true);
    });
    sliderRow.appendChild(this.slider);

    // Chapter display
    this.chapterDisplay = document.createElement('div');
    this.chapterDisplay.className = 'scrubber-chapter-display';
    this.chapterDisplay.textContent = `第${this.currentChapter}章`;
    sliderRow.appendChild(this.chapterDisplay);

    this.container.appendChild(sliderRow);

    // Bottom row: info text
    this.infoText = document.createElement('div');
    this.infoText.className = 'scrubber-info';
    this.container.appendChild(this.infoText);

    this._updateInfo();
  }

  setChapter(chapter, fromSlider = false) {
    this.currentChapter = chapter;
    if (!fromSlider) {
      this.slider.value = chapter;
    }
    this.chapterDisplay.textContent = `第${chapter}章`;
    this._updateInfo();
    this._updateChapterHighlight();
    if (this.onChange) this.onChange(chapter);
  }

  _updateInfo() {
    const chapters = this.timeline.chapters || [];
    const ch = chapters[this.currentChapter - 1];
    if (ch) {
      this.infoText.textContent = `${ch.title} · ${ch.subtitle} (${ch.timeRange[0]}-${ch.timeRange[1]})`;
    }
  }

  _updateChapterHighlight() {
    const ch = this.currentChapter;
    const chEls = this.container.querySelectorAll('.scrubber-chapter');
    chEls.forEach((el, i) => {
      if (i === ch - 1) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });
  }

  togglePlay() {
    this.playing = !this.playing;
    const totalChapters = (this.timeline.chapters || []).length;

    if (this.playing) {
      this.playBtn.innerHTML = '&#9646;&#9646;';
      this.playBtn.title = '暂停';
      this.playInterval = setInterval(() => {
        let next = this.currentChapter + 1;
        if (next > totalChapters) next = 1;
        this.setChapter(next);
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
