import * as T from './assets/three.module.js';

export function createController(canvas) {
  const renderer = new T.WebGLRenderer({canvas, alpha:true, antialias:true, preserveDrawingBuffer:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(32,1,.1,50);
  camera.position.z = 13;
  const body = new T.Group();
  scene.add(body);
  const plastic = (color, roughness=.45) => new T.MeshStandardMaterial({color,roughness,metalness:.14});
  const shell = plastic(0x23262e,.37);
  const grain = document.createElement('canvas');
  grain.width = grain.height = 128;
  const gc = grain.getContext('2d');
  const gd = gc.createImageData(128,128);
  for(let i=0;i<gd.data.length;i+=4) {
    gd.data[i]=gd.data[i+1]=gd.data[i+2]=Math.random()*255;
    gd.data[i+3]=255;
  }
  gc.putImageData(gd,0,0);
  shell.bumpMap = new T.CanvasTexture(grain);
  shell.bumpMap.wrapS = shell.bumpMap.wrapT = T.RepeatWrapping;
  shell.bumpScale = .016;
  const trim = plastic(0x08090d,.23);
  const rubber = plastic(0x1c1d21,.74);

  function add(geometry, material, x=0, y=0, z=0) {
    const mesh = new T.Mesh(geometry,material);
    mesh.position.set(x,y,z);
    body.add(mesh);
    return mesh;
  }
  const outline = new T.Shape();
  outline.moveTo(0,1.28);
  outline.bezierCurveTo(-1.14,1.28,-2.13,1.85,-2.57,.86);
  outline.bezierCurveTo(-2.95,.25,-3.38,-1.19,-2.97,-1.74);
  outline.bezierCurveTo(-2.56,-2.17,-1.86,-1.22,-1.38,-.92);
  outline.bezierCurveTo(-.95,-1.12,-.52,-1.26,0,-1.26);
  outline.bezierCurveTo(.52,-1.26,.95,-1.12,1.38,-.92);
  outline.bezierCurveTo(1.86,-1.22,2.56,-2.17,2.97,-1.74);
  outline.bezierCurveTo(3.38,-1.19,2.95,.25,2.57,.86);
  outline.bezierCurveTo(2.13,1.85,1.14,1.28,0,1.28);
  add(new T.ExtrudeGeometry(outline,{depth:.54,bevelThickness:.23,bevelSize:.22,bevelSegments:10,curveSegments:32}),shell,0,0,-.28);
  const seam = add(new T.ExtrudeGeometry(outline,{depth:.026,bevelThickness:.025,bevelSize:.218,bevelSegments:4,curveSegments:32}),trim,0,0,-.13);
  seam.scale.setScalar(1.005);

  function disk(x,y,z,radius,depth,material,top=radius) {
    const mesh = add(new T.CylinderGeometry(top,radius,depth,48),material,x,y,z);
    mesh.rotation.x = Math.PI/2;
    return mesh;
  }
  function dome(x,y,z,radius,height,material) {
    const mesh = add(new T.SphereGeometry(radius,40,24),material,x,y,z);
    mesh.scale.z = height/radius;
    return mesh;
  }
  function label(value,x,y,z,size,sticker=false) {
    const image = document.createElement('canvas');
    image.width = image.height = 256;
    const ctx = image.getContext('2d');
    if(sticker) {
      ctx.beginPath(); ctx.arc(128,128,121,0,Math.PI*2);
      ctx.fillStyle='#ee3b32'; ctx.fill();
      ctx.strokeStyle='#fff1df'; ctx.lineWidth=9; ctx.stroke();
      ctx.save();
      ctx.translate(128,135); ctx.rotate(-.13); ctx.translate(-128,-135);
    }
    ctx.fillStyle='#fff1df'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.font=sticker?'italic 1000 116px Arial Black, sans-serif':'bold 122px Arial, sans-serif';
    ctx.fillText(value,128,136,sticker?210:245);
    const map = new T.CanvasTexture(image);
    map.colorSpace=T.SRGBColorSpace;
    map.anisotropy=renderer.capabilities.getMaxAnisotropy();
    add(new T.PlaneGeometry(size,size),new T.MeshBasicMaterial({map,transparent:true,alphaTest:.15,toneMapped:false}),x,y,z);
  }

  for(const [x,y] of [[-1.68,.55],[1.30,-.61]]) {
    disk(x,y,.53,.52,.12,trim);
    disk(x,y,.65,.34,.20,shell,.26);
    dome(x,y,.81,.34,.11,rubber);
    const ring = add(new T.TorusGeometry(.285,.012,8,48),shell,x,y,.86);
    ring.scale.setScalar(1);
  }
  disk(-1.52,-.54,.53,.45,.1,trim);
  const cross = new T.Shape();
  [[-.12,.34],[.12,.34],[.12,.12],[.34,.12],[.34,-.12],[.12,-.12],[.12,-.34],[-.12,-.34],[-.12,-.12],[-.34,-.12],[-.34,.12],[-.12,.12]].forEach(([x,y],i)=>i?cross.lineTo(x,y):cross.moveTo(x,y));
  cross.closePath();
  add(new T.ExtrudeGeometry(cross,{depth:.065,bevelSize:.026,bevelThickness:.026,bevelSegments:4}),rubber,-1.52,-.54,.59);
  disk(0,.38,.54,.78,.13,trim);
  disk(0,.38,.62,.66,.065,shell);
  label('200',0,.38,.66,1.27,true);
  const buttons = [[1.86,.89,0xc78b19,'Y'],[1.52,.56,0x565dcc,'X'],[2.19,.56,0xd3472c,'B'],[1.86,.23,0x429758,'A']];
  for(const [x,y,color,name] of buttons) {
    disk(x,y,.52,.215,.08,trim);
    dome(x,y,.58,.175,.12,plastic(color,.22));
    label(name,x,y,.703,.26);
  }
  for(const [x,name] of [[-.43,'BACK'],[.43,'START']]) {
    dome(x,-.69,.53,.14,.08,trim).scale.y=.65;
    label(name,x,-.47,.51,.31);
  }
  for(const x of [-1.58,1.58]) {
    const bumper = dome(x,1.22,-.09,.62,.22,trim);
    bumper.scale.y=.34;
  }
  const cable = new T.CatmullRomCurve3([
    new T.Vector3(0,1.39,-.13),new T.Vector3(.02,1.8,-.12),
    new T.Vector3(.26,2.14,-.28),new T.Vector3(.65,2.5,-.43),new T.Vector3(.65,2.88,-.69)
  ]);
  add(new T.TubeGeometry(cable,44,.058,12,false),rubber);
  dome(0,1.47,-.13,.12,.12,trim).scale.y=1.8;
  for (const x of [-1.7,-.9,.9,1.7]) disk(x,.08,-.51,.105,.035,trim);

  scene.add(new T.HemisphereLight(0xdce7ff,0x552522,2.1));
  for(const [color,intensity,x,y,z] of [[0xffe6db,4,-4,5,5],[0xff4231,6,4,1,-3],[0xa4c2ff,2,2,-3,6]]) {
    const light = new T.DirectionalLight(color,intensity);
    light.position.set(x,y,z);
    scene.add(light);
  }
  function render(angle, seconds) {
    const width=canvas.clientWidth;
    const height=canvas.clientHeight;
    if(!width||!height) return;
    if(camera.aspect!==width/height || canvas.width!==Math.floor(width*renderer.getPixelRatio())) {
      camera.aspect=width/height;
      camera.position.z=13.3/Math.min(1,camera.aspect);
      camera.updateProjectionMatrix();
      renderer.setSize(width,height,false);
    }
    body.rotation.set(.26+Math.sin(seconds*.8)*.10,angle,-.19);
    body.position.y=-.36+Math.sin(seconds*1.24)*.11;
    renderer.render(scene,camera);
  }
  return render;
}
