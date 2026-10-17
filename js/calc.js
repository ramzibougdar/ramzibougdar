/* ==========================================================================
   calc.js — CV Ramzi Bougdar
   Pure derived calculations from window.CV_DATA: key figures, durations,
   timeline nodes. No DOM access. Labels come from window.CV_I18N (js/i18n.js).
   Detailed rules: specs/002-refonte-ui-ux/data-model.md.
   Exposes window.CV_CALC.
   ========================================================================== */

(function () {
  'use strict';

  /** Interface strings of the page language. */
  var T = window.CV_I18N.t;

  /** Formatter for "February 2023" / « février 2023 ». */
  var MONTH_FORMAT = new Intl.DateTimeFormat(T.locale, { month: 'long', year: 'numeric' });

  /** Displayed labels of position types. */
  var TYPE_LABELS = T.types;

  /**
   * Converts "YYYY-MM" into a month index: YYYY × 12 + (MM − 1).
   * @param {string} value
   * @returns {number} NaN if the date is invalid
   */
  function monthIndex(value) {
    var m = /^(\d{4})-(\d{2})$/.exec(String(value));
    if (!m || +m[2] < 1 || +m[2] > 12) return NaN;
    return +m[1] * 12 + (+m[2] - 1);
  }

  /**
   * Index of the current month (computed on each call, no specific time zone).
   * @returns {number}
   */
  function currentMonth() {
    var d = new Date();
    return d.getFullYear() * 12 + d.getMonth();
  }

  /**
   * Effective end of a position: a null end means the current month.
   * @param {string|null} end
   * @returns {number}
   */
  function endIndex(end) {
    return end ? monthIndex(end) : currentMonth();
  }

  /**
   * Length of an interval in months, both bounds included (end − start + 1).
   * @param {string} start "YYYY-MM"
   * @param {string|null} end "YYYY-MM" or null (ongoing)
   * @returns {number}
   */
  function duration(start, end) {
    return endIndex(end) - monthIndex(start) + 1;
  }

  /**
   * Formats a number of months: "3 years 9 months" / « 3 ans 9 mois », "4 months", "2 years".
   * @param {number} n
   * @returns {string}
   */
  function formatDuration(n) {
    var years = Math.floor(n / 12), rest = n % 12, parts = [];
    if (years) parts.push(T.years(years));
    if (rest || !years) parts.push(T.months(rest));
    return parts.join(' ');
  }

  /**
   * Readable label of a month index: "February 2023" / « février 2023 ».
   * @param {number} index
   * @returns {string}
   */
  function monthLabel(index) {
    return MONTH_FORMAT.format(new Date(Math.floor(index / 12), index % 12, 1));
  }

  /**
   * Employers sorted by most recent position, positions sorted by descending start.
   * Does not modify the source data.
   * @param {Object} cv
   * @returns {Array<{emp: Object, positions: Array, index: number}>}
   */
  function sortedEmployers(cv) {
    return (cv.experiences || []).map(function (emp) {
      var positions = (emp.positions || []).slice().sort(function (a, b) {
        return monthIndex(b.start) - monthIndex(a.start);
      });
      return { emp: emp, positions: positions };
    }).sort(function (a, b) {
      var ra = a.positions.length ? monthIndex(a.positions[0].start) : -Infinity;
      var rb = b.positions.length ? monthIndex(b.positions[0].start) : -Infinity;
      return rb - ra;
    }).map(function (item, i) {
      item.index = i;
      return item;
    });
  }

  /**
   * All valid positions, with their employer (sorted rank) and their bounds in months.
   * A position with an invalid date is excluded and reported in the console.
   * @param {Object} cv
   * @returns {Array}
   */
  function validPositions(cv) {
    var list = [];
    sortedEmployers(cv).forEach(function (item) {
      item.positions.forEach(function (position) {
        var start = monthIndex(position.start), end = endIndex(position.end);
        if (isNaN(start) || isNaN(end) || end < start) {
          console.error('Invalid position date ignored in calculations:', item.emp.employer, position);
          return;
        }
        list.push({ item: item, position: position, start: start, end: end });
      });
    });
    return list;
  }

  /**
   * Shared time scale: from the first month to the current month included.
   * @param {Object} cv
   * @returns {{min: number, total: number}}
   */
  function scale(cv) {
    var positions = validPositions(cv);
    var min = positions.length ? Math.min.apply(null, positions.map(function (p) { return p.start; })) : currentMonth();
    return { min: min, total: currentMonth() - min + 1 };
  }

  /**
   * Computed key figure: years of experience = ⌊(current month − min(start) + 1) / 12⌋.
   * @param {Object} cv
   * @returns {Array<{key: string, value: number, label: string}>}
   */
  function keyFigures(cv) {
    var years = Math.floor(scale(cv).total / 12);
    return [{ key: 'years', value: years, label: T.experience(years) }];
  }

  /**
   * Tells whether an employer was only a client: all its positions are of type "mission"
   * (placement at a client). These employers are shown apart from the timeline.
   * @param {Array} positions
   * @returns {boolean}
   */
  function isClientMission(positions) {
    return positions.length > 0 && positions.every(function (p) { return p.type === 'mission'; });
  }

  /**
   * Timeline nodes: one per employer, in reverse chronological order.
   * @param {Object} cv
   * @returns {Array}
   */
  function timelineNodes(cv) {
    var now = currentMonth();
    return sortedEmployers(cv).map(function (item) {
      var starts = item.positions.map(function (p) { return monthIndex(p.start); });
      var ends = item.positions.map(function (p) { return endIndex(p.end); });
      var min = Math.min.apply(null, starts), max = Math.max.apply(null, ends);
      var current = item.positions.some(function (p) { return !p.end; });
      var startYear = Math.floor(min / 12), endYear = Math.floor(max / 12);
      var missions = item.positions.reduce(function (n, p) { return n + (p.missions || []).length; }, 0);
      return {
        id: 'exp-' + item.index,
        employer: item.emp,
        positions: item.positions,
        year: String(startYear),
        range: current ? startYear + ' – ' + T.today : (startYear === endYear ? String(startYear) : startYear + ' – ' + endYear),
        duration: formatDuration((current ? now : max) - min + 1),
        current: current,
        clientMission: isClientMission(item.positions),
        totalMissions: missions,
        collapsible: missions > 4
      };
    });
  }

  window.CV_CALC = {
    TYPE_LABELS: TYPE_LABELS,
    monthIndex: monthIndex,
    currentMonth: currentMonth,
    duration: duration,
    formatDuration: formatDuration,
    monthLabel: monthLabel,
    sortedEmployers: sortedEmployers,
    keyFigures: keyFigures,
    timelineNodes: timelineNodes
  };
})();
