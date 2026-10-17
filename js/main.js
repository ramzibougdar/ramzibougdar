/* ==========================================================================
   main.js — CV Ramzi Bougdar
   Renders the CV from data/cv.js (window.CV_DATA) in the page language (js/i18n.js,
   window.CV_I18N) with the calculations of js/calc.js (window.CV_CALC), then handles the
   theme, language switch, navigation, "to be clarified" markers, collapsible cards and
   the PDF button.
   Works on its own: motion is delegated to js/animations.js through events
   (contracts/dom-rendu.md). No dependency.
   ========================================================================== */

'use strict';

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

/** Interface strings of the page language (js/i18n.js). */
var T = window.CV_I18N.t;

/** Local untracked file holding the phone number, loaded only in ?pdf mode. */
var PRIVATE_PATH = window.CV_I18N.asset('data/private.js');

/** True when the page is opened straight from the disk (file://). */
var LOCAL_FILE = window.location.protocol === 'file:';

/** PDF generation mode: on when the URL contains "?pdf". */
var PDF_MODE = /[?&]pdf\b/.test(window.location.search);

/** Pre-render mode (?prerender): used by scripts/generate-metadata.js to copy the rendered
    CV into the HTML source, so robots that do not run JavaScript read the whole CV. */
var PRERENDER_MODE = /[?&]prerender\b/.test(window.location.search);

/** Number of missions shown before a timeline card is collapsed. */
var VISIBLE_MISSIONS = 4;

/** "Outgoing arrow" icon of the contact links (decorative). */
var SVG_ARROW = '<svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24"><path d="M7 17 17 7M9 7h8v8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** "Chevron" icon of the collapse button (decorative). */
var SVG_CHEVRON = '<svg aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** Technology logos (paths from js/icons.js, Simple Icons, CC0): presentation only.
    Keyed by the displayed name, in both languages for translated names. */
var LOGOS = {
  'AI agents': 'agents', 'Agents IA': 'agents', 'Automation': 'automation', 'Automatisation': 'automation', 'Claude': 'claude', 'PrestaShop': 'prestashop', 'Shopify': 'shopify',
  'Python': 'python', 'FastAPI': 'fastapi', 'Node.js': 'nodedotjs', 'Symfony': 'symfony', 'Laravel': 'laravel',
  'TypeScript': 'typescript', 'JavaScript': 'javascript', 'React': 'react', 'Next.js': 'nextdotjs',
  'HTML5': 'html5', 'CSS / Sass': 'sass', 'Docker': 'docker', 'Git': 'git', 'Webpack': 'webpack'
};

/** Id counter of the "to be clarified" notes. */
var noteCounter = 0;

/* --------------------------------------------------------------------------
   DOM building helpers
   -------------------------------------------------------------------------- */

/**
 * Creates an HTML element with its attributes and children.
 * String children are inserted as text (never parsed as HTML).
 * @param {string} tag
 * @param {Object} [attrs] attributes; "className" sets the class
 * @param {Array|Node|string} [children]
 * @returns {HTMLElement}
 */
function create(tag, attrs, children) {
  var el = document.createElement(tag);
  Object.keys(attrs || {}).forEach(function (key) {
    var value = attrs[key];
    if (value === null || value === undefined || value === false) return;
    if (key === 'className') el.className = value;
    else el.setAttribute(key, value === true ? '' : value);
  });
  append(el, children);
  return el;
}

/**
 * Appends one or more children (nodes or strings) to an element.
 * @param {HTMLElement} parent
 * @param {Array|Node|string} children
 */
function append(parent, children) {
  if (children === null || children === undefined) return;
  (Array.isArray(children) ? children : [children]).forEach(function (child) {
    if (child === null || child === undefined || child === '') return;
    parent.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  });
}

/**
 * Creates a decorative SVG icon from a trusted string (a constant of this file).
 * @param {string} svg
 * @returns {Element}
 */
function icon(svg) {
  var template = document.createElement('template');
  template.innerHTML = svg;
  return template.content.firstChild;
}

/**
 * Creates an inline SVG logo (decorative, text colour) from window.CV_ICONS.
 * Built with createElementNS: no HTML is parsed.
 * @param {string} key path identifier (e.g. "python")
 * @param {string} [className] CSS class (defaults to "tags__logo")
 * @returns {SVGElement|null}
 */
function logoSvg(key, className) {
  var path = window.CV_ICONS && window.CV_ICONS[key];
  if (!path) return null;
  // A path is either a string or an object { d, rule } (fill rule).
  var rule = typeof path === 'object' ? path.rule : null;
  if (typeof path === 'object') path = path.d;
  var ns = 'http://www.w3.org/2000/svg';
  var svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', className || 'tags__logo');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  var pathEl = document.createElementNS(ns, 'path');
  pathEl.setAttribute('d', path);
  if (rule) pathEl.setAttribute('fill-rule', rule);
  svg.appendChild(pathEl);
  return svg;
}

/**
 * Fills the [data-render="name"] container with the given nodes.
 * @param {string} name
 * @param {Array|Node|string} content
 * @returns {HTMLElement|null}
 */
function fill(name, content) {
  var target = document.querySelector('[data-render="' + name + '"]');
  if (!target) return null;
  target.textContent = '';
  append(target, content);
  return target;
}

/**
 * Dispatches a cancelable event carrying the action to run; if no listener
 * (js/animations.js) cancels it to run it itself, the action is run here.
 * @param {EventTarget} target
 * @param {string} name e.g. "card:toggle"
 * @param {Object} detail must contain "apply"
 */
function emitOrRun(target, name, detail) {
  var event = new CustomEvent(name, { bubbles: true, cancelable: true, detail: detail });
  if (target.dispatchEvent(event)) detail.apply();
}

/* --------------------------------------------------------------------------
   Values, links, dates and "to be clarified" markers
   -------------------------------------------------------------------------- */

/**
 * Tells whether a value carries the "to be clarified" marker.
 * @param {*} value
 * @returns {boolean}
 */
function isToClarify(value) {
  return value !== null && typeof value === 'object' && 'toClarify' in value;
}

/**
 * Builds a discreet "… to be clarified" marker (toggletip): button + accessible note.
 * @param {string} note explanation taken from cv.js
 * @param {string} [field] field concerned (chooses the label)
 * @returns {HTMLElement}
 */
function clarifyMarker(note, field) {
  var id = 'note-' + (++noteCounter);
  return create('span', { className: 'tbc' }, [
    create('button', { type: 'button', className: 'tbc__button', 'aria-expanded': 'false', 'aria-describedby': id },
      T.markers[field] || T.toClarify),
    create('span', { className: 'tbc__note', id: id, role: 'note' }, note || T.notProvided)
  ]);
}

/**
 * Turns a "Text" value (string or { toClarify }) into a displayable node.
 * @param {string|Object} value
 * @param {string} [field]
 * @returns {Node|null}
 */
function text(value, field) {
  if (value === null || value === undefined || value === '') return null;
  if (isToClarify(value)) return clarifyMarker(value.toClarify, field);
  return document.createTextNode(String(value));
}

/**
 * Tells whether a URL can be rendered as a link (https or mailto only).
 * @param {string} url
 * @returns {boolean}
 */
function isSafeLink(url) {
  return typeof url === 'string' && /^(https:\/\/|mailto:)/i.test(url);
}

/**
 * Creates an external link opened in a new tab, announced to screen readers.
 * @param {string} url
 * @param {Array|Node|string} content
 * @param {Object} [attrs]
 * @returns {HTMLElement}
 */
function externalLink(url, content, attrs) {
  var link = create('a', Object.assign({ href: url, target: '_blank', rel: 'noopener' }, attrs || {}), content);
  link.appendChild(create('span', { className: 'visually-hidden' }, T.newTab));
  return link;
}

/**
 * <time> element for a "YYYY-MM" date (« février 2023 ») or "YYYY".
 * @param {string} value
 * @returns {HTMLElement}
 */
function dateElement(value) {
  var index = window.CV_CALC.monthIndex(value);
  return create('time', { datetime: value }, isNaN(index) ? String(value) : window.CV_CALC.monthLabel(index));
}

/**
 * "start – end" period; a null end is shown as "present" / « aujourd'hui ».
 * @param {string} start
 * @param {string|null} end
 * @returns {Array}
 */
function period(start, end) {
  return [dateElement(start), ' – ', end ? dateElement(end) : T.today];
}

/* --------------------------------------------------------------------------
   Opening bento
   -------------------------------------------------------------------------- */

/**
 * Renders the hero: name split into letters (animation mask, full text readable), title, location.
 * @param {Object} profile
 */
function renderHero(profile) {
  var visual = create('span', { 'aria-hidden': 'true' }, String(profile.name).split(/\s+/).map(function (word) {
    return create('span', { className: 'name__word' }, word.split('').map(function (letter) {
      return create('span', { className: 'name__letter', 'data-anim': 'name-letter' }, letter);
    }));
  }));
  fill('name', [create('span', { className: 'visually-hidden' }, profile.name), visual]);
  fill('title', text(profile.title));
  fill('location', text(profile.location, 'location'));

  // The photo is rendered only when a path is given (otherwise no empty element).
  // It sits in the first screen: high-priority loading, never deferred.
  var photo = profile.photo;
  fill('photo', photo && photo.src ? create('img', {
    src: window.CV_I18N.asset(photo.src), alt: photo.alt || T.portraitOf + profile.name,
    width: photo.width || 256, height: photo.height || 256, decoding: 'async', fetchpriority: 'high'
  }) : null);
}

/**
 * Renders the summary tiles: years of experience (M2 counter) then strengths
 * (profile.strengths).
 * @param {Object} cv
 */
function renderStats(cv) {
  var calc = window.CV_CALC;
  var tiles = calc.keyFigures(cv).map(function (f) {
    var ticks = create('span', { className: 'stat__ticks', 'aria-hidden': 'true' },
      Array.apply(null, Array(Math.min(f.value, 20))).map(function () { return create('i'); }));
    return create('p', { className: 'tile stat stat--accent stat--wide', 'data-anim': 'tile', 'data-anim-tilt': '4' }, [
      create('data', { className: 'stat__value', value: f.value, 'data-anim': 'counter' }, [
        create('span', { 'aria-hidden': 'true' }, String(f.value)),
        create('span', { className: 'visually-hidden' }, String(f.value))
      ]),
      create('span', { className: 'stat__bottom' }, [ticks, create('span', { className: 'stat__label' }, ' ' + f.label)])
    ]);
  });

  // Strengths (profile.strengths): label, then title, steps or logo, and an optional detail
  var colors = { gradient: 'stat--gradient', active: 'stat--active', warm: 'stat--warm', accent: 'stat--accent' };
  ((cv.profile && cv.profile.strengths) || []).forEach(function (s) {
    if (!s || !s.label) return;
    var content = [create('span', { className: 'stat__label' }, s.label)];
    // Title wraps only between words ("e-commerce" stays whole)
    if (s.title) {
      content.push(create('p', { className: 'strength__title' }, String(s.title).split(' ').reduce(function (acc, word, i) {
        if (i) acc.push(' ');
        acc.push(create('span', { className: 'nowrap' }, word));
        return acc;
      }, [])));
    }
    if (s.steps && s.steps.length) {
      content.push(create('ol', { className: 'strength__steps' }, s.steps.map(function (step) { return create('li', null, text(step)); })));
    }
    var logo = s.logo ? logoSvg(s.logo, 'strength__logo') : null;
    if (logo) content.push(logo);
    if (s.detail) content.push(create('p', { className: 'strength__detail' }, text(s.detail)));
    tiles.push(create('div', { className: 'tile stat strength ' + (colors[s.color] || ''), 'data-anim': 'tile', 'data-anim-tilt': '4' }, content));
  });
  fill('stats', tiles);
}

/**
 * Renders the "About" section: first paragraph as a lead, the next ones as body text.
 * @param {string|Object|Array} summary
 * @param {string} [title] profile title, already shown in the hero
 */
function renderAbout(summary, title) {
  // A paragraph identical to the title (already shown in the hero) is not repeated: no content is lost.
  var paragraphs = (Array.isArray(summary) ? summary : [summary]).filter(function (p) {
    return p && !(typeof p === 'string' && typeof title === 'string' && p.trim() === title.trim());
  });
  fill('about', paragraphs.length ? paragraphs.map(function (p) {
    return create('p', { className: 'about__text' }, text(p, 'summary'));
  }) : create('p', null, clarifyMarker(T.noSummary, 'summary')));
}

/**
 * Renders the skills as a description list: one category per group, technologies as tags.
 * @param {Array} skills
 */
function renderSkills(skills) {
  if (!skills || !skills.length) {
    fill('skills', create('p', null, clarifyMarker(T.noSkills, 'skill')));
    return;
  }
  // Each category is a <div> group (allowed inside <dl>) for a column layout.
  fill('skills', create('dl', { className: 'skills' }, skills.map(function (group) {
    return create('div', { className: 'skills__group' }, [
      create('dt', null, group.category || T.skills),
      create('dd', null, create('ul', { className: 'tags' }, (group.items || []).map(function (item) {
        // Decorative inline SVG logo before the name, only for known technologies.
        var logo = typeof item === 'string' && LOGOS[item] ? logoSvg(LOGOS[item]) : null;
        return create('li', null, [logo, text(item, 'skill')]);
      })))
    ]);
  })));
}

/**
 * Renders the languages and their level.
 * @param {Array} languages
 */
function renderLanguages(languages) {
  fill('languages', languages && languages.length ? create('ul', { className: 'languages' }, languages.map(function (l) {
    return create('li', null, [create('span', { className: 'languages__name' }, l.language), create('span', { className: 'small' }, text(l.level))]);
  })) : create('p', null, clarifyMarker(T.noLanguages)));
}

/* --------------------------------------------------------------------------
   Professional experience: timeline
   -------------------------------------------------------------------------- */

/**
 * Builds the block of a position: title, type, period, location, description and missions.
 * @param {Object} position
 * @returns {HTMLElement}
 */
function renderPosition(position) {
  var type = window.CV_CALC.TYPE_LABELS[position.type];
  var meta = create('p', { className: 'position__meta' }, period(position.start, position.end));
  if (position.location) append(meta, [create('span', { 'aria-hidden': 'true' }, ' / '), text(position.location, 'location')]);
  var block = create('div', { className: 'position' }, [
    create('h4', null, [position.title, position.type === 'internship' && type ? create('span', { className: 'badge badge--' + position.type }, type) : null]),
    meta
  ]);
  if (position.description) block.appendChild(create('p', { className: 'position__desc' }, text(position.description, 'description')));
  // Quantified achievements (optional "highlights"), always visible, before the missions
  if (position.highlights && position.highlights.length) {
    block.appendChild(create('p', { className: 'position__label' }, T.highlights));
    block.appendChild(create('ul', { className: 'position__highlights' }, position.highlights.map(function (h) {
      return create('li', null, text(h));
    })));
  }
  if (position.missions && position.missions.length) {
    block.appendChild(create('ul', { className: 'position__missions' }, position.missions.map(function (m) {
      return create('li', null, text(m));
    })));
  }
  return block;
}

/**
 * Renders the vertical timeline: one node per employer, one sub-node per position.
 * @param {Object} cv
 */
function renderTimeline(cv) {
  // Client missions have their own section (renderClientMissions).
  var nodes = window.CV_CALC.timelineNodes(cv).filter(function (n) { return !n.clientMission; });
  if (!nodes.length) {
    fill('timeline', create('p', null, clarifyMarker(T.noExperience)));
    return;
  }
  var list = create('ol', { className: 'timeline', reversed: true }, nodes.map(function (n, i) {
    var emp = n.employer;
    var header = create('header', { className: 'card__header' }, create('h3', { id: 'title-' + n.id }, emp.employer));
    if (emp.location) header.appendChild(create('p', { className: 'card__location' }, text(emp.location, 'location')));
    var body = create('div', { className: 'positions' + (n.positions.length > 1 ? ' positions--multi' : ''), id: 'body-' + i }, n.positions.map(renderPosition));
    var tile = create('article', { className: 'step__tile', 'aria-labelledby': 'title-' + n.id, 'data-anim': 'reveal' }, [header, body]);
    var step = create('li', { className: 'step' + (n.current ? ' step--current' : ''), id: n.id }, [
      create('div', { className: 'step__date', 'data-anim': 'date' }, [
        create('span', { className: 'step__year' }, n.year),
        create('span', { className: 'step__range' }, [create('span', null, n.range), create('span', null, n.duration)])
      ]),
      create('div', { className: 'step__node', 'aria-hidden': 'true' }, create('i', { 'data-anim': 'node' })),
      tile
    ]);
    if (n.collapsible) setUpCollapse(step, tile, body, n.totalMissions);
    return step;
  }));
  fill('timeline', create('div', { className: 'timeline-frame' }, [
    create('div', { className: 'timeline__rail', 'aria-hidden': 'true' }, create('span', { className: 'timeline__line', 'data-anim': 'line' })),
    list
  ]));
}

/**
 * Collapses the missions beyond VISIBLE_MISSIONS into "hidden=until-found" items
 * (find-in-page finds them and expands the card). Without support, nothing is collapsed.
 * @param {HTMLElement} step
 * @param {HTMLElement} tile
 * @param {HTMLElement} body
 * @param {number} total
 */
function setUpCollapse(step, tile, body, total) {
  // Not collapsed for the PDF or the pre-render: the static HTML keeps every mission visible.
  if (!('onbeforematch' in document.body) || PDF_MODE || PRERENDER_MODE) return;
  var extra = Array.prototype.slice.call(body.querySelectorAll('.position__missions li'), VISIBLE_MISSIONS);
  if (!extra.length) return;
  extra.forEach(function (li) { li.setAttribute('hidden', 'until-found'); });
  var label = create('span', null, T.showMissions(total));
  var button = create('button', { type: 'button', className: 'card__toggle', 'aria-expanded': 'false', 'aria-controls': body.id },
    [label, icon(SVG_CHEVRON)]);
  tile.appendChild(button);
  step.setAttribute('data-state', 'collapsed');

  /** Opens or closes the card (any animation is delegated to animations.js). */
  function toggle(open) {
    emitOrRun(step, 'card:toggle', {
      open: open,
      apply: function () {
        extra.forEach(function (li) {
          if (open) li.removeAttribute('hidden');
          else li.setAttribute('hidden', 'until-found');
        });
        step.setAttribute('data-state', open ? 'expanded' : 'collapsed');
        button.setAttribute('aria-expanded', String(open));
        label.textContent = open ? T.showLess : T.showMissions(total);
      }
    });
  }
  button.addEventListener('click', function () { toggle(button.getAttribute('aria-expanded') !== 'true'); });
  // Find-in-page: the browser reveals the text, the card state is synced.
  extra.forEach(function (li) {
    li.addEventListener('beforematch', function () { if (button.getAttribute('aria-expanded') !== 'true') toggle(true); });
  });
}

/**
 * Renders the "Client assignments" section: one tile per client (placements),
 * in reverse chronological order. The section is hidden when there are none.
 * @param {Object} cv
 */
function renderClientMissions(cv) {
  var clients = window.CV_CALC.timelineNodes(cv).filter(function (n) { return n.clientMission; });
  var section = document.getElementById('missions');
  if (section) section.hidden = !clients.length;
  fill('missions', clients.length ? create('ul', { className: 'missions' }, clients.map(function (n) {
    var header = [create('p', { className: 'small' }, [n.range, create('span', { 'aria-hidden': 'true' }, ' · '), n.duration]),
      create('h3', { id: 'title-' + n.id }, n.employer.employer)];
    if (n.employer.location) header.push(create('p', { className: 'card__location' }, text(n.employer.location, 'location')));
    return create('li', { className: 'tile tile--mission', id: n.id, 'data-anim': 'reveal' },
      header.concat(n.positions.map(renderPosition)));
  })) : null);
}

/* --------------------------------------------------------------------------
   Education, contact, footer
   -------------------------------------------------------------------------- */

/**
 * Renders the education, sorted by descending end year.
 * @param {Array} education
 */
function renderEducation(education) {
  if (!education || !education.length) {
    fill('education', create('p', null, clarifyMarker(T.noEducation)));
    return;
  }
  fill('education', create('ul', { className: 'education' }, education.slice().sort(function (a, b) {
    return String(b.end).localeCompare(String(a.end));
  }).map(function (e) {
    return create('li', { className: 'tile tile--education', 'data-anim': 'reveal' }, [
      create('p', { className: 'small' }, [dateElement(e.start), ' – ', dateElement(e.end)]),
      create('h3', null, e.school),
      create('p', { className: 'education__degree' }, text(e.degree, 'degree')),
      e.field ? create('p', { className: 'small' }, text(e.field)) : null
    ]);
  })));
}

/**
 * Builds a contact row: pictogram, label, value and arrow (or a marker when to be clarified).
 * @param {string} label
 * @param {string|Object} value
 * @param {Function} toLink (content) => <a> element
 * @param {string} [display] text shown instead of the value
 * @param {string} [logo] pictogram key in window.CV_ICONS
 * @returns {HTMLElement}
 */
function contactRow(label, value, toLink, display, logo) {
  var picto = logo ? logoSvg(logo, 'contact__logo') : null;
  if (isToClarify(value)) {
    return create('li', { className: 'contact__row' }, [picto, create('span', { className: 'contact__text' }, [create('small', null, label), text(value, 'link')])]);
  }
  var content = [picto, create('span', { className: 'contact__text' }, [create('small', null, label), display || value]), icon(SVG_ARROW)];
  return create('li', null, toLink(content));
}

/**
 * Direct link (mailto:, tel:) whose address is written only as the visitor approaches
 * (hover, keyboard focus, touch): one click is enough, but robots reading the page
 * find neither the e-mail nor the number. When printing and in ?pdf mode, the value is shown.
 * @param {string} label "Email", "Phone" (reused when printing)
 * @param {string} value e-mail or number
 * @param {string} href real link (mailto:…, tel:…)
 * @param {string} logo pictogram key
 * @param {string} action link text ("Send an email", "Call")
 * @returns {HTMLElement}
 */
function protectedLink(label, value, href, logo, action) {
  var linkText = create('span', null, action);
  var link = create('a', { href: '#contact', className: 'button button--inverse contact__direct', 'data-label': label },
    [logoSvg(logo, 'contact__logo'), linkText]);
  /** Writes the real address of the link right before it is used. */
  function arm() { link.setAttribute('href', href); }
  // "click" covers mobile screen readers (double-tap with neither focus nor touch): navigation
  // reads the address after the handler, so it does go to mailto: / tel:.
  ['pointerenter', 'focus', 'touchstart', 'click'].forEach(function (type) { link.addEventListener(type, arm, { passive: true }); });
  /** Printing: the value replaces the action text. */
  function print() { arm(); linkText.textContent = value; }
  window.addEventListener('beforeprint', print);
  if (PDF_MODE) print();
  return link;
}

/**
 * Renders the Contact section: under the title, direct e-mail and phone links (protected from
 * robots); in the list, LinkedIn, GitHub, Instagram and TikTok, each with its pictogram.
 * @param {Object} contact
 */
function renderContact(contact) {
  contact = contact || {};
  var rows = [];
  // Under the title: direct e-mail and phone links (address written on approach). On the right: networks.
  var actions = [];
  if (contact.email && !isToClarify(contact.email)) {
    actions.push(protectedLink(T.email, contact.email, 'mailto:' + contact.email, 'email', T.sendEmail));
  } else if (contact.email) {
    rows.push(contactRow(T.email, contact.email, null, null, 'email'));
  }
  if (contact.phone) {
    var number = String(contact.phone);
    actions.push(protectedLink(T.phone, number, 'tel:' + number.replace(/[^\d+]/g, ''), 'phone', T.call));
  }
  fill('contact-actions', actions);
  // [label, URL, pictogram, handle prefixed with "@"]
  [['LinkedIn', contact.linkedin, 'linkedin', false], ['GitHub', contact.github, 'github', false],
    ['Instagram', contact.instagram, 'instagram', true], ['TikTok', contact.tiktok, 'tiktok', true]].forEach(function (network) {
    var url = network[1];
    if (!url) return;
    // Short display: the profile handle (the label already names the network).
    var segments = typeof url === 'string' ? url.replace(/[?#].*$/, '').split('/').filter(Boolean) : [];
    var handle = segments.length > 2 ? segments[segments.length - 1].replace(/^@/, '') : null;
    var short = handle ? (network[3] ? '@' : '') + handle : url;
    rows.push(contactRow(network[0], url, function (c) {
      // An unsafe URL is shown as plain text, without a link.
      return isSafeLink(url) ? externalLink(url, c) : create('span', { className: 'contact__plain' }, c);
    }, short, network[2]));
  });
  fill('contact', create('ul', { className: 'contact__links', id: 'contact-list' }, rows));
}

/**
 * Renders the footer: copyright notice.
 * @param {Object} cv
 */
function renderFooter(cv) {
  // Copyright: current year, so it never needs updating
  fill('signature', '© ' + new Date().getFullYear() + ' ' + cv.profile.name + '. ' + T.rights);
}

/* --------------------------------------------------------------------------
   Data loading
   -------------------------------------------------------------------------- */

/**
 * Shows an understandable error message in the role="alert" area.
 * @param {string} message
 */
function showError(message) {
  var area = document.getElementById('error');
  if (!area) return;
  area.textContent = message;
  area.hidden = false;
}

/**
 * Gets window.CV_DATA (data/cv.js) in the page language and checks the required fields.
 * Also works when the file is opened directly (file://), unlike fetch().
 * @returns {Promise<Object>}
 */
function loadCV() {
  return new Promise(function (resolve, reject) {
    if (!window.CV_DATA) return reject(new Error('window.CV_DATA missing: file not found or syntax error'));
    if (!window.CV_CALC) return reject(new Error('window.CV_CALC missing: js/calc.js not loaded'));
    var cv = window.CV_I18N.localize(window.CV_DATA);
    if (!cv.profile || !cv.profile.name) return reject(new Error('Required field "profile.name" missing'));
    resolve(cv);
  });
}

/**
 * Renders the whole CV from the loaded data.
 * @param {Object} cv
 */
function renderCV(cv) {
  renderHero(cv.profile);
  renderStats(cv);
  renderLanguages(cv.languages);
  renderAbout(cv.profile.summary, cv.profile.title);
  renderSkills(cv.skills);
  renderTimeline(cv);
  renderClientMissions(cv);
  renderEducation(cv.education);
  renderContact(cv.contact);
  renderFooter(cv);
}


/* --------------------------------------------------------------------------
   PDF button and generation mode
   -------------------------------------------------------------------------- */

/**
 * Sets up the download button of the static PDF; if the file cannot be
 * found, it becomes "Print the CV".
 * @param {Object} pdf { file, downloadName }
 */
function initPdfButton(pdf) {
  var link = document.getElementById('pdf-button');
  if (!link) return;
  if (pdf && pdf.file) {
    link.setAttribute('href', window.CV_I18N.asset(pdf.file));
    link.setAttribute('download', pdf.downloadName || '');
  }
  // When opened locally (file://), checking with a request is impossible: the link is kept.
  if (LOCAL_FILE) return;
  fetch(link.getAttribute('href'), { method: 'HEAD', cache: 'no-cache' }).then(function (response) {
    if (!response.ok) replaceWithPrint(link);
  }).catch(function () {
    replaceWithPrint(link);
  });
}

/**
 * Replaces the PDF link with a button that opens the browser's print dialog.
 * @param {HTMLElement} link
 */
function replaceWithPrint(link) {
  var button = create('button', { type: 'button', id: 'pdf-button', className: link.className }, T.print);
  button.addEventListener('click', function () { window.print(); });
  link.replaceWith(button);
}

/**
 * ?pdf mode only: loads data/private.js (untracked, window.CV_PRIVATE) and adds
 * the phone number to the contact list. Fails silently when the file is missing.
 */
function loadPhone() {
  if (!PDF_MODE || (window.CV_DATA && window.CV_DATA.contact && window.CV_DATA.contact.phone)) return;
  var script = document.createElement('script');
  script.src = PRIVATE_PATH;
  script.onload = function () {
    var priv = window.CV_PRIVATE;
    var list = document.getElementById('contact-list');
    if (!priv || !priv.phone || !list) return;
    var number = String(priv.phone);
    list.appendChild(contactRow(T.phone, number, function (c) {
      return create('a', { href: 'tel:' + number.replace(/[^\d+]/g, '') }, c);
    }));
  };
  script.onerror = function () { /* file missing: nothing to add */ };
  document.head.appendChild(script);
}

/* --------------------------------------------------------------------------
   Interface: theme, navigation, menu, markers
   -------------------------------------------------------------------------- */

/**
 * Sets up the theme button: stored theme, otherwise the system one.
 * aria-pressed="true" means the dark theme is on. Switching goes through
 * the "theme:toggle" event (M13 cross-fade when animations.js is active).
 */
function initTheme() {
  var button = document.getElementById('theme-button');
  if (!button) return;
  var root = document.documentElement;
  var darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

  /** Returns the theme currently displayed. */
  function effectiveTheme() {
    var chosen = root.getAttribute('data-theme');
    if (chosen === 'light' || chosen === 'dark') return chosen;
    return darkQuery.matches ? 'dark' : 'light';
  }

  /** Updates the announced state of the button. */
  function sync() {
    button.setAttribute('aria-pressed', String(effectiveTheme() === 'dark'));
  }

  button.addEventListener('click', function () {
    var next = effectiveTheme() === 'dark' ? 'light' : 'dark';
    emitOrRun(document, 'theme:toggle', {
      apply: function () {
        root.setAttribute('data-theme', next);
        try { localStorage.setItem('theme', next); } catch (e) { /* storage unavailable */ }
        sync();
      }
    });
  });
  // When the system changes and no choice is stored, the button follows.
  if (darkQuery.addEventListener) darkQuery.addEventListener('change', sync);
  sync();
}

/**
 * Marks the visible section in the menu (aria-current) and moves focus to the
 * target of any internal anchor after scrolling.
 */
function initNavigation() {
  document.addEventListener('click', function (evt) {
    var link = evt.target.closest('a[href^="#"]');
    if (evt.defaultPrevented || !link || link.getAttribute('href').length < 2) return;
    var target = document.getElementById(link.getAttribute('href').slice(1));
    if (!target) return;
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    // Native scrolling (smooth or not) happens; focus is moved without scrolling again.
    window.setTimeout(function () { target.focus({ preventScroll: true }); }, 0);
  });

  if (!('IntersectionObserver' in window)) return;
  var links = Array.prototype.slice.call(document.querySelectorAll('.menu__list a[href^="#"]'));
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      links.forEach(function (link) {
        if (link.getAttribute('href') === '#' + entry.target.id) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
      });
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  links.forEach(function (link) {
    var section = document.querySelector(link.getAttribute('href'));
    if (section) observer.observe(section);
  });
}

/**
 * Shows the "back to top" button once the hero has left the screen.
 * Without IntersectionObserver, the button stays visible at all times.
 */
function initBackToTop() {
  var button = document.querySelector('.back-to-top');
  var hero = document.querySelector('.tile--hero');
  if (!button) return;
  if (!hero || !('IntersectionObserver' in window)) {
    button.classList.add('back-to-top--visible');
    return;
  }
  new IntersectionObserver(function (entries) {
    button.classList.toggle('back-to-top--visible', !entries[0].isIntersecting);
  }).observe(hero);
}

/**
 * Footer dialogs ("Accessibility", "Legal notice"): each link with aria-haspopup="dialog"
 * opens the <dialog> its anchor targets, as a native modal. It closes with the button,
 * Escape or a click outside the dialog; focus then returns to the link. A page opened
 * with the dialog anchor (e.g. #legal) shows it at once.
 */
function initModals() {
  document.querySelectorAll('a[aria-haspopup="dialog"][href^="#"]').forEach(function (link) {
    var modal = document.getElementById(link.getAttribute('href').slice(1));
    if (!modal || typeof modal.showModal !== 'function') return;
    link.addEventListener('click', function (evt) {
      // Also prevents the anchor scrolling of main.js and animations.js (defaultPrevented)
      evt.preventDefault();
      modal.showModal();
    });
    var toAnchor = false;
    modal.addEventListener('click', function (evt) {
      if (evt.target === modal) modal.close();   // click on the backdrop
      else if (evt.target.closest('[data-close-modal]')) {
        // Link to a section: anchor navigation moves the focus, so it is not given back to the link
        toAnchor = true;
        modal.close();
      }
    });
    modal.addEventListener('close', function () {
      if (!toAnchor) link.focus({ preventScroll: true });
      toAnchor = false;
    });
    if (window.location.hash === '#' + modal.id) modal.showModal();
  });
}

/**
 * Language switch: remembers the visitor's choice (read by the root page) and keeps
 * the current section when changing language (same anchors in both languages).
 */
function initLanguageSwitch() {
  document.querySelectorAll('[data-lang-switch]').forEach(function (link) {
    link.addEventListener('click', function () {
      try { localStorage.setItem('lang', link.getAttribute('hreflang')); } catch (e) { /* storage unavailable */ }
      // Opened from the disk (file://), a folder URL would list its files: target the page itself.
      var href = link.getAttribute('href').split('#')[0];
      if (LOCAL_FILE && /\/$/.test(href)) href += 'index.html';
      link.setAttribute('href', href + window.location.hash);
    });
  });
}

/**
 * Handles the collapsible mobile menu: opening, closing after a choice and on Escape.
 * Any animation goes through the "menu:toggle" event (M12).
 */
function initMobileMenu() {
  var button = document.getElementById('menu-button');
  var menu = document.getElementById('menu');
  if (!button || !menu) return;

  /** Opens or closes the menu and updates aria-expanded. */
  function toggle(open) {
    button.setAttribute('aria-expanded', String(open));
    emitOrRun(menu, 'menu:toggle', {
      open: open,
      apply: function () { menu.classList.toggle('is-open', open); }
    });
  }

  button.addEventListener('click', function () {
    toggle(button.getAttribute('aria-expanded') !== 'true');
  });
  menu.addEventListener('click', function (evt) {
    if (evt.target.closest('a') && button.getAttribute('aria-expanded') === 'true') toggle(false);
  });
  document.addEventListener('keydown', function (evt) {
    if (evt.key === 'Escape' && button.getAttribute('aria-expanded') === 'true') {
      toggle(false);
      button.focus();
    }
  });
}

/**
 * "To be clarified" markers: the note opens on click (hover and focus are handled
 * in CSS), closes with Escape, an outside click or focus loss. One at a time.
 */
function initMarkers() {
  /** Closes every note except the one of the given button. */
  function closeAllBut(kept) {
    document.querySelectorAll('.tbc__button[aria-expanded="true"]').forEach(function (b) {
      if (b !== kept) b.setAttribute('aria-expanded', 'false');
    });
  }
  document.addEventListener('click', function (evt) {
    var button = evt.target.closest('.tbc__button');
    closeAllBut(button);
    if (button) button.setAttribute('aria-expanded', String(button.getAttribute('aria-expanded') !== 'true'));
  });
  document.addEventListener('keydown', function (evt) {
    if (evt.key === 'Escape') closeAllBut(null);
  });
  document.addEventListener('focusout', function (evt) {
    if (evt.target.classList && evt.target.classList.contains('tbc__button')) evt.target.setAttribute('aria-expanded', 'false');
  });
  // Before each opening (hover, focus, click), the note is moved back inside the viewport.
  ['pointerover', 'focusin', 'click'].forEach(function (type) {
    document.addEventListener(type, function (evt) {
      var marker = evt.target.closest && evt.target.closest('.tbc');
      if (marker) window.requestAnimationFrame(function () { placeNote(marker); });
    });
  });
}

/**
 * Shifts an open note horizontally so it stays whole inside the viewport (12 px margin).
 * @param {HTMLElement} marker .tbc element
 */
function placeNote(marker) {
  var note = marker.querySelector('.tbc__note');
  if (!note) return;
  note.style.left = '0px';
  var r = note.getBoundingClientRect();
  if (!r.width) return;
  var margin = 12, shift = 0;
  if (r.right > window.innerWidth - margin) shift = window.innerWidth - margin - r.right;
  if (r.left + shift < margin) shift = margin - r.left;
  note.style.left = shift + 'px';
}

/* --------------------------------------------------------------------------
   Start-up
   -------------------------------------------------------------------------- */

/**
 * ?prerender mode only: exposes the HTML of every [data-render] container (without its
 * decorative icons) as JSON in a
 * <script type="application/json" id="prerender-output">, read by scripts/generate-metadata.js.
 */
function exportPrerender() {
  var output = {};
  document.querySelectorAll('[data-render]').forEach(function (el) {
    // Decorative SVG icons are dropped: robots do not need them and JavaScript draws them back.
    var copy = el.cloneNode(true);
    copy.querySelectorAll('svg').forEach(function (svg) { svg.remove(); });
    output[el.getAttribute('data-render')] = copy.innerHTML;
  });
  var script = document.createElement('script');
  script.type = 'application/json';
  script.id = 'prerender-output';
  script.textContent = JSON.stringify(output).replace(/</g, '\\u003c');   // can never close the tag
  document.body.appendChild(script);
}

/**
 * Entry point: sets up the interface, renders the CV, then signals that it is ready
 * (cv-ready class and cv:ready event for js/animations.js).
 */
function start() {
  initTheme();
  initMobileMenu();
  initNavigation();
  initBackToTop();
  initModals();
  initLanguageSwitch();
  initMarkers();

  loadCV().then(function (cv) {
    renderCV(cv);
    if (PRERENDER_MODE) exportPrerender();
    initPdfButton(cv.pdf);
    loadPhone();
  }).catch(function (error) {
    showError(T.loadError);
    // Technical detail kept for the console, for the site owner.
    console.error('Unable to load data/cv.js:', error);
  }).then(function () {
    document.documentElement.classList.add('cv-ready');
    document.dispatchEvent(new Event('cv:ready'));
  });
}

start();
