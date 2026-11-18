const cabinet=document.querySelector('.cabinet');
const product=document.querySelector('.product');
const canvas=document.querySelector('#controller');
const poster=product.querySelector('.poster');
const stillImage=poster.getAttribute('src');
const animatedImage='./assets/controller-spin.webp';
const power=document.querySelector('#power');
const motion=document.querySelector('#motion');
const standby=document.querySelector('.standby');
const signal=document.querySelector('#signal');
const snow=document.querySelector('#snow');
const ctx=snow.getContext('2d');
snow.width=220;
snow.height=130;
const grain=ctx.createImageData(snow.width,snow.height);
const preference=matchMedia('(prefers-reduced-motion: reduce)');
let on=true;
let moving=!preference.matches;
let angle=-.38;
let age=0;
let last=0;
let lastNoise=-Infinity;
let pointer;
let render;
let renderController;
let waitingForRenderer=location.protocol!=='file:';
function showFallback() {
  render=undefined;
  pointer=undefined;
  product.classList.remove('rendered');
  updatePreview();
}
function showController() {
  render=renderController;
  render(angle,age);
  product.classList.add('rendered');
  updatePreview();
}
function updatePreview() {
  const src=!render&&!waitingForRenderer&&on&&moving?animatedImage:stillImage;
  if(poster.getAttribute('src')!==src) poster.src=src;
}
canvas.addEventListener('webglcontextlost',event=>{
  event.preventDefault();
  showFallback();
});
canvas.addEventListener('webglcontextrestored',()=>{
  if(renderController) showController();
});
function drawNoise(time) {
  const tracking=Math.floor(time/33)%snow.height;
  for(let y=0;y<snow.height;y++) {
    const band=Math.abs(y-tracking)<2?24:0;
    for(let x=0;x<snow.width;x++) {
      const offset=(y*snow.width+x)*4;
      const gray=Math.random()*(band?153:67)+band;
      grain.data[offset]=gray;
      grain.data[offset+1]=gray*.84;
      grain.data[offset+2]=gray*.79;
      grain.data[offset+3]=255;
    }
  }
  ctx.putImageData(grain,0,0);
}
function updateControls() {
  cabinet.classList.toggle('off',!on);
  standby.hidden=on;
  power.setAttribute('aria-pressed',on);
  motion.setAttribute('aria-pressed',moving);
  motion.textContent=moving?'Ⅱ':'▶';
  signal.textContent=moving?'SIGNAL LIVE':'MOTION PAUSED';
  updatePreview();
}
power.addEventListener('click',()=>{on=!on;updateControls();});
motion.addEventListener('click',()=>{moving=!moving;updateControls();});
preference.addEventListener('change',({matches})=>{moving=!matches;updateControls();});
product.addEventListener('pointerdown',event=>{
  if(!render||!on||!event.isPrimary||event.button!==0) return;
  pointer=event.clientX;
  product.setPointerCapture(event.pointerId);
});
product.addEventListener('pointermove',event=>{
  if(pointer===undefined) return;
  angle+=(event.clientX-pointer)*.013;
  pointer=event.clientX;
  render(angle,age);
});
product.addEventListener('lostpointercapture',()=>{pointer=undefined;});
function frame(time) {
  const delta=Math.min(.05,(time-last)/1000);
  last=time;
  if(on&&moving) {
    age+=delta;
    if(pointer===undefined) angle+=delta*.48;
    render?.(angle,age);
    if(time-lastNoise>61) {drawNoise(time);lastNoise=time;}
  }
  requestAnimationFrame(frame);
}
new ResizeObserver(()=>render?.(angle,age)).observe(product);
updateControls();
drawNoise(0);
requestAnimationFrame(frame);

if(waitingForRenderer) {
  import('./controller.js')
    .then(({createController})=>{
      renderController=createController(canvas);
      showController();
    })
    .catch(showFallback)
    .finally(()=>{
      waitingForRenderer=false;
      updatePreview();
    });
}
