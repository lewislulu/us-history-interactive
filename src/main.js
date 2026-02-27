/**
 * Main entry point -- US History Interactive Visualization
 *
 * Cinematic dark theme, D3 storyline engine + map engine,
 * GSAP animations, Markdown narrative renderer.
 * Chapter-based navigation, personal events, biography mode.
 * Dual view: Timeline ↔ Map
 */
import { loadAllData } from './data/loader.js';
import { Timeline } from './core/timeline.js';
import { MapEngine } from './core/map-engine.js';
import { MapScrubber } from './ui/map-scrubber.js';
import { Router } from './core/router.js';
import { Minimap } from './core/minimap.js';
import { ChapterBar } from './ui/chapter-bar.js';
import { CharacterCard } from './ui/character-card.js';
import { EventPanel } from './ui/event-panel.js';
import { DetailView } from './ui/detail-view.js';
import { PersonalTooltip } from './ui/personal-tooltip.js';
import { Legend } from './ui/legend.js';
import { Feedback } from './ui/feedback.js';
import { ParticleSystem } from './ui/particles.js';
import gsap from 'gsap';

// ─── Boot ──────────────────────────────────────────────

async function boot() {
  const header = document.getElementById('header');

  try {
    // Load all data
    const data = await loadAllData();

    // ── Initialize systems ──

    // 1. Router (URL state management)
    const router = new Router();

    // 2. Particle background
    const particles = new ParticleSystem('bg-particles');
    particles.start(50);

    // 3. Timeline engine
    const svgElement = document.getElementById('timeline-svg');
    const timeline = new Timeline(svgElement, data);

    // 4. Minimap
    const minimap = new Minimap(timeline);
    timeline.onZoomChange = (transform) => minimap.update(transform);

    // 5. Chapter bar
    const chapterData = (data.timeline.chapters || []).map((ch) => ({
      id: ch.id,
      title: ch.title,
      subtitle: ch.subtitle,
      startYear: ch.timeRange[0],
      endYear: ch.timeRange[1],
    }));

    const chapterBar = new ChapterBar(chapterData, (chapterId) => {
      timeline.setChapter(chapterId);
      chapterBar.setActive(chapterId);
      router.setState({ chapter: chapterId, event: null, bio: null });
      hideBioBanner();

      // Sync map if active
      if (mapEngine && currentView === 'map') {
        const chConfig = (data.timeline.chapters || []).find(c => c.id === chapterId);
        if (chConfig) {
          mapEngine.setChapter(chConfig.number);
          if (mapScrubber) mapScrubber.setChapter(chConfig.number);
        }
      }
    });

    const chapterMount = document.getElementById('chapter-bar-mount');
    chapterMount.appendChild(chapterBar.getElement());
    chapterBar.setActive(null);

    // 6. Character card
    const characterCard = new CharacterCard();

    // 7. Event panel
    const eventPanel = new EventPanel(data.characters, data.events);

    // 8. Detail view
    const detailView = new DetailView(data.characters);

    // 9. Personal tooltip
    const personalTooltip = new PersonalTooltip();

    // 10. Legend
    const legend = new Legend();
    document.getElementById('app').appendChild(legend.getElement());

    // 11. Feedback (GitHub issue submission)
    const feedback = new Feedback();
    document.getElementById('app').appendChild(feedback.getButton());
    document.getElementById('app').appendChild(feedback.getOverlay());

    // ── View management (Timeline ↔ Map) ──
    let currentView = 'timeline';
    let mapEngine = null;
    let mapScrubber = null;
    let mapInitPending = false;

    const timelineContainer = document.getElementById('timeline-container');
    const mapView = document.getElementById('map-view');
    const mapContainer = document.getElementById('map-container');
    const minimapEl = document.getElementById('minimap');

    // View switcher UI
    const viewSwitcher = document.createElement('div');
    viewSwitcher.className = 'view-switcher';
    viewSwitcher.innerHTML = `
      <button class="view-btn active" data-view="timeline">时间线</button>
      <button class="view-btn" data-view="map">地图</button>
    `;
    chapterMount.insertBefore(viewSwitcher, chapterBar.getElement());

    viewSwitcher.addEventListener('click', (e) => {
      const btn = e.target.closest('.view-btn');
      if (!btn) return;
      const view = btn.dataset.view;
      if (view === currentView) return;
      switchView(view);
    });

    function switchView(mode) {
      currentView = mode;

      // Update button states
      viewSwitcher.querySelectorAll('.view-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === mode);
      });

      if (mode === 'map') {
        timelineContainer.classList.add('hidden');
        minimapEl.classList.add('hidden');
        mapView.classList.remove('hidden');

        // Hide chapter cards in map mode (map has its own scrubber)
        chapterBar.getElement().style.display = 'none';

        initMapView();
      } else {
        mapView.classList.add('hidden');
        timelineContainer.classList.remove('hidden');
        minimapEl.classList.remove('hidden');
        chapterBar.getElement().style.display = '';
      }
    }

    function initMapView() {
      if (mapEngine || mapInitPending) return;
      mapInitPending = true;

      // Defer to next frame so container has correct dimensions
      requestAnimationFrame(() => {
        if (mapEngine) return;

        mapEngine = new MapEngine(mapContainer, data);

        mapScrubber = new MapScrubber(data.timeline, (chapterNum) => {
          mapEngine.setChapter(chapterNum);
        });
        mapView.appendChild(mapScrubber.getElement());

        mapEngine.onEventClick = (event) => { eventPanel.show(event); };
        mapEngine.onCharacterClick = (character) => { characterCard.show(character); };

        // Layer filter panel
        const filterPanel = document.createElement('div');
        filterPanel.className = 'map-layer-filter';
        const layers = [
          { key: 'territories', label: '州界', color: '#9b59b6' },
          { key: 'cities', label: '地名', color: '#ffd700' },
          { key: 'events', label: '事件', color: '#ff8c42' },
          { key: 'characters', label: '人物', color: '#8bbbd0' },
        ];
        for (const layer of layers) {
          const item = document.createElement('label');
          item.className = 'map-filter-item';
          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.checked = true;
          checkbox.addEventListener('change', () => {
            mapEngine.setLayerVisibility(layer.key, checkbox.checked);
          });
          const dot = document.createElement('span');
          dot.className = 'map-filter-dot';
          dot.style.background = layer.color;
          const text = document.createTextNode(layer.label);
          item.appendChild(checkbox);
          item.appendChild(dot);
          item.appendChild(text);
          filterPanel.appendChild(item);
        }
        mapContainer.appendChild(filterPanel);

        // Sync to current chapter
        const ch = timeline.getCurrentChapter();
        if (ch) {
          const chConfig = (data.timeline.chapters || []).find(c => c.id === ch);
          if (chConfig) {
            mapEngine.setChapter(chConfig.number);
            mapScrubber.setChapter(chConfig.number);
          }
        } else {
          mapEngine.setChapter(1);
          mapScrubber.setChapter(1);
        }
      });
    }

    // ── Biography mode banner ──
    const bioBanner = document.getElementById('bio-banner');
    const bioBannerText = bioBanner.querySelector('.bio-banner-text');
    const bioBannerExit = bioBanner.querySelector('.bio-banner-exit');

    function showBioBanner(charId) {
      const char = data.characters[charId];
      if (!char) return;
      bioBannerText.textContent = `${char.name} -- 人物传记模式`;
      bioBannerText.style.color = char.color;
      bioBanner.classList.remove('hidden');
      gsap.from(bioBanner, { y: -40, opacity: 0, duration: 0.5, ease: 'power2.out' });
    }

    function hideBioBanner() {
      bioBanner.classList.add('hidden');
    }

    // ── Wire up interactions ──

    timeline.onCharacterClick = (character) => {
      eventPanel.hide();
      characterCard.show(character);
    };

    characterCard.onFollow = (charId) => {
      timeline.followCharacter(charId);
      const unfollowHandler = () => {
        timeline.followCharacter(null);
        document.removeEventListener('click', unfollowHandler);
      };
      setTimeout(() => {
        document.addEventListener('click', unfollowHandler);
      }, 100);
    };

    characterCard.onBiographyMode = (charId) => {
      timeline.setBiographyMode(charId);
      showBioBanner(charId);
      router.setState({ bio: charId, event: null });
    };

    bioBannerExit.addEventListener('click', () => {
      timeline.setBiographyMode(null);
      hideBioBanner();
      router.setState({ bio: null });
    });

    timeline.onEventClick = (event) => {
      characterCard.hide();
      timeline.zoomToEvent(event.id);
      setTimeout(() => {
        eventPanel.show(event);
      }, 400);
      router.setState({ event: event.id });
    };

    eventPanel.onSceneClick = (scene, event) => {
      detailView.show(scene, event);
    };

    eventPanel.onRelatedEventClick = (relatedEvent) => {
      eventPanel.hide();
      setTimeout(() => {
        timeline.zoomToEvent(relatedEvent.id);
        setTimeout(() => {
          eventPanel.show(relatedEvent);
          router.setState({ event: relatedEvent.id });
        }, 400);
      }, 300);
    };

    timeline.onPersonalEventHover = (pe, char, position) => {
      personalTooltip.show(pe, char, position);
    };
    timeline.onPersonalEventLeave = () => {
      personalTooltip.hide();
    };

    timeline.onChapterChange = (chapterId) => {
      chapterBar.setActive(chapterId);
    };

    // ── Router: restore state from URL ──
    const initialState = router.getState();
    if (initialState.chapter) {
      timeline.setChapter(initialState.chapter);
      chapterBar.setActive(initialState.chapter);
    }
    if (initialState.bio) {
      timeline.setBiographyMode(initialState.bio);
      showBioBanner(initialState.bio);
    }
    if (initialState.event && data.events[initialState.event]) {
      setTimeout(() => {
        timeline.zoomToEvent(initialState.event);
        setTimeout(() => eventPanel.show(data.events[initialState.event]), 500);
      }, 800);
    }

    router.onChange((state) => {
      if (state.chapter !== timeline.getCurrentChapter()) {
        timeline.setChapter(state.chapter);
        chapterBar.setActive(state.chapter);
      }
      if (state.bio) {
        timeline.setBiographyMode(state.bio);
        showBioBanner(state.bio);
      } else if (timeline.biographyCharacter) {
        timeline.setBiographyMode(null);
        hideBioBanner();
      }
    });

    // ── Keyboard shortcuts ──
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (detailView.isVisible) {
          detailView.hide();
        } else if (eventPanel.isVisible) {
          eventPanel.hide();
        } else if (characterCard.isVisible) {
          characterCard.hide();
        } else if (timeline.biographyCharacter) {
          timeline.setBiographyMode(null);
          hideBioBanner();
          router.setState({ bio: null });
        }
      }
      if (e.key === 'r' && !e.metaKey && !e.ctrlKey) {
        if (!eventPanel.isVisible && !characterCard.isVisible && !detailView.isVisible) {
          if (currentView === 'map' && mapEngine) {
            mapEngine.resetZoom();
          } else {
            timeline.resetZoom();
          }
        }
      }
    });

    // ── Entrance animation ──
    gsap.from(header, { y: -40, opacity: 0, duration: 1, ease: 'power3.out' });
    gsap.from('#chapter-bar-mount', { y: -60, opacity: 0, duration: 0.8, delay: 0.2, ease: 'power3.out' });
    gsap.from('#timeline-container', { opacity: 0, duration: 1.5, delay: 0.3, ease: 'power2.out' });
    gsap.from('#minimap', { y: 20, opacity: 0, duration: 0.8, delay: 0.8, ease: 'power2.out' });

    console.log('US History Interactive loaded.');
    console.log(`  ${Object.keys(data.characters).length} characters`);
    console.log(`  ${Object.keys(data.events).length} events`);
    console.log(`  ${(data.timeline.chapters || []).length} chapters`);
    console.log('  Press R to reset zoom. Click portraits for bios. Click nodes for events.');

  } catch (err) {
    console.error('Failed to load visualization:', err);

    // Visible fallback (avoid blank screen in production)
    const app = document.getElementById('app') || document.body;
    app.innerHTML = `
      <div style="padding:24px;color:#fff;background:#111;min-height:100vh;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;">
        <h2 style="margin:0 0 12px;">页面加载失败</h2>
        <p style="margin:0 0 12px;opacity:.9;">请刷新重试；如果仍失败，请把下面错误截图给我。</p>
        <pre style="white-space:pre-wrap;background:#1b1b1b;padding:12px;border-radius:8px;overflow:auto;">${(err && (err.stack || err.message)) || String(err)}</pre>
      </div>
    `;
  }
}

// ─── Start ──────────────────────────────────────────────

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
