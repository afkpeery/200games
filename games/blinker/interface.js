(() => {
  const game = document.getElementById('game');
  const timerProgress = document.getElementById('timer-progress');
  const stageStatus = document.getElementById('stage-status');
  const bonusCaption = document.getElementById('bonus-caption');
  const bonusPrompt = document.getElementById('bonus-prompt');
  const bonusKey = document.getElementById('bonus-key');
  const multiplierTime = document.getElementById('multiplier-time');
  const statuses = { ready: 'READY', running: 'LIVE', ended: 'TIME’S UP' };

  const setText = (element, value) => {
    if (element.textContent !== value) element.textContent = value;
  };

  window.addEventListener('blinker:frame', ({ detail }) => {
    const { phase, remaining, prompt, multiplier } = detail;
    game.style.setProperty('--time-left', remaining / 60);
    const seconds = String(Math.ceil(remaining));
    if (timerProgress.getAttribute('aria-valuenow') !== seconds) {
      timerProgress.setAttribute('aria-valuenow', seconds);
    }
    if (game.dataset.tier !== String(multiplier)) game.dataset.tier = String(multiplier);
    multiplierTime.hidden = multiplier <= 1;
    game.classList.toggle('time-low', phase === 'running' && remaining <= 10);
    setText(stageStatus, statuses[phase]);
    if (prompt) {
      bonusPrompt.style.setProperty('--bonus-left', prompt.remaining / 2);
      setText(bonusCaption, prompt.matched ? 'BOOST CAUGHT' : 'BONUS KEY');
      const label = `Bonus key ${prompt.key}`;
      if (bonusKey.getAttribute('aria-label') !== label) bonusKey.setAttribute('aria-label', label);
    }
  });
})();
