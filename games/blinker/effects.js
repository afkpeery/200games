(() => {
  'use strict';

  const stage = document.querySelector('#stage');
  const canvas = document.querySelector('#effects-canvas');
  const portrait = document.querySelector('#portrait');
  const motion = document.querySelector('#portrait-motion');
  const context = canvas?.getContext('2d');
  if (!stage || !portrait || !motion || !context) return;

  const artWidth = 1536;
  const artHeight = 1024;
  const eyeShapes = [
    {
      x: 687, y: 463, rx: 40, ry: 39, pupilX: 700, pupilY: 461, pupilR: 22, direction: -1,
      path: 'M 646 464 C 646 444 662 427 678 425 C 701 417 721 438 725 456 C 728 469 729 480 722 487 C 712 499 692 503 675 498 C 658 494 647 481 646 464 Z'
    },
    {
      x: 830, y: 462, rx: 41, ry: 39, pupilX: 816, pupilY: 461, pupilR: 22, direction: 1,
      path: 'M 788 468 C 789 447 804 429 821 424 C 843 418 862 431 868 449 C 876 475 861 496 840 500 C 823 503 801 495 791 482 C 787 479 787 472 788 468 Z'
    }
  ];
  const colors = { 2: '#d5ff68', 5: '#c2a0ff', 7: '#ff7ac5' };
  const confettiColors = ['#e2ff7d', '#ff80d4', '#bda1ff', '#fdf5ff', '#ffab79'];
  const veins = [
    { start: [-1.06, -0.26], stem: [-0.81, -0.24, -0.68, -0.13, -0.55, -0.23], branch: [-0.73, -0.2, -0.70, -0.42, -0.58, -0.50] },
    { start: [-0.98, 0.4], stem: [-0.8, 0.32, -0.61, 0.55, -0.35, 0.40], branch: [-0.66, 0.44, -0.50, 0.53, -0.45, 0.71] },
    { start: [-0.37, 1.0], stem: [-0.41, 0.88, -0.30, 0.83, -0.34, 0.66], branch: [-0.35, 0.82, -0.23, 0.83, -0.15, 0.75] },
    { start: [-0.61, -0.87], stem: [-0.54, -0.71, -0.30, -0.68, -0.25, -0.53], branch: [-0.48, -0.73, -0.41, -0.83, -0.27, -0.83] },
    { start: [0.39, 0.86], stem: [0.30, 0.76, 0.44, 0.71, 0.34, 0.59], branch: [0.35, 0.74, 0.45, 0.78, 0.58, 0.67] }
  ];
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = preference.matches;
  let game = { phase: 'ready', elapsed: 0, multiplier: 1 };
  let lens = { width: 1, height: 1, scaleX: 1, scaleY: 1, x: 0, y: 0, centerX: 0, centerY: 0, density: 1 };
  let smoke = [];
  let sparks = [];
  let lastFrame = 0;
  let smokeTime = 0;
  let hitTime = -Infinity;
  let bonusTime = -Infinity;
  let endTime = -Infinity;
  let recoil = 0;
  let direction = 1;
  let bonusColor = colors[2];
  let scleraReady = false;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const random = (min, max) => min + Math.random() * (max - min);

  function getEyes() {
    try {
      const custom = JSON.parse(stage.dataset.eyes);
      if (custom?.length === 2 && custom.every(eye => Number.isFinite(eye.x) && Number.isFinite(eye.y) && eye.rx > 0 && eye.ry > 0)) {
        return custom.map((eye, i) => ({
          x: eye.x * artWidth, y: eye.y * artHeight, rx: eye.rx * artWidth, ry: eye.ry * artHeight,
          pupilX: (eye.pupilX ?? eye.x) * artWidth, pupilY: (eye.pupilY ?? eye.y) * artHeight,
          pupilR: (eye.pupilR ?? eye.rx * 0.54) * artWidth, direction: i === 0 ? -1 : 1
        }));
      }
    } catch {
      // The shipped portrait uses hand-traced sclera contours.
    }
    return eyeShapes;
  }

  const eyes = getEyes();
  for (const eye of eyes) {
    eye.outline = new Path2D(eye.path);
    if (!eye.path) eye.outline.ellipse(eye.x, eye.y, eye.rx, eye.ry, 0, 0, Math.PI * 2);
    eye.sclera = new Path2D(eye.outline);
    eye.sclera.ellipse(eye.pupilX, eye.pupilY, eye.pupilR, eye.pupilR * 1.03, 0, 0, Math.PI * 2);
  }

  function imageAnchor(value) {
    if (value?.endsWith('%')) return Number.parseFloat(value) / 100;
    if (value === 'left' || value === 'top') return 0;
    if (value === 'right' || value === 'bottom') return 1;
    return 0.5;
  }

  function resize() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    const density = Math.min(window.devicePixelRatio || 1, 2.5);
    const style = getComputedStyle(portrait);
    const [horizontal, vertical] = style.objectPosition.split(' ');
    const naturalRatio = (portrait.naturalWidth || artWidth) / (portrait.naturalHeight || artHeight);
    const boxWidth = portrait.offsetWidth || width;
    const boxHeight = portrait.offsetHeight || height;
    let renderWidth = boxWidth;
    let renderHeight = boxHeight;
    if (style.objectFit === 'cover' || style.objectFit === 'contain') {
      const stickToWidth = style.objectFit === 'cover'
        ? boxWidth / boxHeight > naturalRatio
        : boxWidth / boxHeight < naturalRatio;
      if (stickToWidth) renderHeight = boxWidth / naturalRatio;
      else renderWidth = boxHeight * naturalRatio;
    }
    lens = {
      width, height, density, scaleX: renderWidth / artWidth, scaleY: renderHeight / artHeight,
      x: motion.offsetLeft + portrait.offsetLeft + (boxWidth - renderWidth) * imageAnchor(horizontal),
      y: motion.offsetTop + portrait.offsetTop + (boxHeight - renderHeight) * imageAnchor(vertical),
      centerX: motion.offsetLeft + (motion.offsetWidth || width) / 2,
      centerY: motion.offsetTop + (motion.offsetHeight || height) / 2
    };
    canvas.width = Math.round(width * density);
    canvas.height = Math.round(height * density);
  }

  function prepareSclera() {
    if (!portrait.naturalWidth || scleraReady) return;
    const sourceX = portrait.naturalWidth / artWidth;
    const sourceY = portrait.naturalHeight / artHeight;
    for (const eye of eyes) {
      const patch = document.createElement('canvas');
      const left = Math.floor(eye.x - eye.rx - 5);
      const top = Math.floor(eye.y - eye.ry - 5);
      patch.width = Math.ceil(eye.rx * 2 + 10);
      patch.height = Math.ceil(eye.ry * 2 + 10);
      const paint = patch.getContext('2d');
      paint.drawImage(portrait, left * sourceX, top * sourceY, patch.width * sourceX, patch.height * sourceY, 0, 0, patch.width, patch.height);
      const centerX = eye.pupilX - left - eye.direction * 6;
      const centerY = eye.pupilY - top - 8;
      const color = paint.createRadialGradient(centerX, centerY, 3, eye.x - left, eye.y - top + 4, Math.max(eye.rx, eye.ry) * 1.23);
      color.addColorStop(0, '#fff2e5');
      color.addColorStop(0.36, '#ff938e');
      color.addColorStop(0.74, '#ff666e');
      color.addColorStop(1, '#e73451');
      paint.globalCompositeOperation = 'multiply';
      paint.fillStyle = color;
      paint.fillRect(0, 0, patch.width, patch.height);
      eye.tint = { patch, left, top };
    }
    scleraReady = true;
  }

  function paintRedness(eye, amount) {
    if (amount <= 0) return;
    context.save();
    context.clip(eye.sclera, 'evenodd');
    context.globalAlpha = amount * 0.96;
    if (eye.tint) {
      context.drawImage(eye.tint.patch, eye.tint.left, eye.tint.top);
    } else {
      context.fillStyle = '#f34d60';
      context.fillRect(eye.x - eye.rx, eye.y - eye.ry, eye.rx * 2, eye.ry * 2);
    }

    const veinOpacity = clamp((amount - 0.12) / 0.88, 0, 1);
    context.translate(eye.x, eye.y);
    context.scale(-eye.direction * eye.rx, eye.ry);
    context.strokeStyle = '#9e253f';
    context.lineCap = 'round';
    context.lineJoin = 'round';
    for (const [index, vein] of veins.entries()) {
      const weight = index % 2 === 0 ? 1 : 0.76;
      context.globalAlpha = veinOpacity * weight * 0.6;
      context.lineWidth = 0.019 + weight * 0.011;
      context.beginPath();
      context.moveTo(...vein.start);
      context.bezierCurveTo(...vein.stem);
      context.stroke();
      context.globalAlpha *= 0.7;
      context.lineWidth *= 0.62;
      context.beginPath();
      context.moveTo(...vein.branch.slice(0, 2));
      context.quadraticCurveTo(...vein.branch.slice(2));
      context.stroke();
    }
    context.restore();
  }

  function makeCloud() {
    const sprite = document.createElement('canvas');
    sprite.width = 144;
    sprite.height = 144;
    const paint = sprite.getContext('2d');
    const lobes = [[65, 76, 59, 0.55], [87, 76, 40, 0.34], [53, 66, 39, 0.28], [65, 49, 39, 0.24]];
    for (const [x, y, radius, opacity] of lobes) {
      const gradient = paint.createRadialGradient(x, y, 3, x, y, radius);
      gradient.addColorStop(0, 'rgba(227, 192, 255, ' + opacity + ')');
      gradient.addColorStop(0.56, 'rgba(168, 117, 248, ' + opacity / 3 + ')');
      gradient.addColorStop(1, 'rgba(153, 94, 229, 0)');
      paint.fillStyle = gradient;
      paint.fillRect(0, 0, 144, 144);
    }
    return sprite;
  }

  const cloud = makeCloud();

  function expelSmoke(now, charge) {
    if (smoke.length > 38) smoke.shift();
    smoke.push({
      born: now, life: random(1.4, 2.9), x: 718 + random(-9, 8), y: 623 + random(-5, 5),
      speedX: random(106, 182), speedY: random(24, 62), radius: random(25, 46),
      phase: random(0, Math.PI * 2), opacity: random(0.23, 0.44) * (0.38 + charge * 0.62)
    });
  }

  function paintSmoke(now) {
    smoke = smoke.filter(puff => now - puff.born < puff.life * 1000);
    context.save();
    for (const puff of smoke) {
      const age = (now - puff.born) / 1000;
      const phase = age / puff.life;
      const radius = puff.radius + age * 53;
      const x = puff.x - puff.speedX * age + Math.sin(age * 2.9 + puff.phase) * age * 12;
      const y = puff.y - puff.speedY * age - age * age * 38;
      context.save();
      context.translate(x, y);
      context.rotate(puff.phase + age * 0.52);
      context.globalAlpha = Math.sin(phase * Math.PI) * puff.opacity;
      context.drawImage(cloud, -radius, -radius * 0.65, radius * 2, radius * 1.3);
      context.restore();
    }
    context.restore();
  }

  function star(x, y, radius, rotation, points = 4) {
    context.beginPath();
    for (let point = 0; point < points * 2; point++) {
      const angle = rotation + point * Math.PI / points;
      const reach = point % 2 === 0 ? radius : radius * 0.3;
      const nextX = x + Math.cos(angle) * reach;
      const nextY = y + Math.sin(angle) * reach;
      if (point === 0) context.moveTo(nextX, nextY);
      else context.lineTo(nextX, nextY);
    }
    context.closePath();
    context.fill();
  }

  function emitSparks(x, y, time, quantity, color, speed) {
    for (let i = 0; i < quantity; i++) {
      const angle = random(0, Math.PI * 2);
      const distance = random(speed * 0.33, speed);
      sparks.push({
        x, y, born: time, life: random(0.54, 1.18), vx: Math.cos(angle) * distance,
        vy: Math.sin(angle) * distance - speed * 0.18, angle, spin: random(-9, 9),
        radius: random(2.4, 10.6), color: color || confettiColors[i % confettiColors.length],
        star: i % 4 === 0
      });
    }
  }

  function paintSparks(now) {
    sparks = sparks.filter(spark => now - spark.born < spark.life * 1000);
    context.save();
    for (const spark of sparks) {
      const age = Math.max(0, now - spark.born) / 1000;
      const progress = age / spark.life;
      const slowing = 1 - 0.36 * progress;
      const x = spark.x + spark.vx * age * slowing;
      const y = spark.y + spark.vy * age * slowing + 160 * age * age;
      const angle = spark.angle + age * spark.spin;
      context.globalAlpha = 1 - progress * progress;
      context.fillStyle = spark.color;
      if (spark.star) {
        star(x, y, spark.radius * (1 - 0.52 * progress), angle);
      } else {
        context.save();
        context.translate(x, y);
        context.rotate(angle);
        context.fillRect(-spark.radius / 2, -1.2, spark.radius, 2.4);
        context.restore();
      }
    }
    context.restore();
  }

  function paintLed(now) {
    const hit = clamp(1 - (now - hitTime) / 410, 0, 1);
    const bonus = clamp(1 - (now - bonusTime) / 560, 0, 1);
    const color = bonus > hit ? bonusColor : '#dfff63';
    const gain = Math.max(hit * 0.78, bonus * 0.95);
    if (gain === 0) return;
    context.save();
    const lamp = context.createRadialGradient(711, 681, 0, 711, 681, 31);
    lamp.addColorStop(0, color + '6e');
    lamp.addColorStop(0.28, color + 'bb');
    lamp.addColorStop(0.4, color + '70');
    lamp.addColorStop(1, color + '00');
    context.globalCompositeOperation = 'screen';
    context.globalAlpha = gain;
    context.fillStyle = lamp;
    context.fillRect(678, 648, 66, 66);
    context.restore();
  }

  function paintSpentEyes(eye, age) {
    const amount = reduced ? 1 : clamp((age - 0.055) * 16, 0, 1);
    if (amount === 0) return;
    context.save();
    context.clip(eye.outline);
    context.globalAlpha = amount;
    const socket = context.createRadialGradient(eye.x, eye.y + 3, 2, eye.x, eye.y + 3, eye.rx * 1.12);
    socket.addColorStop(0, '#53356b');
    socket.addColorStop(0.62, '#271635');
    socket.addColorStop(1, '#180d23');
    context.fillStyle = socket;
    context.fillRect(eye.x - eye.rx - 5, eye.y - eye.ry - 5, eye.rx * 2 + 10, eye.ry * 2 + 10);
    context.fillStyle = '#b880ff';
    const fade = reduced ? 1 : clamp((age - 0.23) * 4, 0, 1);
    context.globalAlpha = amount * fade;
    star(eye.x, eye.y, 23, Math.PI / 4);
    context.fillStyle = '#f4e1ff';
    star(eye.x - 1.2, eye.y - 1.3, 12, Math.PI / 4);
    context.restore();
  }

  function paintFlyingEye(eye, age) {
    if (age > 0.92) return;
    const x = eye.x + eye.direction * (age * 268 + age * age * 114);
    const y = eye.y - 198 * age + 285 * age * age;
    const size = 26 + 27 * Math.sin(Math.min(age * 2.3, 1) * Math.PI / 2);
    const fade = 1 - clamp((age - 0.52) * 2.5, 0, 1);
    context.save();
    context.translate(x, y);
    context.rotate(eye.direction * age * 5.5);
    context.globalAlpha = fade;
    const pearl = context.createRadialGradient(-size * 0.32, -size * 0.36, 2, 0, 0, size);
    pearl.addColorStop(0, '#fffddf');
    pearl.addColorStop(0.60, '#faeacb');
    pearl.addColorStop(0.87, '#f29da9');
    pearl.addColorStop(1, '#e64fb6');
    context.fillStyle = pearl;
    context.shadowBlur = 15;
    context.shadowColor = '#ee76f6';
    context.beginPath();
    context.arc(0, 0, size, 0, Math.PI * 2);
    context.fill();
    context.shadowBlur = 0;
    const iris = context.createRadialGradient(-size * 0.02, -size * 0.05, 1, size * 0.1, 0, size * 0.52);
    iris.addColorStop(0.38, '#72831d');
    iris.addColorStop(0.68, '#b5c348');
    iris.addColorStop(1, '#4e4f1a');
    context.fillStyle = iris;
    context.beginPath();
    context.arc(size * 0.1, 0, size * 0.52, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#140f21';
    context.beginPath();
    context.arc(size * 0.12, -size * 0.01, size * 0.28, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#fff9e4';
    context.beginPath();
    context.arc(size * 0.27, -size * 0.2, size * 0.10, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function paintBreak(age) {
    for (const eye of eyes) {
      paintSpentEyes(eye, age);
      if (reduced) continue;
      if (age < 0.75) {
        const progress = age / 0.75;
        const radius = eye.rx * (0.56 + progress * 2.2);
        context.save();
        context.globalAlpha = (1 - progress) ** 2;
        context.strokeStyle = eye.direction < 0 ? '#edabff' : '#faffac';
        context.lineWidth = 4 * (1 - progress) + 0.5;
        context.beginPath();
        context.arc(eye.x, eye.y, radius, 0, Math.PI * 2);
        context.stroke();
        if (age < 0.26) {
          context.globalAlpha *= 0.75;
          context.fillStyle = '#fff2ca';
          star(eye.x, eye.y, 47 * Math.sin(age / 0.26 * Math.PI), age * 4, 6);
        }
        context.restore();
      }
      paintFlyingEye(eye, age);
    }
  }

  function render(now) {
    const delta = lastFrame ? Math.min(now - lastFrame, 34) : 16;
    lastFrame = now;
    recoil *= Math.exp(-delta / 142);
    const elapsed = clamp(game.elapsed / 60, 0, 1);
    const age = Math.max(0, now - endTime) / 1000;
    const active = game.phase === 'running';
    const ended = game.phase === 'ended' && Number.isFinite(endTime);
    const kick = reduced || !Number.isFinite(hitTime) ? 0 : recoil * Math.sin((now - hitTime) / 64);
    const breath = reduced ? 0 : Math.sin(now / 565);
    const shake = !reduced && ended && age < 0.33 ? Math.sin(age * 88) * (1 - age / 0.33) : 0;
    const x = direction * kick * 2 + shake * 4;
    const y = breath * 1.35 - kick * 3.2;
    const angle = kick * direction * 0.006 + shake * 0.013;
    const zoom = reduced ? 1 : 1.02 + breath * 0.002 + Math.abs(kick) * 0.01 + Math.abs(shake) * 0.028;
    motion.style.transform = reduced ? '' : 'translate(' + x + 'px, ' + y + 'px) rotate(' + angle + 'rad) scale(' + zoom + ')';

    context.setTransform(lens.density, 0, 0, lens.density, 0, 0);
    context.clearRect(0, 0, lens.width, lens.height);
    context.save();
    context.translate(lens.centerX + x, lens.centerY + y);
    context.rotate(angle);
    context.scale(zoom, zoom);
    context.translate(lens.x - lens.centerX, lens.y - lens.centerY);
    context.scale(lens.scaleX, lens.scaleY);
    if (active && !reduced && now - smokeTime > 920 - 670 * elapsed) {
      expelSmoke(now, elapsed);
      smokeTime = now;
    }
    if (!reduced) paintSmoke(now);
    paintLed(now);
    if (ended) {
      paintBreak(age);
    } else if (active) {
      const red = elapsed ** 0.84;
      for (const eye of eyes) paintRedness(eye, red);
    }
    if (!reduced) paintSparks(now);
    context.restore();
    requestAnimationFrame(render);
  }

  function updateGame(event) {
    game = event.detail;
  }

  window.addEventListener('blinker:frame', updateGame);
  window.addEventListener('blinker:start', event => {
    updateGame(event);
    endTime = -Infinity;
    hitTime = -Infinity;
    bonusTime = -Infinity;
    recoil = 0;
    smoke = [];
    sparks = [];
    smokeTime = performance.now();
    if (!reduced) expelSmoke(smokeTime, 0.2);
  });
  window.addEventListener('blinker:hit', event => {
    updateGame(event);
    const now = performance.now();
    if (now - hitTime > 82) direction *= -1;
    recoil = Math.min(0.95, recoil + 0.38);
    hitTime = now;
    if (!reduced && now - smokeTime > 162) {
      expelSmoke(now, game.elapsed / 60);
      smokeTime = now;
    }
  });
  window.addEventListener('blinker:bonus', event => {
    updateGame(event);
    bonusTime = performance.now();
    bonusColor = colors[game.multiplier] || colors[2];
    if (!reduced) emitSparks(711, 681, bonusTime, 12, bonusColor, 169);
  });
  window.addEventListener('blinker:end', event => {
    updateGame(event);
    endTime = performance.now();
    if (!reduced) {
      for (const eye of eyes) emitSparks(eye.x, eye.y, endTime, 38, null, 474);
    }
  });

  preference.addEventListener('change', event => {
    reduced = event.matches;
    if (reduced) {
      smoke = [];
      sparks = [];
    }
  });
  portrait.addEventListener('load', () => {
    scleraReady = false;
    prepareSclera();
    resize();
  });
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);
  window.addEventListener('resize', resize);
  prepareSclera();
  resize();
  requestAnimationFrame(render);
})();
