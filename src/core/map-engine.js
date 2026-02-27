/**
 * MapEngine - D3 geo-based US History interactive map
 *
 * Features:
 *  1. State-based territory coloring (Union/Confederacy/Territory)
 *  2. Character positioning with clustering
 *  3. Event markers per chapter
 *  4. Zoom-based progressive disclosure
 *  5. Hover-only labels (learned from 3-kingdom project)
 *  6. pointer-events: none for invisible elements
 */
import * as d3 from 'd3';
import * as topojson from 'topojson-client';

// ═══ Color palette ═══
const COLORS = {
  capital:     { fill: '#ffd700', stroke: '#ffd700', label: '#ffd700', glow: 'rgba(255, 215, 0, 0.25)' },
  city:        { fill: 'rgba(184, 168, 152, 0.6)', stroke: 'rgba(184, 168, 152, 0.4)', label: 'rgba(200, 192, 180, 0.85)' },
  battlefield: { fill: 'rgba(192, 57, 43, 0.7)', stroke: '#c0392b', label: '#e07060' },
  landmark:    { fill: 'rgba(126, 200, 184, 0.7)', stroke: '#7ec8b8', label: '#7ec8b8' },
  eventMajor:  { fill: '#ff8c42', stroke: '#ff8c42', label: '#ff8c42', pulse: '#ff8c42' },
  eventMinor:  { fill: 'rgba(212, 145, 94, 0.6)', stroke: '#d4915e', label: '#d4915e' },
  state:       { fill: 'rgba(26, 26, 36, 0.6)', stroke: 'rgba(160, 160, 180, 0.12)' },
  cluster:     { fill: 'rgba(139, 187, 208, 0.2)', stroke: 'rgba(139, 187, 208, 0.6)', text: '#8bbbd0' },
};

// FIPS code to state name mapping for TopoJSON
const FIPS_TO_STATE = {
  '01': 'Alabama', '02': 'Alaska', '04': 'Arizona', '05': 'Arkansas', '06': 'California',
  '08': 'Colorado', '09': 'Connecticut', '10': 'Delaware', '11': 'District of Columbia',
  '12': 'Florida', '13': 'Georgia', '15': 'Hawaii', '16': 'Idaho', '17': 'Illinois',
  '18': 'Indiana', '19': 'Iowa', '20': 'Kansas', '21': 'Kentucky', '22': 'Louisiana',
  '23': 'Maine', '24': 'Maryland', '25': 'Massachusetts', '26': 'Michigan', '27': 'Minnesota',
  '28': 'Mississippi', '29': 'Missouri', '30': 'Montana', '31': 'Nebraska', '32': 'Nevada',
  '33': 'New Hampshire', '34': 'New Jersey', '35': 'New Mexico', '36': 'New York',
  '37': 'North Carolina', '38': 'North Dakota', '39': 'Ohio', '40': 'Oklahoma',
  '41': 'Oregon', '42': 'Pennsylvania', '44': 'Rhode Island', '45': 'South Carolina',
  '46': 'South Dakota', '47': 'Tennessee', '48': 'Texas', '49': 'Utah', '50': 'Vermont',
  '51': 'Virginia', '53': 'Washington', '54': 'West Virginia', '55': 'Wisconsin', '56': 'Wyoming',
  '72': 'Puerto Rico',
};

export class MapEngine {
  constructor(container, data) {
    this.container = container;
    this.data = data;
    this.mapData = data.mapData;
    this.characters = data.characters;
    this.events = data.events;
    this.timeline = data.timeline;

    this.currentChapterNum = 1;
    this.currentZoomScale = 1;

    // Layer visibility
    this.layerVisibility = { territories: true, cities: true, events: true, characters: true };

    this._buildLocationIndex();
    this._buildChapterEventMap();

    this.svg = null;
    this.g = null;
    this.projection = null;
    this.path = null;
    this.zoom = null;

    // Callbacks
    this.onEventClick = null;
    this.onCharacterClick = null;

    // Layer refs
    this.statePathMap = {};
    this.eventMarkers = [];
    this.characterMarkers = [];

    this._init();
  }

  _buildLocationIndex() {
    this.locationMap = {};
    const locations = this.mapData.locations || [];
    for (const loc of locations) {
      this.locationMap[loc.id] = loc;
    }
  }

  _buildChapterEventMap() {
    // Map each event to its chapter number based on year falling within chapter timeRange
    this.eventChapterMap = {};
    const chapters = this.timeline.chapters || [];
    for (const evt of Object.values(this.events)) {
      for (const ch of chapters) {
        if (evt.year >= ch.timeRange[0] && evt.year <= ch.timeRange[1]) {
          this.eventChapterMap[evt.id] = ch.number;
          break;
        }
      }
    }
  }

  _init() {
    const rect = this.container.getBoundingClientRect();
    const width = rect.width || 800;
    const height = rect.height || 600;
    this._width = width;
    this._height = height;

    this.svg = d3.select(this.container)
      .append('svg')
      .attr('class', 'map-svg')
      .attr('width', width)
      .attr('height', height)
      .style('display', 'block');

    this.g = this.svg.append('g').attr('class', 'map-main-group');

    // AlbersUsa projection for continental US + Alaska + Hawaii
    this.projection = d3.geoAlbersUsa()
      .scale(Math.min(width, height) * 1.6)
      .translate([width / 2, height / 2]);

    this.path = d3.geoPath().projection(this.projection);

    // Zoom
    this.zoom = d3.zoom()
      .scaleExtent([0.5, 8])
      .on('zoom', (event) => {
        this.g.attr('transform', event.transform);
        const newScale = event.transform.k;
        if (Math.abs(newScale - this.currentZoomScale) > 0.3) {
          this.currentZoomScale = newScale;
          this._updateVisibilityForZoom();
        }
      });
    this.svg.call(this.zoom);

    // Render layers
    this._renderStates();
    this._renderCities();
    this._renderEvents();
    this._renderCharacters();

    this.setChapter(1);

    // ResizeObserver
    this._resizeObserver = new ResizeObserver(() => {
      const r = this.container.getBoundingClientRect();
      const newW = Math.round(r.width);
      const newH = Math.round(r.height);
      if (newW && newH && (newW !== this._width || newH !== this._height)) {
        this.resize();
      }
    });
    this._resizeObserver.observe(this.container);
  }

  // ═══ LAYER 1: State outlines + territory coloring ═══
  _renderStates() {
    const topoData = this.mapData['us-states-topo'];
    if (!topoData) return;

    // Convert TopoJSON to GeoJSON
    const statesGeo = topojson.feature(topoData, topoData.objects.states);

    this.stateGroup = this.g.append('g').attr('class', 'map-states');

    this.stateGroup.selectAll('path')
      .data(statesGeo.features)
      .join('path')
      .attr('d', this.path)
      .attr('class', 'map-state')
      .attr('fill', COLORS.state.fill)
      .attr('stroke', COLORS.state.stroke)
      .attr('stroke-width', 0.5)
      .each((d, i, nodes) => {
        const fips = d.id;
        const name = FIPS_TO_STATE[fips] || d.properties?.name;
        if (name) {
          this.statePathMap[name] = d3.select(nodes[i]);
        }
      });

    // Territory labels group
    this.territoryLabelGroup = this.g.append('g').attr('class', 'map-territory-labels');
  }

  // ═══ LAYER 2: City markers ═══
  _renderCities() {
    const locations = this.mapData.locations || [];
    if (!locations.length) return;

    this.cityGroup = this.g.append('g').attr('class', 'map-cities');
    this.cityElements = [];

    for (const loc of locations) {
      const pt = this.projection(loc.coords);
      if (!pt) continue; // Off projection (e.g., overseas locations for geoAlbersUsa)

      const isCapital = loc.type === 'capital';
      const isBattlefield = loc.type === 'battlefield';
      const isLandmark = loc.type === 'landmark';
      const typeKey = isCapital ? 'capital' : isBattlefield ? 'battlefield' : isLandmark ? 'landmark' : 'city';
      const palette = COLORS[typeKey];
      const r = isCapital ? 5 : isBattlefield ? 3 : 3.5;

      const group = this.cityGroup.append('g')
        .attr('class', `city-marker city-${loc.type}`)
        .attr('transform', `translate(${pt[0]}, ${pt[1]})`)
        .style('cursor', 'pointer');

      // Hit area — keep ≤ 2× visual radius (Lesson 5)
      group.append('circle')
        .attr('r', isCapital ? 8 : 5)
        .attr('fill', 'transparent')
        .attr('class', 'city-hitarea');

      // Marker shape
      if (isBattlefield) {
        const s = r;
        group.append('path')
          .attr('d', `M0,-${s} L${s},0 L0,${s} L-${s},0 Z`)
          .attr('fill', palette.fill)
          .attr('stroke', palette.stroke)
          .attr('stroke-width', 1);
      } else {
        if (isCapital) {
          group.append('circle')
            .attr('r', r + 3)
            .attr('fill', 'none')
            .attr('stroke', COLORS.capital.glow)
            .attr('stroke-width', 1);
        }
        group.append('circle')
          .attr('r', r)
          .attr('fill', palette.fill)
          .attr('stroke', palette.stroke)
          .attr('stroke-width', isCapital ? 1.5 : 1);
      }

      // Label — hidden by default for non-capitals
      // pointer-events:none so label bbox doesn't extend group hit area
      const label = group.append('text')
        .attr('class', isCapital ? 'city-label-capital' : 'city-label-detail')
        .attr('x', 0)
        .attr('y', -(r + 5))
        .attr('text-anchor', 'middle')
        .attr('fill', palette.label)
        .attr('font-size', isCapital ? 11 : 9)
        .attr('font-weight', isCapital ? 700 : 400)
        .attr('opacity', isCapital ? 1 : 0)
        .style('pointer-events', 'none')
        .text(loc.name);

      // Hover
      group.on('mouseenter', () => {
        label.attr('opacity', 1);
        group.select('circle:not(.city-hitarea)').attr('r', r + 1.5);
      });
      group.on('mouseleave', () => {
        if (!isCapital) label.attr('opacity', 0);
        group.select('circle:not(.city-hitarea)').attr('r', r);
      });

      this.cityElements.push({ loc, group, label, isCapital });
    }
  }

  // ═══ LAYER 3: Event markers ═══
  _renderEvents() {
    this.eventGroup = this.g.append('g').attr('class', 'map-events');
    this.eventMarkers = [];

    // Map events to locations based on the location field in event data
    // For US history, we derive location from event name or add a location field
    const allEvents = Object.values(this.events);
    const eventLocationMap = this._buildEventLocationMap();

    for (const evt of allEvents) {
      const locId = eventLocationMap[evt.id];
      if (!locId) continue;
      const loc = this.locationMap[locId];
      if (!loc) continue;

      const pt = this.projection(loc.coords);
      if (!pt) continue;

      const isMajor = evt.importance === 'major';
      const evtPalette = isMajor ? COLORS.eventMajor : COLORS.eventMinor;
      const chapterNum = this.eventChapterMap[evt.id];

      const group = this.eventGroup.append('g')
        .attr('class', 'map-event-marker')
        .attr('transform', `translate(${pt[0]}, ${pt[1]})`)
        .attr('opacity', 0)
        .style('cursor', 'pointer')
        .style('pointer-events', 'none');

      // Pulse ring for major events
      if (isMajor) {
        group.append('circle')
          .attr('class', 'event-pulse-ring')
          .attr('r', 8)
          .attr('fill', 'none')
          .attr('stroke', COLORS.eventMajor.pulse)
          .attr('stroke-width', 1)
          .attr('opacity', 0);
      }

      // Hit area — keep ≤ 2× visual radius
      group.append('circle')
        .attr('r', isMajor ? 8 : 6)
        .attr('fill', 'transparent')
        .attr('class', 'event-hitarea');

      // Event dot
      group.append('circle')
        .attr('r', isMajor ? 4.5 : 3)
        .attr('fill', evtPalette.fill)
        .attr('stroke', evtPalette.stroke)
        .attr('stroke-width', 0.8);

      // Event name label — hover-only
      // pointer-events:none so label bbox doesn't extend group hit area
      const eventLabel = group.append('text')
        .attr('class', 'event-name-label')
        .attr('x', 7)
        .attr('y', 3)
        .attr('fill', evtPalette.label)
        .attr('font-size', isMajor ? 10 : 8)
        .attr('font-weight', isMajor ? 700 : 400)
        .attr('opacity', 0)
        .style('pointer-events', 'none')
        .text(evt.name);

      group.on('mouseenter', () => { eventLabel.attr('opacity', 1); });
      group.on('mouseleave', () => { eventLabel.attr('opacity', 0); });

      group.on('click', () => {
        if (this.onEventClick) this.onEventClick(evt);
      });

      this.eventMarkers.push({
        chapterNum,
        element: group,
        event: evt,
        label: eventLabel,
        isMajor,
      });
    }
  }

  _buildEventLocationMap() {
    // Map event IDs to location IDs based on known associations
    return {
      'boston-tea-party': 'boston',
      'declaration-of-independence': 'philadelphia',
      'battle-of-yorktown': 'yorktown',
      'constitutional-convention': 'philadelphia',
      'washington-inauguration': 'washington-dc',
      'louisiana-purchase': 'new-orleans',
      'war-of-1812': 'washington-dc',
      'trail-of-tears': 'hermitage',
      'mexican-american-war': 'mexico-city',
      'california-gold-rush': 'sacramento',
      'fort-sumter': 'fort-sumter',
      'emancipation-proclamation': 'washington-dc',
      'gettysburg': 'gettysburg',
      'lincoln-assassination': 'washington-dc',
      'transcontinental-railroad': 'promontory-summit',
      'spanish-american-war': 'new-york',
      'us-enters-ww1': 'washington-dc',
      'great-depression': 'new-york',
      'pearl-harbor': 'pearl-harbor',
      'd-day': 'washington-dc',
      'korean-war': 'washington-dc',
      'cuban-missile-crisis': 'washington-dc',
      'i-have-a-dream': 'washington-dc',
      'civil-rights-act': 'washington-dc',
      'vietnam-war': 'washington-dc',
      'moon-landing': 'cape-canaveral',
      'missouri-compromise': 'washington-dc',
      'nullification-crisis': 'charleston',
      'seneca-falls': 'seneca-falls',
      'compromise-1850': 'washington-dc',
      'underground-railroad': 'rochester',
      'kansas-nebraska': 'kansas-territory',
      'dred-scott': 'washington-dc',
      'harpers-ferry': 'harpers-ferry',
      'stamp-act': 'boston',
      '14th-amendment': 'washington-dc',
      'chinese-exclusion': 'san-francisco',
      'plessy-v-ferguson': 'new-orleans',
      'statue-of-liberty': 'new-york',
      'ellis-island': 'ellis-island',
      'homestead-strike': 'pittsburgh',
      'womens-suffrage': 'nashville',
      'new-deal': 'washington-dc',
      'truman-doctrine': 'washington-dc',
      'brown-v-board': 'topeka',
      'montgomery-boycott': 'montgomery',
      'little-rock': 'little-rock',
      'voting-rights-act': 'selma',
      'watergate': 'washington-dc',
    };
  }

  // ═══ LAYER 4: Character markers ═══
  _renderCharacters() {
    this.characterGroup = this.g.append('g').attr('class', 'map-characters');
    this.characterMarkers = [];

    const charLocations = this.mapData['character-locations'] || {};

    for (const [charId, movements] of Object.entries(charLocations)) {
      const char = this.characters[charId];
      if (!char) continue;

      const group = this.characterGroup.append('g')
        .attr('class', `map-char-avatar map-char-${charId}`)
        .attr('opacity', 0)
        .style('cursor', 'pointer')
        .style('pointer-events', 'none');

      const r = 8;
      group.append('circle')
        .attr('r', r)
        .attr('fill', char.color)
        .attr('opacity', 0.25)
        .attr('stroke', char.color)
        .attr('stroke-width', 1.5);

      group.append('text')
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .attr('fill', '#fff')
        .attr('font-size', 9)
        .attr('font-weight', 700)
        .style('pointer-events', 'none')
        .text(char.name.charAt(0));

      // Name label — hover-only
      // pointer-events:none so label bbox doesn't extend group hit area
      const nameLabel = group.append('text')
        .attr('class', 'char-name-label')
        .attr('y', r + 12)
        .attr('text-anchor', 'middle')
        .attr('fill', char.color)
        .attr('font-size', 8)
        .attr('font-weight', 600)
        .attr('opacity', 0)
        .style('pointer-events', 'none')
        .text(char.name);

      group.on('mouseenter', () => { nameLabel.attr('opacity', 1); });
      group.on('mouseleave', () => { nameLabel.attr('opacity', 0); });
      group.on('click', () => {
        if (this.onCharacterClick) this.onCharacterClick(char);
      });

      this.characterMarkers.push({
        id: charId,
        movements,
        element: group,
        char,
        nameLabel,
      });
    }

    // Cluster group
    this.clusterGroup = this.characterGroup.append('g').attr('class', 'map-clusters');
  }

  // ═══ TIME CONTROL ═══
  setChapter(chapterNum) {
    this.currentChapterNum = chapterNum;
    this._updateTerritories();
    this._updateEvents();
    this._updateCharacters();
  }

  _updateTerritories() {
    const ch = this.currentChapterNum;
    const territories = this.mapData.territories || [];

    // Find applicable territories for this chapter
    const stateColorMap = {};
    for (const terr of territories) {
      if (ch >= terr.chapters[0] && ch <= terr.chapters[1]) {
        for (const state of terr.states) {
          stateColorMap[state] = terr.color;
        }
      }
    }

    // Color states
    for (const [name, pathEl] of Object.entries(this.statePathMap)) {
      const color = stateColorMap[name];
      pathEl.transition()
        .duration(600)
        .attr('fill', color ? `${color}18` : COLORS.state.fill)
        .attr('stroke', color ? `${color}40` : COLORS.state.stroke);
    }
  }

  _updateEvents() {
    const ch = this.currentChapterNum;

    for (const m of this.eventMarkers) {
      const visible = m.chapterNum === ch;
      m.element
        .style('pointer-events', visible ? 'auto' : 'none')
        .transition()
        .duration(400)
        .attr('opacity', visible ? 1 : 0);

      const pulse = m.element.select('.event-pulse-ring');
      if (visible) {
        if (!pulse.empty()) pulse.attr('opacity', 0.6);
      } else {
        if (!pulse.empty()) pulse.attr('opacity', 0);
      }
      // Labels only on hover
      m.label.attr('opacity', 0);
    }
  }

  _updateCharacters() {
    const ch = this.currentChapterNum;

    // 1. Group active characters by location
    const locationGroups = {};

    for (const m of this.characterMarkers) {
      const movement = m.movements.find(
        mv => ch >= mv.chapters[0] && ch <= mv.chapters[1]
      );
      if (!movement) {
        m.element.style('pointer-events', 'none').transition().duration(400).attr('opacity', 0);
        continue;
      }
      const loc = this.locationMap[movement.location];
      if (!loc) {
        m.element.style('pointer-events', 'none').transition().duration(400).attr('opacity', 0);
        continue;
      }

      if (!locationGroups[movement.location]) {
        locationGroups[movement.location] = [];
      }
      locationGroups[movement.location].push(m);
    }

    // 2. Clear old clusters
    this.clusterGroup.selectAll('*').remove();

    // 3. Position
    const CLUSTER_THRESHOLD = 3;

    for (const [locId, markers] of Object.entries(locationGroups)) {
      const loc = this.locationMap[locId];
      if (!loc) continue;
      const basePt = this.projection(loc.coords);
      if (!basePt) continue;

      const count = markers.length;
      const baseY = basePt[1] + 18;

      if (count > CLUSTER_THRESHOLD) {
        for (const m of markers) {
          m.element.style('pointer-events', 'none').transition().duration(300).attr('opacity', 0);
        }
        this._createCluster(basePt[0], baseY, markers, loc);
      } else {
        const spacing = 22;
        for (let i = 0; i < count; i++) {
          const m = markers[i];
          const offsetX = (i - (count - 1) / 2) * spacing;
          m.element
            .style('pointer-events', 'auto')
            .transition()
            .duration(600)
            .ease(d3.easeCubicInOut)
            .attr('transform', `translate(${basePt[0] + offsetX}, ${baseY})`)
            .attr('opacity', 1);
        }
      }
    }
  }

  _createCluster(x, y, markers, loc) {
    const count = markers.length;
    const self = this;

    const clusterG = this.clusterGroup.append('g')
      .attr('transform', `translate(${x}, ${y})`)
      .style('cursor', 'pointer');

    clusterG.on('mousedown.zoom touchstart.zoom', (e) => {
      e.stopPropagation();
    });

    const r = 16;
    clusterG.append('circle')
      .attr('r', r)
      .attr('fill', COLORS.cluster.fill)
      .attr('stroke', COLORS.cluster.stroke)
      .attr('stroke-width', 1.5);

    clusterG.append('text')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('fill', COLORS.cluster.text)
      .attr('font-size', 12)
      .attr('font-weight', 700)
      .style('pointer-events', 'none')
      .text(count);

    clusterG.append('text')
      .attr('y', r + 12)
      .attr('text-anchor', 'middle')
      .attr('fill', COLORS.cluster.text)
      .attr('font-size', 7)
      .attr('opacity', 0.6)
      .style('pointer-events', 'none')
      .text('点击展开');

    let expanded = false;

    clusterG.on('click', (event) => {
      event.stopPropagation();
      if (expanded) {
        expanded = false;
        collapseCluster();
      } else {
        expanded = true;
        expandCluster();
      }
    });

    const names = markers.map(m => m.char.name).join(', ');
    clusterG.append('title').text(`${loc.name}: ${names}`);

    function expandCluster() {
      clusterG.select('text:last-of-type').attr('opacity', 0);
      const ringR = 32 + count * 4;
      const angleStep = (Math.PI * 2) / count;

      for (let i = 0; i < count; i++) {
        const m = markers[i];
        const angle = angleStep * i - Math.PI / 2;
        const cx = Math.cos(angle) * ringR;
        const cy = Math.sin(angle) * ringR;

        const avatar = clusterG.append('g')
          .attr('class', 'cluster-expanded-avatar')
          .attr('transform', 'translate(0, 0)')
          .attr('opacity', 0)
          .style('cursor', 'pointer');

        avatar.on('mousedown.zoom touchstart.zoom', (e) => {
          e.stopPropagation();
        });

        avatar.append('circle')
          .attr('r', 12)
          .attr('fill', m.char.color)
          .attr('opacity', 0.3)
          .attr('stroke', m.char.color)
          .attr('stroke-width', 1.5);

        avatar.append('text')
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'central')
          .attr('fill', '#fff')
          .attr('font-size', 10)
          .attr('font-weight', 700)
          .style('pointer-events', 'none')
          .text(m.char.name.charAt(0));

        avatar.append('text')
          .attr('y', 20)
          .attr('text-anchor', 'middle')
          .attr('fill', m.char.color)
          .attr('font-size', 9)
          .attr('font-weight', 600)
          .style('pointer-events', 'none')
          .text(m.char.name);

        avatar.on('click', (e) => {
          e.stopPropagation();
          if (self.onCharacterClick) self.onCharacterClick(m.char);
        });

        avatar.transition()
          .duration(400)
          .delay(i * 40)
          .ease(d3.easeCubicOut)
          .attr('transform', `translate(${cx}, ${cy})`)
          .attr('opacity', 1);
      }
    }

    function collapseCluster() {
      clusterG.select('text:last-of-type').attr('opacity', 0.6);
      clusterG.selectAll('.cluster-expanded-avatar')
        .transition()
        .duration(300)
        .attr('transform', 'translate(0, 0)')
        .attr('opacity', 0)
        .remove();
    }
  }

  // ═══ ZOOM-BASED PROGRESSIVE DISCLOSURE ═══
  _updateVisibilityForZoom() {
    const scale = this.currentZoomScale;
    const detailVisible = scale >= 1.5;

    this.g.selectAll('.city-city, .city-battlefield, .city-landmark')
      .style('pointer-events', detailVisible ? 'auto' : 'none')
      .transition()
      .duration(200)
      .attr('opacity', detailVisible ? 1 : 0);

    this.g.selectAll('.city-capital').attr('opacity', 1);
  }

  // ═══ LAYER VISIBILITY ═══
  // Key lesson: setting pointer-events:none on a parent <g> does NOT override
  // children that have their own inline pointer-events:auto. We must use
  // visibility:hidden which truly prevents all interaction and rendering.
  setLayerVisibility(layer, visible) {
    this.layerVisibility[layer] = visible;

    if (layer === 'territories') {
      const groups = [this.stateGroup, this.territoryLabelGroup];
      for (const g of groups) {
        if (!g) continue;
        g.transition().duration(300).style('opacity', visible ? 1 : 0)
          .on('end', () => {
            if (!visible) g.style('visibility', 'hidden');
          });
        if (visible) g.style('visibility', 'visible');
      }
      return;
    }

    const groupMap = {
      cities: this.cityGroup,
      events: this.eventGroup,
      characters: this.characterGroup,
    };
    const group = groupMap[layer];
    if (group) {
      if (visible) {
        // Restore visibility first so transition is visible
        group.style('visibility', 'visible');
        group.transition().duration(300).style('opacity', 1);
      } else {
        // Fade out, then set visibility:hidden to block ALL pointer events
        group.transition().duration(300).style('opacity', 0)
          .on('end', () => {
            group.style('visibility', 'hidden');
          });
      }
    }
  }

  // ═══ NAVIGATION ═══
  resetZoom() {
    this.svg.transition()
      .duration(800)
      .ease(d3.easeCubicInOut)
      .call(this.zoom.transform, d3.zoomIdentity);
  }

  resize() {
    const rect = this.container.getBoundingClientRect();
    const w = rect.width || 800;
    const h = rect.height || 600;
    this._width = w;
    this._height = h;

    this.svg.attr('width', w).attr('height', h);

    this.projection = d3.geoAlbersUsa()
      .scale(Math.min(w, h) * 1.6)
      .translate([w / 2, h / 2]);
    this.path = d3.geoPath().projection(this.projection);

    this.g.selectAll('*').remove();
    this.statePathMap = {};
    this.eventMarkers = [];
    this.characterMarkers = [];

    this._renderStates();
    this._renderCities();
    this._renderEvents();
    this._renderCharacters();
    this.setChapter(this.currentChapterNum);
  }

  destroy() {
    if (this._resizeObserver) this._resizeObserver.disconnect();
    if (this.svg) this.svg.remove();
  }
}
