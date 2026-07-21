/* Nest Egg — SVG chart module.
   Modes: 'lines' (multi-series), 'stacked' (part-to-whole bands), 'area' (single series).
   Every chart ships a crosshair + tooltip (pointer and keyboard) and reads its
   colors from CSS custom properties so theme flips need no re-render. */
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';

  function el(name, attrs, style) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (style) e.setAttribute('style', style);
    return e;
  }

  function fmtMoney(v) {
    var a = Math.abs(v), s = v < 0 ? '−$' : '$';
    if (a >= 1e6) return s + (a / 1e6).toFixed(a >= 1e7 ? 1 : 2).replace(/\.?0+$/, '') + 'M';
    if (a >= 1e4) return s + Math.round(a / 1e3) + 'K';
    if (a >= 1e3) return s + (a / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return s + Math.round(a).toLocaleString('en-US');
  }

  function fmtMoneyFull(v) {
    var s = v < 0 ? '−$' : '$';
    return s + Math.round(Math.abs(v)).toLocaleString('en-US');
  }

  function niceCeil(v) {
    if (v <= 0) return 1;
    var mag = Math.pow(10, Math.floor(Math.log(v) / Math.LN10));
    var norm = v / mag;
    var step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
    return step * mag;
  }

  function yTicks(floor, top) {
    var step = niceCeil((top - floor) / 5) || 1;
    var ticks = [];
    for (var v = Math.ceil(floor / step) * step; v <= top + 1e-9; v += step) ticks.push(v);
    return ticks;
  }

  function xTicks(minAge, maxAge) {
    var span = maxAge - minAge;
    var step = span <= 8 ? 1 : span <= 16 ? 2 : span <= 40 ? 5 : 10;
    var ticks = [];
    for (var a = Math.ceil(minAge / step) * step; a <= maxAge + 1e-9; a += step) ticks.push(a);
    return ticks;
  }

  function makeChart(host, opts) {
    var wrap = document.createElement('div');
    wrap.className = 'chart';
    wrap.tabIndex = 0;
    wrap.setAttribute('role', 'img');
    wrap.setAttribute('aria-label', opts.ariaLabel || opts.title || 'Chart');
    host.appendChild(wrap);

    var tip = document.createElement('div');
    tip.className = 'chart-tip';
    tip.hidden = true;
    wrap.appendChild(tip);

    var state = { points: [], goal: null, activeIdx: -1, hoverLayer: null, geom: null };

    function seriesList() {
      return opts.series.filter(function (s) { return !s.hidden; });
    }

    function render() {
      var old = wrap.querySelector('svg');
      if (old) old.remove();
      state.hoverLayer = null;
      var pts = state.points;
      if (!pts.length) return;

      var W = Math.max(280, wrap.clientWidth || 560);
      var plotH = opts.height || 240;
      var mL = 52, mT = 16, mB = 26;
      var wantEndLabels = opts.endLabels !== false && opts.mode !== 'area';
      var mR = wantEndLabels ? 116 : 24;
      var H = plotH + mT + mB;
      var pw = W - mL - mR, ph = plotH;

      var svg = el('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H });
      wrap.insertBefore(svg, tip);

      var minAge = pts[0].age, maxAge = pts[pts.length - 1].age;
      var series = seriesList();
      var maxVal = 0, minVal = 0, i, j, p, v;
      for (i = 0; i < pts.length; i++) {
        p = pts[i];
        if (opts.mode === 'stacked') {
          var sum = 0;
          for (j = 0; j < series.length; j++) sum += p[series[j].key] || 0;
          if (sum > maxVal) maxVal = sum;
        } else {
          for (j = 0; j < series.length; j++) {
            v = p[series[j].key] || 0;
            if (v > maxVal) maxVal = v;
            if (v < minVal) minVal = v;
          }
          if (opts.band) {
            var bh = p[opts.band.high] || 0, bl = p[opts.band.low] || 0;
            if (bh > maxVal) maxVal = bh;
            if (bl < minVal) minVal = bl;
          }
        }
      }
      if (state.goal && state.goal.value > maxVal) maxVal = state.goal.value;
      if (maxVal <= 0) maxVal = 1;

      var top = niceCeil(maxVal);
      var floor = minVal < 0 ? -niceCeil(-minVal) : 0;
      var yt = yTicks(floor, top);
      var x = function (age) { return mL + (maxAge === minAge ? 0 : (age - minAge) / (maxAge - minAge) * pw); };
      var y = function (val) { return mT + ph - ((val - floor) / (top - floor)) * ph; };
      state.geom = { x: x, y: y, mL: mL, mT: mT, pw: pw, ph: ph, W: W, H: H };

      /* gridlines + y tick labels (solid hairlines, recessive; 0 is the axis) */
      for (i = 0; i < yt.length; i++) {
        if (yt[i] === 0) continue;
        svg.appendChild(el('line', { x1: mL, x2: mL + pw, y1: y(yt[i]), y2: y(yt[i]) },
          'stroke:var(--grid);stroke-width:1'));
      }
      for (i = 0; i < yt.length; i++) {
        var lab = el('text', { x: mL - 8, y: y(yt[i]) + 4, 'text-anchor': 'end' },
          'fill:var(--muted);font-size:11px;font-variant-numeric:tabular-nums');
        lab.textContent = fmtMoney(yt[i]);
        svg.appendChild(lab);
      }
      /* baseline + x ticks */
      svg.appendChild(el('line', { x1: mL, x2: mL + pw, y1: y(0), y2: y(0) },
        'stroke:var(--axis);stroke-width:1'));
      var xt = xTicks(minAge, maxAge);
      for (i = 0; i < xt.length; i++) {
        var xl = el('text', { x: x(xt[i]), y: mT + ph + 18, 'text-anchor': 'middle' },
          'fill:var(--muted);font-size:11px;font-variant-numeric:tabular-nums');
        xl.textContent = xt[i];
        svg.appendChild(xl);
      }
      var xTitle = el('text', { x: mL - 8, y: mT + ph + 18, 'text-anchor': 'end' },
        'fill:var(--muted);font-size:11px');
      xTitle.textContent = 'Age';
      svg.appendChild(xTitle);

      function linePath(key, base) {
        var d = '';
        for (var k = 0; k < pts.length; k++) {
          var v = (pts[k][key] || 0) + (base ? base[k] : 0);
          d += (k ? 'L' : 'M') + x(pts[k].age).toFixed(1) + ' ' + y(v).toFixed(1);
        }
        return d;
      }

      var endLabels = [];

      if (opts.mode === 'stacked') {
        var cumPrev = pts.map(function () { return 0; });
        for (j = 0; j < series.length; j++) {
          var s = series[j];
          var cumNow = pts.map(function (pt, k) { return cumPrev[k] + (pt[s.key] || 0); });
          /* band fill: wash between cumPrev and cumNow */
          var d = '';
          for (i = 0; i < pts.length; i++) d += (i ? 'L' : 'M') + x(pts[i].age).toFixed(1) + ' ' + y(cumNow[i]).toFixed(1);
          for (i = pts.length - 1; i >= 0; i--) d += 'L' + x(pts[i].age).toFixed(1) + ' ' + y(cumPrev[i]).toFixed(1);
          svg.appendChild(el('path', { d: d + 'Z' }, 'fill:var(' + s.color + ');opacity:.16'));
          /* surface gap under the band's top edge, then the 2px series line */
          var edge = '';
          for (i = 0; i < pts.length; i++) edge += (i ? 'L' : 'M') + x(pts[i].age).toFixed(1) + ' ' + y(cumNow[i]).toFixed(1);
          svg.appendChild(el('path', { d: edge }, 'fill:none;stroke:var(--surface);stroke-width:5'));
          svg.appendChild(el('path', { d: edge },
            'fill:none;stroke:var(' + s.color + ');stroke-width:2;stroke-linejoin:round;stroke-linecap:round'));
          if (wantEndLabels) {
            var bandTopY = y(cumNow[pts.length - 1]);
            var bandBotY = y(cumPrev[pts.length - 1]);
            endLabels.push({
              name: s.name, color: s.color,
              yNat: (bandTopY + bandBotY) / 2,
              fits: (bandBotY - bandTopY) >= 15, band: true
            });
          }
          cumPrev = cumNow;
        }
      } else {
        /* uncertainty band: a quiet wash behind the lines */
        if (opts.band && pts.length > 1 && pts.some(function (q) { return q[opts.band.high] != null; })) {
          var bd = '';
          for (i = 0; i < pts.length; i++) {
            bd += (i ? 'L' : 'M') + x(pts[i].age).toFixed(1) + ' ' + y(pts[i][opts.band.high] || 0).toFixed(1);
          }
          for (i = pts.length - 1; i >= 0; i--) {
            bd += 'L' + x(pts[i].age).toFixed(1) + ' ' + y(pts[i][opts.band.low] || 0).toFixed(1);
          }
          svg.appendChild(el('path', { d: bd + 'Z' }, 'fill:var(' + opts.band.color + ');opacity:.08'));
        }
        for (j = 0; j < series.length; j++) {
          var sr = series[j];
          if (opts.mode === 'area') {
            var ad = linePath(sr.key) +
              'L' + (mL + pw).toFixed(1) + ' ' + y(0).toFixed(1) +
              'L' + mL.toFixed(1) + ' ' + y(0).toFixed(1) + 'Z';
            svg.appendChild(el('path', { d: ad }, 'fill:var(' + sr.color + ');opacity:.10'));
          }
          svg.appendChild(el('path', { d: linePath(sr.key) },
            'fill:none;stroke:var(' + sr.color + ');stroke-width:2;stroke-linejoin:round;stroke-linecap:round'));
          if (opts.mode === 'lines' && wantEndLabels) {
            var last = pts[pts.length - 1];
            endLabels.push({
              name: sr.name, color: sr.color,
              xEnd: x(last.age), yNat: y(last[sr.key] || 0), fits: true, dot: true
            });
          }
        }
      }

      /* goal / threshold line: dashed is the threshold idiom (grids stay solid) */
      if (state.goal && state.goal.value > 0) {
        var gy = y(state.goal.value);
        svg.appendChild(el('line', { x1: mL, x2: mL + pw, y1: gy, y2: gy },
          'stroke:var(--muted);stroke-width:1.5;stroke-dasharray:5 4'));
        var gl = el('text', { x: mL + pw - 4, y: gy - 6, 'text-anchor': 'end' },
          'fill:var(--ink-2);font-size:11px');
        gl.textContent = state.goal.label;
        svg.appendChild(gl);
      }

      /* direct end labels — text in ink tokens, identity from the mark beside it;
         collisions resolved by nudging apart with leader lines */
      endLabels.sort(function (a, b) { return a.yNat - b.yNat; });
      var prevY = -Infinity;
      for (i = 0; i < endLabels.length; i++) {
        var L = endLabels[i];
        L.yLab = Math.max(L.yNat, prevY + 15);
        prevY = L.yLab;
      }
      for (i = endLabels.length - 1; i >= 0; i--) {
        if (endLabels[i].yLab > mT + ph) {
          endLabels[i].yLab = mT + ph;
          if (i < endLabels.length - 1) {
            endLabels[i].yLab = Math.min(endLabels[i].yLab, endLabels[i + 1].yLab - 15);
          }
          prevY = endLabels[i].yLab;
        }
      }
      var labX = mL + pw + 14;
      for (i = 0; i < endLabels.length; i++) {
        var e = endLabels[i];
        if (e.band && !e.fits) continue; /* thin band: legend + tooltip carry it */
        if (e.dot) {
          svg.appendChild(el('circle', { cx: e.xEnd, cy: e.yNat, r: 6.5 }, 'fill:var(--surface)'));
          svg.appendChild(el('circle', { cx: e.xEnd, cy: e.yNat, r: 4.5 }, 'fill:var(' + e.color + ')'));
        }
        if (Math.abs(e.yLab - e.yNat) > 4) {
          svg.appendChild(el('line', {
            x1: mL + pw + (e.dot ? 8 : 2), y1: e.yNat, x2: labX - 3, y2: e.yLab - 4
          }, 'stroke:var(--axis);stroke-width:1'));
        }
        if (!e.dot) {
          svg.appendChild(el('rect', {
            x: labX - 2, y: e.yLab - 8, width: 10, height: 3, rx: 1.5
          }, 'fill:var(' + e.color + ')'));
        }
        var t = el('text', { x: labX + (e.dot ? 0 : 12), y: e.yLab - 1 },
          'fill:var(--ink-2);font-size:12px');
        t.textContent = e.name;
        svg.appendChild(t);
      }

      /* hover layer: crosshair group + overlay hit rect */
      var hover = el('g', { 'pointer-events': 'none' });
      hover.style.display = 'none';
      var cross = el('line', { y1: mT, y2: mT + ph }, 'stroke:var(--axis);stroke-width:1');
      hover.appendChild(cross);
      var dots = [];
      var dotSeries = opts.mode === 'stacked' ? series.slice() : series;
      for (j = 0; j < dotSeries.length; j++) {
        var ring = el('circle', { r: 6.5 }, 'fill:var(--surface)');
        var dot = el('circle', { r: 4.5 }, 'fill:var(' + dotSeries[j].color + ')');
        hover.appendChild(ring); hover.appendChild(dot);
        dots.push({ ring: ring, dot: dot, key: dotSeries[j].key });
      }
      svg.appendChild(hover);
      state.hoverLayer = { g: hover, cross: cross, dots: dots };

      var overlay = el('rect', { x: mL, y: mT, width: pw, height: ph, fill: 'transparent' });
      overlay.style.cursor = 'crosshair';
      svg.appendChild(overlay);

      overlay.addEventListener('pointermove', function (ev) {
        var r = svg.getBoundingClientRect();
        var px = ev.clientX - r.left;
        var frac = Math.min(1, Math.max(0, (px - mL) / pw));
        setActive(Math.round(frac * (pts.length - 1)), ev.clientX - r.left);
      });
      overlay.addEventListener('pointerleave', function () { setActive(-1); });
    }

    function setActive(idx, pointerX) {
      var pts = state.points, hl = state.hoverLayer, g = state.geom;
      state.activeIdx = idx;
      if (!hl || !g || idx < 0 || idx >= pts.length) {
        if (hl) hl.g.style.display = 'none';
        tip.hidden = true;
        return;
      }
      var p = pts[idx];
      var cx = g.x(p.age);
      hl.g.style.display = '';
      hl.cross.setAttribute('x1', cx); hl.cross.setAttribute('x2', cx);

      var series = seriesList();
      var cum = 0;
      for (var j = 0; j < hl.dots.length; j++) {
        var v = p[hl.dots[j].key] || 0;
        var yv = opts.mode === 'stacked' ? (cum += v) : v;
        hl.dots[j].ring.setAttribute('cx', cx); hl.dots[j].ring.setAttribute('cy', g.y(yv));
        hl.dots[j].dot.setAttribute('cx', cx); hl.dots[j].dot.setAttribute('cy', g.y(yv));
      }

      /* tooltip: values lead, labels follow; line keys, not boxes */
      tip.textContent = '';
      var head = document.createElement('div');
      head.className = 'tip-head';
      head.textContent = opts.xMeta ? opts.xMeta(p) : ('Age ' + Math.round(p.age));
      tip.appendChild(head);
      var rows = series.slice();
      if (opts.mode === 'stacked') rows.reverse(); /* match visual top-to-bottom */
      for (var k = 0; k < rows.length; k++) {
        var row = document.createElement('div');
        row.className = 'tip-row';
        var key = document.createElement('span');
        key.className = 'tip-key';
        key.style.background = 'var(' + rows[k].color + ')';
        var val = document.createElement('span');
        val.className = 'tip-val';
        val.textContent = fmtMoneyFull(p[rows[k].key] || 0);
        var name = document.createElement('span');
        name.className = 'tip-name';
        name.textContent = rows[k].name;
        row.appendChild(key); row.appendChild(val); row.appendChild(name);
        tip.appendChild(row);
      }
      if (opts.tipExtra) opts.tipExtra(tip, p);

      tip.hidden = false;
      var wr = wrap.getBoundingClientRect();
      var tw = tip.offsetWidth;
      var leftHalf = cx < g.mL + g.pw / 2;
      var tx = leftHalf ? cx + 14 : cx - tw - 14;
      tx = Math.min(Math.max(2, tx), wr.width - tw - 2);
      tip.style.left = tx + 'px';
      tip.style.top = (g.mT + 6) + 'px';
    }

    wrap.addEventListener('keydown', function (ev) {
      var n = state.points.length;
      if (!n) return;
      var idx = state.activeIdx < 0 ? n - 1 : state.activeIdx;
      if (ev.key === 'ArrowLeft') idx = Math.max(0, idx - 1);
      else if (ev.key === 'ArrowRight') idx = Math.min(n - 1, idx + 1);
      else if (ev.key === 'Escape') { setActive(-1); return; }
      else if (ev.key !== 'Enter') return;
      ev.preventDefault();
      setActive(idx);
    });
    wrap.addEventListener('focus', function () {
      if (state.points.length) setActive(state.points.length - 1);
    });
    wrap.addEventListener('blur', function () { setActive(-1); });

    if (window.ResizeObserver) {
      var ro = new ResizeObserver(function () { render(); });
      ro.observe(wrap);
    } else {
      window.addEventListener('resize', render);
    }

    return {
      update: function (points, goal) {
        state.points = points || [];
        state.goal = goal || null;
        state.activeIdx = -1;
        tip.hidden = true;
        render();
      }
    };
  }

  window.NestEggCharts = {
    makeChart: makeChart,
    fmtMoney: fmtMoney,
    fmtMoneyFull: fmtMoneyFull
  };
})();
