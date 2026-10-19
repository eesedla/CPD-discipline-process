/* The discipline-flow scrolly engine.
 *
 * This lives in its own file on purpose. Pasted into a CMS as inline
 * script it kept arriving corrupted -- "Uncaught SyntaxError: Invalid or
 * unexpected token" -- because post content gets filtered, texturised and
 * re-encoded on its way to the page, and one bad character anywhere kills
 * the whole script. A src attribute is not content, so nothing rewrites
 * it. The markup and the stylesheet stay inline in the post, so the text
 * is still part of the article for search and Discover.
 */
// If anything in here throws, the beats would stay hidden and the page
// would look empty. Dropping the js class hands it back to the plain,
// fully visible rendering instead.
// Tell the watchdog in the page that the engine parsed and is running.
// If it was deferred past the watchdog's deadline the class has already
// been dropped, so put it back and carry on animating.
(function () {

// Loaded twice -- the post still carries its own script tag and the site
// enqueues the file as well, say -- would build every connector a second
// time on top of the first. Once is enough.
if (window.vizFlowStarted) { return; }

window.vizFlowStarted = true;
document.documentElement.classList.add('viz-js');

function vizFlowStart() {
try {

  // position: sticky quietly stops working if ANY ancestor between the
  // pinned element and the scrollport has overflow set to anything but
  // visible. Themes routinely put overflow-x: hidden on a page wrapper to
  // stop sideways scroll, and that is enough to kill every pinned panel
  // below it -- the stages then scroll straight past instead of holding
  // while their beats build.
  //
  // Walk up from the explainer and open up only the ancestors that
  // actually have it set. Nothing else on the page is touched, and an
  // ancestor that was already visible is left alone.
  (function freeStickyAncestors() {
    var root = document.querySelector('.viz-container');
    if (!root) { return; }
    for (var n = root.parentElement; n && n !== document.documentElement; n = n.parentElement) {
      var o = window.getComputedStyle(n);
      if (o.overflowX !== 'visible' || o.overflowY !== 'visible') {
        n.style.setProperty('overflow', 'visible', 'important');
      }
    }
  })();

  // Draws the short elbow where each box in 'boxContainer' merges toward
  // center inside 'wrap', and returns a function that "draws" them in
  // (animates stroke-dashoffset to 0). Used for the entry phase, where
  // four boxes merge into one path forward. The continuous trunk line
  // that carries on from here down to the next phase is handled
  // separately, in the 'trunks' loop below -- this is just the merge.
  // Where each investigation track sits, as an x offset from the centre
  // of the sticky stack. Both the merge elbows and the trunks aim at
  // these, so the lines stay glued to the boxes at any width. When the
  // pair wraps (narrow screens) both offsets collapse to ~0 and the two
  // trunks fall back onto the single centre line.
  function splitTargets() {
    const grid = document.querySelector('.investigation-grid');
    if (!grid) return null;
    const stack = grid.closest('.beat-stack');
    if (!stack) return null;
    const stackRect = stack.getBoundingClientRect();
    const centerX = stackRect.left + stackRect.width / 2;
    const targets = {};
    grid.querySelectorAll('.main-box[data-route]').forEach((box) => {
      const r = box.getBoundingClientRect();
      targets[box.dataset.route] = r.left + r.width / 2 - centerX;
    });

    // A track fed by a single source runs straight down instead of jogging
    // across to the middle of its box: the line stays under that source and
    // lands wherever on the box it falls, clamped to stay inside the edges.
    const sources = {};
    document.querySelectorAll('.entry-grid .entry-box[data-route]').forEach((el) => {
      (sources[el.dataset.route] = sources[el.dataset.route] || []).push(el);
    });
    const label = stack.querySelector(':scope > .phase-label');
    const labelRect = label && label.getBoundingClientRect();
    Object.keys(sources).forEach((route) => {
      const box = grid.querySelector('.main-box[data-route="' + route + '"]');
      if (sources[route].length !== 1 || !box) return;
      const r = box.getBoundingClientRect();
      const src = sources[route][0].getBoundingClientRect();
      const inset = 20;
      let x = Math.max(
        r.left + inset,
        Math.min(r.right - inset, src.left + src.width / 2)
      );

      // Once the entry boxes wrap, this source sits near the middle of the
      // page and its line comes down on top of the next stage's label. Slide
      // it along the box, away from the centre, until it is clear -- staying
      // inside the box, which is why it lands off centre rather than in the
      // middle of it.
      // Not on a phone: there the tracks collapse onto the one centre line
      // and the second trunk is hidden, so nudging this one aside would
      // only leave a stub pointing at nothing.
      if (!isNarrow() && labelRect
          && x > labelRect.left - 14 && x < labelRect.right + 14) {
        const right = labelRect.right + 14;
        const left = labelRect.left - 14;
        if (right <= r.right - inset) x = right;
        else if (left >= r.left + inset) x = left;
      }
      targets[route] = x - centerX;
    });
    return targets;
  }

  function buildConvergence(wrap, boxContainer) {
    const svg = wrap.querySelector('svg');
    const ns = 'http://www.w3.org/2000/svg';
    let paths = [];
    let revealed = false;

    function layout() {
      svg.innerHTML = '';
      paths = [];
      const boxes = Array.from(boxContainer.children);
      const gridRect = boxContainer.getBoundingClientRect();
      const wrapRect = wrap.getBoundingClientRect();
      const width = gridRect.width || 1;
      const mergeHeight = 26;

      // The entry boxes sit on one row on a wide screen but wrap below
      // about 940px, and a wrapped box lands directly under one that did
      // not wrap. So each box's line has to start at its own bottom edge
      // and turn at a bar belonging to its own row -- drawing every line
      // from a single y below the whole grid leaves the upper row's boxes
      // with no visible riser and makes the wrapped box look as though it
      // feeds the merge the others share.
      // Group the boxes into rows. The grid centres each row, so boxes
      // sharing a row have different tops and bottoms when their text runs
      // to a different number of lines -- their centres are what match.
      const rows = [];
      boxes.forEach((box) => {
        const r = box.getBoundingClientRect();
        const mid = r.top + r.height / 2;
        let row = rows.find((v) => Math.abs(v.mid - mid) < 4);
        if (!row) rows.push((row = { mid, top: r.top, bottom: r.bottom }));
        row.top = Math.min(row.top, r.top);
        row.bottom = Math.max(row.bottom, r.bottom);
      });
      rows.sort((a, b) => a.mid - b.mid);

      // A phone stacks the boxes one per row. There each line would run
      // from its own bottom edge straight down through every box below it,
      // so they all start together under the last one instead.
      const stacked = boxes.length > 1 && rows.length === boxes.length;

      function rowFor(boxRect) {
        if (stacked) return rows[rows.length - 1];
        const mid = boxRect.top + boxRect.height / 2;
        return rows.find((v) => Math.abs(v.mid - mid) < 4) || rows[rows.length - 1];
      }

      // How far below a row its bar sits: the full merge height for the
      // last row, otherwise half way into the gap before the next row, so
      // the bar never lands on the boxes that wrapped underneath it.
      function dropFor(row) {
        const next = rows[rows.indexOf(row) + 1];
        if (!next) return mergeHeight;
        return Math.max(8, Math.min(mergeHeight, (next.top - row.bottom) / 2));
      }

      // The svg spans the grid as well as the merge below it, and is taken
      // out of the flow so that extra height changes nothing: the wrap
      // keeps the 26px the merge alone used to occupy.
      //
      // It has to reach the WRAP's bottom, not just the merge height: the
      // trunk that carries on downward is positioned from the wrap, and the
      // stack's own gap sits between the two. Stopping short of it leaves
      // that gap as a visible break in the middle of the line.
      const top = gridRect.top;
      const height = Math.max(gridRect.height + mergeHeight,
                              wrapRect.bottom - gridRect.top);
      svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
      svg.style.height = height + 'px';
      svg.style.width = width + 'px';
      svg.style.left = (gridRect.left - wrapRect.left) + 'px';
      svg.style.top = (top - wrapRect.top) + 'px';

      const centerX = width / 2;
      const targets = splitTargets();

      boxes.forEach((box) => {
        const boxRect = box.getBoundingClientRect();
        const boxCenterX = boxRect.left + boxRect.width / 2 - gridRect.left;
        const row = rowFor(boxRect);
        const startY = (stacked ? gridRect.bottom : boxRect.bottom) - top;
        const barY = row.bottom - top + dropFor(row);
        const route = box.dataset.route;
        const endX = centerX + ((targets && route && targets[route]) || 0);
        const p = document.createElementNS(ns, 'path');
        // Down from the box, across on its row's bar, then down to the
        // trunk. On a single row the last leg has no length, so this draws
        // exactly what it always did.
        p.setAttribute('d', 'M ' + boxCenterX + ' ' + startY
          + ' L ' + boxCenterX + ' ' + barY
          + ' L ' + endX + ' ' + barY
          + ' L ' + endX + ' ' + height);
        p.setAttribute('class', 'merge-path');
        svg.appendChild(p);
        paths.push(p);
      });

      paths.forEach((p) => {
        const len = p.getTotalLength();
        p.style.strokeDasharray = len;
        p.style.strokeDashoffset = revealed ? 0 : len;
      });
    }

    layout();

    const reveal = (on) => {
      if (on === revealed) return;
      revealed = on;
      paths.forEach((p) => {
        p.style.strokeDashoffset = on ? 0 : p.getTotalLength();
      });
    };
    reveal.layout = layout;
    return reveal;
  }

  // Each .phase is much taller than the viewport. Its .beat-stack sticks
  // to the middle of the screen once reached and stays there while the
  // phase's remaining height scrolls underneath it. Because the beats
  // stop moving once stuck, we can't rely on IntersectionObserver (it
  // only fires when a target's position relative to the viewport
  // changes) -- instead we track how far the reader has scrolled through
  // each phase and reveal one beat per step of that progress. Once
  // revealed, a beat stays visible, so by the final step all of a
  // phase's beats sit stacked together in the center.
  function isNarrow() { return window.innerWidth <= 640; }

  // Some elements are a beat on one screen size only: a phone stacks the
  // investigation columns, so each column takes its own turn there, while a
  // wide screen reveals the grid as a whole. data-fade says which, and the
  // fade class is set to match before any beats are collected.
  document.querySelectorAll('[data-fade]').forEach((el) => {
    el.classList.toggle('fade', (el.dataset.fade === 'narrow') === isNarrow());
  });

  // How much scroll each beat is worth. A phone screen is short, so the
  // desktop allowance of 55vh a beat means better than half a screen of
  // scrolling before anything moves -- the whole stage runs five screens
  // long and the boxes arrive late. Narrow screens get a tighter pace.
  function beatHeight(count) {
    const narrow = isNarrow();
    const perBeat = narrow ? 28 : 55;
    const tail = narrow ? 45 : 60;
    return (count * perBeat + tail) + 'vh';
  }

  // Collected so layoutAll can re-measure them with the .fade transforms
  // neutralised -- these read each box's own bottom edge, which a part-played
  // reveal would otherwise shift.
  const convergences = [];

  const phases = Array.from(document.querySelectorAll('.phase')).map((phase) => {
    const label = phase.querySelector(':scope > .beat-stack > .phase-label');
    const lead = phase.querySelector(':scope > .beat-stack > .phase-lead');
    const boxContainer = phase.querySelector('.entry-grid, .phase-body');
    // A .fade is a beat unless it sits inside another .fade, which keeps a
    // revealed block from being split into beats by accident; .beat--nested
    // opts one back in. Beats then run in markup order, unless they carry
    // data-beat-order -- needed where the markup cannot express the order,
    // as with copy nested in an earlier block that should reveal later.
    const boxItems = boxContainer
      ? Array.from(boxContainer.querySelectorAll('.fade')).filter((el) =>
          !el.parentElement.closest('.fade') || el.classList.contains('beat--nested'))
      : [];
    if (boxItems.some((el) => el.dataset.beatOrder)) {
      boxItems.sort((a, b) =>
        Number(a.dataset.beatOrder || 0) - Number(b.dataset.beatOrder || 0));
    }

    const beats = [];
    if (label) beats.push([label]);
    if (lead) beats.push([lead]);
    // Each box is its own beat, so within a phase they build one at a
    // time along with the scroll rather than popping in as a group.
    boxItems.forEach((item) => beats.push([item]));

    // Once every box in the phase is built, one more beat draws in the
    // trunk line leading out of this phase (see layoutTrunks below).
    const trunkState = { active: false, start: null, pieces: null };

    // Transient beats: each shows on its own step, then fades out again as
    // the next beat lands (see update). They stack in the same slot between
    // the entry boxes and the merge, so they hand off one to the next and
    // the last one clears as the merge lines start drawing.
    phase.querySelectorAll(':scope > .beat-stack > .merge-svg-wrap > .phase-transient')
      .forEach((caption) => beats.push([caption]));

    const mergeSvgWrap = phase.querySelector(':scope > .beat-stack > .merge-svg-wrap');
    if (mergeSvgWrap && boxContainer) {
      const revealConvergence = buildConvergence(mergeSvgWrap, boxContainer);
      convergences.push(revealConvergence);
      trunkState.start = mergeSvgWrap;
      beats.push([(on) => {
        revealConvergence(on);
        trunkState.active = on;
        if (!on) return;
        // The trunks draw straight into the investigation boxes, so land the
        // whole arrival on this beat -- heading, lead and boxes -- instead of
        // letting it wait for its own stage to start. Otherwise the lines
        // arrive at nothing, and the heading turns up after the boxes it
        // introduces.
        const landing = document.querySelector('.investigation-grid');
        if (landing) {
          const landingStack = landing.closest('.beat-stack');
          if (landingStack) {
            landingStack
              .querySelectorAll(':scope > .phase-label, :scope > .phase-lead')
              .forEach((el) => el.classList.add('is-visible'));
          }
          landing.classList.add('is-visible');
        }
      }]);
    } else {
      // The line leaves from under whatever in the phase body sits on the
      // center line -- the main box, or a note/exit box stacked below it.
      if (boxContainer && phase.querySelector('.main-box')) {
        trunkState.start = boxContainer;
        beats.push([(on) => { trunkState.active = on; }]);
      }
    }

    // Give every beat its own real scroll distance, regardless of how many
    // beats this particular phase ends up with. The per-beat distance is
    // set in beatHeight() and re-applied by fitStacks, since it depends on
    // the viewport.
    phase.style.minHeight = beatHeight(beats.length);

    const stack = phase.querySelector(':scope > .beat-stack');
    return { el: phase, stack, beats, label, trunkState,
             tall: false, revealByView: false };
  });

  // One two-piece trunk per gap between phases (none after the last
  // phase) -- see the .trunk-out / .trunk-in CSS for how the pieces fit.
  // Stages taller than the screen (e.g. Corrective action, with the
  // matrix) would otherwise pin at top: 0 with their lower half hidden
  // below the fold until release. A negative sticky top lets such a stack
  // scroll until its bottom is in view, then pin there instead.
  function fitStacks() {
    // Two passes: the first can flip a stage between paced and unpaced,
    // which changes its stack height, so everything is measured again.
    for (let pass = 0; pass < 2; pass += 1) {
      phases.forEach((phaseObj) => {
        const { el, stack } = phaseObj;
        const baseMinHeight = beatHeight(phaseObj.beats.length);
        const overflow = stack.offsetHeight - window.innerHeight;
        phaseObj.tall = overflow > 0;

        // A stage that only just overflows pins almost at once, so there is
        // no travel left for reveal-by-position: every beat would fire
        // together. Such a stage can opt into paced beats instead, which
        // step through on scroll progress the way a short stage does.
        const paced = el.classList.contains('phase--paced')
          && overflow <= window.innerHeight * 0.25;
        phaseObj.revealByView = overflow > 0 && !paced;
        el.classList.toggle('is-unpaced', phaseObj.revealByView);

        stack.style.top = Math.min(0, -overflow) + 'px';
        // A stage revealing by position scrolls past as it goes, so it only
        // needs a short pinned pause at the end, not a step per beat.
        el.style.minHeight = phaseObj.revealByView
          ? (stack.offsetHeight + window.innerHeight * 0.6) + 'px'
          : baseMinHeight;
      });
    }
  }
  fitStacks();
  window.addEventListener('resize', fitStacks);
  if (document.fonts) document.fonts.ready.then(fitStacks);

  // Discipline matrix: draw the mitigating/aggravating lines once the
  // matrix beat has been revealed AND the chart is actually on screen.
  (function animateMatrix() {
    const matrix = document.querySelector('.matrix');
    if (!matrix) return;
    const svgs = Array.from(matrix.querySelectorAll('.matrix-adjust svg'));
    if (!svgs.length) return;
    const lines = svgs.reduce((all, el) =>
      all.concat(Array.from(el.querySelectorAll('.factor-line'))), []);
    const dots = svgs.map((el) => el.querySelector('.range-dot')).filter(Boolean);
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    lines.forEach((line) => {
      const length = line.getTotalLength();
      line.style.strokeDasharray = length;
      line.style.strokeDashoffset = reduceMotion ? 0 : length;
    });

    let onScreen = false;
    let done = false;
    function play() {
      if (done || !onScreen || !matrix.classList.contains('is-visible')) return;
      done = true;
      dots.forEach((dot) => { dot.style.transform = 'scale(1)'; });
      lines.forEach((line, i) => {
        const delay = reduceMotion ? 0 : 0.35 + (i % 2) * 0.18;
        line.style.transitionDelay = delay + 's';
        line.style.strokeDashoffset = '0';
        const markerId = line.getAttribute('marker-end').match(/url\(#(.+)\)/)[1];
        const arrow = matrix.querySelector('#' + markerId + ' .arrow-path');
        if (arrow) {
          arrow.style.transitionDelay = (reduceMotion ? 0 : delay + 0.75) + 's';
          arrow.style.opacity = '1';
        }
      });
    }

    new IntersectionObserver((entries) => {
      onScreen = entries[entries.length - 1].isIntersecting;
      play();
    }, { threshold: 0.3 }).observe(svgs[0]);
    svgs.slice(1).forEach((el) => {
      new IntersectionObserver((entries) => {
        if (entries[entries.length - 1].isIntersecting) { onScreen = true; play(); }
      }, { threshold: 0.3 }).observe(el);
    });
    new MutationObserver(play).observe(matrix, { attributes: true, attributeFilter: ['class'] });
  })();

  // Beats that come back off as the reader scrolls up, rather than latching
  // on for good. Revealing by position cannot sequence them (a beat and the
  // one after it land together), so there they latch like any other.
  function reversible(item) {
    return item.classList.contains('beat--transient')
      || item.classList.contains('beat--reversible');
  }

  const TRUNK_GAP = 14; // space left between the arrow's tip and the next label
  const ARROW_SVG = '<svg viewBox="0 0 16 8" fill="none"><path d="M2 0L8 8L14 0" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  // An elbow out of a stage whose flow leaves from one column: down out of
  // that column, across to the centre line, then on down to meet the next
  // stage's trunk-in. Replaces the straight .trunk-out for that gap.
  function buildExitElbow(phase, selector) {
    const stack = phase.querySelector(':scope > .beat-stack');
    const from = phase.querySelector(selector);
    const body = phase.querySelector('.phase-body');
    if (!stack || !from || !body) return null;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'exit-elbow-svg');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('class', 'exit-elbow');
    svg.appendChild(path);
    stack.appendChild(svg);

    function layout() {
      const s = stack.getBoundingClientRect();
      if (!s.width) return;
      svg.setAttribute('viewBox', '0 0 ' + s.width + ' ' + s.height);
      svg.style.width = s.width + 'px';
      svg.style.height = s.height + 'px';
      const f = from.getBoundingClientRect();
      const b = body.getBoundingClientRect();
      const x = f.left + f.width / 2 - s.left;
      const startY = f.bottom - s.top + 10;
      const turnY = b.bottom - s.top + 24;   // clear of the exit branch
      const cx = s.width / 2;
      path.setAttribute('d', 'M ' + x + ' ' + startY + ' L ' + x + ' ' + turnY
        + ' L ' + cx + ' ' + turnY + ' L ' + cx + ' ' + s.height);
      const len = path.getTotalLength();
      path.style.strokeDasharray = len;
      if (path.style.strokeDashoffset !== '0px' && path.style.strokeDashoffset !== '0') {
        path.style.strokeDashoffset = len;
      }
    }

    layout();
    return { layout, path };
  }

  const elbows = [];

  const trunks = [];
  phases.forEach((from, i) => {
    const to = phases[i + 1];
    if (!to || !from.trunkState.start || !to.label) return;
    // The gap into a split stage carries one trunk per track; every other
    // gap carries a single centred one (route === null).
    const pair = to.el.querySelector('.investigation-grid');
    const routes = pair ? ['internal', 'external'] : [null];
    const pieces = [];
    const elbowFrom = from.el.getAttribute('data-trunk-elbow');
    routes.forEach((route) => {
      const routeClass = route ? ' trunk--' + route : '';
      // A stage with an elbow exit draws its own outgoing line.
      const out = elbowFrom ? null : document.createElement('div');
      if (out) {
        out.className = 'trunk-out' + routeClass;
        out.setAttribute('aria-hidden', 'true');
      }
      const inn = document.createElement('div');
      inn.className = 'trunk-in' + routeClass;
      inn.setAttribute('aria-hidden', 'true');
      const arrow = document.createElement('div');
      arrow.className = 'trunk-arrow';
      arrow.innerHTML = ARROW_SVG;
      inn.appendChild(arrow);
      if (out) from.label.parentElement.appendChild(out);
      to.label.parentElement.appendChild(inn);
      if (out) pieces.push(out);
      pieces.push(inn);
      trunks.push({ out, inn, start: from.trunkState.start, toLabel: to.label, route, pair });
    });
    if (elbowFrom) {
      const elbow = buildExitElbow(from.el, elbowFrom);
      if (elbow) {
        elbows.push(elbow);
        pieces.push(elbow.path);
      }
    }
    from.trunkState.pieces = pieces;
  });

  // offsetTop/offsetHeight are relative to the sticky stack and ignore the
  // fade-in transforms, so these only change when the layout does.
  function trunkStartY(start) {
    if (!start.classList.contains('phase-body')) return start.offsetTop + start.offsetHeight;
    const centerX = start.parentElement.clientWidth / 2;
    let bottom = 0;
    Array.from(start.children).forEach((child) => {
      if (child.offsetLeft <= centerX && child.offsetLeft + child.offsetWidth >= centerX) {
        // Leave a little air under plain text; boxes connect flush.
        const pad = child.classList.contains('phase-note') ? 12 : 0;
        bottom = Math.max(bottom, child.offsetTop + child.offsetHeight + pad);
      }
    });
    return bottom || start.offsetTop + start.offsetHeight;
  }

  // Two connectors into the chief's box: one straight down out of the
  // internal column, one out of the external column that turns and comes in
  // from the right. Both are drawn in an SVG laid over the stage body, since
  // they cross between grid columns and the rows beneath.
  function buildChiefLinks() {
    const box = document.querySelector('.chief-box');
    const grid = document.querySelector('.investigation-grid');
    // Anchored to the stack, not the stage body: the body has to stay
    // unpositioned or it becomes the offsetParent of its children and
    // throws off trunkStartY.
    const body = box && box.closest('.beat-stack');
    if (!body || !box || !grid) return null;

    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'chief-links');
    svg.setAttribute('aria-hidden', 'true');
    body.appendChild(svg);

    let lines = [];
    let heads = [];
    let revealed = false;
    const HEAD = 8;
    const CLEAR = 8;   // gap between an arrow tip and the box it points at

    function layout() {
      const b = body.getBoundingClientRect();
      const cols = grid.querySelectorAll('.inv-col');
      svg.innerHTML = '';
      lines = [];
      heads = [];
      if (cols.length < 2 || !b.width) return;
      svg.setAttribute('viewBox', '0 0 ' + b.width + ' ' + b.height);
      svg.style.width = b.width + 'px';
      svg.style.height = b.height + 'px';

      const boxRect = box.getBoundingClientRect();
      const topY = boxRect.top - b.top;
      const boxX = boxRect.left + boxRect.width / 2 - b.left;

      function add(d, head) {
        const line = document.createElementNS(ns, 'path');
        line.setAttribute('d', d);
        line.setAttribute('class', 'chief-link');
        svg.appendChild(line);
        const len = line.getTotalLength();
        line.style.strokeDasharray = len;
        line.style.strokeDashoffset = revealed ? 0 : len;
        lines.push(line);
        if (!head) return;
        const tip = document.createElementNS(ns, 'path');
        tip.setAttribute('d', head);
        tip.setAttribute('class', 'chief-head');
        if (revealed) tip.style.opacity = 1;
        svg.appendChild(tip);
        heads.push(tip);
      }

      // Straight down out of the copy above, stopping short of the box so
      // the arrow sits clear of its edge, plus one in from the external
      // column across the gutter.
      // Measured from the internal column itself: the box's previous sibling
      // is the phone-only connector, which is hidden here and measures zero.
      const aboveY = cols[0].getBoundingClientRect().bottom - b.top;
      const rightX = boxRect.right - b.left;
      const midY = topY + boxRect.height / 2;
      const outerX = cols[1].getBoundingClientRect().left - b.left;

      const tipY = topY - CLEAR;
      add('M ' + boxX + ' ' + (aboveY + 8) + ' L ' + boxX + ' ' + tipY,
          'M ' + (boxX - HEAD) + ' ' + (tipY - HEAD) + ' L ' + boxX + ' '
            + tipY + ' L ' + (boxX + HEAD) + ' ' + (tipY - HEAD));

      const tipX = rightX + CLEAR;
      add('M ' + (outerX - 6) + ' ' + midY + ' L ' + tipX + ' ' + midY,
          'M ' + (tipX + HEAD) + ' ' + (midY - HEAD) + ' L ' + tipX + ' '
            + midY + ' L ' + (tipX + HEAD) + ' ' + (midY + HEAD));
    }

    layout();
    return {
      layout,
      // Drawn or undrawn, following the box it points at -- which stands
      // down again when the reader scrolls back above its beat.
      set(on) {
        if (on === revealed) return;
        revealed = on;
        lines.forEach((l) => {
          l.style.transitionDelay = on ? '0.15s' : '0s';
          l.style.strokeDashoffset = on ? 0 : l.getTotalLength();
        });
        heads.forEach((h) => {
          h.style.transitionDelay = on ? '0.6s' : '0s';
          h.style.opacity = on ? 1 : 0;
        });
      }
    };
  }

  const chiefLinks = buildChiefLinks();
  if (chiefLinks) {
    const box = document.querySelector('.chief-box');
    const sync = () => chiefLinks.set(box.classList.contains('is-visible'));
    new MutationObserver(sync).observe(box, { attributes: true, attributeFilter: ['class'] });
    sync();
  }

  // Park the aside directly under the internal column's copy. Everything
  // below it there -- the chief's box, the board copy opposite -- reserves
  // its space from the start but is still hidden at that point, so the
  // aside borrows the band and hands it back when it clears.
  function layoutAside() {
    const note = document.querySelector('.criminal-note');
    const anchor = document.querySelector('.criminal-anchor');
    const grid = document.querySelector('.investigation-grid');
    if (!note || !anchor || !grid) return;
    const column = grid.querySelector('.inv-col');
    const copy = column && column.querySelector('.inv-note');
    if (!copy) return;
    note.style.top = (copy.getBoundingClientRect().bottom
      - anchor.getBoundingClientRect().top + 28) + 'px';
  }

  function layoutTrunks() {
    const targets = splitTargets();
    trunks.forEach(({ out, inn, start, toLabel, route, pair }) => {
      if (out) out.style.top = trunkStartY(start) + 'px';
      if (route && targets && pair && !isNarrow()) {
        // Offset onto the track, and carry the line down past the centred
        // label to the top of the box row it feeds.
        const dx = targets[route] || 0;
        if (out) out.style.left = 'calc(50% + ' + dx + 'px)';
        inn.style.left = 'calc(50% + ' + dx + 'px)';
        inn.style.height = Math.max(pair.offsetTop - TRUNK_GAP, 0) + 'px';
      } else {
        // Centred, and stopping above the heading rather than running on
        // past it to the boxes.
        if (out) out.style.left = '';
        inn.style.left = '';
        inn.style.height = Math.max(toLabel.offsetTop - TRUNK_GAP, 0) + 'px';
      }
    });
  }
  function layoutAll() {
    // Measure against the settled layout, not the pre-reveal offsets.
    const root = document.documentElement;
    root.classList.add('viz-measuring');
    try {
      layoutTrunks();
      layoutAside();
      if (chiefLinks) chiefLinks.layout();
      elbows.forEach((e) => e.layout());
      convergences.forEach((c) => c.layout());
    } finally {
      root.classList.remove('viz-measuring');
    }
  }
  layoutAll();
  window.addEventListener('resize', layoutAll);
  if (document.fonts) document.fonts.ready.then(layoutAll);

  let ticking = false;
  function requestUpdate() {
    if (!ticking) {
      requestAnimationFrame(update);
      ticking = true;
    }
  }

  function update() {
    ticking = false;

    phases.forEach((phaseObj) => {
      const { el, beats } = phaseObj;
      const rect = el.getBoundingClientRect();
      const scrollableRange = Math.max(rect.height - window.innerHeight, 1);
      const progress = Math.min(Math.max(-rect.top / scrollableRange, 0), 1);
      const stepSize = 1 / beats.length;

      phaseObj.progress = progress;

      // A stage much taller than the screen scrolls through before pinning,
      // so step-by-progress would reveal beats that are already off screen.
      // Instead, reveal each beat as it scrolls into view; the trunk beat
      // (a function) fires once the bottom of the stack is on screen.
      const inView = (group) => {
        const item = group[0];
        if (typeof item === 'function') {
          return phaseObj.stack.getBoundingClientRect().bottom <= window.innerHeight + 2;
        }
        return item.getBoundingClientRect().top < window.innerHeight * 0.85;
      };

      // Resolve every beat first: a transient beat needs to know whether
      // the beat after it has landed yet.
      const met = beats.map((group, i) =>
        phaseObj.revealByView ? inView(group) : progress >= i * stepSize + 0.02);

      beats.forEach((group, i) => {
        group.forEach((item) => {
          if (typeof item === 'function') {
            // Called every pass with the beat's state, so the lines it
            // draws can run backwards when the reader scrolls up.
            item(met[i]);
            return;
          }
          // Latched reveals keep is-visible once set; is-live tracks the
          // beat in both directions, and the connectors hang off that.
          item.classList.toggle('is-live', met[i]);
          if (reversible(item) && !phaseObj.revealByView) {
            // These two track scroll in both directions so the hand-off
            // plays backwards as well: a transient shows only until the
            // next beat lands, and whatever takes its place stands down
            // again when the reader scrolls back above it.
            const transient = item.classList.contains('beat--transient');
            item.classList.toggle('is-visible',
              met[i] && (!transient || met[i + 1] !== true));
          } else if (met[i]) {
            item.classList.add('is-visible');
          }
        });
      });
    });

    // An element can bow out when a later beat lands rather than when its
    // own does -- keyed to is-live, so scrolling back up brings it in again.
    if (isNarrow()) {
      document.querySelectorAll('[data-fade-out-narrow]').forEach((el) => {
        const trigger = document.querySelector(el.dataset.fadeOutNarrow);
        const gone = !!(trigger && trigger.classList.contains('is-live'));
        if (gone) el.classList.remove('is-visible');
        // It collapses as well as fading, so the trunk and everything under
        // it close up into the space rather than leaving a hole. The lines
        // are measured from layout, so they are re-measured once the box has
        // finished moving (see the transitionend hook below).
        el.classList.toggle('is-collapsed', gone);
      });
    }

    phases.forEach(({ trunkState }) => {
      if (trunkState.pieces) {
        const on = !!trunkState.active;
        trunkState.pieces.forEach((p) => {
          // The elbow is an SVG path, drawn by running its dash offset out.
          // Retracting is immediate; only drawing in waits its turn.
          if (p.tagName === 'path') {
            p.style.transitionDelay = on ? '0.45s' : '0s';
            p.style.strokeDashoffset = on ? '0' : p.getTotalLength();
          } else {
            p.classList.toggle('is-drawn', on);
          }
        });
      }
    });
  }

  // Collapsing a box changes where everything below it sits, so the
  // connectors are re-measured once that transition has finished.
  document.querySelectorAll('[data-fade-out-narrow]').forEach((el) => {
    el.addEventListener('transitionend', (event) => {
      if (event.propertyName === 'max-height') layoutAll();
    });
  });

  window.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('resize', requestUpdate);

  update();

  // Table of contents: jump to a stage, landing a little way inside it
  // so its first beat is already revealed -- a plain anchor jump would
  // land on a sticky stack at progress 0, i.e. an empty screen (see
  // update, which reveals beats by scroll progress through the phase).
  document.querySelectorAll('.toc-card').forEach((link) => {
    link.addEventListener('click', (event) => {
      const href = link.getAttribute('href');
      const target = document.querySelector(href);
      if (!target) return;
      event.preventDefault();
      // Beats normally build one per step of scroll progress, so a jump
      // would land on the stage's kicker alone. Reveal the opening beats
      // up front -- update() only ever adds is-visible, so the rest of the
      // stage still builds from here as the reader scrolls on.
      target.querySelectorAll(
        ':scope > .beat-stack > .phase-label,' +
        ':scope > .beat-stack > .phase-lead,' +
        ':scope .main-box'
      ).forEach((beat) => beat.classList.add('is-visible'));

      const rect = target.getBoundingClientRect();
      const scrollable = Math.max(rect.height - window.innerHeight, 0);
      const lead = Math.min(scrollable * 0.1, 160);
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({
        top: rect.top + window.scrollY + lead,
        behavior: reduceMotion ? 'auto' : 'smooth'
      });
    });
  });

  // Back to top. The masthead scrolls away on this piece and the read is
  // long, so there is nothing to get home by otherwise.
  //
  // Built here rather than in the markup so that the whole thing -- button,
  // styling, behaviour -- travels in this one file. Its colours are written
  // out literally: the palette is declared on .viz-container and this sits
  // on the body, outside it, where those custom properties do not reach.
  (function backToTop() {
    if (!document.querySelector('.viz-container')) { return; }

    var style = document.createElement('style');
    style.textContent = [
      '.viz-top {',
      '  position: fixed;',
      '  right: 18px;',
      '  bottom: 18px;',
      '  z-index: 9999;',
      '  width: 46px;',
      '  height: 46px;',
      '  display: flex;',
      '  align-items: center;',
      '  justify-content: center;',
      '  padding: 0;',
      '  border: 0;',
      '  border-radius: 50%;',
      '  background: #27343a;',
      '  color: #ffffff;',
      '  cursor: pointer;',
      '  opacity: 0;',
      '  visibility: hidden;',
      '  pointer-events: none;',
      '  transform: translateY(8px);',
      '  transition: opacity 0.25s ease, transform 0.25s ease,',
      '              visibility 0.25s, background 0.15s ease;',
      '  box-shadow: 0 4px 16px rgba(16, 24, 28, 0.28);',
      '}',
      /* Clear of a phone's home indicator and any rounded corner. */
      '@supports (bottom: env(safe-area-inset-bottom)) {',
      '  .viz-top {',
      '    right: calc(18px + env(safe-area-inset-right));',
      '    bottom: calc(18px + env(safe-area-inset-bottom));',
      '  }',
      '}',
      /* Hidden rather than merely transparent, so it is not a tab stop
         while it is off. */
      '.viz-top.is-on {',
      '  opacity: 1;',
      '  visibility: visible;',
      '  pointer-events: auto;',
      '  transform: none;',
      '}',
      '.viz-top:hover { background: #23685b; }',
      '.viz-top:focus-visible { outline: 3px solid #f4c913; outline-offset: 3px; }',
      '.viz-top svg { display: block; width: 16px; height: 10px; }',
      '@media (prefers-reduced-motion: reduce) {',
      '  .viz-top { transition: none; }',
      '}'
    ].join('\n');
    document.head.appendChild(style);

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'viz-top';
    btn.setAttribute('aria-label', 'Back to top');
    btn.innerHTML = '<svg viewBox="0 0 16 10" fill="none" aria-hidden="true" '
      + 'focusable="false"><path d="M2 8L8 2L14 8" stroke="currentColor" '
      + 'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    // On the body, so no ancestor's overflow or transform can trap it.
    document.body.appendChild(btn);

    btn.addEventListener('click', function () {
      var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    });

    // Shows once the reader is past the opening screen, which keeps it out
    // of the way of the contents at the top.
    function sync() {
      btn.classList.toggle('is-on', window.scrollY > window.innerHeight * 1.2);
    }
    window.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    sync();
  })();

  // Example walkthrough: one step at a time, with prev/next buttons.
  (function () {
    const root = document.getElementById('ex-card');
    if (!root) return;
    const slides = root.querySelectorAll('.ex-slide');
    const prev = root.querySelector('.ex-prev');
    const next = root.querySelector('.ex-next');
    const count = root.querySelector('.ex-count');
    const total = slides.length;
    let i = 0;

    function show(n) {
      i = Math.max(0, Math.min(total - 1, n));
      slides.forEach((s, k) => { s.hidden = k !== i; });
      count.textContent = (i + 1) + ' of ' + total;
      prev.disabled = i === 0;
      next.disabled = i === total - 1;
    }
    prev.addEventListener('click', () => show(i - 1));
    next.addEventListener('click', () => show(i + 1));
    show(0);
  })();
} catch (err) {
  document.documentElement.classList.remove('viz-js');
  if (window.console) console.error('discipline flow: falling back to the plain rendering', err);
}
}

// Enqueued in the footer, the markup is already there and this runs now.
// Enqueued in the head it is not, so wait for it rather than finding an
// empty page and standing down. Either placement works.
if (document.querySelector('.viz-container')) {
  vizFlowStart();
} else {
  document.addEventListener('DOMContentLoaded', vizFlowStart);
}

})();
