(() => {
  'use strict';

  const roundLength = 60_000;
  const promptLength = 2_000;
  const boostLength = 3_000;
  const bonusKeys = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bonusTiers = [2, 5, 7];
  const gameKeys = new Set([
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Backspace',
    'Delete', 'Home', 'End', 'PageUp', 'PageDown',
  ]);
  const ids = [
    'game', 'start-button', 'replay-button', 'score', 'timer', 'best-score',
    'bonus-prompt', 'bonus-key', 'bonus-value', 'bonus-time', 'multiplier',
    'multiplier-time', 'multiplier-status', 'result-score', 'result-presses',
    'presses', 'tap-button', 'sound-toggle', 'help-button', 'help-dialog',
    'close-help',
  ];
  const ui = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
  const scoreFormat = new Intl.NumberFormat('en-US');

  let phase = 'ready';
  let startedAt = 0;
  let score = 0;
  let presses = 0;
  let best = Math.max(0, Number(readPreference('blinker-best-score')) || 0);
  let schedule = [];
  let nextPrompt = 0;
  let prompt = null;
  let multiplier = 1;
  let boostEndsAt = 0;
  let animationFrame = null;
  let deadlineTimer = null;

  let soundOn = readPreference('blinker-sound') !== 'off';
  let audio = null;
  let lastTickSound = -Infinity;

  function readPreference(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function savePreference(key, value) {
    try {
      localStorage.setItem(key, String(value));
    } catch {
      // Play can continue when a browser blocks local storage.
    }
  }

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function buildSchedule() {
    const cues = [];
    let shuffledTiers = [];
    let lastKey = null;
    let starts = randomBetween(4_500, 5_500);

    while (starts <= roundLength - promptLength - boostLength) {
      if (shuffledTiers.length === 0) {
        shuffledTiers = [...bonusTiers];
        for (let index = shuffledTiers.length - 1; index > 0; index -= 1) {
          const swap = Math.floor(Math.random() * (index + 1));
          [shuffledTiers[index], shuffledTiers[swap]] = [shuffledTiers[swap], shuffledTiers[index]];
        }
      }

      const keys = bonusKeys.replace(lastKey ?? '', '');
      lastKey = keys[Math.floor(Math.random() * keys.length)];
      cues.push({ key: lastKey, multiplier: shuffledTiers.pop(), starts, ends: starts + promptLength });
      starts += randomBetween(6_100, 7_100);
    }

    return cues;
  }

  function stateAt(now) {
    let elapsedMs = 0;
    if (phase === 'running') elapsedMs = Math.min(roundLength, Math.max(0, now - startedAt));
    if (phase === 'ended') elapsedMs = roundLength;
    const activePrompt = prompt ? {
      key: prompt.key,
      multiplier: prompt.multiplier,
      matched: prompt.matched,
      remaining: Math.max(0, prompt.ends - elapsedMs) / 1_000,
    } : null;

    return {
      phase,
      elapsed: elapsedMs / 1_000,
      remaining: (roundLength - elapsedMs) / 1_000,
      score,
      presses,
      best,
      prompt: activePrompt,
      multiplier,
      multiplierRemaining: multiplier > 1 ? Math.max(0, boostEndsAt - now) / 1_000 : 0,
    };
  }

  function emit(type, state, extra) {
    window.dispatchEvent(new CustomEvent(`blinker:${type}`, { detail: { ...state, ...extra } }));
  }

  function setText(id, text) {
    const node = ui[id];
    if (node && node.textContent !== text) node.textContent = text;
  }

  function setData(node, name, value) {
    if (node && node.dataset[name] !== value) node.dataset[name] = value;
  }

  function render(state) {
    const seconds = Math.ceil(state.remaining);
    const minutes = String(Math.floor(seconds / 60)).padStart(2, '0');
    const remainder = String(seconds % 60).padStart(2, '0');
    setText('timer', `${minutes}:${remainder}`);
    setText('score', scoreFormat.format(state.score));
    setText('presses', scoreFormat.format(state.presses));
    setText('best-score', scoreFormat.format(state.best));
    setText('multiplier', `${state.multiplier}×`);
    setText('multiplier-time', state.multiplier > 1 ? `${state.multiplierRemaining.toFixed(1)}s` : '');
    setText('multiplier-status', state.multiplier > 1 ? 'Active' : 'Ready');

    const root = ui.game;
    setData(root, 'phase', state.phase);
    setData(root, 'boosted', String(state.multiplier > 1));
    setData(root, 'hasPrompt', String(Boolean(state.prompt)));
    root?.style.setProperty('--time-fraction', String(state.remaining / 60));
    root?.style.setProperty('--bonus-fraction', String((state.prompt?.remaining ?? 0) / 2));
    root?.style.setProperty('--multiplier-fraction', String(state.multiplierRemaining / 3));

    const promptUi = ui['bonus-prompt'];
    if (promptUi) promptUi.hidden = !state.prompt;
    if (state.prompt) {
      setData(promptUi, 'matched', String(state.prompt.matched));
      setData(promptUi, 'tier', String(state.prompt.multiplier));
      setText('bonus-key', state.prompt.key);
      setText('bonus-value', `${state.prompt.multiplier}×`);
      setText('bonus-time', `${state.prompt.remaining.toFixed(1)}s`);
      ui['bonus-key']?.setAttribute('aria-disabled', String(state.prompt.matched));
    }

    if (state.phase === 'ended') {
      setText('result-score', scoreFormat.format(state.score));
      setText('result-presses', scoreFormat.format(state.presses));
    }
  }

  function enableAudio() {
    if (!soundOn) return;
    const Audio = window.AudioContext ?? window.webkitAudioContext;
    if (!Audio) return;

    try {
      audio ??= new Audio();
      if (audio.state === 'suspended') audio.resume().catch(() => {});
    } catch {
      // Audio hardware or automatic playback policy can be unavailable.
    }
  }

  function note(from, to, duration, volume, delay = 0, shape = 'sine') {
    if (!soundOn || audio?.state !== 'running') return;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    const start = audio.currentTime + delay;
    const stop = start + duration;

    oscillator.type = shape;
    oscillator.frequency.setValueAtTime(from, start);
    oscillator.frequency.exponentialRampToValueAtTime(to, stop);
    gain.gain.setValueAtTime(0.001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, stop);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(start);
    oscillator.stop(stop);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  }

  function updateSoundButton() {
    setData(ui.game, 'muted', String(!soundOn));
    const toggle = ui['sound-toggle'];
    toggle?.setAttribute('aria-pressed', String(soundOn));
    const label = toggle?.querySelector('.sound-label');
    if (label) label.textContent = soundOn ? 'Sound on' : 'Sound off';
  }

  function finishRound(now) {
    if (phase !== 'running') return;
    phase = 'ended';
    prompt = null;
    multiplier = 1;
    clearTimeout(deadlineTimer);
    cancelAnimationFrame(animationFrame);
    animationFrame = null;
    deadlineTimer = null;

    const newBest = score > best;
    if (newBest) {
      best = score;
      savePreference('blinker-best-score', best);
    }

    if (ui['help-dialog']?.open) ui['help-dialog'].close();
    setData(ui.game, 'newBest', String(newBest));
    const state = stateAt(now);
    render(state);
    emit('frame', state);
    emit('end', state, { newBest });
    note(166, 42, 0.46, 0.19, 0, 'triangle');
    note(274, 85, 0.24, 0.07, 0.03);
  }

  function advance(now) {
    if (phase !== 'running') return;
    const elapsed = now - startedAt;
    if (elapsed >= roundLength) {
      finishRound(now);
      return;
    }

    if (prompt && elapsed >= prompt.ends) prompt = null;
    if (multiplier > 1 && now >= boostEndsAt) multiplier = 1;

    for (; nextPrompt < schedule.length && schedule[nextPrompt].starts <= elapsed; nextPrompt += 1) {
      const next = schedule[nextPrompt];
      if (elapsed < next.ends) {
        prompt = { ...next, matched: false };
        emit('prompt', stateAt(now));
        note(760, 525, 0.15, 0.043);
      }
    }
  }

  function step() {
    // The rAF timestamp can predate a click that started the current round.
    const now = performance.now();
    advance(now);
    if (phase === 'running') {
      const state = stateAt(now);
      render(state);
      emit('frame', state);
      animationFrame = requestAnimationFrame(step);
    }
  }

  function settleDeadline() {
    if (phase !== 'running') return;
    const now = performance.now();
    advance(now);
    if (phase === 'running') {
      deadlineTimer = setTimeout(settleDeadline, startedAt + roundLength - now);
    }
  }

  function startRound() {
    if (phase === 'running' || ui['help-dialog']?.open) return;
    enableAudio();
    schedule = buildSchedule();
    nextPrompt = 0;
    prompt = null;
    multiplier = 1;
    boostEndsAt = 0;
    score = 0;
    presses = 0;
    lastTickSound = -Infinity;
    startedAt = performance.now();
    phase = 'running';
    setData(ui.game, 'newBest', 'false');

    const state = stateAt(startedAt);
    render(state);
    ui.game?.focus({ preventScroll: true });
    emit('start', state);
    emit('frame', state);
    note(230, 370, 0.15, 0.07, 0, 'triangle');
    note(375, 610, 0.18, 0.065, 0.11, 'triangle');
    deadlineTimer = setTimeout(settleDeadline, roundLength);
    animationFrame = requestAnimationFrame(step);
  }

  function scorePress(key, source) {
    const now = performance.now();
    advance(now);
    if (phase !== 'running') return;

    const caught = Boolean(prompt && !prompt.matched && key === prompt.key);
    if (source === 'bonus-button' && !caught) return;
    if (caught) {
      prompt.matched = true;
      multiplier = prompt.multiplier;
      boostEndsAt = now + boostLength;
    }

    const points = multiplier;
    presses += 1;
    score += points;
    const state = stateAt(now);
    render(state);
    const hit = { key, points, source };
    if (caught) {
      emit('bonus', state, hit);
      note(290, 490, 0.15, 0.085, 0, 'triangle');
      note(440, 810, 0.23, 0.07, 0.09, 'triangle');
    } else if (now - lastTickSound >= 31) {
      lastTickSound = now;
      const pitch = 144 + points * 25 + presses % 5 * 9;
      note(pitch, pitch * 0.57, 0.045, 0.035, 0, 'triangle');
    }
    emit('hit', state, hit);
  }

  function handleKeyboard(event) {
    if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey
      || ui['help-dialog']?.open) return;

    const { key, target } = event;
    const element = target instanceof Element ? target : null;
    const activatesControl = (key === ' ' || key === 'Enter')
      && element?.closest('button, a[href], summary, [role="button"]');
    if (event.repeat) {
      if (phase === 'running' && !element?.closest('input, select, textarea, [contenteditable]')
        && (key.length === 1 || gameKeys.has(key))) event.preventDefault();
      return;
    }
    if (activatesControl || element?.closest('input, select, textarea, [contenteditable]')) return;

    if (phase !== 'running') {
      if (key === ' ') {
        event.preventDefault();
        startRound();
      }
      return;
    }

    if (key.length === 1 || gameKeys.has(key)) {
      event.preventDefault();
      scorePress(key === ' ' ? 'SPACE' : key.toUpperCase(), 'keyboard');
    }
  }

  window.addEventListener('keydown', handleKeyboard);
  ui['start-button']?.addEventListener('click', startRound);
  ui['replay-button']?.addEventListener('click', startRound);
  ui['tap-button']?.addEventListener('click', () => scorePress('TAP', 'tap-button'));
  ui['bonus-key']?.addEventListener('click', () => {
    if (prompt) scorePress(prompt.key, 'bonus-button');
  });
  ui['sound-toggle']?.addEventListener('click', () => {
    soundOn = !soundOn;
    savePreference('blinker-sound', soundOn ? 'on' : 'off');
    updateSoundButton();
    enableAudio();
    note(410, 520, 0.12, 0.065);
  });
  ui['help-button']?.addEventListener('click', () => {
    if (ui['help-dialog'] && !ui['help-dialog'].open) ui['help-dialog'].showModal();
  });
  ui['close-help']?.addEventListener('click', () => ui['help-dialog']?.close());
  document.addEventListener('visibilitychange', () => {
    if (phase === 'running') advance(performance.now());
  });

  updateSoundButton();
  const ready = stateAt(performance.now());
  render(ready);
  emit('frame', ready);
})();
